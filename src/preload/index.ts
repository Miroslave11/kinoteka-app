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
  app: {
    info: () => ipcRenderer.invoke(IpcChannel.AppInfo),
    openFolder: (which) => ipcRenderer.invoke(IpcChannel.AppOpenFolder, which),
    quit: () => ipcRenderer.invoke(IpcChannel.AppQuit)
  },
  appWindow: {
    state: () => ipcRenderer.invoke(IpcChannel.WindowState),
    setFullscreen: (fullscreen) => ipcRenderer.invoke(IpcChannel.WindowSetFullscreen, fullscreen),
    onChanged: (listener) => subscribe(IpcChannel.WindowChanged, listener)
  },
  update: {
    state: () => ipcRenderer.invoke(IpcChannel.UpdateState),
    check: () => ipcRenderer.invoke(IpcChannel.UpdateCheck),
    install: () => ipcRenderer.invoke(IpcChannel.UpdateInstall),
    setAutoCheck: (enabled) => ipcRenderer.invoke(IpcChannel.UpdateSetAutoCheck, enabled),
    onChanged: (listener) => subscribe(IpcChannel.UpdateChanged, listener)
  },
  player: {
    openFile: () => ipcRenderer.invoke(IpcChannel.PlayerOpenFile),
    playFile: (request) => ipcRenderer.invoke(IpcChannel.PlayerPlayFile, request),
    send: (command) => ipcRenderer.send(IpcChannel.PlayerCommand, command),
    onState: (listener) => subscribe(IpcChannel.PlayerState, listener),
    onClosed: (listener) => subscribe(IpcChannel.PlayerClosed, listener)
  },
  audio: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.AudioGetSettings),
    saveSettings: (value) => ipcRenderer.invoke(IpcChannel.AudioSaveSettings, value),
    listDevices: () => ipcRenderer.invoke(IpcChannel.AudioListDevices)
  },
  subtitles: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.SubtitlesGetSettings),
    saveSettings: (value) => ipcRenderer.invoke(IpcChannel.SubtitlesSaveSettings, value)
  },
  onlineSubtitles: {
    status: () => ipcRenderer.invoke(IpcChannel.OnlineSubtitlesStatus),
    save: (credentials) => ipcRenderer.invoke(IpcChannel.OnlineSubtitlesSave, credentials),
    remove: () => ipcRenderer.invoke(IpcChannel.OnlineSubtitlesRemove),
    search: () => ipcRenderer.invoke(IpcChannel.OnlineSubtitlesSearch),
    download: (fileId) => ipcRenderer.invoke(IpcChannel.OnlineSubtitlesDownload, fileId)
  },
  journal: {
    list: () => ipcRenderer.invoke(IpcChannel.JournalList),
    addManual: (entry) => ipcRenderer.invoke(IpcChannel.JournalAddManual, entry),
    update: (id, patch) => ipcRenderer.invoke(IpcChannel.JournalUpdate, id, patch),
    remove: (id) => ipcRenderer.invoke(IpcChannel.JournalRemove, id),
    setRating: (titleId, rating) => ipcRenderer.invoke(IpcChannel.JournalSetRating, titleId, rating)
  },
  deletion: {
    plan: (fileIds) => ipcRenderer.invoke(IpcChannel.DeletionPlan, fileIds),
    execute: (fileIds) => ipcRenderer.invoke(IpcChannel.DeletionExecute, fileIds)
  },
  catalog: {
    listMovies: () => ipcRenderer.invoke(IpcChannel.CatalogListMovies),
    listShows: () => ipcRenderer.invoke(IpcChannel.CatalogListShows),
    getFileDetails: (fileId) => ipcRenderer.invoke(IpcChannel.CatalogFileDetails, fileId),
    classify: (fileId, classification) =>
      ipcRenderer.invoke(IpcChannel.CatalogClassify, fileId, classification),
    classifyFolder: (fileId, classification) =>
      ipcRenderer.invoke(IpcChannel.CatalogClassifyFolder, fileId, classification)
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
  imdb: {
    status: () => ipcRenderer.invoke(IpcChannel.ImdbStatus),
    setEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.ImdbSetEnabled, enabled),
    updateNow: () => ipcRenderer.invoke(IpcChannel.ImdbUpdateNow)
  },
  theme: {
    getSettings: () => ipcRenderer.invoke(IpcChannel.ThemeGetSettings),
    saveSettings: (value) => ipcRenderer.invoke(IpcChannel.ThemeSaveSettings, value),
    info: (titleId) => ipcRenderer.invoke(IpcChannel.ThemeInfo, titleId),
    pickFile: (titleId) => ipcRenderer.invoke(IpcChannel.ThemePickFile, titleId),
    setYoutube: (titleId, link) => ipcRenderer.invoke(IpcChannel.ThemeSetYoutube, titleId, link),
    setNone: (titleId) => ipcRenderer.invoke(IpcChannel.ThemeSetNone, titleId),
    reset: (titleId) => ipcRenderer.invoke(IpcChannel.ThemeReset, titleId),
    status: () => ipcRenderer.invoke(IpcChannel.ThemeStatus),
    onStatusChanged: (listener) => subscribe(IpcChannel.ThemeStatusChanged, listener),
    onDownloaded: (listener) => subscribe(IpcChannel.ThemeDownloaded, listener)
  },
  preview: {
    status: () => ipcRenderer.invoke(IpcChannel.PreviewStatus),
    setClipsEnabled: (enabled) => ipcRenderer.invoke(IpcChannel.PreviewSetClipsEnabled, enabled)
  },
  kids: {
    status: () => ipcRenderer.invoke(IpcChannel.KidsStatus),
    preview: (url) => ipcRenderer.invoke(IpcChannel.KidsPreview, url),
    onPreviewStage: (listener) => subscribe(IpcChannel.KidsPreviewStage, listener),
    warmUp: () => ipcRenderer.invoke(IpcChannel.KidsWarmUp),
    enqueue: (request) => ipcRenderer.invoke(IpcChannel.KidsEnqueue, request),
    queue: () => ipcRenderer.invoke(IpcChannel.KidsQueue),
    removeFromQueue: (id) => ipcRenderer.invoke(IpcChannel.KidsQueueRemove, id),
    clearFinished: () => ipcRenderer.invoke(IpcChannel.KidsQueueClear),
    onQueueChanged: (listener) => subscribe(IpcChannel.KidsQueueChanged, listener),
    getSettings: () => ipcRenderer.invoke(IpcChannel.KidsGetSettings),
    saveSettings: (value) => ipcRenderer.invoke(IpcChannel.KidsSaveSettings, value),
    listTitles: () => ipcRenderer.invoke(IpcChannel.KidsListTitles),
    scan: () => ipcRenderer.invoke(IpcChannel.KidsScan),
    onChanged: (listener) => subscribe(IpcChannel.KidsChanged, () => listener()),
    playVideo: (videoId) => ipcRenderer.invoke(IpcChannel.KidsPlayVideo, videoId),
    setFavorite: (kind, id, favorite) =>
      ipcRenderer.invoke(IpcChannel.KidsSetFavorite, kind, id, favorite),
    mode: () => ipcRenderer.invoke(IpcChannel.KidsMode),
    enter: () => ipcRenderer.invoke(IpcChannel.KidsEnter),
    challenge: () => ipcRenderer.invoke(IpcChannel.KidsChallenge),
    unlock: (answer) => ipcRenderer.invoke(IpcChannel.KidsUnlock, answer),
    leaveParent: () => ipcRenderer.invoke(IpcChannel.KidsLeaveParent),
    exit: () => ipcRenderer.invoke(IpcChannel.KidsExit),
    setPin: (pin) => ipcRenderer.invoke(IpcChannel.KidsSetPin, pin),
    resetPlayTime: () => ipcRenderer.invoke(IpcChannel.KidsResetPlayTime),
    pickFolder: () => ipcRenderer.invoke(IpcChannel.KidsPickFolder),
    checkYtDlp: () => ipcRenderer.invoke(IpcChannel.KidsCheckYtDlp),
    openFolder: () => ipcRenderer.invoke(IpcChannel.KidsOpenFolder),
    manageTitles: () => ipcRenderer.invoke(IpcChannel.KidsManageTitles),
    manage: (action) => ipcRenderer.invoke(IpcChannel.KidsManage, action),
    searchTmdb: (query) => ipcRenderer.invoke(IpcChannel.KidsSearchTmdb, query),
    chooseTmdb: (titleId, choice) => ipcRenderer.invoke(IpcChannel.KidsChooseTmdb, titleId, choice),
    pickCover: (titleId) => ipcRenderer.invoke(IpcChannel.KidsPickCover, titleId)
  },
  yt: {
    status: () => ipcRenderer.invoke(IpcChannel.YtStatus),
    listCategories: () => ipcRenderer.invoke(IpcChannel.YtListCategories),
    scan: () => ipcRenderer.invoke(IpcChannel.YtScan),
    onChanged: (listener) => subscribe(IpcChannel.YtChanged, () => listener()),
    pickFolder: () => ipcRenderer.invoke(IpcChannel.YtPickFolder),
    manage: (action) => ipcRenderer.invoke(IpcChannel.YtManage, action),
    openFolder: () => ipcRenderer.invoke(IpcChannel.YtOpenFolder),
    playVideo: (videoId) => ipcRenderer.invoke(IpcChannel.YtPlayVideo, videoId),
    preview: (url) => ipcRenderer.invoke(IpcChannel.YtPreview, url),
    onPreviewStage: (listener) => subscribe(IpcChannel.YtPreviewStage, listener),
    warmUp: () => ipcRenderer.invoke(IpcChannel.YtWarmUp),
    enqueue: (request) => ipcRenderer.invoke(IpcChannel.YtEnqueue, request),
    queue: () => ipcRenderer.invoke(IpcChannel.YtQueue),
    removeFromQueue: (id) => ipcRenderer.invoke(IpcChannel.YtQueueRemove, id),
    clearFinished: () => ipcRenderer.invoke(IpcChannel.YtQueueClear),
    onQueueChanged: (listener) => subscribe(IpcChannel.YtQueueChanged, listener),
    addOnline: (request) => ipcRenderer.invoke(IpcChannel.YtAddOnline, request)
  },
  library: {
    listFolders: () => ipcRenderer.invoke(IpcChannel.LibraryListFolders),
    listFiles: () => ipcRenderer.invoke(IpcChannel.LibraryListFiles),
    pickFolder: () => ipcRenderer.invoke(IpcChannel.LibraryPickFolder),
    addFolder: (path) => ipcRenderer.invoke(IpcChannel.LibraryAddFolder, path),
    removeFolder: (id) => ipcRenderer.invoke(IpcChannel.LibraryRemoveFolder, id),
    scan: (folderId) => ipcRenderer.invoke(IpcChannel.LibraryScan, folderId),
    onChanged: (listener) => subscribe(IpcChannel.LibraryChanged, () => listener()),
    autoScan: () => ipcRenderer.invoke(IpcChannel.LibraryAutoScan),
    setAutoScan: (enabled) => ipcRenderer.invoke(IpcChannel.LibrarySetAutoScan, enabled),
    onScanProgress: (listener) => subscribe(IpcChannel.LibraryScanProgress, listener)
  }
}

contextBridge.exposeInMainWorld('kinoteka', api)
