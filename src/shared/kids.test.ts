import { describe, expect, it } from 'vitest'
import {
  cleanKeywords,
  parseDownloadRequest,
  parseManageAction,
  parseTmdbChoice,
  parseTmdbLink,
  parseYoutubeLink,
  parseYoutubeUrl
} from './kids'

describe('parseYoutubeUrl', () => {
  const canonical = 'https://www.youtube.com/watch?v=jNQXAC9IVRw'

  it('různé podoby odkazu na jedno video', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=jNQXAC9IVRw',
      ' https://youtube.com/watch?v=jNQXAC9IVRw&t=5s ',
      'https://m.youtube.com/watch?v=jNQXAC9IVRw',
      'https://youtu.be/jNQXAC9IVRw?si=abc',
      'https://www.youtube.com/shorts/jNQXAC9IVRw',
      'https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PL123'
    ]) {
      expect(parseYoutubeUrl(url), url).toBe(canonical)
    }
  })

  it('jiné weby, playlist bez videa a nesmysly odmítne', () => {
    for (const url of [
      'https://vimeo.com/123',
      'https://www.youtube.com/playlist?list=PL123',
      'https://www.youtube.com/watch?v=kratke',
      'https://evil.example/watch?v=jNQXAC9IVRw',
      'file:///C:/video.mp4',
      'Prasátko Peppa'
    ]) {
      expect(parseYoutubeUrl(url), url).toBeNull()
    }
  })
})

describe('parseYoutubeLink', () => {
  it('video v playlistu → obojí, samotný playlist → jen playlist', () => {
    expect(
      parseYoutubeLink('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=PLUuoaBQqIS25cfp46uJ')
    ).toEqual({ videoId: 'jNQXAC9IVRw', playlistId: 'PLUuoaBQqIS25cfp46uJ' })
    expect(parseYoutubeLink('https://www.youtube.com/playlist?list=PLUuoaBQqIS25cfp46uJ')).toEqual({
      videoId: null,
      playlistId: 'PLUuoaBQqIS25cfp46uJ'
    })
  })

  it('mix (RD…) se nestahuje jako playlist', () => {
    expect(
      parseYoutubeLink('https://www.youtube.com/watch?v=jNQXAC9IVRw&list=RDjNQXAC9IVRw')
    ).toEqual({ videoId: 'jNQXAC9IVRw', playlistId: null })
    expect(parseYoutubeLink('https://www.youtube.com/playlist?list=RDjNQXAC9IVRw')).toBeNull()
  })

  it('jiné weby a nesmysly odmítne', () => {
    expect(parseYoutubeLink('https://vimeo.com/watch?v=jNQXAC9IVRw')).toBeNull()
    expect(parseYoutubeLink('javascript:alert(1)')).toBeNull()
    expect(parseYoutubeLink('https://www.youtube.com/watch?v=kratke')).toBeNull()
  })
})

describe('parseDownloadRequest', () => {
  const video = {
    kind: 'video',
    videoId: 'jNQXAC9IVRw',
    playlistId: null,
    title: ' Prasátko Peppa ',
    quality: '720'
  }

  it('platný požadavek projde (název oříznutý)', () => {
    expect(parseDownloadRequest(video)).toEqual({ ...video, title: 'Prasátko Peppa' })
  })

  it('chybějící nebo neplatné údaje odmítne', () => {
    expect(parseDownloadRequest({ ...video, videoId: 'x' })).toBeNull()
    expect(parseDownloadRequest({ ...video, kind: 'playlist' })).toBeNull()
    expect(parseDownloadRequest({ ...video, title: '  ' })).toBeNull()
    expect(parseDownloadRequest({ ...video, title: 'x'.repeat(121) })).toBeNull()
    expect(parseDownloadRequest({ ...video, quality: '4k' })).toBeNull()
    expect(parseDownloadRequest(null)).toBeNull()
  })
})

describe('parseManageAction', () => {
  it('platné požadavky projdou, klíčová slova se uklidí', () => {
    expect(parseManageAction({ kind: 'rename-title', titleId: 3, name: ' Bluey ' })).toEqual({
      kind: 'rename-title',
      titleId: 3,
      name: 'Bluey'
    })
    expect(
      parseManageAction({ kind: 'set-keywords', titleId: 3, keywords: [' peppa ', 'PEPPA', '', 5] })
    ).toEqual({ kind: 'set-keywords', titleId: 3, keywords: ['peppa'] })
    expect(parseManageAction({ kind: 'set-cover', titleId: 3, videoId: null })).toEqual({
      kind: 'set-cover',
      titleId: 3,
      videoId: null
    })
    expect(parseManageAction({ kind: 'move-video', videoId: 7, titleId: 3 })).toEqual({
      kind: 'move-video',
      videoId: 7,
      titleId: 3
    })
  })

  it('neplatné odmítne', () => {
    expect(parseManageAction({ kind: 'rename-title', titleId: 3, name: '   ' })).toBeNull()
    expect(parseManageAction({ kind: 'trash-video', videoId: '7' })).toBeNull()
    expect(parseManageAction({ kind: 'move-video', videoId: 7 })).toBeNull()
    expect(parseManageAction({ kind: 'set-cover', titleId: 3 })).toBeNull()
    expect(parseManageAction({ kind: 'smazat-vse' })).toBeNull()
  })

  it('nejvýš 20 klíčových slov', () => {
    expect(cleanKeywords(Array.from({ length: 30 }, (_, i) => `slovo ${i}`))).toHaveLength(20)
  })
})

describe('pořad na TMDB', () => {
  it('odkaz z themoviedb.org', () => {
    expect(parseTmdbLink('https://www.themoviedb.org/tv/69501-bing')).toEqual({
      kind: 'tv',
      id: 69501
    })
    expect(parseTmdbLink(' https://www.themoviedb.org/movie/109445?language=cs-CZ ')).toEqual({
      kind: 'movie',
      id: 109445
    })
    expect(parseTmdbLink('https://www.themoviedb.org/cs-CZ/tv/12225/images')).toEqual({
      kind: 'tv',
      id: 12225
    })
    expect(parseTmdbLink('Prasátko Peppa')).toBeNull()
    expect(parseTmdbLink('https://example.com/tv/12')).toBeNull()
  })

  it('ruční výběr z okna', () => {
    expect(parseTmdbChoice(null)).toBeNull()
    expect(parseTmdbChoice({ kind: 'tv', id: 3, extra: 1 })).toEqual({ kind: 'tv', id: 3 })
    expect(parseTmdbChoice({ kind: 'person', id: 3 })).toBeUndefined()
    expect(parseTmdbChoice({ kind: 'tv', id: -1 })).toBeUndefined()
    expect(parseTmdbChoice('tv')).toBeUndefined()
  })

  it('obrázek titulu z TMDB jen jako cesta na TMDB', () => {
    expect(parseManageAction({ kind: 'set-cover-image', titleId: 2, image: '/abc.jpg' })).toEqual({
      kind: 'set-cover-image',
      titleId: 2,
      image: '/abc.jpg'
    })
    for (const image of ['../x.jpg', '/a/../b.jpg', 'C:\\x.jpg', '/x.exe', 7])
      expect(parseManageAction({ kind: 'set-cover-image', titleId: 2, image })).toBeNull()
    expect(parseManageAction({ kind: 'tmdb-retry', titleId: 2 })).toEqual({
      kind: 'tmdb-retry',
      titleId: 2
    })
  })
})

describe('parseDownloadRequest – YT videa', () => {
  it('prázdný název jen s allowAuto, kvalita 4K', () => {
    const value = {
      kind: 'video',
      videoId: 'aaaaaaaaaaa',
      playlistId: null,
      title: '',
      quality: '2160'
    }
    expect(parseDownloadRequest(value)).toBeNull()
    expect(parseDownloadRequest(value, { allowAuto: true })).toMatchObject({
      title: '',
      quality: '2160'
    })
  })
})
