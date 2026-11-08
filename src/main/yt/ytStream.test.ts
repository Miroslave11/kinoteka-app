import { describe, expect, it, vi } from 'vitest'
import {
  buildStreamArgs,
  mpvFileFor,
  mpvNetworkArgs,
  parseStream,
  STREAM_REUSE_MARGIN_MS,
  YtStreamResolver
} from './ytStream'

const EXPIRE = 1_800_000_000
const VIDEO_URL = `https://rr1.googlevideo.com/videoplayback?expire=${EXPIRE}&itag=137&mime=video%2Fmp4`
const AUDIO_URL = `https://rr1.googlevideo.com/videoplayback?expire=${EXPIRE - 60}&itag=140;x,y`
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)',
  'Accept-Language': 'en-us,en;q=0.5',
  'Sec-Fetch-Mode': 'navigate'
}

const SPLIT = {
  title: 'Norway in 4K',
  duration: 312.4,
  requested_formats: [
    {
      format_id: '137',
      vcodec: 'avc1.640028',
      acodec: 'none',
      url: VIDEO_URL,
      http_headers: HEADERS
    },
    { format_id: '140', vcodec: 'none', acodec: 'mp4a.40.2', url: AUDIO_URL, http_headers: HEADERS }
  ]
}

describe('buildStreamArgs', () => {
  it('jen údaje (-J) s vybraným formátem, bez playlistu', () => {
    const args = buildStreamArgs('https://www.youtube.com/watch?v=abc', 'C:/e.exe', '1080')
    expect(args).toContain('-J')
    expect(args).toContain('--no-playlist')
    expect(args[args.indexOf('-f') + 1]).toMatch(/height<=1080/)
    expect(args.at(-1)).toBe('https://www.youtube.com/watch?v=abc')
  })
})

describe('parseStream', () => {
  it('obraz a zvuk zvlášť, hlavičky a nejbližší vypršení', () => {
    expect(parseStream(SPLIT)).toEqual({
      video: VIDEO_URL,
      audio: AUDIO_URL,
      headers: HEADERS,
      title: 'Norway in 4K',
      durationSec: 312,
      expiresAt: (EXPIRE - 60) * 1000
    })
  })

  it('spojený formát (obraz se zvukem v jednom)', () => {
    const stream = parseStream({ title: 'X', url: VIDEO_URL, http_headers: HEADERS })
    expect(stream).toMatchObject({ video: VIDEO_URL, audio: null, headers: HEADERS })
  })

  it('bez adresy nebo s jinou než http(s) null; hlavička s novým řádkem se zahodí', () => {
    expect(parseStream({ title: 'X' })).toBeNull()
    expect(parseStream({ url: 'file:///C:/x.mp4' })).toBeNull()
    expect(parseStream(null)).toBeNull()
    expect(
      parseStream({ url: VIDEO_URL, http_headers: { A: 'ok', B: 'x\r\nEvil: 1' } })?.headers
    ).toEqual({ A: 'ok' })
  })
})

describe('mpvFileFor', () => {
  it('obraz a zvuk spojí do EDL s délkami v bajtech (středníky v adrese nevadí)', () => {
    const file = mpvFileFor(parseStream(SPLIT)!)
    expect(file).toBe(
      `edl://!no_clip;%${VIDEO_URL.length}%${VIDEO_URL};!new_stream;!no_clip;%${AUDIO_URL.length}%${AUDIO_URL}`
    )
  })

  it('spojený formát přímo jako adresa', () => {
    expect(mpvFileFor({ ...parseStream(SPLIT)!, audio: null })).toBe(VIDEO_URL)
  })
})

describe('mpvNetworkArgs', () => {
  it('User-Agent zvlášť, ostatní hlavičky po jedné, bez doplňku ytdl', () => {
    const args = mpvNetworkArgs({ headers: HEADERS })
    expect(args).toContain('--ytdl=no')
    expect(args).toContain('--user-agent=Mozilla/5.0 (Windows NT 10.0)')
    expect(args).toContain('--http-header-fields-append=Accept-Language: en-us,en;q=0.5')
    expect(args).toContain('--http-header-fields-append=Sec-Fetch-Mode: navigate')
  })
})

describe('YtStreamResolver', () => {
  it('použije zjištěné adresy znovu, dokud platí; souběžné dotazy spojí', async () => {
    let now = (EXPIRE - 3600) * 1000
    const lookup = vi.fn(async () => SPLIT)
    const resolver = new YtStreamResolver(lookup, () => now)
    const [a, b] = await Promise.all([
      resolver.resolve('abc', '1080'),
      resolver.resolve('abc', '1080')
    ])
    expect(a).toBe(b)
    expect(lookup).toHaveBeenCalledTimes(1)

    await resolver.resolve('abc', '1080')
    expect(lookup).toHaveBeenCalledTimes(1)
    await resolver.resolve('abc', '720')
    expect(lookup).toHaveBeenCalledTimes(2)

    // Těsně před vypršením se zjistí znovu.
    now = (EXPIRE - 60) * 1000 - STREAM_REUSE_MARGIN_MS + 1
    await resolver.resolve('abc', '1080')
    expect(lookup).toHaveBeenCalledTimes(3)

    resolver.forget('abc')
    await resolver.resolve('abc', '720')
    expect(lookup).toHaveBeenCalledTimes(4)
  })

  it('chyba se nezapamatuje', async () => {
    const lookup = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(SPLIT)
    const resolver = new YtStreamResolver(lookup)
    await expect(resolver.resolve('abc', '1080')).rejects.toThrow('offline')
    await expect(resolver.resolve('abc', '1080')).resolves.toMatchObject({ audio: AUDIO_URL })
  })

  it('výpis bez adresy = srozumitelná chyba', async () => {
    const resolver = new YtStreamResolver(async () => ({ title: 'X' }))
    await expect(resolver.resolve('abc', '1080')).rejects.toThrow(/nevrátil adresu/)
  })
})
