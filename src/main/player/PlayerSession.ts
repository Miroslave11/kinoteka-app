import { app, BaseWindow, BrowserWindow } from 'electron'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { basename } from 'node:path'
import { IpcChannel } from '../../shared/ipc'
import {
  describeAudioOutput,
  INITIAL_PLAYER_STATE,
  type PlayerClosedInfo,
  type PlayerCommand,
  type PlayerState
} from '../../shared/player'
import { mpvExecutablePath } from '../mpv/binary'
import { connectToMpv, type MpvClient } from '../mpv/MpvClient'
import { buildMpvArgs, DEFAULT_PASSTHROUGH_CODECS, windowHandleToId } from '../mpv/mpvArgs'
import { hardenWebContents, loadRendererPage, preloadPath } from '../rendererPage'
import { createOverlayWindowOptions, createVideoWindowOptions } from '../windowOptions'

/** Pozice se do overlaye posílá nejvýš 4× za sekundu, ostatní změny hned. */
const POSITION_UPDATE_MS = 250
const QUIT_TIMEOUT_MS = 2000

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
  'path'
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
  logFile?: string
  /** Pozice a délka právě hraného souboru (několikrát za sekundu). */
  onProgress?: (position: number, duration: number) => void
  /** Uživatel chce další díl – volající pak zavolá `load()`. */
  onNext?: () => void
  onEnd: (info: PlayerClosedInfo) => void
}

export interface LoadOptions {
  file: string
  title: string
  startSec?: number
  next: string | null
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
    this.state = {
      ...INITIAL_PLAYER_STATE,
      title: options.title ?? basename(options.file),
      next: options.next ?? null,
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
    if (mainWindow.isFullScreen()) videoWindow.setFullScreen(true)

    const ipcPath = `\\\\.\\pipe\\kinoteka-mpv-${process.pid}-${Date.now()}`
    const args = buildMpvArgs({
      file: options.file,
      windowId: windowHandleToId(videoWindow.getNativeWindowHandle()),
      ipcPath,
      passthroughCodecs: DEFAULT_PASSTHROUGH_CODECS,
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
      case 'play-next':
        return this.options.onNext?.()
    }
  }

  /** Další soubor (díl) ve stejném okně, bez zavření přehrávače. */
  load(options: LoadOptions): void {
    if (this.finished) return
    this.switching = true
    this.fixedTitle = options.title
    this.update({
      title: options.title,
      next: options.next,
      position: 0,
      duration: 0,
      ended: false
    })
    // `start` platí pro další načtený soubor; na konci dílu je mpv pozastavené (keep-open).
    void this.client
      .setProperty('start', options.startSec ? options.startSec.toFixed(1) : 'none')
      .then(() => this.client.command('loadfile', options.file, 'replace'))
      .then(() => this.client.setProperty('pause', false))
      .catch(() => undefined)
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
    for (const cleanup of this.cleanups) cleanup()
    if (!this.client.isClosed) this.client.close()
    if (this.mpv.exitCode === null) this.mpv.kill()
    if (!this.overlay.isDestroyed()) this.overlay.destroy()
    this.restoreMainWindow()
    if (!this.videoWindow.isDestroyed()) this.videoWindow.destroy()
    this.options.onEnd(error ? { error } : {})
  }

  /** Hlavní okno se vrátí tam, kde naposledy bylo okno s videem. */
  private restoreMainWindow(): void {
    if (this.mainWindow.isDestroyed()) return
    if (!this.videoWindow.isDestroyed()) {
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
