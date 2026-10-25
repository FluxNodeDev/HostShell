import { Client, type ClientChannel, type ConnectConfig, type SFTPWrapper } from 'ssh2'
import { EventEmitter } from 'node:events'
import { execFile } from 'node:child_process'
import * as net from 'node:net'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { app, BrowserWindow, dialog } from 'electron'
import { unlink } from 'node:fs/promises'
import { StringDecoder } from 'node:string_decoder'
import { store } from './store'

// zmodem.js 是 CJS 且没有类型声明；只用到 Sentry
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Zmodem = require('zmodem.js') as {
  Sentry: new (opts: Record<string, unknown>) => { consume: (octets: Uint8Array) => void }
}
import type { ConnConfig } from './store'
import { decryptSecret } from './store'
import { connectViaProxy, type ProxyConfig } from './proxy'

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

function humanError(err: unknown): Error {
  const msg = (err as Error)?.message || String(err)
  const map: Record<string, string> = {
    'All configured authentication methods failed': '认证失败：用户名/密码或密钥不正确',
    ETIMEDOUT: '连接超时：请检查网络、端口或防火墙',
    ECONNREFUSED: '连接被拒绝：目标端口未开放',
    ENOTFOUND: '主机名无法解析',
    EHOSTUNREACH: '主机不可达'
  }
  for (const [k, v] of Object.entries(map)) if (msg.includes(k)) return new Error(v)
  return new Error(msg)
}

interface ZmodemOffer {
  get_details: () => { name: string; size: number }
  on: (ev: string, cb: (octets: Uint8Array) => void) => void
  accept: () => Promise<void>
  skip: () => void
}

interface ZmodemTransfer {
  send: (chunk: Uint8Array) => void
  end: (lastChunk?: Uint8Array) => Promise<void>
}

interface ZmodemSession {
  type?: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on: (ev: string, cb: (...args: any[]) => void) => void
  start: () => void
  close?: () => Promise<void> | void
  send_offer?: (fileInfo: {
    name: string
    size: number
    mtime: number
    mode: number
  }) => Promise<ZmodemTransfer | undefined>
}

interface ZmodemDetection {
  confirm: () => ZmodemSession
  deny: () => void
}

export interface ForwardRule {
  id: string
  type: 'local' | 'remote' | 'dynamic'
  local_port: number
  remote_host: string
  remote_port: number
  description?: string
}

export class SshSession extends EventEmitter {
  readonly id: string
  readonly cfg: ConnConfig
  private client = new Client()
  private stream: ClientChannel | null = null
  private sftpWrapper: SFTPWrapper | null = null
  private forwards = new Map<string, { server: net.Server; rule: ForwardRule; conns: number }>()
  private sentry: { consume: (octets: Uint8Array) => void } | null = null
  private sentryFactory: (() => { consume: (octets: Uint8Array) => void }) | null = null
  private zmodemBusy = false
  private zmodemQuietUntil = 0
  private zmodemWatchdog: ReturnType<typeof setTimeout> | null = null
  connected = false
  shellOpened = false

  constructor(
    id: string,
    cfg: ConnConfig,
    private proxy?: ProxyConfig
  ) {
    super()
    this.id = id
    this.cfg = cfg
  }

  async connect(passwordOverride?: string): Promise<void> {
    const cfg = this.cfg
    const password = passwordOverride ?? decryptSecret(cfg.password)
    let sock: import('node:net').Socket | undefined
    if (this.proxy && this.proxy.host) {
      sock = await connectViaProxy(this.proxy, cfg.host, cfg.port || 22)
    }
    return new Promise((resolve, reject) => {
      let settled = false
      const done = (err?: Error): void => {
        if (settled) return
        settled = true
        if (err) reject(humanError(err))
        else resolve()
      }

      this.client.on('ready', () => {
        this.connected = true
        done()
      })
      this.client.on('error', (err) => {
        this.emit('error', humanError(err))
        done(err)
      })
      this.client.on('close', () => {
        this.connected = false
        this.emit('close')
      })
      this.client.on('keyboard-interactive', (_n, _i, _l, _p, finish) => {
        finish([password])
      })

      const opts: ConnectConfig = {
        host: cfg.host,
        port: cfg.port || 22,
        username: cfg.user_name,
        password,
        readyTimeout: 20000,
        keepaliveInterval: 30000,
        keepaliveCountMax: 3,
        tryKeyboard: true,
        algorithms: {
          kex: [
            'curve25519-sha256',
            'curve25519-sha256@libssh.org',
            'ecdh-sha2-nistp256',
            'ecdh-sha2-nistp384',
            'ecdh-sha2-nistp521',
            'diffie-hellman-group-exchange-sha256',
            'diffie-hellman-group14-sha256',
            'diffie-hellman-group14-sha1'
          ]
        }
      }
      if (sock) opts.sock = sock
      if (cfg.authentication_type !== 1 && cfg.secret_key_id) {
        // 密钥认证：secret_key_id 指向本地密钥文件（后续版本接入）
        delete opts.password
      }
      try {
        this.client.connect(opts)
      } catch (e) {
        done(humanError(e))
      }
    })
  }

  openShell(cols: number, rows: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stream) return resolve()
      this.client.shell(
        { term: 'xterm-256color', cols, rows, width: cols * 8, height: rows * 16 },
        (err, stream) => {
          if (err) return reject(humanError(err))
          this.stream = stream
          this.shellOpened = true
          // 终端输出保持为 Buffer：zmodem 需要按字节识别，普通文本再解码成字符串
          const decoder = new StringDecoder('utf8')
          const sentry = new Zmodem.Sentry({
            to_terminal: (octets: Uint8Array): void => {
              const text = decoder.write(Buffer.from(octets))
              const clean = this.filterZmodemNoise(text)
              if (clean) this.emit('data', clean)
              // 传输期间有数据流动就顺延看门狗
              if (this.zmodemBusy) this.armZmodemWatchdog(15000)
            },
            sender: (octets: Uint8Array): void => {
              try {
                stream.write(Buffer.from(octets))
              } catch {
                /* 通道已关闭 */
              }
            },
            on_detect: (detection: ZmodemDetection): void => this.handleZmodem(detection),
            on_retract: (): void => undefined
          })
          this.sentryFactory = (): { consume: (octets: Uint8Array) => void } =>
            new Zmodem.Sentry({
              to_terminal: (octets: Uint8Array): void => {
                const text = decoder.write(Buffer.from(octets))
                const clean = this.filterZmodemNoise(text)
                if (clean) this.emit('data', clean)
                if (this.zmodemBusy) this.armZmodemWatchdog(15000)
              },
              sender: (octets: Uint8Array): void => {
                try {
                  stream.write(Buffer.from(octets))
                } catch {
                  /* 通道已关闭 */
                }
              },
              on_detect: (detection: ZmodemDetection): void => this.handleZmodem(detection),
              on_retract: (): void => undefined
            })
          this.sentry = sentry
          stream.on('data', (chunk: Buffer) => {
            try {
              sentry.consume(new Uint8Array(chunk))
            } catch {
              const text = decoder.write(chunk)
              if (text) this.emit('data', text)
            }
          })
          stream.stderr?.on('data', (chunk: Buffer) => {
            const text = this.filterZmodemNoise(decoder.write(Buffer.from(chunk)))
            if (text) this.emit('data', text)
          })
          stream.on('close', () => {
            this.shellOpened = false
            this.sentry = null
            this.sentryFactory = null
            this.zmodemBusy = false
            if (this.zmodemWatchdog) {
              clearTimeout(this.zmodemWatchdog)
              this.zmodemWatchdog = null
            }
            this.emit('shell-close')
          })
          resolve()
        }
      )
    })
  }

  /** zmodem：远端 sz 发送文件过来时接收并落盘（仅接收方向） */
  private handleZmodem(detection: ZmodemDetection): void {
    let zs: ZmodemSession
    try {
      zs = detection.confirm()
    } catch {
      return
    }
    // 远端执行 rz：本端作为发送方
    if (zs.type === 'send') {
      void this.handleZmodemSend(zs)
      return
    }
    this.zmodemBusy = true
    this.zmodemQuietUntil = Date.now() + 5000
    this.armZmodemWatchdog(15000)
    // Sentry 会先把手里的握手字节吐给终端，再回到这里；等这一拍过去后擦掉当前行，
    // 避免 `**B...` 残留在提示符后面（此时远端命令还没返回，不会擦到新提示符）
    setTimeout(() => this.emit('data', '\r\x1b[2K'), 40)
    this.emit('zmodem-start')
    zs.on('offer', (...args: unknown[]) => {
      const offer = args[0] as ZmodemOffer
      const details = offer.get_details() || { name: 'zmodem-download.bin', size: 0 }
      const chunks: Buffer[] = []
      offer.on('input', (octets: Uint8Array) => chunks.push(Buffer.from(octets)))
      offer
        .accept()
        .then(() => {
          const buf = Buffer.concat(chunks)
          try {
            const target = this.saveZmodemFile(details.name, buf)
            this.emit('zmodem', { name: details.name, size: buf.length, path: target })
            // 文件已落盘；若 2.5s 内收不到 ZFIN/OO，重建 Sentry 以防卡死
            this.armZmodemWatchdog(2500)
          } catch (e) {
            this.emit('zmodem-error', (e as Error).message)
          }
        })
        .catch((e: Error) => this.emit('zmodem-error', e.message))
    })
    zs.on('session_end', () => this.endZmodem())
    zs.start()
  }

  /** 远端 rz：选本地文件发送过去 */
  private async handleZmodemSend(zs: ZmodemSession): Promise<void> {
    this.zmodemBusy = true
    this.armZmodemWatchdog(120000)
    this.emit('zmodem-send-start')

    let filePath = process.env['HOSTSHELL_ZMODEM_SEND'] || ''
    if (!filePath) {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
      const r = win
        ? await dialog.showOpenDialog(win, { title: '选择要发送到远端的文件' })
        : { canceled: true, filePaths: [] as string[] }
      if (r.canceled || !r.filePaths.length) {
        try {
          await zs.close?.()
        } catch {
          /* ignore */
        }
        this.endZmodem()
        return
      }
      filePath = r.filePaths[0]
    }

    try {
      const buf = readFileSync(filePath)
      const name = basename(filePath)
      zs.on('session_end', () => this.endZmodem())
      const xfer = await zs.send_offer?.({
        name,
        size: buf.length,
        mtime: Math.floor(Date.now() / 1000),
        mode: 0o100644
      })
      if (!xfer) {
        await zs.close?.()
        this.endZmodem()
        return
      }
      const CHUNK = 8192
      let off = 0
      while (off + CHUNK < buf.length) {
        xfer.send(buf.subarray(off, off + CHUNK))
        off += CHUNK
      }
      await xfer.end(buf.subarray(off))
      await zs.close?.()
      this.emit('zmodem-sent', { name, size: buf.length })
      this.armZmodemWatchdog(3000)
    } catch (e) {
      this.emit('zmodem-error', (e as Error).message)
      this.resetZmodem()
    }
  }

  private armZmodemWatchdog(ms: number): void {
    if (this.zmodemWatchdog) clearTimeout(this.zmodemWatchdog)
    this.zmodemWatchdog = setTimeout(() => this.resetZmodem(), ms)
  }

  /**
   * ZMODEM 握手/尾巴的残留字节：Sentry 按设计会把初始 ZRQINIT/ZRINIT 和会话结束后的
   * trailing bytes 送给终端，表现为提示符后面冒出 `0100000023be50`、`B` 之类。
   * 这里按协议常量剔除，避免污染提示符。
   */
  private filterZmodemNoise(text: string): string {
    // 会话结束后的 trailing bytes 可能是被拆开的一两个帧标记（`**`、`B`），
    // 只在 zmodem 窗口内、且整块就是这么短时才丢弃，避免误伤正常输出的单个字母
    if (Date.now() < this.zmodemQuietUntil && /^[\r\n]*(\*{1,2}|[ABC])[\r\n]*$/.test(text)) return ''
    return text
      .replace(/0100000023be50/g, '')
      .replace(/00000000000000/g, '')
      .replace(/\uFFFD/g, '')
  }

  /** 会话没能正常结束（没收到 ZFIN/OO）时，丢弃旧 Sentry，恢复正常文本模式 */
  private resetZmodem(): void {
    if (this.zmodemWatchdog) {
      clearTimeout(this.zmodemWatchdog)
      this.zmodemWatchdog = null
    }
    if (!this.zmodemBusy) return
    this.zmodemBusy = false
    this.zmodemQuietUntil = Date.now() + 5000
    this.sentry = this.sentryFactory ? this.sentryFactory() : null
    this.emit('zmodem-end')
  }

  private endZmodem(): void {
    if (this.zmodemWatchdog) {
      clearTimeout(this.zmodemWatchdog)
      this.zmodemWatchdog = null
    }
    if (!this.zmodemBusy) return
    this.zmodemBusy = false
    this.zmodemQuietUntil = Date.now() + 5000
    this.emit('zmodem-end')
  }

  private saveZmodemFile(name: string, buf: Buffer): string {
    const base = (name || 'zmodem-download.bin').replace(/[\\/:*?"<>|]/g, '_')
    let dir = store().config.download_path
    if (!dir || !existsSync(dir)) dir = join(app.getPath('downloads'), 'HostShell')
    mkdirSync(dir, { recursive: true })
    let target = join(dir, base)
    if (existsSync(target)) {
      const ext = extname(base)
      const stem = base.slice(0, base.length - ext.length)
      let i = 1
      while (existsSync(target)) {
        target = join(dir, `${stem} (${i})${ext}`)
        i += 1
      }
    }
    writeFileSync(target, buf)
    return target
  }

  write(data: string): void {
    this.stream?.write(data)
  }

  resize(cols: number, rows: number): void {
    this.stream?.setWindow(rows, cols, rows * 16, cols * 8)
  }

  exec(cmd: string, timeoutMs = 30000): Promise<string> {
    return new Promise((resolve, reject) => {
      let finished = false
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true
          reject(new Error('命令执行超时'))
        }
      }, timeoutMs)
      this.client.exec(cmd, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          return reject(humanError(err))
        }
        let out = ''
        stream.setEncoding('utf8')
        stream.on('data', (d: string) => (out += d))
        stream.stderr.setEncoding('utf8')
        stream.stderr.on('data', (d: string) => (out += d))
        stream.on('close', () => {
          clearTimeout(timer)
          if (!finished) {
            finished = true
            resolve(out)
          }
        })
      })
    })
  }

  sftp(): Promise<SFTPWrapper> {
    if (this.sftpWrapper) return Promise.resolve(this.sftpWrapper)
    return new Promise((resolve, reject) => {
      this.client.sftp((err, sftp) => {
        if (err) return reject(humanError(err))
        this.sftpWrapper = sftp
        sftp.on('close', () => (this.sftpWrapper = null))
        resolve(sftp)
      })
    })
  }

  async readdir(path: string): Promise<SftpEntry[]> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      sftp.readdir(path, (err, list) => {
        if (err) return reject(humanError(err))
        const entries: SftpEntry[] = list
          .filter((i) => i.filename !== '.' && i.filename !== '..')
          .map((i) => ({
            name: i.filename,
            path: path.replace(/\/+$/, '') + '/' + i.filename,
            longname: i.longname,
            isDir: i.attrs.isDirectory(),
            isLink: i.attrs.isSymbolicLink(),
            size: i.attrs.size,
            mtime: i.attrs.mtime,
            mode: i.attrs.mode,
            uid: i.attrs.uid,
            gid: i.attrs.gid
          }))
        entries.sort((a, b) => {
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
          return a.name.localeCompare(b.name, 'zh-CN')
        })
        resolve(entries)
      })
    })
  }

  async realpath(path: string): Promise<string> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      sftp.realpath(path, (err, abs) => (err ? reject(humanError(err)) : resolve(abs)))
    })
  }

  async stat(path: string): Promise<{ size: number; mtime: number; mode: number; isDir: boolean }> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      sftp.stat(path, (err, s) => {
        if (err) return reject(humanError(err))
        resolve({ size: s.size, mtime: s.mtime, mode: s.mode, isDir: s.isDirectory() })
      })
    })
  }

  async mkdir(path: string): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) => sftp.mkdir(path, (e) => (e ? rej(humanError(e)) : res())))
  }

  async rename(from: string, to: string): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) =>
      sftp.rename(from, to, (e) => (e ? rej(humanError(e)) : res()))
    )
  }

  async remove(path: string, isDir: boolean): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) =>
      isDir ? sftp.rmdir(path, (e) => (e ? rej(humanError(e)) : res())) : sftp.unlink(path, (e) => (e ? rej(humanError(e)) : res()))
    )
  }

  async chmod(path: string, mode: number): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) =>
      sftp.chmod(path, mode, (e) => (e ? rej(humanError(e)) : res()))
    )
  }

  async readFile(path: string): Promise<Buffer> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const rs = sftp.createReadStream(path)
      rs.on('data', (c: Buffer) => chunks.push(c))
      rs.on('error', (e) => reject(humanError(e)))
      rs.on('end', () => resolve(Buffer.concat(chunks)))
    })
  }

  async writeFile(path: string, data: Buffer): Promise<void> {
    const sftp = await this.sftp()
    return new Promise((resolve, reject) => {
      const ws = sftp.createWriteStream(path)
      ws.on('error', (e) => reject(humanError(e)))
      ws.on('close', () => resolve())
      ws.end(data)
    })
  }

  async download(remote: string, local: string, onProgress?: (p: number) => void): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) =>
      sftp.fastGet(remote, local, { step: (t, c) => (onProgress && t > 0 ? onProgress(c / t) : undefined) }, (e) =>
        e ? rej(humanError(e)) : res()
      )
    )
  }

  async upload(local: string, remote: string, onProgress?: (p: number) => void): Promise<void> {
    const sftp = await this.sftp()
    await new Promise<void>((res, rej) =>
      sftp.fastPut(local, remote, { step: (t, c) => (onProgress && t > 0 ? onProgress(c / t) : undefined) }, (e) =>
        e ? rej(humanError(e)) : res()
      )
    )
  }

  /** 本地监听端口，通过 SSH 通道转发到远端地址（local forward） */
  startForward(rule: ForwardRule): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.forwards.has(rule.id)) return resolve()
      const server = net.createServer((sock) => {
        this.client.forwardOut(
          sock.remoteAddress || '127.0.0.1',
          sock.remotePort || 0,
          rule.remote_host,
          rule.remote_port,
          (err, stream) => {
            if (err) {
              sock.destroy()
              return
            }
            const rec = this.forwards.get(rule.id)
            if (rec) rec.conns++
            sock.on('close', () => {
              stream.destroy()
              const r2 = this.forwards.get(rule.id)
              if (r2 && r2.conns > 0) r2.conns--
            })
            sock.on('error', () => stream.destroy())
            stream.on('error', () => sock.destroy())
            sock.pipe(stream).pipe(sock)
          }
        )
      })
      server.once('error', (err) => {
        this.forwards.delete(rule.id)
        reject(new Error(`端口转发启动失败：${err.message}`))
      })
      server.listen(rule.local_port, '127.0.0.1', () => {
        this.forwards.set(rule.id, { server, rule, conns: 0 })
        resolve()
      })
    })
  }

  stopForward(ruleId: string): void {
    const rec = this.forwards.get(ruleId)
    if (!rec) return
    try {
      rec.server.close()
    } catch {
      /* ignore */
    }
    this.forwards.delete(ruleId)
  }

  runningForwards(): string[] {
    return [...this.forwards.keys()]
  }

  /** 本地执行 tar（Windows 10+ / macOS / Linux 自带） */
  private runLocal(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, { timeout: 180000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(String(stderr || err.message).trim().slice(0, 400)))
        else resolve()
      })
    })
  }

  /**
   * 打包下载：远端 tar czf → SFTP 下载 → 本地解压
   * 目录/文件都支持，返回本地落盘路径
   */
  async packDownload(
    remotePath: string,
    localDir: string,
    onProgress?: (p: number) => void
  ): Promise<string> {
    const sftp = await this.sftp()
    const clean = remotePath.replace(/\/+$/, '')
    const parent = dirname(clean) || '/'
    const base = clean.split('/').pop() || ''
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const remoteTmp = `/tmp/.hs-${stamp}.tar.gz`
    const localTmp = join(tmpdir(), `hs-${stamp}.tar.gz`)

    const out = await this.exec(
      `tar czf '${remoteTmp}' -C '${parent}' '${base}' 2>&1; echo "EXIT:$?"`,
      180000
    )
    if (!/EXIT:0\b/.test(out)) {
      throw new Error(`远端打包失败：${out.replace(/EXIT:\d+/g, '').trim().slice(0, 300) || '未知错误'}`)
    }
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastGet(
          remoteTmp,
          localTmp,
          {
            step: (transferred, _chunk, total) => {
              if (onProgress && total > 0) onProgress(Math.min(98, Math.round((transferred / total) * 98)))
            }
          },
          (err) => (err ? reject(err) : resolve())
        )
      })
      await this.runLocal('tar', ['-xzf', localTmp, '-C', localDir])
      onProgress?.(100)
      return join(localDir, base)
    } finally {
      void this.exec(`rm -f '${remoteTmp}'`).catch(() => undefined)
      await unlink(localTmp).catch(() => undefined)
    }
  }

  /** 打包上传：本地 tar czf → SFTP 上传 → 远端解压 */
  async packUpload(
    localPath: string,
    remoteDir: string,
    onProgress?: (p: number) => void
  ): Promise<void> {
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    const localTmp = join(tmpdir(), `hs-${stamp}.tar.gz`)
    const remoteTmp = `/tmp/.hs-${stamp}.tar.gz`
    const parent = dirname(localPath)
    const base = localPath.split(/[\\/]/).pop() || ''
    await this.runLocal('tar', ['-czf', localTmp, '-C', parent, base])
    const sftp = await this.sftp()
    try {
      await new Promise<void>((resolve, reject) => {
        sftp.fastPut(
          localTmp,
          remoteTmp,
          {
            step: (transferred, _chunk, total) => {
              if (onProgress && total > 0) onProgress(Math.min(98, Math.round((transferred / total) * 98)))
            }
          },
          (err) => (err ? reject(err) : resolve())
        )
      })
      const out = await this.exec(
        `mkdir -p '${remoteDir}' && tar xzf '${remoteTmp}' -C '${remoteDir}' 2>&1; echo "EXIT:$?"`,
        180000
      )
      if (!/EXIT:0\b/.test(out)) {
        throw new Error(`远端解压失败：${out.replace(/EXIT:\d+/g, '').trim().slice(0, 300) || '未知错误'}`)
      }
      onProgress?.(100)
    } finally {
      void this.exec(`rm -f '${remoteTmp}'`).catch(() => undefined)
      await unlink(localTmp).catch(() => undefined)
    }
  }

  close(): void {
    for (const id of [...this.forwards.keys()]) this.stopForward(id)
    try {
      this.stream?.close()
    } catch {
      /* ignore */
    }
    try {
      this.client.end()
    } catch {
      /* ignore */
    }
    this.connected = false
  }
}
