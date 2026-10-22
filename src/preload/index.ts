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
    send: (command) => ipcRenderer.send(IpcChannel.PlayerCommand, command),
    onState: (listener) => subscribe(IpcChannel.PlayerState, listener),
    onClosed: (listener) => subscribe(IpcChannel.PlayerClosed, listener)
  }
}

contextBridge.exposeInMainWorld('kinoteka', api)
