import { app, safeStorage } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  copyFileSync
} from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import type { ProxyConfig } from './proxy'

/** HostShell 连接模型（按 id 落盘为 conn/<id>_connect_config.json） */
export interface ConnConfig {
  id: string
  name: string
  host: string
  port: number
  user_name: string
  /** enc: / plain: / legacy: 前缀；legacy: 表示无法解密的外部密文，连接时需重新输入 */
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
  port_forwarding_list: unknown[]
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
  /** 仅本程序使用：是否为分组节点 */
  is_group?: boolean
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
  cmd_groups: unknown[]
  proxies: ProxyConfig[]
  locale: string
  close_to_tray: boolean
  auto_start: boolean
  window: { width: number; height: number; x?: number; y?: number }
}

const DEFAULT_CONFIG: AppConfig = {
  font_size: 12,
  en_font_name: 'Consolas',
  cn_font_name: 'Microsoft YaHei UI',
  theme_name: 'Default',
  show_sidebar: true,
  show_terminal_help: true,
  command_input_full_path: true,
  close_window_after_connect: false,
  download_path: join(app.getPath('desktop'), 'fsdownload'),
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

function now(): number {
  return Date.now()
}

export function makeId(): string {
  return randomBytes(8).toString('hex')
}

export function emptyConn(parentId = 'root'): ConnConfig {
  const t = now()
  return {
    id: makeId(),
    name: '',
    host: '',
    port: 22,
    user_name: 'root',
    password: '',
    authentication_type: 1,
    secret_key_id: '',
    conection_type: 100,
    parent_id: parentId,
    description: '',
    proxy_id: '0',
    accelerate: false,
    terminal_encoding: 'UTF-8',
    backspace_key_sequence: 2,
    exec_channel_enable: true,
    port_forwarding_list: [],
    remote_port_forwarding: {},
    forwarding_auto_reconnect: false,
    custom_size: false,
    width: 0,
    height: 0,
    fullscreen: false,
    drivestoredirect: true,
    order: 0,
    create_time: t,
    modified_time: t,
    access_time: 0,
    delete_time: 0,
    delete_key_sequence: 0,
    sort_time: 0,
    rename_time: 0,
    parent_update_time: 0
  }
}

export function encryptSecret(plain: string): string {
  if (!plain) return ''
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return 'enc:' + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* fallthrough */
  }
  return 'plain:' + Buffer.from(plain, 'utf8').toString('base64')
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  try {
    if (stored.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(stored.slice(4), 'base64'))
    }
    if (stored.startsWith('plain:')) {
      return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    }
  } catch {
    return ''
  }
  // legacy: / final: 前缀表示外部密文，无法解密，连接时提示重新输入
  return ''
}

class Store {
  readonly root: string
  readonly connDir: string
  readonly configPath: string
  config: AppConfig
  connections = new Map<string, ConnConfig>()

  constructor() {
    this.root = join(app.getPath('userData'), 'data')
    this.connDir = join(this.root, 'conn')
    this.configPath = join(this.root, 'config.json')
    mkdirSync(this.connDir, { recursive: true })
    this.config = this.loadConfig()
    this.loadConnections()
  }

  private loadConfig(): AppConfig {
    try {
      if (existsSync(this.configPath)) {
        const raw = JSON.parse(readFileSync(this.configPath, 'utf8'))
        return { ...DEFAULT_CONFIG, ...raw }
      }
    } catch (e) {
      console.error('load config failed', e)
    }
    return { ...DEFAULT_CONFIG }
  }

  saveConfig(patch?: Partial<AppConfig>): AppConfig {
    if (patch) this.config = { ...this.config, ...patch }
    try {
      writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8')
    } catch (e) {
      console.error('save config failed', e)
    }
    return this.config
  }

  private loadConnections(): void {
    this.connections.clear()
    if (!existsSync(this.connDir)) return
    for (const f of readdirSync(this.connDir)) {
      if (!f.endsWith('_connect_config.json')) continue
      try {
        const raw = readFileSync(join(this.connDir, f), 'utf8')
        const c = JSON.parse(raw) as ConnConfig
        if (c && c.id) this.connections.set(c.id, c)
      } catch (e) {
        console.error('bad conn file', f, e)
      }
    }
  }

  list(): ConnConfig[] {
    return [...this.connections.values()].sort(
      (a, b) => a.order - b.order || a.create_time - b.create_time
    )
  }

  get(id: string): ConnConfig | undefined {
    return this.connections.get(id)
  }

  save(input: Partial<ConnConfig> & { id?: string }): ConnConfig {
    const id = input.id || makeId()
    const base = this.connections.get(id) || emptyConn(input.parent_id || 'root')
    const merged: ConnConfig = {
      ...base,
      ...input,
      id,
      modified_time: now()
    }
    if (input.password !== undefined && input.password !== base.password) {
      // 只有传入明文（未经前缀包装）时才重新加密
      if (input.password && !/^(enc|plain|legacy):/.test(input.password)) {
        merged.password = encryptSecret(input.password)
      }
    }
    this.connections.set(id, merged)
    this.persist(merged)
    return merged
  }

  private persist(c: ConnConfig): void {
    const p = join(this.connDir, `${c.id}_connect_config.json`)
    writeFileSync(p, JSON.stringify(c, null, 0), 'utf8')
  }

  remove(id: string): void {
    const c = this.connections.get(id)
    if (!c) return
    // 连同子节点一起删除
    for (const child of this.list().filter((x) => x.parent_id === id)) this.remove(child.id)
    this.connections.delete(id)
    const p = join(this.connDir, `${id}_connect_config.json`)
    try {
      if (existsSync(p)) {
        copyFileSync(p, join(this.root, `deleted_${id}.json`))
        unlinkSync(p)
      }
    } catch (e) {
      console.error('delete conn failed', e)
    }
  }

  /**
   * 导入单个连接配置文件（JSON）。
   * 兼容常见的“一个连接一个 json”的导出格式：只取 HostShell 认识的字段，
   * 未知字段忽略；密码无法解密时标记为 legacy:，连接时提示重新输入。
   */
  importConnFile(file: string): boolean {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<ConnConfig>
      if (!raw || !raw.id || !raw.host) return false
      if (this.connections.has(raw.id)) return false
      const conn: ConnConfig = {
        ...emptyConn(raw.parent_id || 'root'),
        ...raw,
        id: raw.id,
        name: raw.name || raw.host,
        password: raw.password ? 'legacy:' + raw.password : '',
        is_group: !!raw.is_group
      }
      this.connections.set(conn.id, conn)
      this.persist(conn)
      return true
    } catch (e) {
      console.error('import failed', file, e)
      return false
    }
  }
}

let instance: Store | null = null

export function store(): Store {
  if (!instance) instance = new Store()
  return instance
}
