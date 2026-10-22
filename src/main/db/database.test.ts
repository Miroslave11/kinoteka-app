import { describe, expect, it } from 'vitest'
import { migrate, openDatabase, transaction } from './database'

describe('openDatabase', () => {
  it('vytvoří schéma a nastaví verzi', () => {
    const db = openDatabase(':memory:')
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row['name'])
    expect(tables).toEqual(expect.arrayContaining(['library_folder', 'media_file']))
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 1 })
  })

  it('zapne cizí klíče', () => {
    const db = openDatabase(':memory:')
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 })
  })
})

describe('migrate', () => {
  it('spustí jen chybějící migrace', () => {
    const db = openDatabase(':memory:', ['CREATE TABLE a (x)'])
    migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y)'])
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 })
    // opakované spuštění nic nedělá (jinak by CREATE TABLE selhal)
    expect(() => migrate(db, ['CREATE TABLE a (x)', 'CREATE TABLE b (y)'])).not.toThrow()
  })

  it('chybná migrace se vrátí celá a verze se nezmění', () => {
    const db = openDatabase(':memory:', [])
    expect(() => migrate(db, ['CREATE TABLE ok (x); CREATE TABLE ok (y);'])).toThrow()
    expect(db.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 })
    expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'ok'").get()).toEqual({
      n: 0
    })
  })
})

describe('transaction', () => {
  it('při chybě vrátí změny zpět', () => {
    const db = openDatabase(':memory:', ['CREATE TABLE t (x)'])
    expect(() =>
      transaction(db, () => {
        db.exec('INSERT INTO t VALUES (1)')
        throw new Error('selhání')
      })
    ).toThrow('selhání')
    expect(db.prepare('SELECT count(*) AS n FROM t').get()).toEqual({ n: 0 })
  })
})
