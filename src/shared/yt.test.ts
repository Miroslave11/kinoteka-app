import { describe, expect, it } from 'vitest'
import {
  cleanYtKeywords,
  parseConcurrency,
  parseYtManageAction,
  parseYtQueueAction,
  splitLinks
} from './yt'

describe('parseYtManageAction', () => {
  it('ověří akce správy', () => {
    expect(
      parseYtManageAction({ kind: 'rename-category', categoryId: 2, name: ' Pláže ' })
    ).toEqual({ kind: 'rename-category', categoryId: 2, name: 'Pláže' })
    expect(parseYtManageAction({ kind: 'move-video', videoId: 5, categoryId: 1 })).toEqual({
      kind: 'move-video',
      videoId: 5,
      categoryId: 1
    })
    expect(parseYtManageAction({ kind: 'trash-video', videoId: 0 })).toBeNull()
    expect(parseYtManageAction({ kind: 'delete-category', categoryId: '1' })).toBeNull()
    expect(parseYtManageAction({ kind: 'rename-category', categoryId: 2, name: '' })).toBeNull()
    expect(parseYtManageAction({ kind: 'neco' })).toBeNull()
    expect(parseYtManageAction({ kind: 'keep-online', videoId: 4 })).toEqual({
      kind: 'keep-online',
      videoId: 4
    })
    expect(parseYtManageAction({ kind: 'keep-online-category', categoryId: 2 })).toEqual({
      kind: 'keep-online-category',
      categoryId: 2
    })
  })

  it('klíčová slova bez prázdných a opakování', () => {
    expect(cleanYtKeywords([' city ', 'City', '', 3, 'walk'])).toEqual(['city', 'walk'])
  })
})

describe('fronta stahování', () => {
  it('počet souběžných stahování 1–3, jinak výchozí 2', () => {
    expect([1, 2, 3, 0, 4, 2.5, '3', undefined].map(parseConcurrency)).toEqual([
      1, 2, 3, 2, 2, 2, 2, 2
    ])
  })

  it('ovládání fronty z okna', () => {
    expect(parseYtQueueAction({ kind: 'pause' })).toEqual({ kind: 'pause' })
    expect(parseYtQueueAction({ kind: 'retry', id: 4 })).toEqual({ kind: 'retry', id: 4 })
    expect(parseYtQueueAction({ kind: 'retry' })).toEqual({ kind: 'retry', id: null })
    expect(parseYtQueueAction({ kind: 'smazat-disk' })).toBeNull()
    expect(parseYtQueueAction(null)).toBeNull()
  })

  it('víc odkazů: po řádcích i mezerách, bez opakování a prázdných', () => {
    expect(
      splitLinks(' https://youtu.be/a \n\nhttps://youtu.be/b https://youtu.be/a\r\n x ')
    ).toEqual(['https://youtu.be/a', 'https://youtu.be/b', 'x'])
  })
})
