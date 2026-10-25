/// <reference types="vite/client" />

import type { HostShellApi } from '../../preload/index'

declare global {
  interface Window {
    api: HostShellApi
  }
}
