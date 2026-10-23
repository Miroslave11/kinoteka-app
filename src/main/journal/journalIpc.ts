import { ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { isRating, parseEntryUpdate, parseManualEntry } from '../../shared/journal'
import type { JournalRepository } from './JournalRepository'

/** Deník a hodnocení. Každá změna se ohlásí jako změna knihovny (fajfky, hvězdy v katalogu). */
export function registerJournalIpc(journal: JournalRepository, changed: () => void): void {
  ipcMain.handle(IpcChannel.JournalList, () => journal.list())

  ipcMain.handle(IpcChannel.JournalAddManual, (_event, value: unknown) => {
    const entry = parseManualEntry(value)
    if (!entry) return 0
    const added = journal.addManual(entry)
    changed()
    return added
  })

  ipcMain.handle(IpcChannel.JournalUpdate, (_event, id: unknown, value: unknown) => {
    const patch = parseEntryUpdate(value)
    if (!Number.isInteger(id) || !patch) return
    journal.update(id as number, patch)
    changed()
  })

  ipcMain.handle(IpcChannel.JournalRemove, (_event, id: unknown) => {
    if (!Number.isInteger(id)) return
    journal.remove(id as number)
    changed()
  })

  ipcMain.handle(IpcChannel.JournalSetRating, (_event, titleId: unknown, rating: unknown) => {
    if (!Number.isInteger(titleId) || (rating !== null && !isRating(rating))) return
    journal.setRating(titleId as number, rating as number | null)
    changed()
  })
}
