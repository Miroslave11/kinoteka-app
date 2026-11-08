import { describe, expect, it } from 'vitest'
import { cleanYtKeywords, parseYtManageAction } from './yt'

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
