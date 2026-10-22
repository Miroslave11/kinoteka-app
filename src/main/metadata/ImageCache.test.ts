import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageCache } from './ImageCache'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'kinoteka-img-'))
})

afterEach(() => rm(directory, { recursive: true, force: true }))

describe('ImageCache', () => {
  it('obrázek stáhne jednou a pak ho vrací z disku', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])))
    const cache = new ImageCache(directory, 'http://img.test/t/p', fetchImpl)

    const first = await cache.get('/w500/abc.jpg')
    expect(first).toEqual({ data: Buffer.from([1, 2, 3]), contentType: 'image/jpeg' })
    expect(fetchImpl).toHaveBeenCalledWith('http://img.test/t/p/w500/abc.jpg')

    await cache.get('/w500/abc.jpg')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('souběžné požadavky stáhnou obrázek jen jednou', async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([9])))
    const cache = new ImageCache(directory, 'http://img.test', fetchImpl)
    await Promise.all([
      cache.get('/w185/x.png'),
      cache.get('/w185/x.png'),
      cache.get('/w185/x.png')
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('odmítne cesty mimo povolený tvar', async () => {
    const fetchImpl = vi.fn()
    const cache = new ImageCache(directory, 'http://img.test', fetchImpl)
    for (const path of [
      '/../secret.jpg',
      '/w500/../../x.jpg',
      '/w500/x.exe',
      'w500/x.jpg',
      '/w500/a/b.jpg'
    ]) {
      expect(await cache.get(path)).toBeNull()
    }
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('nepovedené stažení vrátí null a nic neuloží', async () => {
    let fail = true
    const cache = new ImageCache(directory, 'http://img.test', async () =>
      fail ? new Response('', { status: 404 }) : new Response(new Uint8Array([7]))
    )
    expect(await cache.get('/w300/y.jpg')).toBeNull()
    fail = false
    expect((await cache.get('/w300/y.jpg'))?.data).toEqual(Buffer.from([7]))
  })
})
