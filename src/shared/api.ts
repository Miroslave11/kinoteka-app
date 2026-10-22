import type { MovieItem, ShowItem } from './catalog'
import type {
  AddFolderResult,
  LibraryFolder,
  MediaFileSummary,
  ScanProgress,
  ScanResult
} from './library'
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
