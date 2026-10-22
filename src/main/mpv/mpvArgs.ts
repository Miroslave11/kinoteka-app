/** Formáty, které jdou nedekódované přes HDMI do receiveru (hodnoty volby `--audio-spdif`). */
export const DEFAULT_PASSTHROUGH_CODECS = ['ac3', 'eac3', 'dts', 'dts-hd', 'truehd'] as const

export interface MpvLaunchOptions {
  file: string
  /** HWND okna, do kterého mpv kreslí obraz (desítkové číslo). */
  windowId: string
  ipcPath: string
  passthroughCodecs: readonly string[]
  logFile?: string
  /** Další volby pro ladění (jen ve vývoji, proměnná KINOTEKA_DEV_MPV_ARGS). */
  extraArgs?: readonly string[]
}

export function buildMpvArgs(options: MpvLaunchOptions): string[] {
  const args = [
    // Žádný uživatelský mpv.conf – chování určuje jen aplikace.
    '--no-config',
    `--wid=${options.windowId}`,
    `--input-ipc-server=${options.ipcPath}`,
    '--force-window=yes',
    // Na konci se nezavírat, overlay nabídne „Přehrát znovu“.
    '--keep-open=yes',
    // Ovládání i kurzor řeší overlay v Reactu.
    '--osc=no',
    '--osd-level=0',
    '--input-default-bindings=no',
    '--input-vo-keyboard=no',
    '--input-cursor=no',
    '--cursor-autohide=no',
    // Obraz: hardwarové dekódování, Direct3D 11, předání HDR metadat displeji.
    '--vo=gpu-next',
    '--gpu-api=d3d11',
    '--hwdec=auto-safe',
    '--target-colorspace-hint=yes',
    // Zvuk: WASAPI, Dolby/DTS jako bitstream, jinak vícekanálové PCM podle zařízení.
    '--ao=wasapi',
    `--audio-spdif=${options.passthroughCodecs.join(',')}`,
    '--audio-channels=auto',
    '--alang=cze,ces,cs,eng,en',
    '--slang=cze,ces,cs,eng,en',
    '--sub-auto=fuzzy'
  ]
  if (options.logFile) args.push(`--log-file=${options.logFile}`)
  if (options.extraArgs) args.push(...options.extraArgs)
  // „--“ zajistí, že název souboru začínající pomlčkou mpv nevezme jako volbu.
  args.push('--', options.file)
  return args
}

/** HWND z `BrowserWindow.getNativeWindowHandle()` jako desítkové číslo pro `--wid`. */
export function windowHandleToId(handle: Buffer): string {
  return handle.length >= 8 ? handle.readBigUInt64LE(0).toString() : String(handle.readUInt32LE(0))
}
