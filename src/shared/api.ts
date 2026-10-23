import type { FileDetails, MovieItem, ShowItem } from './catalog'
import type {
  AddFolderResult,
  LibraryFolder,
  MediaFileSummary,
  ScanProgress,
  ScanResult
} from './library'
import type {
  ActionResult,
  ImdbStatus,
  MetadataSearchResult,
  SaveKeyResult,
  TmdbKeyStatus
} from './metadata'
import type { OpenFileResult, PlayerClosedInfo, PlayerCommand, PlayerState } from './player'

/** API, které preload zpřístupní oknům jako `window.kinoteka`. */
export interface KinotekaApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  player: {
    /** Otevře dialog pro výběr souboru a spustí přehrávání v tomto okně. */
    openFile(): Promise<OpenFileResult>
    /** Přehraje soubor z knihovny. */
    playFile(mediaFileId: number): Promise<OpenFileResult>
    /** Příkaz z ovládání přehrávače. */
    send(command: PlayerCommand): void
    /** Odebírá stav přehrávače; vrací funkci pro odhlášení. */
    onState(listener: (state: PlayerState) => void): () => void
    /** Přehrávání skončilo (zavřením nebo chybou). */
    onClosed(listener: (info: PlayerClosedInfo) => void): () => void
  }
  catalog: {
    /** Filmy rozpoznané z názvů souborů. Změny hlásí `library.onChanged`. */
    listMovies(): Promise<MovieItem[]>
    /** Seriály se sériemi a díly. */
    listShows(): Promise<ShowItem[]>
    /** Technické vlastnosti souboru (panel „Vlastnosti souboru“). */
    getFileDetails(fileId: number): Promise<FileDetails | null>
  }
  metadata: {
    keyStatus(): Promise<TmdbKeyStatus>
    /** Ověří klíč u TMDB a uloží ho (šifrovaně). */
    saveKey(key: string): Promise<SaveKeyResult>
    removeKey(): Promise<void>
    /** Vyhledávání pro dialog „Opravit shodu“. */
    search(
      kind: 'movie' | 'show',
      query: string,
      year: number | null
    ): Promise<MetadataSearchResult[]>
    applyMatch(titleId: number, tmdbId: number): Promise<ActionResult>
    /** Znovu načte údaje titulu z TMDB. */
    refresh(titleId: number): Promise<void>
  }
  imdb: {
    status(): Promise<ImdbStatus>
    setEnabled(enabled: boolean): Promise<void>
    /** Stáhne datový soubor IMDb hned (jinak jednou týdně). */
    updateNow(): Promise<void>
  }
  library: {
    listFolders(): Promise<LibraryFolder[]>
    listFiles(): Promise<MediaFileSummary[]>
    /** Vybere složku v dialogu, přidá ji a naskenuje. */
    pickFolder(): Promise<AddFolderResult>
    /** Přidá složku podle zadané cesty (typicky síťové \\NAS\…) a naskenuje ji. */
    addFolder(path: string): Promise<AddFolderResult>
    removeFolder(id: number): Promise<void>
    /** Naskenuje jednu složku, nebo bez parametru všechny. */
    scan(folderId?: number): Promise<ScanResult[]>
    onChanged(listener: () => void): () => void
    onScanProgress(listener: (progress: ScanProgress) => void): () => void
  }
}
