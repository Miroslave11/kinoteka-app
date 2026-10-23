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

  CsfdEnabled: 'csfd:enabled',
  CsfdSetEnabled: 'csfd:set-enabled',
  CsfdLink: 'csfd:link',
  CsfdRefresh: 'csfd:refresh'
} as const
