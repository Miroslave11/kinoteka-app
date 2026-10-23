/** Názvy IPC kanálů mezi hlavním procesem a okny. */
export const IpcChannel = {
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

  CatalogListMovies: 'catalog:list-movies',
  CatalogListShows: 'catalog:list-shows',
  CatalogFileDetails: 'catalog:file-details',

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

  JournalList: 'journal:list',
  JournalAddManual: 'journal:add-manual',
  JournalUpdate: 'journal:update',
  JournalRemove: 'journal:remove',
  JournalSetRating: 'journal:set-rating',

  DeletionPlan: 'deletion:plan',
  DeletionExecute: 'deletion:execute',

  PreviewStatus: 'preview:status',
  PreviewSetClipsEnabled: 'preview:set-clips-enabled'
} as const
