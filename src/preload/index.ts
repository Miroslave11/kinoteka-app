import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { KinotekaApi } from '../shared/api'
import { IpcChannel } from '../shared/ipc'

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: KinotekaApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  player: {
    openFile: () => ipcRenderer.invoke(IpcChannel.PlayerOpenFile),
    playFile: (mediaFileId) => ipcRenderer.invoke(IpcChannel.PlayerPlayFile, mediaFileId),
    send: (command) => ipcRenderer.send(IpcChannel.PlayerCommand, command),
    onState: (listener) => subscribe(IpcChannel.PlayerState, listener),
    onClosed: (listener) => subscribe(IpcChannel.PlayerClosed, listener)
  },
  catalog: {
    listMovies: () => ipcRenderer.invoke(IpcChannel.CatalogListMovies),
    listShows: () => ipcRenderer.invoke(IpcChannel.CatalogListShows),
    getFileDetails: (fileId) => ipcRenderer.invoke(IpcChannel.CatalogFileDetails, fileId)
  },
  metadata: {
    keyStatus: () => ipcRenderer.invoke(IpcChannel.MetadataKeyStatus),
    saveKey: (key) => ipcRenderer.invoke(IpcChannel.MetadataSaveKey, key),
    removeKey: () => ipcRenderer.invoke(IpcChannel.MetadataRemoveKey),
    search: (kind, query, year) =>
      ipcRenderer.invoke(IpcChannel.MetadataSearch, { kind, query, year }),
    applyMatch: (titleId, tmdbId) =>
      ipcRenderer.invoke(IpcChannel.MetadataApplyMatch, titleId, tmdbId),
    refresh: (titleId) => ipcRenderer.invoke(IpcChannel.MetadataRefresh, titleId)
  },
  csfd: {
    enabled: () => ipcRenderer.invoke(IpcChannel.CsfdEnabled),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.CsfdSetEnabled, enabled),
    link: (titleId, url) => ipcRenderer.invoke(IpcChannel.CsfdLink, titleId, url),
    refresh: (titleId) => ipcRenderer.invoke(IpcChannel.CsfdRefresh, titleId)
  },
  library: {
    listFolders: () => ipcRenderer.invoke(IpcChannel.LibraryListFolders),
    listFiles: () => ipcRenderer.invoke(IpcChannel.LibraryListFiles),
    pickFolder: () => ipcRenderer.invoke(IpcChannel.LibraryPickFolder),
    addFolder: (path) => ipcRenderer.invoke(IpcChannel.LibraryAddFolder, path),
    removeFolder: (id) => ipcRenderer.invoke(IpcChannel.LibraryRemoveFolder, id),
    scan: (folderId) => ipcRenderer.invoke(IpcChannel.LibraryScan, folderId),
    onChanged: (listener) => subscribe(IpcChannel.LibraryChanged, () => listener()),
    onScanProgress: (listener) => subscribe(IpcChannel.LibraryScanProgress, listener)
  }
}

contextBridge.exposeInMainWorld('kinoteka', api)
