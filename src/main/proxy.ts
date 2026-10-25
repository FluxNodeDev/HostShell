import * as net from 'node:net'

export interface ProxyConfig {
  id: string
  name: string
  type: 'http' | 'socks5'
  host: string
  port: number
  username?: string
  password?: string
}

/** 读取指定字节数的小工具，握手完成后把剩余字节 unshift 回 socket */
class SocketReader {
  private chunks: Buffer[] = []
  private length = 0
  private pending:
    | { mode: 'n'; n: number; resolve: (b: Buffer) => void; reject: (e: Error) => void }
    | { mode: 'until'; token: Buffer; resolve: (b: Buffer) => void; reject: (e: Error) => void }
    | null = null
  private err: Error | null = null
  private readonly onData: (d: Buffer) => void
  private readonly onError: (e: Error) => void
  private readonly onClose: () => void

  constructor(private sock: net.Socket) {
    this.onData = (d: Buffer): void => {
      this.chunks.push(d)
      this.length += d.length
      this.pump()
    }
    this.onError = (e: Error): void => {
      this.err = e
      this.pending?.reject(e)
      this.pending = null
    }
    this.onClose = (): void => {
      this.pending?.reject(new Error('代理连接已关闭'))
      this.pending = null
    }
    sock.on('data', this.onData)
    sock.on('error', this.onError)
    sock.on('close', this.onClose)
  }

  private take(n: number): Buffer | null {
    if (this.length < n) return null
    const all = Buffer.concat(this.chunks)
    const out = all.subarray(0, n)
    const rest = all.subarray(n)
    this.chunks = rest.length ? [rest] : []
    this.length = rest.length
    return Buffer.from(out)
  }

  private pump(): void {
    if (!this.pending) return
    if (this.err) {
      this.pending.reject(this.err)
      this.pending = null
      return
    }
    if (this.pending.mode === 'n') {
      const out = this.take(this.pending.n)
      if (!out) return
      const p = this.pending
      this.pending = null
      p.resolve(out)
      return
    }
    const all = Buffer.concat(this.chunks)
    const idx = all.indexOf(this.pending.token)
    if (idx < 0) return
    const end = idx + this.pending.token.length
    const out = all.subarray(0, end)
    const rest = all.subarray(end)
    this.chunks = rest.length ? [rest] : []
    this.length = rest.length
    const p = this.pending
    this.pending = null
    p.resolve(Buffer.from(out))
  }

  read(n: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.pending = { mode: 'n', n, resolve, reject }
      this.pump()
    })
  }

  readUntil(token: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.pending = { mode: 'until', token, resolve, reject }
      this.pump()
    })
  }

  detach(): void {
    this.sock.removeListener('data', this.onData)
    this.sock.removeListener('error', this.onError)
    this.sock.removeListener('close', this.onClose)
    const rest = Buffer.concat(this.chunks)
    this.chunks = []
    this.length = 0
    if (rest.length) this.sock.unshift(rest)
  }
}

async function httpConnect(
  sock: net.Socket,
  reader: SocketReader,
  proxy: ProxyConfig,
  host: string,
  port: number
): Promise<void> {
  const auth = proxy.username
    ? `Proxy-Authorization: Basic ${Buffer.from(`${proxy.username}:${proxy.password || ''}`).toString('base64')}\r\n`
    : ''
  sock.write(
    `CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n${auth}Proxy-Connection: keep-alive\r\n\r\n`
  )
  const head = (await reader.readUntil(Buffer.from('\r\n\r\n'))).toString('latin1')
  const status = head.split('\r\n')[0] || ''
  if (!/^HTTP\/1\.[01] 200/.test(status)) {
    throw new Error(`代理拒绝连接：${status.trim() || '无响应'}`)
  }
}

async function socks5Connect(
  sock: net.Socket,
  reader: SocketReader,
  proxy: ProxyConfig,
  host: string,
  port: number
): Promise<void> {
  const needAuth = !!proxy.username
  sock.write(Buffer.from([0x05, 0x01, needAuth ? 0x02 : 0x00]))
  const greeting = await reader.read(2)
  if (greeting[0] !== 0x05) throw new Error('SOCKS5 握手失败：版本不匹配')
  if (greeting[1] === 0x02) {
    const u = Buffer.from(proxy.username || '')
    const p = Buffer.from(proxy.password || '')
    sock.write(Buffer.concat([Buffer.from([0x01, u.length]), u, Buffer.from([p.length]), p]))
    const res = await reader.read(2)
    if (res[1] !== 0x00) throw new Error('SOCKS5 认证失败')
  } else if (greeting[1] !== 0x00) {
    throw new Error('SOCKS5 代理不支持当前认证方式')
  }

  const hb = Buffer.from(host)
  sock.write(
    Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hb.length]),
      hb,
      Buffer.from([(port >> 8) & 0xff, port & 0xff])
    ])
  )
  const head = await reader.read(4)
  if (head[0] !== 0x05) throw new Error('SOCKS5 应答格式错误')
  if (head[1] !== 0x00) {
    const map: Record<number, string> = {
      1: '一般性失败',
      2: '规则不允许',
      3: '网络不可达',
      4: '主机不可达',
      5: '连接被拒绝',
      6: 'TTL 过期',
      7: '命令不支持',
      8: '地址类型不支持'
    }
    throw new Error(`SOCKS5 连接失败：${map[head[1]] || '错误码 ' + head[1]}`)
  }
  const atyp = head[3]
  if (atyp === 0x01) await reader.read(4)
  else if (atyp === 0x03) {
    const len = (await reader.read(1))[0]
    await reader.read(len)
  } else if (atyp === 0x04) await reader.read(16)
  await reader.read(2)
}

/**
 * 通过代理建立到 target 的 TCP 连接，返回已就绪的 socket。
 * 支持 HTTP CONNECT 与 SOCKS5（可选用户名/密码认证）。
 */
export function connectViaProxy(
  proxy: ProxyConfig,
  host: string,
  port: number,
  timeoutMs = 20000
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: proxy.host, port: proxy.port })
    const reader = new SocketReader(sock)
    let settled = false
    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (err) {
        try {
          reader.detach()
        } catch {
          /* ignore */
        }
        sock.destroy()
        reject(err)
      } else {
        reader.detach()
        resolve(sock)
      }
    }
    const timer = setTimeout(() => finish(new Error('代理连接超时')), timeoutMs)
    sock.once('connect', () => {
      const task = proxy.type === 'http' ? httpConnect : socks5Connect
      task(sock, reader, proxy, host, port)
        .then(() => finish())
        .catch((e: Error) => finish(e))
    })
    sock.once('error', (e) => finish(new Error(`无法连接代理 ${proxy.host}:${proxy.port}（${e.message}）`)))
  })
}
