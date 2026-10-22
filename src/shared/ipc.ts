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
  CatalogFileDetails: 'catalog:file-details'
} as const
