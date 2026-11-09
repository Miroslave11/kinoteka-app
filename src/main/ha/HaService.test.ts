import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { haBulbState, type HaStatus } from '../../shared/ha'
import { openDatabase } from '../db/database'
import { SettingsRepository } from '../settings/SettingsRepository'
import { FAKE_HA_TOKEN, startFakeHa, type FakeHa } from './fakeHa'
import { HaConnection, websocketUrl } from './HaConnection'
import { HA_TOKEN_KEY, HaService } from './HaService'

const ENTITY = 'switch.vypinac_linka'

let ha: FakeHa
let services: HaService[] = []

beforeEach(async () => {
  ha = await startFakeHa()
})

afterEach(async () => {
  for (const service of services) service.stop()
  services = []
  await ha.close()
})

function service(options: { pingMs?: number; timeoutMs?: number } = {}): {
  service: HaService
  settings: SettingsRepository
} {
  const settings = new SettingsRepository(openDatabase(':memory:'))
  const created = new HaService({ settings, retryMs: [50], ...options })
  services.push(created)
  return { service: created, settings }
}

/** Počká, až stav služby splní podmínku (změny chodí asynchronně ze serveru). */
function until(service: HaService, check: (status: HaStatus) => boolean): Promise<HaStatus> {
  return new Promise((resolve, reject) => {
    if (check(service.status())) return resolve(service.status())
    const timer = setTimeout(() => {
      service.off('changed', listener)
      reject(new Error(`Nesplněno: ${JSON.stringify(service.status())}`))
    }, 3000)
    const listener = (status: HaStatus): void => {
      if (!check(status)) return
      clearTimeout(timer)
      service.off('changed', listener)
      resolve(status)
    }
    service.on('changed', listener)
  })
}

async function connected(): Promise<HaService> {
  const { service: created } = service()
  await created.save({ enabled: true, url: ha.url, token: FAKE_HA_TOKEN, entityId: ENTITY })
  await until(created, (s) => s.connection === 'connected' && s.entity?.state === 'on')
  return created
}

describe('websocketUrl', () => {
  it('převede adresu na WebSocket API', () => {
    expect(websocketUrl('http://homeassistant.local:8123')).toBe(
      'ws://homeassistant.local:8123/api/websocket'
    )
    expect(websocketUrl('https://dum.example.cz')).toBe('wss://dum.example.cz/api/websocket')
  })
})

describe('HaConnection', () => {
  it('přihlásí se tokenem a vrátí verzi', async () => {
    const connection = await HaConnection.open(ha.url, FAKE_HA_TOKEN)
    expect(connection.version).toBe('2026.11.0')
    expect((await connection.getConfig()).location_name).toBe('Domov')
    connection.close()
  })

  it('neplatný token = srozumitelná chyba', async () => {
    await expect(HaConnection.open(ha.url, 'spatny')).rejects.toMatchObject({ code: 'auth' })
  })

  it('nedostupná adresa = chyba sítě', async () => {
    const port = ha.port
    await ha.close()
    await expect(
      HaConnection.open(`http://127.0.0.1:${port}`, FAKE_HA_TOKEN)
    ).rejects.toMatchObject({ code: 'network' })
    ha = await startFakeHa()
  })
})

describe('HaService', () => {
  it('bez zapnutí a tokenu se nepřipojuje a žárovka je skrytá', async () => {
    const { service: created } = service()
    created.start()
    expect(created.status().connection).toBe('off')
    expect(haBulbState(created.status())).toBe('hidden')
  })

  it('token se ukládá jen jako příznak, do stavu nejde', async () => {
    const { service: created, settings } = service()
    const status = await created.save({ token: '  tajny  ' })
    expect(status.hasToken).toBe(true)
    expect(JSON.stringify(status)).not.toContain('tajny')
    expect(settings.getSecret(HA_TOKEN_KEY)).toBe('tajny')
    expect((await created.save({ token: '' })).hasToken).toBe(false)
  })

  it('připojí se, drží živý stav a přepíná entitu', async () => {
    const created = await connected()
    expect(haBulbState(created.status())).toBe('on')
    expect(created.status().entity?.friendlyName).toBe('vypinac_linka')

    expect(await created.toggle()).toEqual({ ok: true })
    await until(created, (s) => s.entity?.state === 'off')
    expect(ha.calls).toContain(`switch.toggle ${ENTITY}`)

    // Vypínač na zdi: změna z Home Assistant se projeví bez dotazu.
    ha.setState(ENTITY, 'on')
    await until(created, (s) => s.entity?.state === 'on')

    await created.setOn(false)
    expect(ha.state(ENTITY)).toBe('off')
  })

  it('vybere jen entity, které jde přepínat', async () => {
    const created = await connected()
    const ids = (await created.entities()).map((e) => e.entityId)
    expect(ids).toEqual([
      'switch.vypinac_linka',
      'switch.vypinac_loznice_left',
      'light.led_loznice'
    ])
  })

  it('ověření spojení neuloží nic a hlásí špatný token', async () => {
    const { service: created } = service()
    const ok = await created.test(ha.url.replace('http://', ''), FAKE_HA_TOKEN)
    expect(ok).toMatchObject({ ok: true, locationName: 'Domov', version: '2026.11.0' })
    expect(ok.message).toContain('Domov')
    expect((await created.test(ha.url, 'spatny')).message).toContain('token nepřijal')
    expect(created.status().hasToken).toBe(false)
  })

  it('po výpadku se samo znovu připojí', async () => {
    const created = await connected()
    ha.dropClients()
    await until(created, (s) => s.connection === 'error')
    expect(haBulbState(created.status())).toBe('unavailable')
    await until(created, (s) => s.connection === 'connected' && s.entity?.state === 'on')
  })

  it('mrtvé spojení (uspání PC) pozná pingem a naváže nové', async () => {
    const { service: created } = service({ pingMs: 100, timeoutMs: 300 })
    await created.save({ enabled: true, url: ha.url, token: FAKE_HA_TOKEN, entityId: ENTITY })
    await until(created, (s) => s.connection === 'connected')
    ha.freeze(true)
    await until(created, (s) => s.connection === 'error')
    ha.freeze(false)
    await until(created, (s) => s.connection === 'connected' && s.entity?.state === 'on')
    expect(ha.logins()).toBeGreaterThanOrEqual(2)
  }, 15_000)

  it('probuzení ze spánku hned naváže nové spojení', async () => {
    const created = await connected()
    created.wake()
    await until(created, (s) => s.connection === 'connected' && s.entity?.state === 'on')
    expect(ha.logins()).toBe(2)
  })

  it('zneplatněný token: srozumitelná chyba a žádné další pokusy', async () => {
    const created = await connected()
    ha.revokeToken()
    const status = await until(
      created,
      (s) => s.connection === 'error' && !!s.error?.includes('token')
    )
    expect(haBulbState(status)).toBe('unavailable')
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(created.status().error).toContain('token nepřijal')
  })

  it('entita smazaná v Home Assistant: hláška, přepnutí se nezkouší', async () => {
    const created = await connected()
    ha.removeEntity(ENTITY)
    const status = await until(created, (s) => s.entity?.missing === true)
    expect(haBulbState(status)).toBe('unavailable')
    const calls = ha.calls.length
    const result = await created.toggle()
    expect(result.message).toContain('vyber ji znovu')
    expect(ha.calls.length).toBe(calls)
  })

  it('neexistující entita je nedostupná', async () => {
    const { service: created } = service()
    await created.save({
      enabled: true,
      url: ha.url,
      token: FAKE_HA_TOKEN,
      entityId: 'switch.neni'
    })
    const status = await until(created, (s) => s.connection === 'connected')
    expect(haBulbState(status)).toBe('unavailable')
    expect((await created.toggle()).ok).toBe(false)
  })
})
