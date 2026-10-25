import { execFile } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { pingOnce } from './ping'

export interface TraceHop {
  hop: number
  ip: string
  rtts: (number | null)[]
}

export interface HopState {
  hop: number
  ip: string
  rtt: number | null
  sent: number
  lost: number
  loss: number
  samples: (number | null)[]
}

function runTracert(host: string): Promise<string> {
  return new Promise((resolve) => {
    const win = process.platform === 'win32'
    const bin = win ? 'tracert' : 'traceroute'
    const args = win ? ['-d', '-w', '800', '-h', '16', host] : ['-n', '-m', '16', '-w', '1', host]
    execFile(
      bin,
      args,
      { timeout: 45000, windowsHide: true, maxBuffer: 1024 * 1024 },
      (_err, stdout) => resolve(String(stdout || ''))
    )
  })
}

export function parseTracert(raw: string): TraceHop[] {
  const hops: TraceHop[] = []
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\s+(.*)$/)
    if (!m) continue
    const idx = Number(m[1])
    if (!idx) continue
    const rest = m[2]
    const ip = rest.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)
    const rtts = [...rest.matchAll(/(\d+)\s*ms/g)].map((x) => Number(x[1]))
    // 没有 IP 且没有 ms 的行（例如 "Trace complete."）跳过
    if (!ip && !rtts.length) continue
    hops.push({
      hop: idx,
      ip: ip ? ip[0] : '',
      rtts: rtts.length ? rtts : [null, null, null]
    })
  }
  return hops
}

export class HostInspector extends EventEmitter {
  readonly id: string
  readonly host: string
  hops: TraceHop[] = []
  states: HopState[] = []
  private timer: NodeJS.Timeout | null = null
  private busy = false

  constructor(id: string, host: string) {
    super()
    this.id = id
    this.host = host
  }

  async start(): Promise<void> {
    this.stop()
    await this.trace()
    this.timer = setInterval(() => void this.tick(), 2000)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async trace(): Promise<void> {
    const raw = await runTracert(this.host)
    this.hops = parseTracert(raw)
    if (!this.hops.length && this.host) {
      this.hops = [{ hop: 1, ip: this.host, rtts: [] }]
    }
    this.states = this.hops.map((h) => ({
      hop: h.hop,
      ip: h.ip,
      rtt: null,
      sent: 0,
      lost: 0,
      loss: 0,
      samples: []
    }))
    this.emit('hops', { id: this.id, host: this.host, hops: this.hops })
  }

  private async tick(): Promise<void> {
    if (this.busy || !this.states.length) return
    this.busy = true
    try {
      await Promise.all(
        this.states.map(async (s) => {
          if (!s.ip) {
            s.sent++
            s.lost++
            s.loss = 100
            s.samples.push(null)
            s.samples = s.samples.slice(-30)
            return
          }
          const rtt = await pingOnce(s.ip, 1200)
          s.sent++
          if (rtt === null) s.lost++
          s.loss = s.sent ? Math.round((s.lost / s.sent) * 100) : 0
          s.rtt = rtt
          s.samples.push(rtt)
          s.samples = s.samples.slice(-30)
        })
      )
      this.emit('sample', { id: this.id, states: this.states.map((s) => ({ ...s })) })
    } finally {
      this.busy = false
    }
  }
}

const inspectors = new Map<string, HostInspector>()

export function startInspector(id: string, host: string): HostInspector {
  inspectors.get(id)?.stop()
  const ins = new HostInspector(id, host)
  inspectors.set(id, ins)
  void ins.start()
  return ins
}

export function getInspector(id: string): HostInspector | undefined {
  return inspectors.get(id)
}

export function stopInspector(id: string): void {
  const ins = inspectors.get(id)
  if (ins) {
    ins.stop()
    inspectors.delete(id)
  }
}

export function stopAllInspectors(): void {
  for (const ins of inspectors.values()) ins.stop()
  inspectors.clear()
}
