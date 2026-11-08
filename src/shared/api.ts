import type { FileDetails, MovieItem, ShowItem } from './catalog'
import type { ClassificationResult, FileClassification } from './classification'
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
import type { PreviewStatus } from './posterPalette'
import type { AudioDevice, AudioSettings } from './audio'
import type { DeletionPlan, DeletionResult } from './deletion'
import type { JournalEntry, ManualEntry } from './journal'
import type {
  KidsChallenge,
  KidsDownloadRequest,
  KidsManageAction,
  KidsManageResult,
  KidsTmdbChoice,
  KidsTmdbResult,
  KidsPreviewResult,
  KidsPreviewStage,
  KidsQueueItem,
  KidsMode,
  KidsUnlockResult,
  KidsScanResult,
  KidsSettings,
  KidsStatus,
  KidsTitle
} from './kids'
import type {
  OnlineDownloadResult,
  OnlineSearchResult,
  OnlineSubtitlesCredentials,
  OnlineSubtitlesStatus
} from './onlineSubtitles'
import type { PlayRequest } from './playback'
import type { SubtitleSettings } from './subtitles'
import type { ThemeInfo, ThemeResult, ThemeSettings, ThemeStatus } from './theme'
import type { UpdateState } from './update'
import type {
  YtCategory,
  YtManageAction,
  YtManageResult,
  YtQueueAction,
  YtScanResult,
  YtStatus
} from './yt'
import type { OpenFileResult, PlayerClosedInfo, PlayerCommand, PlayerState } from './player'

export interface AppInfo {
  version: string
  /** Verze přibaleného mpv a ffmpeg; null = nezjištěno. */
  mpv: string | null
  ffmpeg: string | null
  dataPath: string
  logsPath: string
}

/** Režim hlavního okna. */
export interface WindowState {
  /** Celá obrazovka – bez lišty okna a hlavního panelu Windows. */
  fullscreen: boolean
}

/** API, které preload zpřístupní oknům jako `window.kinoteka`. */
export interface KinotekaApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
  app: {
    info(): Promise<AppInfo>
    /** Otevře v Průzkumníkovi složku s daty (databáze, cache) nebo se záznamy (logy). */
    openFolder(which: 'data' | 'logs'): Promise<void>
    /** Ukončí aplikaci (na celé obrazovce chybí tlačítko Zavřít). */
    quit(): Promise<void>
  }
  /** Celá obrazovka, nebo okno (ikona v horní liště, F11, Esc). */
  appWindow: {
    state(): Promise<WindowState>
    setFullscreen(fullscreen: boolean): Promise<void>
    onChanged(listener: (state: WindowState) => void): () => void
  }
  /** Automatické aktualizace (jen v nainstalované aplikaci). */
  update: {
    state(): Promise<UpdateState>
    /** Zkontroluje novou verzi hned. */
    check(): Promise<UpdateState>
    /** Ukončí aplikaci a nainstaluje připravenou verzi; false = žádná připravená není. */
    install(): Promise<boolean>
    setAutoCheck(enabled: boolean): Promise<void>
    onChanged(listener: (state: UpdateState) => void): () => void
  }
  player: {
    /** Otevře dialog pro výběr souboru a spustí přehrávání v tomto okně. */
    openFile(): Promise<OpenFileResult>
    /** Přehraje soubor z knihovny – od začátku, nebo od uložené pozice. */
    playFile(request: PlayRequest): Promise<OpenFileResult>
    /** Příkaz z ovládání přehrávače. */
    send(command: PlayerCommand): void
    /** Odebírá stav přehrávače; vrací funkci pro odhlášení. */
    onState(listener: (state: PlayerState) => void): () => void
    /** Přehrávání skončilo (zavřením nebo chybou). */
    onClosed(listener: (info: PlayerClosedInfo) => void): () => void
  }
  audio: {
    getSettings(): Promise<AudioSettings>
    /** Uloží nastavení zvuku (projeví se při dalším spuštění přehrávání) a vrátí ověřenou podobu. */
    saveSettings(value: AudioSettings): Promise<AudioSettings>
    /** Zvuková zařízení, jak je vidí mpv. */
    listDevices(): Promise<AudioDevice[]>
  }
  subtitles: {
    getSettings(): Promise<SubtitleSettings>
    /** Uloží nastavení titulků (projeví se při dalším spuštění přehrávání). */
    saveSettings(value: SubtitleSettings): Promise<SubtitleSettings>
  }
  onlineSubtitles: {
    status(): Promise<OnlineSubtitlesStatus>
    /** Ověří a uloží klíč API (a přihlášení); vrací chybu srozumitelně. */
    save(
      credentials: OnlineSubtitlesCredentials
    ): Promise<{ ok: true } | { ok: false; message: string }>
    remove(): Promise<void>
    /** Jen z přehrávače: hledá titulky k právě hranému souboru. */
    search(): Promise<OnlineSearchResult>
    /** Jen z přehrávače: stáhne titulky, uloží je vedle filmu a zapne. */
    download(fileId: number): Promise<OnlineDownloadResult>
  }
  journal: {
    list(): Promise<JournalEntry[]>
    /** „Viděl jsem“ – vrací počet nových záznamů. */
    addManual(entry: ManualEntry): Promise<number>
    update(id: number, patch: { watchedAt?: string; note?: string | null }): Promise<void>
    remove(id: number): Promise<void>
    /** Moje hodnocení titulu 1–5; null = zrušit. */
    setRating(titleId: number, rating: number | null): Promise<void>
  }
  deletion: {
    /** Co se smaže: soubory, titulky, velikost, jestli trvale (síť). */
    plan(fileIds: number[]): Promise<DeletionPlan>
    /** Smaže soubory (lokálně do Koše, na síti trvale). Deník a hodnocení zůstanou. */
    execute(fileIds: number[]): Promise<DeletionResult>
  }
  catalog: {
    /** Filmy rozpoznané z názvů souborů. Změny hlásí `library.onChanged`. */
    listMovies(): Promise<MovieItem[]>
    /** Seriály se sériemi a díly. */
    listShows(): Promise<ShowItem[]>
    /** Technické vlastnosti souboru (panel „Vlastnosti souboru“). */
    getFileDetails(fileId: number): Promise<FileDetails | null>
    /** Ruční zařazení souboru (null = vrátit rozpoznání z názvu); vrací titul, kam soubor patří. */
    classify(
      fileId: number,
      classification: FileClassification | null
    ): Promise<ClassificationResult | null>
    /**
     * Celou složku souboru zařadí jako jeden seriál (kurz); díly podle pořadí názvů souborů.
     * Použije se název, rok a série ze zařazení dílu.
     */
    classifyFolder(
      fileId: number,
      classification: FileClassification
    ): Promise<ClassificationResult | null>
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
  /** Ústřední melodie na stránce filmu a seriálu. */
  theme: {
    getSettings(): Promise<ThemeSettings>
    saveSettings(value: ThemeSettings): Promise<ThemeSettings>
    /** Melodie titulu; null = neplatné id. */
    info(titleId: number): Promise<ThemeInfo | null>
    /** Vybere zvukový soubor v dialogu; null = výběr zrušen. */
    pickFile(titleId: number): Promise<ThemeResult | null>
    /** Stáhne melodii z videa na YouTube. */
    setYoutube(titleId: number, link: string): Promise<ThemeResult>
    /** Titul bude bez melodie. */
    setNone(titleId: number): Promise<ThemeInfo | null>
    /** Zruší ruční volbu (znovu platí soubor vedle filmu). */
    reset(titleId: number): Promise<ThemeInfo | null>
    /** Automatické stahování: kolik titulů čeká, kolik má melodii. */
    status(): Promise<ThemeStatus>
    onStatusChanged(listener: (status: ThemeStatus) => void): () => void
    /** Titul dostal automaticky staženou melodii. */
    onDownloaded(listener: (titleId: number) => void): () => void
  }
  preview: {
    /** Stav klipů na pozadí; null, když chybí ffmpeg. */
    status(): Promise<PreviewStatus | null>
    setClipsEnabled(enabled: boolean): Promise<void>
  }
  kids: {
    status(): Promise<KidsStatus>
    /** Náhled odkazu na video nebo playlist s návrhem titulu (část Pro rodiče). */
    preview(url: string): Promise<KidsPreviewResult>
    /** Co právě náhled dělá (text na tlačítku Načíst). */
    onPreviewStage(listener: (stage: KidsPreviewStage) => void): () => void
    /** Připraví yt-dlp na pozadí (při otevření stahování), ať je první náhled rychlejší. */
    warmUp(): Promise<void>
    /** Zařadí video nebo celý playlist do fronty stahování. */
    enqueue(
      request: KidsDownloadRequest
    ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }>
    queue(): Promise<KidsQueueItem[]>
    /** Čekající video odebere, stahované zruší. */
    removeFromQueue(id: number): Promise<void>
    clearFinished(): Promise<void>
    onQueueChanged(listener: (items: KidsQueueItem[]) => void): () => void
    getSettings(): Promise<KidsSettings>
    /** Uloží nastavení dětské části a vrátí ověřenou podobu. */
    saveSettings(value: KidsSettings): Promise<KidsSettings>
    /** Tituly (podsložky) s videi; videa, která nejde zařadit, jsou v titulu „Ostatní“. */
    listTitles(): Promise<KidsTitle[]>
    /** Projde složku, nová videa zařadí do titulů. */
    scan(): Promise<KidsScanResult>
    onChanged(listener: () => void): () => void
    /** Přehraje pohádku v dětském přehrávači (rozkoukanou od uložené pozice). */
    playVideo(videoId: number): Promise<OpenFileResult>
    /** Srdíčko u titulu nebo pohádky. */
    setFavorite(kind: 'title' | 'video', id: number, favorite: boolean): Promise<void>
    /** Je okno v dětském režimu, je otevřená část Pro rodiče, kolik zbývá času pohádek. */
    mode(): Promise<KidsMode>
    /** Vstup do dětského režimu (zamkne ho, přežije restart). */
    enter(): Promise<void>
    /** Otázka rodičovské brány (PIN, nebo příklad). */
    challenge(): Promise<KidsChallenge>
    unlock(answer: string): Promise<KidsUnlockResult>
    /** Zavře část Pro rodiče (dětský režim zůstane). */
    leaveParent(): Promise<void>
    /** Odchod z dětského režimu – jen za branou; false = nepovoleno. */
    exit(): Promise<boolean>
    /** Nový PIN (4–8 číslic), null = zrušit. */
    setPin(pin: string | null): Promise<boolean>
    /** Vynuluje dnešní čas pohádek. */
    resetPlayTime(): Promise<boolean>
    /** Vybere jinou složku s pohádkami; null = zrušeno. */
    pickFolder(): Promise<string | null>
    checkYtDlp(): Promise<{ ok: true; version: string } | { ok: false; message: string }>
    openFolder(): Promise<void>
    /** Všechny tituly včetně prázdných a cesta ke složce Kids (správa titulů). */
    manageTitles(): Promise<{ folder: string; titles: KidsTitle[] }>
    /** Přejmenování, obrázek, klíčová slova, přesun a mazání do Koše (jen rodiče). */
    manage(action: KidsManageAction): Promise<KidsManageResult>
    /** Hledání pořadu na TMDB podle názvu nebo odkazu z themoviedb.org (jen rodiče). */
    searchTmdb(
      query: string
    ): Promise<{ ok: true; results: KidsTmdbResult[] } | { ok: false; message: string }>
    /** Ruční výběr pořadu na TMDB; null = obrázky z TMDB u titulu nepoužívat. */
    chooseTmdb(titleId: number, choice: KidsTmdbChoice): Promise<KidsManageResult>
    /** Vlastní obrázek titulu vybraný v dialogu; null = výběr zrušen. */
    pickCover(titleId: number): Promise<KidsManageResult | null>
  }
  yt: {
    status(): Promise<YtStatus>
    /** Kategorie (podsložky) s videi; videa čekající na údaje z YouTube jsou na konci. */
    listCategories(): Promise<YtCategory[]>
    /** Projde složku, videa z jejího kořene zařadí do kategorií. */
    scan(): Promise<YtScanResult>
    onChanged(listener: () => void): () => void
    /** Vybere jinou složku s YT videi; null = zrušeno. */
    pickFolder(): Promise<string | null>
    /** Nová kategorie, klíčová slova kategorie. */
    manage(action: YtManageAction): Promise<YtManageResult>
    openFolder(): Promise<void>
    /** Přehraje video (rozkoukané od uložené pozice, předchozí / další v kategorii). */
    playVideo(videoId: number): Promise<OpenFileResult>
    /** Online video: zjistí adresy předem (najetí myší), spuštění pak nečeká. */
    prefetch(videoId: number): Promise<void>
    /** Náhled odkazu s návrhem kategorie (podle názvu a kanálu). */
    preview(url: string): Promise<KidsPreviewResult>
    onPreviewStage(listener: (stage: KidsPreviewStage) => void): () => void
    warmUp(): Promise<void>
    /** Video nebo playlist do fronty; prázdný `title` = zařadit podle obsahu po stažení. */
    enqueue(
      request: KidsDownloadRequest
    ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }>
    queue(): Promise<KidsQueueItem[]>
    removeFromQueue(id: number): Promise<void>
    clearFinished(): Promise<void>
    /** Pozastavit / pokračovat / zkusit znovu / zrušit vše. */
    controlQueue(action: YtQueueAction): Promise<void>
    /** Kolik videí stahovat najednou (1–3). */
    setConcurrency(count: number): Promise<number>
    onQueueChanged(listener: (items: KidsQueueItem[]) => void): () => void
    /** Přidá video nebo playlist jako online (jen odkaz, nic se nestahuje). */
    addOnline(
      request: KidsDownloadRequest
    ): Promise<{ ok: true; added: number; skipped: number } | { ok: false; message: string }>
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
    /** Automatický sken při startu a každých 30 minut. */
    autoScan(): Promise<boolean>
    setAutoScan(enabled: boolean): Promise<void>
    onChanged(listener: () => void): () => void
    onScanProgress(listener: (progress: ScanProgress) => void): () => void
  }
}
