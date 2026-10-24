/** Názvy IPC kanálů mezi hlavním procesem a okny. */
export const IpcChannel = {
  AppInfo: 'app:info',
  AppOpenFolder: 'app:open-folder',

  PlayerOpenFile: 'player:open-file',
  PlayerPlayFile: 'player:play-file',
  PlayerCommand: 'player:command',
  PlayerState: 'player:state',
  PlayerClosed: 'player:closed',

  LibraryListFolders: 'library:list-folders',
  LibraryListFiles: 'library:list-files',
  LibraryPickFolder: 'library:pick-folder',
  LibraryAddFolder: 'library:add-folder',
  LibraryRemoveFolder: 'library:remove-folder',
  LibraryScan: 'library:scan',
  LibraryChanged: 'library:changed',
  LibraryScanProgress: 'library:scan-progress',
  LibraryAutoScan: 'library:auto-scan',
  LibrarySetAutoScan: 'library:set-auto-scan',

  CatalogListMovies: 'catalog:list-movies',
  CatalogListShows: 'catalog:list-shows',
  CatalogFileDetails: 'catalog:file-details',
  CatalogClassify: 'catalog:classify',

  MetadataKeyStatus: 'metadata:key-status',
  MetadataSaveKey: 'metadata:save-key',
  MetadataRemoveKey: 'metadata:remove-key',
  MetadataSearch: 'metadata:search',
  MetadataApplyMatch: 'metadata:apply-match',
  MetadataRefresh: 'metadata:refresh',

  ImdbStatus: 'imdb:status',
  ImdbSetEnabled: 'imdb:set-enabled',
  ImdbUpdateNow: 'imdb:update-now',

  AudioGetSettings: 'audio:get-settings',
  AudioSaveSettings: 'audio:save-settings',
  AudioListDevices: 'audio:list-devices',
  SubtitlesGetSettings: 'subtitles:get-settings',
  SubtitlesSaveSettings: 'subtitles:save-settings',
  OnlineSubtitlesStatus: 'online-subtitles:status',
  OnlineSubtitlesSave: 'online-subtitles:save',
  OnlineSubtitlesRemove: 'online-subtitles:remove',
  OnlineSubtitlesSearch: 'online-subtitles:search',
  OnlineSubtitlesDownload: 'online-subtitles:download',

  JournalList: 'journal:list',
  JournalAddManual: 'journal:add-manual',
  JournalUpdate: 'journal:update',
  JournalRemove: 'journal:remove',
  JournalSetRating: 'journal:set-rating',

  DeletionPlan: 'deletion:plan',
  DeletionExecute: 'deletion:execute',

  PreviewStatus: 'preview:status',
  PreviewSetClipsEnabled: 'preview:set-clips-enabled',

  KidsStatus: 'kids:status',
  KidsDownload: 'kids:download',
  KidsDownloadProgress: 'kids:download-progress',
  KidsListTitles: 'kids:list-titles',
  KidsScan: 'kids:scan',
  KidsChanged: 'kids:changed',
  KidsPlayVideo: 'kids:play-video',
  KidsOpenFolder: 'kids:open-folder'
} as const
