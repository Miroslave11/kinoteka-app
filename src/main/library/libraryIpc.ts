import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '../../shared/ipc'
import { broadcast } from '../broadcast'
import type { AddFolderResult } from '../../shared/library'
import type { LibraryRepository } from './LibraryRepository'
import { LibraryError, type LibraryService } from './LibraryService'

const isId = (value: unknown): value is number => Number.isInteger(value) && (value as number) > 0

/** IPC knihovny. Vstupy z UI se ověřují – okno posílá jen data, nikdy cesty ke spuštění. */
export function registerLibraryIpc(service: LibraryService, repository: LibraryRepository): void {
  service.on('changed', () => broadcast(IpcChannel.LibraryChanged))
  service.on('progress', (progress) => broadcast(IpcChannel.LibraryScanProgress, progress))

  const addAndScan = async (path: string): Promise<AddFolderResult> => {
    try {
      const folder = await service.addFolder(path)
      const scan = await service.scanFolder(folder.id)
      return { ok: true, folder: repository.getFolder(folder.id) ?? folder, scan }
    } catch (error) {
      if (error instanceof LibraryError)
        return { ok: false, reason: 'error', message: error.message }
      throw error
    }
  }

  ipcMain.handle(IpcChannel.LibraryListFolders, () => service.listFolders())
  ipcMain.handle(IpcChannel.LibraryListFiles, () => repository.listFiles())

  ipcMain.handle(IpcChannel.LibraryPickFolder, async (event): Promise<AddFolderResult> => {
    const owner = BrowserWindow.fromWebContents(event.sender)
    const options = {
      title: 'Vyber složku s filmy nebo seriály',
      properties: ['openDirectory' as const]
    }
    const picked = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    const path = picked.filePaths[0]
    if (picked.canceled || !path) return { ok: false, reason: 'cancelled' }
    return addAndScan(path)
  })

  ipcMain.handle(IpcChannel.LibraryAddFolder, (_event, path: unknown) =>
    typeof path === 'string' && path.length < 1024
      ? addAndScan(path)
      : { ok: false, reason: 'error', message: 'Neplatná cesta.' }
  )

  ipcMain.handle(IpcChannel.LibraryRemoveFolder, (_event, id: unknown) => {
    if (isId(id)) service.removeFolder(id)
  })

  ipcMain.handle(IpcChannel.LibraryScan, async (_event, id: unknown) => {
    if (id === undefined || id === null) return service.scanAll()
    return isId(id) ? [await service.scanFolder(id)] : []
  })
}
