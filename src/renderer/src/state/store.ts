import { create } from 'zustand'
import type {
  AppConfig,
  ConnConfig,
  Metrics,
  PingSample,
  PingStats,
  Tab,
  TabStatus
} from '../types'

const DEFAULT_CONFIG: AppConfig = {
  font_size: 12,
  en_font_name: 'Consolas',
  cn_font_name: 'Microsoft YaHei UI',
  theme_name: 'Default',
  show_sidebar: true,
  show_terminal_help: true,
  command_input_full_path: true,
  close_window_after_connect: false,
  download_path: '',
  recent_download_path: [],
  editor_type: 0,
  bg_img_blur_level: 4,
  bg_image: '',
  bg_image_blur: 6,
  bg_image_opacity: 0.9,
  pack_trans: false,
  command_input_show_hide: false,
  cmd_history: [],
  file_history: [],
  cmd_groups: [],
  proxies: [],
  locale: '',
  close_to_tray: false,
  auto_start: false,
  window: { width: 1500, height: 940 }
}

interface AppStore {
  ready: boolean
  config: AppConfig
  connections: ConnConfig[]
  tabs: Tab[]
  activeId: string | null
  metrics: Record<string, Metrics>
  pings: Record<string, PingSample[]>
  pingStats: Record<string, PingStats>
  sysinfo: Record<string, Record<string, string>>
  cwd: Record<string, string>
  followCwd: boolean
  passwords: Record<string, string>
  pendingConn: ConnConfig | null
  managerOpen: boolean
  settingsOpen: boolean
  editor: { tabId: string; path: string; content: string } | null
  sysinfoTab: string | null
  procTab: string | null
  inspectTab: string | null
  forwardTab: string | null
  probeTab: string | null
  pack: { title: string; percent: number; error?: string } | null
  broadcast: boolean
  toast: string | null
  splitId: string | null
  splitRatio: number
  sidebarOpen: boolean
  bottomView: 'file' | 'cmd'

  init: () => Promise<void>
  refreshLinks: () => Promise<void>
  setConfig: (patch: Partial<AppConfig>) => void
  addTab: (conn: ConnConfig, password?: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  setTabStatus: (id: string, status: TabStatus, error?: string) => void
  setMetrics: (id: string, m: Metrics) => void
  setCwd: (id: string, path: string) => void
  toggleFollow: () => void
  pushPing: (id: string, s: PingSample, stats: PingStats) => void
  setSysinfo: (id: string, info: Record<string, string>) => void
  openManager: (open: boolean) => void
  openSettings: (open: boolean) => void
  setEditor: (v: AppStore['editor']) => void
  setSysinfoTab: (id: string | null) => void
  setProcTab: (id: string | null) => void
  setInspectTab: (id: string | null) => void
  setForwardTab: (id: string | null) => void
  setProbeTab: (id: string | null) => void
  setPack: (p: { title: string; percent: number; error?: string } | null) => void
  moveTab: (fromId: string, toId: string) => void
  setSplit: (id: string | null) => void
  setSplitRatio: (r: number) => void
  toggleSidebar: () => void
  setBottomView: (v: 'file' | 'cmd') => void
  toggleBroadcast: () => void
  flash: (msg: string, durationMs?: number) => void
  setPending: (c: ConnConfig | null) => void
  activeTab: () => Tab | undefined
}

export const useApp = create<AppStore>((set, get) => ({
  ready: false,
  config: DEFAULT_CONFIG,
  connections: [],
  tabs: [],
  activeId: null,
  metrics: {},
  pings: {},
  pingStats: {},
  sysinfo: {},
  cwd: {},
  followCwd: true,
  passwords: {},
  pendingConn: null,
  managerOpen: false,
  settingsOpen: false,
  editor: null,
  sysinfoTab: null,
  procTab: null,
  inspectTab: null,
  forwardTab: null,
  probeTab: null,
  pack: null,
  broadcast: false,
  toast: null,
  splitId: null,
  splitRatio: 0.5,
  sidebarOpen: true,
  bottomView: 'file',

  init: async () => {
    const data = await window.api.init()
    set({
      ready: true,
      config: { ...DEFAULT_CONFIG, ...data.config },
      connections: data.connections || []
    })
    if (!data.connections?.length) set({ managerOpen: true })
    if (data.autoConnect) {
      const c = (data.connections || []).find((x: ConnConfig) => x.id === data.autoConnect)
      if (c) requestOpen(c)
    }
  },

  refreshLinks: async () => {
    const list = (await window.api.conn.list()) as ConnConfig[]
    set({ connections: list })
  },

  setConfig: (patch) => {
    set((s) => ({ config: { ...s.config, ...patch } }))
    void window.api.setConfig(patch)
  },

  addTab: (conn, password) => {
    const id = crypto.randomUUID()
    const tab: Tab = {
      id,
      connId: conn.id,
      title: conn.name || conn.host,
      host: conn.host,
      status: 'connecting'
    }
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeId: id,
      passwords: password ? { ...s.passwords, [conn.id]: password } : s.passwords
    }))
  },

  closeTab: (id) => {
    void window.api.session.close(id)
    void window.api.monitor.stop(id)
    void window.api.ping.stop(id)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id)
      let activeId = s.activeId
      if (activeId === id) activeId = tabs.length ? tabs[tabs.length - 1].id : null
      let splitId = s.splitId
      if (splitId === id || splitId === activeId) splitId = null
      const metrics = { ...s.metrics }
      delete metrics[id]
      return { tabs, activeId, splitId, metrics }
    })
  },

  setActive: (id) =>
    set((s) => {
      // 分屏时点击右栏：交换两栏，保持“左=当前”的语义
      if (s.splitId && s.splitId === id && s.activeId && s.activeId !== id) {
        return { activeId: id, splitId: s.activeId }
      }
      return { activeId: id }
    }),

  setSplit: (id) => set({ splitId: id }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setBottomView: (v) => set({ bottomView: v }),
  setSplitRatio: (r) =>
    set({ splitRatio: Math.max(0.25, Math.min(0.75, Number(r) || 0.5)) }),

  setTabStatus: (id, status, error) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, status, error } : t))
    })),

  setMetrics: (id, m) => set((s) => ({ metrics: { ...s.metrics, [id]: m } })),

  setCwd: (id, path) =>
    set((s) => (s.cwd[id] === path ? s : { cwd: { ...s.cwd, [id]: path } })),

  toggleFollow: () => set((s) => ({ followCwd: !s.followCwd })),

  pushPing: (id, sample, stats) =>
    set((s) => {
      const list = [...(s.pings[id] || []), sample].slice(-120)
      return { pings: { ...s.pings, [id]: list }, pingStats: { ...s.pingStats, [id]: stats } }
    }),

  setSysinfo: (id, info) => set((s) => ({ sysinfo: { ...s.sysinfo, [id]: info } })),

  openManager: (open) => set({ managerOpen: open }),
  openSettings: (open) => set({ settingsOpen: open }),
  setEditor: (v) => set({ editor: v }),
  setSysinfoTab: (id) => set({ sysinfoTab: id }),
  setProcTab: (id) => set({ procTab: id }),
  setInspectTab: (id) => set({ inspectTab: id }),
  setForwardTab: (id) => set({ forwardTab: id }),
  setProbeTab: (id) => set({ probeTab: id }),
  setPack: (p) => set({ pack: p }),

  moveTab: (fromId, toId) =>
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === fromId)
      const to = s.tabs.findIndex((t) => t.id === toId)
      if (from < 0 || to < 0 || from === to) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      tabs.splice(to, 0, moved)
      return { tabs }
    }),

  toggleBroadcast: () => set((s) => ({ broadcast: !s.broadcast })),

  flash: (msg, durationMs) => {
    set({ toast: msg })
    window.setTimeout(() => {
      set((s) => (s.toast === msg ? { toast: null } : s))
    }, durationMs || 2200)
  },
  setPending: (c) => set({ pendingConn: c }),

  activeTab: () => {
    const { tabs, activeId } = get()
    return tabs.find((t) => t.id === activeId)
  }
}))

/** 打开连接（无密码时先弹密码框） */
export function requestOpen(conn: ConnConfig): void {
  // Windows 远程桌面：调起系统 mstsc，不建立 SSH 会话
  if (conn.conection_type === 200) {
    const st = useApp.getState()
    void window.api.rdp
      .open(conn.id)
      .then(() => st.flash(`已启动远程桌面：${conn.name || conn.host}（外部 mstsc 窗口）`, 4000))
      .catch((e: Error) => st.flash(`远程桌面启动失败：${e.message}`, 5000))
    return
  }
  const needsPassword =
    conn.authentication_type === 1 &&
    (!conn.password || conn.password.startsWith('legacy:') || conn.password.startsWith('final:'))
  if (needsPassword) {
    useApp.getState().setPending(conn)
    return
  }
  useApp.getState().addTab(conn)
}
