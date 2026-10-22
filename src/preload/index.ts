import { contextBridge } from 'electron'
import type { KinotekaApi } from '../shared/api'

const api: KinotekaApi = {
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  }
}

contextBridge.exposeInMainWorld('kinoteka', api)
