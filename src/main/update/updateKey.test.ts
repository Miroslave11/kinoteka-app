import { describe, expect, it, vi } from 'vitest'
import { checkUpdateKey, parseKeyExpiration } from './updateKey'

describe('parseKeyExpiration', () => {
  it('převede datum z hlavičky GitHubu (UTC i s posunem)', () => {
    expect(parseKeyExpiration('2027-10-25 08:00:00 UTC')).toBe('2027-10-25T08:00:00.000Z')
    expect(parseKeyExpiration('2027-10-25 08:00:00 +0200')).toBe('2027-10-25T06:00:00.000Z')
  })

  it('bez hlavičky nebo s nečekaným tvarem vrátí null', () => {
    expect(parseKeyExpiration(null)).toBeNull()
    expect(parseKeyExpiration('zítra')).toBeNull()
  })
})

describe('checkUpdateKey', () => {
  const respond = (status: number, headers: Record<string, string> = {}): typeof fetch =>
    vi.fn(async () => new Response('{}', { status, headers })) as unknown as typeof fetch

  it('ptá se na repozitář s vydáními s klíčem v hlavičce', async () => {
    const fetchImpl = respond(200)
    await checkUpdateKey(fetchImpl, 'github_pat_test')
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!
    expect(url).toBe('https://api.github.com/repos/Miroslave11/kinoteka-vydani')
    expect((init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer github_pat_test'
    )
  })

  it('platný klíč s datem vypršení', async () => {
    const key = await checkUpdateKey(
      respond(200, { 'github-authentication-token-expiration': '2027-10-25 08:00:00 UTC' }),
      'x'
    )
    expect(key).toEqual({ status: 'ok', expiresAt: '2027-10-25T08:00:00.000Z' })
  })

  it('odmítnutý klíč nebo klíč bez přístupu k repozitáři je neplatný', async () => {
    expect((await checkUpdateKey(respond(401), 'x')).status).toBe('invalid')
    expect((await checkUpdateKey(respond(404), 'x')).status).toBe('invalid')
  })

  it('výpadek sítě nebo GitHubu klíč nezneplatní', async () => {
    expect((await checkUpdateKey(respond(503), 'x')).status).toBe('unknown')
    const offline = vi.fn(async () => {
      throw new Error('net::ERR_INTERNET_DISCONNECTED')
    }) as unknown as typeof fetch
    expect((await checkUpdateKey(offline, 'x')).status).toBe('unknown')
  })
})
