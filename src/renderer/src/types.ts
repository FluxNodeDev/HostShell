export interface ProxyConfig {
  id: string
  name: string
  type: 'http' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

export interface ForwardRule {
  id: string
  type: 'local' | 'remote' | 'dynamic'
  local_port: number
  remote_host: string
  remote_port: number
  description?: string
}

export interface ConnConfig {
  id: string
  name: string
  host: string
  port: number
  user_name: string
  password: string
  authentication_type: number
  secret_key_id: string
  conection_type: number
  parent_id: string
  description: string
  proxy_id: string
  accelerate: boolean
  terminal_encoding: string
  backspace_key_sequence: number
  exec_channel_enable: boolean
  port_forwarding_list: ForwardRule[]
  remote_port_forwarding: Record<string, unknown>
  forwarding_auto_reconnect: boolean
  custom_size: boolean
  width: number
  height: number
  fullscreen: boolean
  drivestoredirect: boolean
  order: number
  create_time: number
  modified_time: number
  access_time: number
  delete_time: number
  delete_key_sequence: number
  sort_time: number
  rename_time: number
  parent_update_time: number
  is_group?: boolean
}

export interface QuickCmd {
  id: string
  name: string
  cmd: string
}

export interface QuickGroup {
  id: string
  name: string
  items: QuickCmd[]
}

export interface ProcFull {
  pid: number
  user: string
  cpu: number
  mem: number
  rss: number
  elapsed: string
  cmd: string
}

export interface ProcDetail {
  args: string
  exe: string
  cwd: string
  env: string[]
}

export interface AppConfig {
  font_size: number
  en_font_name: string
  cn_font_name: string
  theme_name: string
  show_sidebar: boolean
  show_terminal_help: boolean
  command_input_full_path: boolean
  close_window_after_connect: boolean
  download_path: string
  recent_download_path: string[]
  editor_type: number
  bg_img_blur_level: number
  bg_image: string
  bg_image_blur: number
  bg_image_opacity: number
  pack_trans: boolean
  command_input_show_hide: boolean
  cmd_history: { text: string; type: string; index: number; active_time: number }[]
  file_history: { text: string; type: string; index: number; active_time: number }[]
  cmd_groups: QuickGroup[]
  proxies: ProxyConfig[]
  locale: string
  close_to_tray: boolean
  auto_start: boolean
  window: { width: number; height: number; x?: number; y?: number }
}

export interface ProcInfo {
  pid: number
  user: string
  cpu: number
  mem: number
  rss: number
  cmd: string
}

export interface DiskInfo {
  fs: string
  mount: string
  total: number
  used: number
  avail: number
  pct: number
}

export interface NetInfo {
  iface: string
  rx: number
  tx: number
  rxBps: number
  txBps: number
  ifaces: { name: string; rx: number; tx: number; rxBps: number; txBps: number }[]
}

export interface Metrics {
  ts: number
  uptime: number
  load: [number, number, number]
  cpu: number
  mem: { used: number; total: number; pct: number }
  swap: { used: number; total: number; pct: number }
  net: NetInfo
  disks: DiskInfo[]
  procs: ProcInfo[]
}

export interface PingSample {
  ts: number
  rtt: number | null
  timeout: boolean
  seq: number
}

export interface PingStats {
  avg: number
  min: number
  max: number
  loss: number
}

export interface SftpEntry {
  name: string
  path: string
  longname: string
  isDir: boolean
  isLink: boolean
  size: number
  mtime: number
  mode: number
  uid: number
  gid: number
}

export type TabStatus = 'connecting' | 'connected' | 'closed' | 'error'

export interface Tab {
  id: string
  connId: string
  title: string
  host: string
  status: TabStatus
  error?: string
}
