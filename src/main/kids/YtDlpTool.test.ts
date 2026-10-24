import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { YtDlpTool } from './YtDlpTool'

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'kinoteka-ytdlp-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const sha = (data: string): string => createHash('sha256').update(data).digest('hex')

/** Falešný GitHub: poslední vydání `tag`, program s obsahem `exe`. */
function github(tag: string, exe: string, sumFor = exe) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith('/releases/latest')) return Response.json({ tag_name: tag })
    if (url.endsWith(`/download/${tag}/SHA2-256SUMS`))
      return new Response(`${sha('linux')}  yt-dlp\n${sha(sumFor)}  yt-dlp.exe\n`)
    if (url.endsWith(`/download/${tag}/yt-dlp.exe`)) return new Response(exe)
    return new Response('', { status: 404 })
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

describe('YtDlpTool', () => {
  it('poprvé stáhne poslední vydání, ověří součet a zapíše verzi', async () => {
    const fetch = github('2026.10.21', 'program v1')
    const tool = new YtDlpTool({ dir, fetch })
    expect(await tool.version()).toBeNull()

    expect(await tool.ensure()).toBe(join(dir, 'yt-dlp.exe'))
    expect(await readFile(join(dir, 'yt-dlp.exe'), 'utf8')).toBe('program v1')
    expect(await tool.version()).toBe('2026.10.21')
  })

  it('nesedící kontrolní součet – nic neuloží', async () => {
    const tool = new YtDlpTool({ dir, fetch: github('2026.10.21', 'podvržený', 'pravý') })
    await expect(tool.ensure()).rejects.toThrow(/kontrolním součtem/)
    expect(await tool.version()).toBeNull()
  })

  it('aktualizace nejvýš jednou denně; bez internetu zůstane stará verze', async () => {
    let now = new Date('2026-10-24T08:00:00Z')
    const first = github('2026.10.21', 'v1')
    await new YtDlpTool({ dir, fetch: first, now: () => now }).ensure()

    // Za hodinu se nic nekontroluje.
    const newer = github('2026.10.30', 'v2')
    const tool = new YtDlpTool({ dir, fetch: newer, now: () => now })
    now = new Date('2026-10-24T09:00:00Z')
    await tool.ensure()
    expect(newer).not.toHaveBeenCalled()

    // Druhý den se stáhne novější verze.
    now = new Date('2026-10-25T09:00:00Z')
    await tool.ensure()
    expect(await tool.version()).toBe('2026.10.30')
    expect(await readFile(join(dir, 'yt-dlp.exe'), 'utf8')).toBe('v2')

    // Výpadek sítě při kontrole: použije se stávající verze.
    now = new Date('2026-10-27T09:00:00Z')
    const offline = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com')
    }) as unknown as typeof fetch
    await expect(new YtDlpTool({ dir, fetch: offline, now: () => now }).ensure()).resolves.toBe(
      join(dir, 'yt-dlp.exe')
    )
  })

  it('souběžná příprava (předem a náhled) stáhne program jen jednou', async () => {
    const fetch = github('2026.10.21', 'program v1')
    const tool = new YtDlpTool({ dir, fetch })
    await Promise.all([tool.ensure(), tool.ensure()])
    const downloads = fetch.mock.calls.filter(([url]) => String(url).endsWith('/yt-dlp.exe'))
    expect(downloads).toHaveLength(1)
  })

  it('zaseknutý GitHub → srozumitelná chyba místo nekonečného čekání', async () => {
    const timeout = vi.fn(async () => {
      throw new DOMException('The operation was aborted due to timeout', 'TimeoutError')
    }) as unknown as typeof fetch
    await expect(new YtDlpTool({ dir, fetch: timeout }).ensure()).rejects.toThrow(
      /neodpověděl včas/
    )
    // Každý dotaz má časový limit.
    expect(vi.mocked(timeout).mock.calls[0]![1]).toMatchObject({ signal: expect.any(AbortSignal) })
  })

  it('poškozený soubor VERSION = nestažený', async () => {
    await writeFile(join(dir, 'yt-dlp.exe'), 'x')
    expect(await new YtDlpTool({ dir, fetch: github('t', 'x') }).version()).toBeNull()
  })
})
