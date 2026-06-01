import { FluxAPI } from '../renderer/src/types'

declare global {
  interface Window {
    api: FluxAPI
  }
}
