import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startFakeGoogle, type FakeGoogle } from '../../../scripts/fake-google.mjs'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase } from '../db/database'
import { JournalRepository } from '../journal/JournalRepository'
import { SettingsRepository } from '../settings/SettingsRepository'
import { driveEndpointsAt, driveErrorMessage } from './driveClient'
import { endpointsAt } from './googleAuth'
import { JournalSync } from './journalSync'
import { SyncService } from './SyncService'

let google: FakeGoogle

beforeEach(async () => {
  google = await startFakeGoogle()
})

afterEach(async () => {
  await google.close()
})

/** Počítač s Kinotékou připojený k falešnému Googlu. */
function computer(name: string, movies: string[]) {
  const db = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\Filmy', 'Filmy', 'local', '')"
  ).run()
  for (const path of movies)
    db.prepare(
      `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
       VALUES (1, ?, ?, 1000, 1, '', '')`
    ).run(`C:\\Filmy\\${path}`, path)
  new CatalogRepository(db).rebuild()
  const settings = new SettingsRepository(db)
  settings.set('sync.deviceName', name)
  const journal = new JournalSync(db)
  const onApplied = vi.fn()
  const service = new SyncService({
    db,
    settings,
    adapters: [journal.diary, journal.ratings],
    client: { id: 'kinoteka-test', secret: 'tajne' },
    endpoints: endpointsAt(google.url),
    drive: driveEndpointsAt(google.url),
    fetch: (url, init) => fetch(url, init),
    // Přihlášení „v prohlížeči“: falešný Google hned přesměruje zpět do Kinotéky.
    openUrl: async (url) => void (await fetch(url)),
    onApplied
  })
  return {
    db,
    service,
    onApplied,
    journal: new JournalRepository(db),
    titleId: (title: string): number =>
      Number(db.prepare('SELECT id FROM title WHERE name = ?').get(title)!['id'])
  }
}

describe('SyncService', () => {
  it('přihlášení, nahrání deníku a jeho převzetí na druhém počítači', async () => {
    const doma = computer('Doma', ['Duna (2021).mkv'])
    const notebook = computer('Notebook', [])
    expect(doma.service.status()).toMatchObject({ configured: true, signedIn: false })

    await doma.service.signIn()
    await doma.service.syncNow()
    expect(doma.service.status()).toMatchObject({
      signedIn: true,
      email: 'test@kinoteka.cz',
      lastError: null
    })

    doma.journal.addManual({
      titleId: doma.titleId('Duna'),
      episodeIds: [],
      watchedAt: '2026-11-02T20:00:00.000Z',
      note: 'Kino'
    })
    await doma.service.syncNow()
    expect([...google.files.values()].map((f) => f.name)).toHaveLength(1)

    await notebook.service.signIn()
    await notebook.service.syncNow()
    expect(notebook.journal.list().map((e) => [e.titleName, e.note])).toEqual([['Duna', 'Kino']])
    expect(notebook.onApplied).toHaveBeenCalled()
    expect(notebook.service.status().devices.map((d) => d.name)).toEqual(['Doma'])
    expect(google.files.size).toBe(2)
  })

  it('zrušené přihlášení: srozumitelná chyba; odhlášení smaže klíče', async () => {
    const doma = computer('Doma', [])
    await doma.service.signIn()
    await doma.service.syncNow()
    google.revokeAll()
    // Přístupový klíč „vyprší“ – obnovení odmítne Google.
    doma.db.prepare("DELETE FROM settings WHERE key = 'sync.google'").run()
    expect(doma.service.status().signedIn).toBe(false)

    await doma.service.signIn()
    google.revokeAll()
    await doma.service.syncNow()
    expect(doma.service.status().lastError).toMatch(/přihlas se prosím znovu/)

    await doma.service.signOut()
    expect(doma.service.status()).toMatchObject({ signedIn: false, lastError: null, devices: [] })
  })
})

describe('driveErrorMessage', () => {
  it('rozliší vypnuté Drive API, chybějící oprávnění a vypršelé přihlášení', () => {
    const google = (reason: string, message = ''): string =>
      JSON.stringify({ error: { code: 403, message, errors: [{ reason }] } })
    expect(driveErrorMessage(403, google('accessNotConfigured'))).toMatch(/Google Drive API/)
    expect(driveErrorMessage(403, google('insufficientPermissions'))).toMatch(/zaškrtni/)
    expect(driveErrorMessage(401, '')).toMatch(/přihlas se prosím znovu/)
    expect(driveErrorMessage(403, google('rateLimitExceeded', 'Rate limit'))).toBe(
      'Google Disk odmítl přístup: Rate limit (rateLimitExceeded).'
    )
  })
})
