// Falešný Home Assistant (WebSocket API) pro testy a vývoj – ať se při vývoji neblikalo
// skutečnou linkou. Spuštění pro ruční zkoušky: node scripts/fake-ha.mjs [port]
//
// Jen čistý TypeScript bez závislostí, aby šel spustit i přímo v Node (odstranění typů).
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { Socket } from 'node:net'

export const FAKE_HA_TOKEN = 'fake-ha-token'
export const FAKE_HA_VERSION = '2026.11.0'

interface FakeEntity {
  state: string
  attributes: Record<string, unknown>
}

interface Client {
  socket: Socket
  authed: boolean
  /** id zprávy subscribe_entities → sledované entity (prázdné = všechny). */
  subscriptions: Map<number, string[]>
}

export interface FakeHa {
  url: string
  port: number
  /** Přepne entitu „zvenku“ (vypínač na zdi) – pošle změnu odběratelům. */
  setState(entityId: string, state: string): void
  state(entityId: string): string | undefined
  /** Volání služeb, která přišla (např. switch.toggle switch.vypinac_linka). */
  calls: string[]
  /** Odpojí všechny klienty (výpadek Home Assistant). */
  dropClients(): void
  close(): Promise<void>
}

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame(text: string): Buffer {
  const payload = Buffer.from(text, 'utf8')
  const length = payload.length
  let header: Buffer
  if (length < 126) {
    header = Buffer.from([0x81, length])
  } else if (length < 65536) {
    header = Buffer.alloc(4)
    header[0] = 0x81
    header[1] = 126
    header.writeUInt16BE(length, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = 0x81
    header[1] = 127
    header.writeBigUInt64BE(BigInt(length), 2)
  }
  return Buffer.concat([header, payload])
}

/** Rozloží přijatá data na zprávy (klient vždy maskuje); vrátí zbytek nedokončeného rámce. */
function readFrames(buffer: Buffer, onText: (text: string) => void, onClose: () => void): Buffer {
  let offset = 0
  while (buffer.length - offset >= 2) {
    const opcode = buffer[offset]! & 0x0f
    let length = buffer[offset + 1]! & 0x7f
    let position = offset + 2
    if (length === 126) {
      if (buffer.length < position + 2) break
      length = buffer.readUInt16BE(position)
      position += 2
    } else if (length === 127) {
      if (buffer.length < position + 8) break
      length = Number(buffer.readBigUInt64BE(position))
      position += 8
    }
    if (buffer.length < position + 4 + length) break
    const mask = buffer.subarray(position, position + 4)
    position += 4
    const payload = Buffer.alloc(length)
    for (let i = 0; i < length; i++) payload[i] = buffer[position + i]! ^ mask[i % 4]!
    offset = position + length
    if (opcode === 0x8) onClose()
    else if (opcode === 0x1) onText(payload.toString('utf8'))
  }
  return buffer.subarray(offset)
}

export function startFakeHa(
  port = 0,
  {
    entities = {
      'switch.vypinac_linka': { state: 'on', attributes: { friendly_name: 'vypinac_linka' } },
      'switch.vypinac_loznice_left': {
        state: 'off',
        attributes: { friendly_name: 'vypinac_loznice Left' }
      },
      'light.led_loznice': { state: 'off', attributes: { friendly_name: 'led_loznice' } },
      'sensor.teplota': { state: '21.5', attributes: { friendly_name: 'Teplota' } }
    } as Record<string, FakeEntity>,
    token = FAKE_HA_TOKEN
  } = {}
): Promise<FakeHa> {
  const states = new Map<string, FakeEntity>(Object.entries(entities))
  const clients = new Set<Client>()
  const calls: string[] = []

  const send = (client: Client, message: unknown): void => {
    if (!client.socket.destroyed) client.socket.write(frame(JSON.stringify(message)))
  }

  const compressed = (entity: FakeEntity): Record<string, unknown> => ({
    s: entity.state,
    a: entity.attributes,
    c: 'kontext',
    lc: Date.now() / 1000
  })

  const notify = (entityId: string): void => {
    const entity = states.get(entityId)
    if (!entity) return
    for (const client of clients) {
      for (const [id, watched] of client.subscriptions) {
        if (watched.length && !watched.includes(entityId)) continue
        send(client, {
          id,
          type: 'event',
          event: { c: { [entityId]: { '+': { s: entity.state, lc: Date.now() / 1000 } } } }
        })
      }
    }
  }

  const setState = (entityId: string, state: string): void => {
    const entity = states.get(entityId)
    if (!entity) return
    entity.state = state
    notify(entityId)
  }

  const handle = (client: Client, text: string): void => {
    const message = JSON.parse(text) as Record<string, unknown>
    if (!client.authed) {
      if (message['type'] === 'auth' && message['access_token'] === token) {
        client.authed = true
        send(client, { type: 'auth_ok', ha_version: FAKE_HA_VERSION })
      } else {
        send(client, { type: 'auth_invalid', message: 'Invalid access token or password' })
        client.socket.end()
      }
      return
    }
    const id = message['id'] as number
    const result = (value: unknown): void =>
      send(client, { id, type: 'result', success: true, result: value })
    const failure = (code: string, text: string): void =>
      send(client, { id, type: 'result', success: false, error: { code, message: text } })
    switch (message['type']) {
      case 'get_config':
        return result({ location_name: 'Domov', version: FAKE_HA_VERSION })
      case 'get_states':
        return result(
          [...states].map(([entityId, entity]) => ({
            entity_id: entityId,
            state: entity.state,
            attributes: entity.attributes
          }))
        )
      case 'subscribe_entities': {
        const watched = (message['entity_ids'] as string[] | undefined) ?? []
        client.subscriptions.set(id, watched)
        result(null)
        const added: Record<string, unknown> = {}
        for (const [entityId, entity] of states) {
          if (!watched.length || watched.includes(entityId)) added[entityId] = compressed(entity)
        }
        return send(client, { id, type: 'event', event: { a: added } })
      }
      case 'call_service': {
        const domain = message['domain'] as string
        const service = message['service'] as string
        const target = (message['target'] as { entity_id?: string } | undefined)?.entity_id
        calls.push(`${domain}.${service} ${target ?? ''}`.trim())
        const entity = target ? states.get(target) : undefined
        if (!target || !entity || !target.startsWith(`${domain}.`))
          return failure('not_found', `Entity ${target} not found`)
        if (service === 'turn_on') setState(target, 'on')
        else if (service === 'turn_off') setState(target, 'off')
        else if (service === 'toggle') setState(target, entity.state === 'on' ? 'off' : 'on')
        else return failure('not_found', `Service ${domain}.${service} not found`)
        return result({ context: { id: 'kontext' } })
      }
      case 'ping':
        return send(client, { id, type: 'pong' })
      default:
        return failure('unknown_command', 'Unknown command.')
    }
  }

  const server: Server = createServer((request, response) => {
    if (request.url === '/api/' || request.url === '/api') {
      const ok = request.headers.authorization === `Bearer ${token}`
      response.writeHead(ok ? 200 : 401, { 'Content-Type': 'application/json' })
      return response.end(JSON.stringify(ok ? { message: 'API running.' } : {}))
    }
    response.writeHead(404)
    response.end()
  })

  server.on('upgrade', (request, socket: Socket) => {
    if (request.url !== '/api/websocket') return socket.destroy()
    const key = String(request.headers['sec-websocket-key'] ?? '')
    const accept = createHash('sha1')
      .update(key + WS_GUID)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    const client: Client = { socket, authed: false, subscriptions: new Map() }
    clients.add(client)
    let pending: Buffer = Buffer.alloc(0)
    socket.on('data', (chunk: Buffer) => {
      pending = readFrames(
        Buffer.concat([pending, chunk]),
        (text) => handle(client, text),
        () => socket.end()
      )
    })
    socket.on('close', () => clients.delete(client))
    socket.on('error', () => clients.delete(client))
    send(client, { type: 'auth_required', ha_version: FAKE_HA_VERSION })
  })

  const dropClients = (): void => {
    for (const client of clients) client.socket.destroy()
    clients.clear()
  }

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      const actual = typeof address === 'object' && address ? address.port : port
      resolve({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        setState,
        state: (entityId) => states.get(entityId)?.state,
        calls,
        dropClients,
        close: () =>
          new Promise<void>((done) => {
            dropClients()
            server.close(() => done())
          })
      })
    })
  })
}
