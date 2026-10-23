import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { movieHash } from './movieHash'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kinoteka-hash-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('movieHash', () => {
  it('nulový obsah = jen velikost souboru', async () => {
    const file = join(root, 'a.mkv')
    await writeFile(file, Buffer.alloc(200_000))
    expect(await movieHash(file)).toBe((200_000).toString(16).padStart(16, '0'))
  })

  it('sečte slova ze začátku a konce s přetečením přes 64 bitů', async () => {
    const data = Buffer.alloc(300_000)
    data.writeBigUInt64LE(0xffffffffffffffffn, 0) // začátek
    data.writeBigUInt64LE(5n, 300_000 - 8) // poslední slovo
    data.writeBigUInt64LE(7n, 150_000) // uprostřed – do otisku nepatří
    const file = join(root, 'b.mkv')
    await writeFile(file, data)
    // 300000 + (2^64 - 1) + 5  (mod 2^64) = 300004
    expect(await movieHash(file)).toBe((300_004).toString(16).padStart(16, '0'))
  })

  it('malý soubor otisk nemá', async () => {
    const file = join(root, 'c.mkv')
    await writeFile(file, Buffer.alloc(1000))
    expect(await movieHash(file)).toBeNull()
  })
})
