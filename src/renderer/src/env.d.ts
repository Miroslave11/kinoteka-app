/// <reference types="vite/client" />
import type { KinotekaApi } from '../../shared/api'

declare global {
  interface Window {
    kinoteka: KinotekaApi
  }
}
