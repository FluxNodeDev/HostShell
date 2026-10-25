import type { HostShellApi } from './index'

declare global {
  interface Window {
    api: HostShellApi
  }
}

export {}
