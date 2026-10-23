import type { Database } from '../db/database'

/** Šifrování tajných hodnot (v aplikaci Electron safeStorage – vázané na účet Windows). */
export interface SecretCipher {
  available(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

const ENCRYPTED_PREFIX = 'enc:'

/** Nastavení aplikace v databázi (klíč → JSON). */
export class SettingsRepository {
  constructor(
    private readonly db: Database,
    private readonly cipher?: SecretCipher
  ) {}

  get<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    if (!row) return undefined
    try {
      return JSON.parse(String(row['value'])) as T
    } catch {
      return undefined
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value'
      )
      .run(key, JSON.stringify(value))
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM settings WHERE key = ?').run(key)
  }

  /** Tajná hodnota (API klíč) – uložená šifrovaně, pokud to systém umí. */
  getSecret(key: string): string | undefined {
    const stored = this.get<string>(key)
    if (stored === undefined) return undefined
    if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored
    if (!this.cipher?.available()) return undefined
    try {
      return this.cipher.decrypt(Buffer.from(stored.slice(ENCRYPTED_PREFIX.length), 'base64'))
    } catch {
      return undefined
    }
  }

  setSecret(key: string, value: string): void {
    if (this.cipher?.available()) {
      this.set(key, ENCRYPTED_PREFIX + this.cipher.encrypt(value).toString('base64'))
    } else {
      this.set(key, value)
    }
  }
}
