import { describe, expect, it } from 'vitest'
import { CatalogRepository } from '../catalog/CatalogRepository'
import { openDatabase, type Database } from '../db/database'
import { JournalRepository } from '../journal/JournalRepository'
import { JournalSync } from './journalSync'
import {
  canonical,
  merge,
  parseDeviceFile,
  SyncRepository,
  type DeviceFile,
  type SyncEntity
} from './syncModel'

/** Jeden počítač: vlastní databáze s knihovnou, deník a synchronizace. */
function computer(id: string, files: string[]) {
  const db: Database = openDatabase(':memory:')
  db.prepare(
    "INSERT INTO library_folder (id, path, name, kind, created_at) VALUES (1, 'C:\\Filmy', 'Filmy', 'local', '')"
  ).run()
  const now = new Date().toISOString()
  for (const path of files)
    db.prepare(
      `INSERT INTO media_file (folder_id, path, relative_path, size, mtime_ms, added_at, updated_at)
       VALUES (1, ?, ?, 1000, 1, ?, ?)`
    ).run(`C:\\Filmy\\${path}`, path, now, now)
  const catalog = new CatalogRepository(db)
  catalog.rebuild()
  const journal = new JournalRepository(db)
  const adapters = new JournalSync(db)
  const repository = new SyncRepository(db)
  let file: DeviceFile = { format: 1, device: { id, name: id }, updatedAt: '', entities: [] }
  return {
    db,
    journal,
    titleId: (name: string): number =>
      Number(db.prepare('SELECT id FROM title WHERE name = ?').get(name)!['id']),
    /** Synchronizace proti souborům ostatních počítačů; vrátí výsledek a nový vlastní soubor. */
    sync(others: DeviceFile[], at: string) {
      const result = merge(repository, [adapters.diary, adapters.ratings], others, id, at)
      file = { ...file, updatedAt: at, entities: result.own }
      return result
    },
    get file(): DeviceFile {
      // Přes JSON, jako přes Google Disk.
      return parseDeviceFile(JSON.stringify(file))!
    }
  }
}

describe('canonical', () => {
  it('stejná data = stejný zápis bez ohledu na pořadí klíčů', () => {
    expect(canonical({ b: 1, a: [{ d: null, c: 'x' }] })).toBe(
      canonical({ a: [{ c: 'x', d: null }], b: 1 })
    )
  })
})

describe('sdílení deníku mezi dvěma počítači', () => {
  it('záznam a hodnocení se přenesou; titul, který druhé PC nemá, se založí', () => {
    const doma = computer('A-doma', ['Prázdnota (2020).mkv', 'Duna (2021).mkv'])
    const notebook = computer('B-notebook', ['Duna (2021).mkv'])
    const prazdnota = doma.titleId('Prázdnota')
    doma.journal.addManual({
      titleId: prazdnota,
      episodeIds: [],
      watchedAt: '2026-11-01T20:00:00.000Z',
      note: 'Super'
    })
    doma.journal.addManual({
      titleId: doma.titleId('Duna'),
      episodeIds: [],
      watchedAt: '2026-11-02T20:00:00.000Z',
      note: null
    })
    doma.journal.setRating(prazdnota, 5)

    expect(doma.sync([], '2026-11-08T10:00:00.000Z')).toMatchObject({ local: 3, applied: 0 })
    expect(notebook.sync([doma.file], '2026-11-08T10:01:00.000Z')).toMatchObject({
      applied: 3,
      local: 0,
      errors: []
    })

    const list = notebook.journal.list()
    expect(list.map((e) => [e.titleName, e.note, e.inLibrary, e.rating])).toEqual([
      ['Duna', null, true, null],
      ['Prázdnota', 'Super', false, 5]
    ])
    // Duna se připojila k titulu, který notebook už má (žádný duplikát).
    expect(
      notebook.db.prepare("SELECT COUNT(*) AS n FROM title WHERE name = 'Duna'").get()!['n']
    ).toBe(1)

    // Promítnuté změny nejsou místní změny – další synchronizace nic nového nenajde.
    expect(notebook.sync([doma.file], '2026-11-08T10:02:00.000Z')).toMatchObject({
      local: 0,
      applied: 0
    })
    expect(doma.sync([notebook.file], '2026-11-08T10:03:00.000Z')).toMatchObject({
      local: 0,
      applied: 0
    })
  })

  it('úprava a smazání se přenesou zpět; novější změna vyhraje', () => {
    const doma = computer('A-doma', ['Duna (2021).mkv'])
    const notebook = computer('B-notebook', ['Duna (2021).mkv'])
    doma.journal.addManual({
      titleId: doma.titleId('Duna'),
      episodeIds: [],
      watchedAt: '2026-11-02T20:00:00.000Z',
      note: null
    })
    doma.sync([], '2026-11-08T10:00:00.000Z')
    notebook.sync([doma.file], '2026-11-08T10:01:00.000Z')

    // Obě PC upraví poznámku; notebook později → vyhraje notebook.
    const [onDoma] = doma.journal.list()
    const [onNotebook] = notebook.journal.list()
    doma.journal.update(onDoma!.id, { note: 'doma' })
    doma.sync([notebook.file], '2026-11-08T11:00:00.000Z')
    notebook.journal.update(onNotebook!.id, { note: 'notebook' })
    notebook.sync([doma.file], '2026-11-08T11:05:00.000Z')
    doma.sync([notebook.file], '2026-11-08T11:06:00.000Z')
    expect(doma.journal.list()[0]!.note).toBe('notebook')

    // Smazání na notebooku smaže i doma a záznam se už nevrátí.
    notebook.journal.remove(onNotebook!.id)
    notebook.sync([doma.file], '2026-11-08T12:00:00.000Z')
    expect(doma.sync([notebook.file], '2026-11-08T12:01:00.000Z')).toMatchObject({ applied: 1 })
    expect(doma.journal.list()).toEqual([])
    notebook.sync([doma.file], '2026-11-08T12:02:00.000Z')
    expect(notebook.journal.list()).toEqual([])
  })

  it('poškozený soubor z Disku se přeskočí; neznámá oblast se zachová a pošle dál', () => {
    expect(parseDeviceFile('nesmysl')).toBeNull()
    expect(parseDeviceFile('{"format":2,"device":{"id":"x"}}')).toBeNull()
    const doma = computer('A-doma', [])
    const future: SyncEntity = {
      key: 'budouci:1',
      data: { x: 1 },
      updatedAt: '2026-11-08T10:00:00.000Z',
      device: 'C',
      deleted: false
    }
    doma.sync(
      [{ format: 1, device: { id: 'C', name: 'C' }, updatedAt: '', entities: [future] }],
      '2026-11-08T10:01:00.000Z'
    )
    expect(doma.file.entities).toContainEqual(future)
  })
})
