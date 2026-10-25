import { clipboard, contextBridge, ipcRenderer, webUtils } from 'electron'

type Handler = (payload: any) => void

function subscribe(channel: string, cb: Handler): () => void {
  const listener = (_e: Electron.IpcRendererEvent, payload: any): void => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  platform: process.platform,
  init: () => ipcRenderer.invoke('app:init'),
  setConfig: (patch: any) => ipcRenderer.invoke('app:config:set', patch),
  pickImage: () => ipcRenderer.invoke('app:pickImage'),

  conn: {
    list: () => ipcRenderer.invoke('conn:list'),
    save: (c: any) => ipcRenderer.invoke('conn:save', c),
    remove: (id: string) => ipcRenderer.invoke('conn:delete', id),
    importConnections: () => ipcRenderer.invoke('conn:import')
  },

  session: {
    open: (args: {
      connId: string
      cols: number
      rows: number
      password?: string
      clientId?: string
    }) => ipcRenderer.invoke('session:open', args),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke('session:write', { sessionId, data }),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('session:resize', { sessionId, cols, rows }),
    close: (sessionId: string) => ipcRenderer.invoke('session:close', sessionId),
    exec: (sessionId: string, cmd: string) =>
      ipcRenderer.invoke('session:exec', { sessionId, cmd }),
    sysinfo: (sessionId: string) => ipcRenderer.invoke('session:sysinfo', sessionId),
    onData: (cb: Handler) => subscribe('session:data', cb),
    onClosed: (cb: Handler) => subscribe('session:closed', cb),
    onError: (cb: Handler) => subscribe('session:error', cb)
  },

  sessionEvents: {
    onZmodem: (
      cb: (p: { sessionId: string; phase: string; name?: string; size?: number; path?: string; message?: string }) => void
    ) => {
      ipcRenderer.on('session:zmodem', (_e, p) => cb(p))
    }
  },

  probe: {
    ping: (sessionIds: string[], target: string) =>
      ipcRenderer.invoke('probe:ping', { sessionIds, target })
  },

  rdp: {
    open: (connId: string) => ipcRenderer.invoke('rdp:open', connId)
  },

  forward: {
    list: (sessionId: string) => ipcRenderer.invoke('forward:list', sessionId),
    start: (sessionId: string, rule: unknown) =>
      ipcRenderer.invoke('forward:start', { sessionId, rule }),
    stop: (sessionId: string, ruleId: string) =>
      ipcRenderer.invoke('forward:stop', { sessionId, ruleId })
  },

  proc: {
    list: (sessionId: string) => ipcRenderer.invoke('proc:list', sessionId),
    detail: (sessionId: string, pid: number) =>
      ipcRenderer.invoke('proc:detail', { sessionId, pid }),
    kill: (sessionId: string, pid: number, force = false) =>
      ipcRenderer.invoke('proc:kill', { sessionId, pid, force })
  },

  net: {
    start: (tabId: string, host: string) =>
      ipcRenderer.invoke('net:inspect:start', { tabId, host }),
    stop: (tabId: string) => ipcRenderer.invoke('net:inspect:stop', tabId),
    retrace: (tabId: string) => ipcRenderer.invoke('net:inspect:retrace', tabId),
    onHops: (cb: Handler) => subscribe('net:hops', cb),
    onSample: (cb: Handler) => subscribe('net:hop', cb)
  },

  monitor: {
    start: (sessionId: string, interval = 2000) =>
      ipcRenderer.invoke('monitor:start', { sessionId, interval }),
    stop: (sessionId: string) => ipcRenderer.invoke('monitor:stop', sessionId),
    onMetrics: (cb: Handler) => subscribe('session:metrics', cb),
    onError: (cb: Handler) => subscribe('session:monitor-error', cb)
  },

  ping: {
    start: (sessionId: string, host: string, interval = 2000) =>
      ipcRenderer.invoke('ping:start', { sessionId, host, interval }),
    stop: (sessionId: string) => ipcRenderer.invoke('ping:stop', sessionId),
    onSample: (cb: Handler) => subscribe('session:ping', cb)
  },

  sftp: {
    home: (sessionId: string) => ipcRenderer.invoke('sftp:home', sessionId),
    list: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:list', { sessionId, path }),
    stat: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:stat', { sessionId, path }),
    mkdir: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:mkdir', { sessionId, path }),
    rename: (sessionId: string, from: string, to: string) =>
      ipcRenderer.invoke('sftp:rename', { sessionId, from, to }),
    remove: (sessionId: string, path: string, isDir: boolean) =>
      ipcRenderer.invoke('sftp:delete', { sessionId, path, isDir }),
    chmod: (sessionId: string, path: string, mode: number) =>
      ipcRenderer.invoke('sftp:chmod', { sessionId, path, mode }),
    read: (sessionId: string, path: string) => ipcRenderer.invoke('sftp:read', { sessionId, path }),
    write: (sessionId: string, path: string, content: string) =>
      ipcRenderer.invoke('sftp:write', { sessionId, path, content }),
    upload: (sessionId: string, remoteDir: string, localPaths?: string[]) =>
      ipcRenderer.invoke('sftp:upload', { sessionId, remoteDir, localPaths }),
    download: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:download', { sessionId, remotePath }),
    packDownload: (sessionId: string, remotePath: string) =>
      ipcRenderer.invoke('sftp:packDownload', { sessionId, remotePath }),
    packUpload: (sessionId: string, remoteDir: string, localPath?: string) =>
      ipcRenderer.invoke('sftp:packUpload', { sessionId, remoteDir, localPath }),
    onProgress: (cb: Handler) => subscribe('sftp:progress', cb)
  },

  clipboard: {
    read: (): string => clipboard.readText(),
    write: (text: string): void => clipboard.writeText(text)
  },

  /** 拖拽进来的 File 对象没有 path 属性（Electron 32+），需用 webUtils 取绝对路径 */
  appCtl: {
    setCloseToTray: (on: boolean) => ipcRenderer.invoke('app:set-close-to-tray', on),
    show: () => ipcRenderer.invoke('app:show'),
    quit: () => ipcRenderer.invoke('app:quit'),
    autostart: (on?: boolean) => ipcRenderer.invoke('app:autostart', on),
    onOpenManager: (cb: () => void) => {
      ipcRenderer.on('app:open-manager', () => cb())
    },
    onConfigChanged: (cb: () => void) => {
      ipcRenderer.on('app:config-changed', () => cb())
    }
  },

  filePath: (file: unknown): string => {
    try {
      return webUtils.getPathForFile(file as File)
    } catch {
      return ''
    }
  },

  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url)
}

contextBridge.exposeInMainWorld('api', api)

export type HostShellApi = typeof api
