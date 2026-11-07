import { app, BaseWindow, BrowserWindow, dialog } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { audioTracksFromMpv, type AudioTrack } from '../../shared/audio'
import { IpcChannel } from '../../shared/ipc'
import {
  describeAudioOutput,
  INITIAL_PLAYER_STATE,
  type KidsPlayerInfo,
  type PlayerClosedInfo,
  type PlayerCommand,
  type PlayerState
} from '../../shared/player'
import {
  subtitleTracksFromMpv,
  SUBTITLE_EXTENSIONS,
  type SubtitleTrack
} from '../../shared/subtitles'
import { mpvExecutablePath } from '../mpv/binary'
import { connectToMpv, type MpvClient } from '../mpv/MpvClient'
import { buildMpvArgs, windowHandleToId, type MpvLaunchOptions } from '../mpv/mpvArgs'
import { hardenWebContents, loadRendererPage, preloadPath } from '../rendererPage'
import type { ExternalSubtitle } from '../subtitles/externalSubtitles'
import { TrackSelector, type TrackChoices } from './TrackSelector'
import { createOverlayWindowOptions, createVideoWindowOptions } from '../windowOptions'

/** Pozice se do overlaye posílá nejvýš 4× za sekundu, ostatní změny hned. */
const POSITION_UPDATE_MS = 250
const QUIT_TIMEOUT_MS = 2000
/** Za jak dlouho po spuštění souboru se kontroluje, jestli se přehrávání rozběhlo. */
const STALL_CHECK_MS = 5000

const OBSERVED_PROPERTIES = [
  'pause',
  'time-pos',
  'duration',
  'volume',
  'mute',
  'eof-reached',
  'media-title',
  'audio-codec-name',
  'audio-params',
  'audio-out-params',
  'video-format',
  'video-params',
  'path',
  'track-list',
  'sub-delay'
]

const BOUNDS_EVENTS = [
  'move',
  'resize',
  'maximize',
  'unmaximize',
  'restore',
  'enter-full-screen',
  'leave-full-screen'
] as const

export interface PlayerSessionOptions {
  /** Hlavní okno aplikace – po dobu přehrávání se schová a video zaujme jeho místo. */
  mainWindow: BrowserWindow
  file: string
  /** Název z knihovny („Země gangů · S01E02 · Puzzle“); jinak název z mpv nebo souboru. */
  title?: string
  /** Začít od pozice (s) – pokračování. */
  startSec?: number
  /** Popis dalšího dílu pro tlačítko „Další díl“. */
  next?: string | null
  /** Popis předchozího dílu pro tlačítko „Předchozí díl“. */
  previous?: string | null
  /** Volby zvuku pro mpv (passthrough, zařízení, kanály, jazyky). */
  audio: Pick<
    MpvLaunchOptions,
    'passthroughCodecs' | 'audioDevice' | 'audioChannels' | 'audioLanguages'
  >
  /** Jak vybrat zvuk a titulky po načtení souboru. */
  tracks: TrackChoices
  /** Styl titulků (volby `--sub-…`). */
  subtitleArgs?: readonly string[]
  logFile?: string
  /** Pozice a délka právě hraného souboru (několikrát za sekundu). */
  onProgress?: (position: number, duration: number) => void
  /** Tlačítko Zastavit – volající zapomene rozkoukání, pak se přehrávač zavře. */
  onStop?: () => void
  /** Uživatel chce další díl – volající pak zavolá `load()`. */
  onNext?: () => void
  /** Pohádka z dětské části: dětské ovládání, předchozí pohádka a srdíčko. */
  kids?: KidsPlayerInfo
  onPrevious?: () => void
  onToggleFavorite?: () => void
  /** Uživatel ručně vybral zvukovou stopu (zapamatuje se pro titul). */
  onAudioTrackChosen?: (track: AudioTrack) => void
  /** Uživatel ručně vybral titulky (null = vypnul). */
  onSubtitleChosen?: (track: SubtitleTrack | null) => void
  /** Uživatel změnil posun titulků. */
  onSubDelayChanged?: (seconds: number) => void
  /** Připraví ručně vybraný soubor titulků (převod kódování). */
  prepareSubtitle?: (path: string) => Promise<ExternalSubtitle>
  onEnd: (info: PlayerClosedInfo) => void
}

export interface LoadOptions {
  file: string
  title: string
  startSec?: number
  next: string | null
  previous?: string | null
  tracks: TrackChoices
  kids?: KidsPlayerInfo
}

const asNumber = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0
const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined

/**
 * Jedno přehrávání. mpv kreslí obraz do samostatného nativního okna bez webového obsahu
 * (Chromium by obraz v okně se stránkou překryl). Nad ním leží průhledné okno
 * s ovládáním v Reactu. Hlavní okno se mezitím schová, takže uživatel vidí jedno okno.
 */
export class PlayerSession {
  private state: PlayerState
  private readonly audio: Record<'codecName' | 'channelCount' | 'outputFormat', unknown> = {
    codecName: undefined,
    channelCount: undefined,
    outputFormat: undefined
  }
  private readonly video: { codec: unknown; params: unknown } = {
    codec: undefined,
    params: undefined
  }
  private lastSentAt = 0
  private sendTimer: NodeJS.Timeout | null = null
  private quitTimer: NodeJS.Timeout | null = null
  private finished = false
  /** Po `load()` až do změny `path` chodí ještě události předchozího souboru. */
  private switching = false
  private fixedTitle: string | undefined
  private readonly selector: TrackSelector
  private file: string
  /** Hlídání zaseknutí po spuštění souboru (viz `checkStall`). */
  private stallTimer: NodeJS.Timeout | null = null
  private firstPosition: number | null = null
  private advanced = false
  private pcmFallback = false
  private readonly cleanups: (() => void)[] = []

  private constructor(
    private readonly mainWindow: BrowserWindow,
    private readonly videoWindow: BaseWindow,
    readonly overlay: BrowserWindow,
    private readonly mpv: ChildProcess,
    private readonly client: MpvClient,
    private readonly options: PlayerSessionOptions
  ) {
    this.fixedTitle = options.title
    this.selector = new TrackSelector(client)
    this.file = options.file
    this.selector.reset(options.tracks)
    this.state = {
      ...INITIAL_PLAYER_STATE,
      title: options.title ?? basename(options.file),
      next: options.next ?? null,
      previous: options.previous ?? null,
      kids: options.kids ?? null,
      fullscreen: videoWindow.isFullScreen()
    }
  }

  static async start(options: PlayerSessionOptions): Promise<PlayerSession> {
    const executable = mpvExecutablePath()
    if (!existsSync(executable)) {
      throw new Error(
        'Přehrávač mpv nebyl nalezen. Ve složce projektu spusť jednou „npm run fetch:mpv“.'
      )
    }

    const { mainWindow } = options
    const videoWindow = new BaseWindow(createVideoWindowOptions(mainWindow.getBounds()))
    if (mainWindow.isMaximized()) videoWindow.maximize()
    const fullscreen = mainWindow.isFullScreen()

    const ipcPath = `\\\\.\\pipe\\kinoteka-mpv-${process.pid}-${Date.now()}`
    const args = buildMpvArgs({
      file: options.file,
      windowId: windowHandleToId(videoWindow.getNativeWindowHandle()),
      ipcPath,
      ...options.audio,
      subtitleArgs: options.subtitleArgs,
      logFile: options.logFile,
      startSec: options.startSec,
      extraArgs: app.isPackaged
        ? undefined
        : process.env['KINOTEKA_DEV_MPV_ARGS']?.split(' ').filter(Boolean)
    })
    const mpv = spawn(executable, args, { windowsHide: true, stdio: 'ignore' })

    // mpv může skončit dřív, než otevře IPC (např. nečitelný soubor).
    const exitedEarly = new Promise<never>((_, reject) => {
      mpv.once('error', reject)
      mpv.once('exit', (code) =>
        reject(new Error(`mpv se ukončilo hned po spuštění (kód ${code})`))
      )
    })
    exitedEarly.catch(() => undefined)

    let client: MpvClient
    try {
      client = await Promise.race([connectToMpv(ipcPath), exitedEarly])
    } catch (error) {
      mpv.kill()
      videoWindow.destroy()
      throw new Error(`Přehrávač se nepodařilo spustit: ${(error as Error).message}`, {
        cause: error
      })
    }

    videoWindow.show()
    // Celá obrazovka až u zobrazeného okna: skryté okno by na ní Windows nenechal – zůstalo by
    // jen velké jako obrazovka a hlavní panel Windows by byl dál vidět.
    if (fullscreen) videoWindow.setFullScreen(true)
    mainWindow.hide()

    const overlay = new BrowserWindow({
      ...createOverlayWindowOptions(preloadPath()),
      parent: videoWindow
    })
    const session = new PlayerSession(mainWindow, videoWindow, overlay, mpv, client, options)
    await session.attach()
    return session
  }

  handle(command: PlayerCommand): void {
    const run = (promise: Promise<unknown>): void => {
      promise.catch(() => undefined)
    }
    switch (command.type) {
      case 'toggle-pause':
        return run(this.client.command('cycle', 'pause'))
      case 'set-pause':
        return run(this.client.setProperty('pause', command.paused))
      case 'seek-relative':
        return run(this.client.command('seek', command.seconds, 'relative'))
      case 'seek-absolute':
        return run(this.client.command('seek', command.seconds, 'absolute'))
      case 'set-volume':
        return run(this.client.setProperty('volume', command.volume))
      case 'toggle-mute':
        return run(this.client.command('cycle', 'mute'))
      case 'toggle-fullscreen':
        return this.videoWindow.setFullScreen(!this.videoWindow.isFullScreen())
      case 'escape':
        return this.videoWindow.isFullScreen()
          ? this.videoWindow.setFullScreen(false)
          : this.close()
      case 'close':
        return this.close()
      case 'stop':
        this.options.onStop?.()
        return this.close()
      case 'play-next':
        return this.options.onNext?.()
      case 'play-previous':
        return this.options.onPrevious?.()
      case 'toggle-favorite':
        return this.options.onToggleFavorite?.()
      case 'set-audio-track': {
        const track = this.state.audioTracks.find((t) => t.id === command.id)
        if (!track) return
        run(this.client.setProperty('aid', command.id))
        return this.options.onAudioTrackChosen?.(track)
      }
      case 'set-subtitle-track': {
        const track = this.state.subtitleTracks.find((t) => t.id === command.id) ?? null
        if (command.id !== null && !track) return
        run(this.client.setProperty('sid', command.id ?? 'no'))
        return this.options.onSubtitleChosen?.(track)
      }
      case 'set-sub-delay':
        run(this.client.setProperty('sub-delay', command.seconds))
        return this.options.onSubDelayChanged?.(command.seconds)
      case 'load-subtitle':
        return void this.loadSubtitleFromDialog()
    }
  }

  /** Další soubor (díl) ve stejném okně, bez zavření přehrávače. */
  load(options: LoadOptions): void {
    if (this.finished) return
    this.switching = true
    this.file = options.file
    this.fixedTitle = options.title
    this.selector.reset(options.tracks)
    this.update({
      title: options.title,
      next: options.next,
      previous: options.previous ?? null,
      kids: options.kids ?? this.state.kids,
      position: 0,
      duration: 0,
      ended: false,
      audioTracks: [],
      subtitleTracks: []
    })
    // `start` platí pro další načtený soubor; na konci dílu je mpv pozastavené (keep-open).
    void this.client
      .setProperty('start', options.startSec ? options.startSec.toFixed(1) : 'none')
      // Stopy předchozího dílu neplatí – vybere je znovu TrackSelector.
      .then(() => this.client.setProperty('aid', 'auto'))
      .then(() => this.client.setProperty('sid', 'no'))
      .then(() => this.client.command('loadfile', options.file, 'replace'))
      .then(() => this.client.setProperty('pause', false))
      .catch(() => undefined)
    this.armStallCheck()
  }

  private armStallCheck(): void {
    this.firstPosition = null
    this.advanced = false
    if (this.stallTimer) clearTimeout(this.stallTimer)
    this.stallTimer = setTimeout(() => this.checkStall(), STALL_CHECK_MS)
  }

  /**
   * Když zařízení passthrough neumí (např. reproduktory notebooku), mpv po neúspěšném pokusu
   * o bitstream zůstane stát na prvním snímku místo přechodu na PCM. Pozná se to tak,
   * že se pozice nehýbe a zvukový výstup se nespustil – pak se passthrough vypne
   * a výstup znovu načte (do konce přehrávání).
   */
  private checkStall(): void {
    this.stallTimer = null
    if (this.finished || this.advanced || this.pcmFallback || this.state.paused) return
    if (this.options.audio.passthroughCodecs.length === 0 || this.audio.outputFormat) return
    if (this.state.audioTracks.length === 0) return
    this.pcmFallback = true
    void this.client
      .setProperty('audio-spdif', '')
      .then(() => this.client.command('ao-reload'))
      .catch(() => undefined)
    this.update({
      notice:
        'Zvukové zařízení neumí passthrough – zvuk teď dekóduje počítač (PCM). Natrvalo to změníš v Nastavení → Zvuk.'
    })
  }

  /** Požádá mpv o ukončení; když nezareaguje, ukončí ho natvrdo. */
  close(): void {
    if (this.finished) return
    this.client.command('quit').catch(() => undefined)
    this.quitTimer ??= setTimeout(() => this.finish(), QUIT_TIMEOUT_MS)
  }

  private async attach(): Promise<void> {
    this.client.on('property', (name, value) => this.onProperty(name, value))
    this.client.on('close', () => this.finish())
    this.client.on('event', (name) => {
      if (name === 'file-loaded') void this.selector.onFileLoaded()
    })
    this.mpv.on('exit', (code) => {
      const crashed = code !== 0 && code !== null
      this.finish(
        crashed
          ? `Přehrávač neočekávaně skončil (kód ${code}).${this.options.logFile ? ` Podrobnosti: ${this.options.logFile}` : ''}`
          : undefined
      )
    })

    this.listenToVideoWindow()
    hardenWebContents(this.overlay)
    this.overlay.webContents.on('did-finish-load', () => this.sendState())
    this.overlay.once('ready-to-show', () => {
      this.syncBounds()
      this.overlay.show()
      this.overlay.focus()
    })
    void loadRendererPage(this.overlay, 'overlay')

    await Promise.all(OBSERVED_PROPERTIES.map((name) => this.client.observe(name)))
    this.armStallCheck()
    // Soubor se mohl načíst dřív, než se aplikace k mpv připojila (událost by pak nepřišla).
    const tracks = await this.client.command('get_property', 'track-list').catch(() => [])
    if (Array.isArray(tracks) && tracks.length > 0) void this.selector.onFileLoaded()
  }

  private listenToVideoWindow(): void {
    const win = this.videoWindow
    const on = (event: string, listener: (...args: unknown[]) => void): void => {
      win.on(event as never, listener)
      this.cleanups.push(() => win.off(event as never, listener))
    }
    for (const event of BOUNDS_EVENTS) on(event, () => this.syncBounds())
    on('enter-full-screen', () => this.update({ fullscreen: true }))
    on('leave-full-screen', () => this.update({ fullscreen: false }))
    on('minimize', () => this.overlay.hide())
    on('restore', () => this.overlay.show())
    // Klávesy má dostávat ovládání, i když uživatel klikl do titulku okna.
    on('focus', () => {
      if (!this.overlay.isDestroyed() && this.overlay.isVisible()) this.overlay.focus()
    })
    // Křížek okna: nejdřív korektně ukončit mpv, okno zavře až finish().
    on('close', (event) => {
      if (this.finished) return
      ;(event as Electron.Event).preventDefault()
      this.close()
    })
  }

  private syncBounds(): void {
    if (this.overlay.isDestroyed() || this.videoWindow.isDestroyed()) return
    this.overlay.setBounds(this.videoWindow.getContentBounds())
  }

  private onProperty(name: string, value: unknown): void {
    switch (name) {
      case 'pause':
        return this.update({ paused: value === true })
      case 'path':
        if (typeof value === 'string') this.switching = false
        return
      case 'time-pos':
        // Při ukončení nebo výměně souboru mpv hlásí „žádná pozice“ – ta se nesmí uložit jako 0.
        if (typeof value !== 'number' || this.switching) return
        if (this.firstPosition === null) this.firstPosition = value
        else if (Math.abs(value - this.firstPosition) > 0.3) this.advanced = true
        this.update({ position: value }, true)
        return this.options.onProgress?.(value, this.state.duration)
      case 'duration':
        if (typeof value !== 'number' || this.switching) return
        return this.update({ duration: value })
      case 'volume':
        return this.update({ volume: asNumber(value) })
      case 'mute':
        return this.update({ muted: value === true })
      case 'eof-reached':
        if (this.switching) return
        return this.update({ ended: value === true })
      case 'track-list':
        if (this.switching) return
        return this.update({
          audioTracks: audioTracksFromMpv(value),
          subtitleTracks: subtitleTracksFromMpv(value)
        })
      case 'sub-delay':
        return this.update({ subDelay: Math.round(asNumber(value) * 10) / 10 })
      case 'media-title':
        if (!this.fixedTitle && typeof value === 'string' && value) this.update({ title: value })
        return
      case 'audio-codec-name':
        this.audio.codecName = value
        return this.update({ audio: describeAudioOutput(this.audio) })
      case 'audio-params':
        this.audio.channelCount = field(value, 'channel-count')
        return this.update({ audio: describeAudioOutput(this.audio) })
      case 'audio-out-params':
        this.audio.outputFormat = field(value, 'format')
        return this.update({ audio: describeAudioOutput(this.audio) })
      case 'video-format':
        this.video.codec = value
        return this.update({ video: this.describeVideo() })
      case 'video-params':
        this.video.params = value
        return this.update({ video: this.describeVideo() })
    }
  }

  /** „Načíst titulky ze souboru…“ – vybraný soubor se převede do UTF-8 a hned zapne. */
  private async loadSubtitleFromDialog(): Promise<void> {
    if (this.videoWindow.isFullScreen()) this.videoWindow.setFullScreen(false)
    const picked = await dialog.showOpenDialog(this.videoWindow, {
      title: 'Načíst titulky',
      properties: ['openFile'],
      filters: [{ name: 'Titulky', extensions: [...SUBTITLE_EXTENSIONS] }]
    })
    const file = picked.filePaths[0]
    if (picked.canceled || !file || this.finished) return
    const subtitle = (await this.options.prepareSubtitle?.(file).catch(() => null)) ?? null
    const ok = await this.addSubtitle(
      subtitle ?? { path: file, title: file, language: null, forced: false, encoding: null }
    )
    if (!ok) this.update({ notice: 'Titulky se nepodařilo načíst.' })
  }

  /** Přidá titulky ze souboru (ručně načtené nebo stažené) a hned je zapne. */
  async addSubtitle(subtitle: ExternalSubtitle): Promise<boolean> {
    if (this.finished) return false
    const args: unknown[] = ['sub-add', subtitle.path, 'select', subtitle.title]
    if (subtitle.language) args.push(subtitle.language)
    return this.client.command(...args).then(
      () => true,
      () => false
    )
  }

  /** Soubor, který se právě přehrává. */
  get currentFile(): string {
    return this.file
  }

  /** Změna dětského ovládání (srdíčko, zbývající čas) během přehrávání. */
  updateKids(patch: Partial<KidsPlayerInfo>): void {
    if (this.state.kids) this.update({ kids: { ...this.state.kids, ...patch } })
  }

  private describeVideo(): PlayerState['video'] {
    if (typeof this.video.codec !== 'string') return null
    return {
      codec: this.video.codec.toUpperCase(),
      width: asNumber(field(this.video.params, 'w')),
      height: asNumber(field(this.video.params, 'h'))
    }
  }

  private update(patch: Partial<PlayerState>, positionOnly = false): void {
    this.state = { ...this.state, ...patch }
    if (!positionOnly) return this.sendState()
    const wait = POSITION_UPDATE_MS - (Date.now() - this.lastSentAt)
    if (wait <= 0) this.sendState()
    else this.sendTimer ??= setTimeout(() => this.sendState(), wait)
  }

  private sendState(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.sendTimer = null
    this.lastSentAt = Date.now()
    if (!this.overlay.isDestroyed()) {
      this.overlay.webContents.send(IpcChannel.PlayerState, this.state)
    }
  }

  private finish(error?: string): void {
    if (this.finished) return
    this.finished = true
    if (this.sendTimer) clearTimeout(this.sendTimer)
    if (this.quitTimer) clearTimeout(this.quitTimer)
    if (this.stallTimer) clearTimeout(this.stallTimer)
    for (const cleanup of this.cleanups) cleanup()
    if (!this.client.isClosed) this.client.close()
    if (this.mpv.exitCode === null) this.mpv.kill()
    if (!this.overlay.isDestroyed()) this.overlay.destroy()
    this.restoreMainWindow()
    if (!this.videoWindow.isDestroyed()) this.videoWindow.destroy()
    this.options.onEnd(error ? { error } : {})
  }

  /**
   * Hlavní okno se vrátí tam, kde naposledy bylo okno s videem. Knihovna na celé obrazovce
   * na ní zůstane, ať se video mezitím zmenšilo do okna, nebo ne.
   */
  private restoreMainWindow(): void {
    if (this.mainWindow.isDestroyed()) return
    if (!this.videoWindow.isDestroyed() && !this.mainWindow.isFullScreen()) {
      const maximized = this.videoWindow.isMaximized()
      if (!maximized && !this.videoWindow.isFullScreen()) {
        this.mainWindow.setBounds(this.videoWindow.getBounds())
      }
      if (maximized) this.mainWindow.maximize()
    }
    this.mainWindow.show()
    this.mainWindow.focus()
  }
}
