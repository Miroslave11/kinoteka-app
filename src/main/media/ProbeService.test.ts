import { beforeEach, describe, expect, it } from 'vitest'
import type { MediaInfo } from '../../shared/mediaInfo'
import { openDatabase, type Database } from '../db/database'
import { ProbeService } from './ProbeService'

const INFO: MediaInfo = {
  container: 'MKV',
  durationSec: 60,
  bitrate: 1000,
  video: null,
  audio: [],
  subtitles: []
}

let db: Database

function addFile(path: string, available = 1): void {
  db.prepare(
    `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, available, added_at, updated_at)
     VALUES (1, ?, ?, 1, 1, ?, '', '')`
  ).run(path, path, available)
}

const rows = (): Record<string, unknown>[] =>
  db.prepare('SELECT path, media_info, probe_error FROM media_file ORDER BY id').all()

beforeEach(() => {
  db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\F', 'F', 'local', '')"
  ).run()
})

describe('ProbeService', () => {
  it('zpracuje dostupné soubory bez vlastností a chyby si zapamatuje', async () => {
    addFile('a.mkv')
    addFile('vadny.mkv')
    addFile('nedostupny.mkv', 0)
    const probed: string[] = []
    const service = new ProbeService(db, async (path) => {
      probed.push(path)
      if (path === 'vadny.mkv') throw new Error('Invalid data found')
      return INFO
    })
    let notifications = 0
    service.on('changed', () => notifications++)

    await service.run()

    expect(probed).toEqual(['a.mkv', 'vadny.mkv'])
    expect(rows()).toEqual([
      { path: 'a.mkv', media_info: JSON.stringify(INFO), probe_error: null },
      { path: 'vadny.mkv', media_info: null, probe_error: 'Invalid data found' },
      { path: 'nedostupny.mkv', media_info: null, probe_error: null }
    ])
    expect(notifications).toBe(1)

    // Druhý běh už nic nezkouší znovu.
    await service.run()
    expect(probed).toHaveLength(2)
  })

  it('soubor přidaný během běhu zpracuje ve stejném běhu', async () => {
    addFile('a.mkv')
    const service = new ProbeService(db, async (path) => {
      if (path === 'a.mkv') {
        addFile('b.mkv')
        void service.run()
      }
      return INFO
    })
    await service.run()
    expect(rows().every((row) => row['media_info'] !== null)).toBe(true)
  })
})
