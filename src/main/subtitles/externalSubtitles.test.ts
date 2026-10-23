import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findExternalSubtitles, prepareSubtitle } from './externalSubtitles'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-subs-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const touch = async (...parts: string[]): Promise<string> => {
  const file = join(root, ...parts)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, '1\n00:00:01,000 --> 00:00:02,000\nAhoj\n')
  return file
}

describe('findExternalSubtitles', () => {
  it('najde titulky k filmu podle názvu, ne cizí', async () => {
    const video = await touch('Úkryt nebo past (2026).mkv')
    await touch('Prázdnota (2020).mkv')
    await touch('Úkryt nebo past (2026).cze.srt')
    await touch('Ukryt.nebo.past.2026.en.forced.ass')
    await touch('Prázdnota (2020).srt')
    const found = (await findExternalSubtitles(video)).map((f) => basename(f))
    expect(found.sort()).toEqual(
      ['Ukryt.nebo.past.2026.en.forced.ass', 'Úkryt nebo past (2026).cze.srt'].sort()
    )
  })

  it('u VobSub vezme jen .idx', async () => {
    const video = await touch('Film.mkv')
    await touch('Film.idx')
    await touch('Film.sub')
    expect((await findExternalSubtitles(video)).map((f) => basename(f))).toEqual(['Film.idx'])
  })

  it('v podsložce Subs u jediného videa bere i titulky bez názvu filmu', async () => {
    const video = await touch('Film', 'Film.mkv')
    await touch('Film', 'Subs', 'Czech.srt')
    expect((await findExternalSubtitles(video)).map((f) => basename(f))).toEqual(['Czech.srt'])

    await touch('Film', 'Jiný film.mkv')
    expect(await findExternalSubtitles(video)).toEqual([])
  })

  it('nedostupná složka = žádné titulky', async () => {
    expect(await findExternalSubtitles(join(root, 'neexistuje', 'Film.mkv'))).toEqual([])
  })
})

describe('prepareSubtitle', () => {
  it('UTF-8 nechá, jak je, a z názvu vezme jazyk', async () => {
    const video = join(root, 'Film (2020).mkv')
    const file = await touch('Film (2020).cz.srt')
    expect(await prepareSubtitle(file, video, join(root, 'cache'))).toEqual({
      path: file,
      title: 'Film (2020).cz.srt',
      language: 'cs',
      forced: false,
      encoding: 'utf-8'
    })
  })

  it('Windows-1250 převede do UTF-8 kopie v cache', async () => {
    const video = join(root, 'Film.mkv')
    const file = join(root, 'Film.srt')
    // „Příliš žluťoučký“ ve Windows-1250
    await writeFile(
      file,
      Buffer.from([
        0x31, 0x0a, 0x50, 0xf8, 0xed, 0x6c, 0x69, 0x9a, 0x20, 0x9e, 0x6c, 0x75, 0x9d, 0x6f, 0x75,
        0xe8, 0x6b, 0xfd, 0x0a
      ])
    )
    const prepared = await prepareSubtitle(file, video, join(root, 'cache'))
    expect(prepared.encoding).toBe('windows-1250')
    expect(prepared.path).not.toBe(file)
    expect(await readFile(prepared.path, 'utf8')).toBe('1\nPříliš žluťoučký\n')
  })
})
