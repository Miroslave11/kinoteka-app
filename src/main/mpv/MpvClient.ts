import { EventEmitter } from 'node:events'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

export class MpvError extends Error {
  constructor(readonly code: string) {
    super(`mpv: ${code}`)
  }
}

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (error: Error) => void
}

interface MpvClientEvents {
  /** Změna sledované vlastnosti (`observe_property`). */
  property: [name: string, value: unknown]
  /** Ostatní události mpv, např. `end-file`. */
  event: [name: string, payload: Record<string, unknown>]
  close: []
}

/**
 * Klient JSON IPC protokolu mpv – jeden JSON objekt na řádek.
 * https://mpv.io/manual/stable/#json-ipc
 */
export class MpvClient extends EventEmitter<MpvClientEvents> {
  private buffer = ''
  private nextRequestId = 1
  private nextObserverId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private closed = false

  constructor(private readonly socket: Duplex) {
    super()
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => this.onData(chunk))
    // „end“ = mpv zavřelo rouru (skončilo), „close“ = spojení zaniklo jinak.
    socket.on('end', () => this.onClose())
    socket.on('close', () => this.onClose())
    // Po chybě vždy následuje „close“, kde se vše uklidí.
    socket.on('error', () => undefined)
  }

  get isClosed(): boolean {
    return this.closed
  }

  command(...args: unknown[]): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('Spojení s mpv je uzavřené'))
    const requestId = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject })
      this.socket.write(`${JSON.stringify({ command: args, request_id: requestId })}\n`)
    })
  }

  setProperty(name: string, value: unknown): Promise<unknown> {
    return this.command('set_property', name, value)
  }

  observe(name: string): Promise<unknown> {
    return this.command('observe_property', this.nextObserverId++, name)
  }

  close(): void {
    this.socket.end()
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line) this.handleMessage(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private handleMessage(line: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }

    const requestId = message['request_id']
    if (typeof requestId === 'number' && this.pending.has(requestId)) {
      const request = this.pending.get(requestId)!
      this.pending.delete(requestId)
      if (message['error'] === 'success') request.resolve(message['data'])
      else request.reject(new MpvError(String(message['error'])))
      return
    }

    const event = message['event']
    if (event === 'property-change' && typeof message['name'] === 'string') {
      this.emit('property', message['name'], message['data'])
    } else if (typeof event === 'string') {
      this.emit('event', event, message)
    }
  }

  private onClose(): void {
    if (this.closed) return
    this.closed = true
    for (const request of this.pending.values()) {
      request.reject(new Error('Spojení s mpv bylo ukončeno'))
    }
    this.pending.clear()
    this.emit('close')
  }
}

/** Připojí se k IPC rouře mpv; mpv ji vytváří až chvíli po startu, proto se zkouší opakovaně. */
export async function connectToMpv(pipePath: string, timeoutMs = 5000): Promise<MpvClient> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const socket = await new Promise<Duplex>((resolve, reject) => {
        const candidate = connect(pipePath)
        candidate.once('connect', () => {
          candidate.off('error', reject)
          resolve(candidate)
        })
        candidate.once('error', reject)
      })
      return new MpvClient(socket)
    } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
}
