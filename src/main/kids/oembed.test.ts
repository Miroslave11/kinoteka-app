import { describe, expect, it, vi } from 'vitest'
import { fetchOembed, parseOembed } from './oembed'

const BING = {
  title: 'Mobilní telefon, Stín a VÍCE | Bing Český',
  author_name: 'Bing Český - Oficiální Kanál',
  type: 'video'
}

describe('oEmbed', () => {
  it('název a kanál, délku nezná', () => {
    expect(parseOembed(BING)).toEqual({
      title: 'Mobilní telefon, Stín a VÍCE | Bing Český',
      channel: 'Bing Český - Oficiální Kanál',
      durationSec: null,
      entries: []
    })
    expect(parseOembed({ author_name: 'x' })).toBeNull()
    expect(parseOembed('Unauthorized')).toBeNull()
  })

  it('zeptá se na odkaz videa; chyba nebo výpadek sítě = null', async () => {
    const ok = vi.fn(async () => Response.json(BING)) as unknown as typeof fetch
    expect(await fetchOembed(ok, 'fRLkxs41P2I')).toMatchObject({ title: BING.title })
    expect(String(vi.mocked(ok).mock.calls[0]![0])).toBe(
      'https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DfRLkxs41P2I'
    )

    const denied = (async () => new Response('Unauthorized', { status: 401 })) as typeof fetch
    expect(await fetchOembed(denied, 'fRLkxs41P2I')).toBeNull()
    const offline = (async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    }) as typeof fetch
    expect(await fetchOembed(offline, 'fRLkxs41P2I')).toBeNull()
  })
})
