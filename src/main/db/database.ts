import { DatabaseSync } from 'node:sqlite'
import { MIGRATIONS } from './migrations'

export type Database = DatabaseSync

/** Otevře (nebo vytvoří) databázi a doběhne chybějící migrace. `:memory:` pro testy. */
export function openDatabase(path: string, migrations: readonly string[] = MIGRATIONS): Database {
  const db = new DatabaseSync(path)
  db.exec('PRAGMA foreign_keys = ON')
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
  migrate(db, migrations)
  return db
}

export function migrate(db: Database, migrations: readonly string[]): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  for (let version = row.user_version; version < migrations.length; version++) {
    transaction(db, () => {
      db.exec(migrations[version]!)
      db.exec(`PRAGMA user_version = ${version + 1}`)
    })
  }
}

export function transaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN')
  try {
    const result = work()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
