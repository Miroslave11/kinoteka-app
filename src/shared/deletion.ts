/** Jeden soubor k smazání i s titulky, které k němu patří. */
export interface DeletionFile {
  id: number
  path: string
  fileName: string
  size: number
  /** Cesty k titulkům, které se smažou s videem. */
  subtitles: string[]
  /** Na síťovém disku – mazání je trvalé (Koš Windows tam nefunguje). */
  network: boolean
  available: boolean
}

export interface DeletionPlan {
  files: DeletionFile[]
  totalSize: number
  /** Něco z toho je na síťovém disku. */
  network: boolean
}

export interface DeletionResult {
  deleted: number
  failed: { path: string; message: string }[]
}

export const parseFileIds = (value: unknown): number[] | null =>
  Array.isArray(value) && value.length > 0 && value.every((id) => Number.isInteger(id) && id > 0)
    ? [...new Set(value as number[])]
    : null
