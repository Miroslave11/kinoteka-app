import { describe, expect, it } from 'vitest'
import { parseYoutubeUrl } from './kids'

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
