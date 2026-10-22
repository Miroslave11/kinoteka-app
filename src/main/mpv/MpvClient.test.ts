import { duplexPair, type Duplex } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { MpvClient, MpvError } from './MpvClient'

/** Druhý konec spojení hraje roli mpv. */
function setup(): { client: MpvClient; mpv: Duplex; received: () => Promise<unknown> } {
  const [ours, theirs] = duplexPair()
  theirs.setEncoding('utf8')
  const client = new MpvClient(ours)
  const received = (): Promise<unknown> =>
    new Promise((resolve) => theirs.once('data', (line: string) => resolve(JSON.parse(line))))
  return { client, mpv: theirs, received }
}

const reply = (mpv: Duplex, message: object): void => {
  mpv.write(`${JSON.stringify(message)}\n`)
}

describe('MpvClient', () => {
  let current: MpvClient | undefined
  afterEach(() => current?.close())

  it('pošle příkaz s request_id a vrátí odpověď', async () => {
    const { client, mpv, received } = setup()
    current = client
    const sent = received()
    const result = client.command('get_property', 'volume')
    expect(await sent).toEqual({ command: ['get_property', 'volume'], request_id: 1 })
    reply(mpv, { request_id: 1, error: 'success', data: 80 })
    expect(await result).toBe(80)
  })

  it('chybu z mpv vrátí jako MpvError', async () => {
    const { client, mpv, received } = setup()
    current = client
    const sent = received()
    const result = client.setProperty('nesmysl', 1)
    await sent
    reply(mpv, { request_id: 1, error: 'property not found' })
    await expect(result).rejects.toBeInstanceOf(MpvError)
  })

  it('poskládá zprávy rozdělené do více kusů i více zpráv v jednom kusu', async () => {
    const { client, mpv } = setup()
    current = client
    const changes: [string, unknown][] = []
    client.on('property', (name, value) => changes.push([name, value]))
    mpv.write('{"event":"property-change","id":1,"name":"time-pos","da')
    mpv.write('ta":12.5}\n{"event":"property-change","id":2,"name":"pause","data":true}\n')
    await new Promise((resolve) => setImmediate(resolve))
    expect(changes).toEqual([
      ['time-pos', 12.5],
      ['pause', true]
    ])
  })

  it('předá ostatní události', async () => {
    const { client, mpv } = setup()
    current = client
    const events: string[] = []
    client.on('event', (name) => events.push(name))
    reply(mpv, { event: 'end-file', reason: 'eof' })
    await new Promise((resolve) => setImmediate(resolve))
    expect(events).toEqual(['end-file'])
  })

  it('ignoruje nevalidní řádky', async () => {
    const { client, mpv } = setup()
    current = client
    const changes: unknown[] = []
    client.on('property', (...args) => changes.push(args))
    mpv.write('tohle není json\n')
    reply(mpv, { event: 'property-change', name: 'mute', data: false })
    await new Promise((resolve) => setImmediate(resolve))
    expect(changes).toEqual([['mute', false]])
  })

  it('při ukončení mpv odmítne čekající příkazy a ohlásí close', async () => {
    const { client, mpv, received } = setup()
    const closed = new Promise((resolve) => client.once('close', () => resolve(true)))
    const sent = received()
    const result = client.command('quit')
    await sent
    mpv.end()
    await expect(result).rejects.toThrow('ukončeno')
    expect(await closed).toBe(true)
    expect(client.isClosed).toBe(true)
    await expect(client.command('quit')).rejects.toThrow('uzavřené')
  })
})
