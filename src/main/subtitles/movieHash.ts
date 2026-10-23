import { open } from 'node:fs/promises'

const CHUNK = 64 * 1024

/**
 * Otisk souboru podle OpenSubtitles: velikost + součet 64bitových slov (little endian)
 * z prvních a posledních 64 KiB, modulo 2^64, jako 16 hex znaků. Podle něj API najde
 * titulky přesně k tomuto vydání. Soubory menší než 128 KiB otisk nemají (null).
 */
export async function movieHash(path: string): Promise<string | null> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    if (size < CHUNK * 2) return null
    const buffer = Buffer.alloc(CHUNK * 2)
    await handle.read(buffer, 0, CHUNK, 0)
    await handle.read(buffer, CHUNK, CHUNK, size - CHUNK)
    let hash = BigInt(size)
    for (let offset = 0; offset < buffer.length; offset += 8) {
      hash = (hash + buffer.readBigUInt64LE(offset)) & 0xffffffffffffffffn
    }
    return hash.toString(16).padStart(16, '0')
  } finally {
    await handle.close()
  }
}
