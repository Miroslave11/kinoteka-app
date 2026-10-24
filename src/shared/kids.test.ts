import { describe, expect, it } from 'vitest'
import {
  cleanKeywords,
  parseDownloadRequest,
  parseManageAction,
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
