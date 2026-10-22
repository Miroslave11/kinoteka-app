/** API, které preload zpřístupní oknu jako `window.kinoteka`. */
export interface KinotekaApi {
  versions: {
    electron: string
    chrome: string
    node: string
  }
}
