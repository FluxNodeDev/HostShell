import { execFile } from 'node:child_process'

export interface PingSample {
  ts: number
  rtt: number | null
  timeout: boolean
  seq: number
}

const isWin = process.platform === 'win32'

export function pingOnce(host: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const args = isWin
      ? ['-n', '1', '-w', String(timeoutMs), host]
      : ['-c', '1', '-W', String(Math.max(1, Math.round(timeoutMs / 1000))), host]
    execFile('ping', args, { timeout: timeoutMs + 1500, windowsHide: true }, (err, stdout) => {
      if (err && !stdout) return resolve(null)
      const text = String(stdout || '')
      const m = text.match(/(\d+(?:\.\d+)?)\s*ms/i)
      if (!m) return resolve(null)
      resolve(Number(m[1]))
    })
  })
}

export class Pinger {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private seq = 0
  samples: PingSample[] = []
  private lost = 0
  private sent = 0

  constructor(
    readonly host: string,
    private onSample: (s: PingSample) => void
  ) {}

  start(intervalMs = 2000): void {
    this.stop()
    this.timer = setInterval(() => void this.tick(), intervalMs)
    void this.tick()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const rtt = await pingOnce(this.host, 1500)
      this.seq++
      this.sent++
      if (rtt === null) this.lost++
      const s: PingSample = { ts: Date.now(), rtt, timeout: rtt === null, seq: this.seq }
      this.samples.push(s)
      if (this.samples.length > 120) this.samples.shift()
      this.onSample(s)
    } finally {
      this.running = false
    }
  }

  stats(): { avg: number; min: number; max: number; loss: number } {
    const vals = this.samples.filter((s) => s.rtt !== null).map((s) => s.rtt as number)
    if (!vals.length) return { avg: 0, min: 0, max: 0, loss: this.sent ? (this.lost / this.sent) * 100 : 0 }
    return {
      avg: vals.reduce((a, b) => a + b, 0) / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
      loss: this.sent ? (this.lost / this.sent) * 100 : 0
    }
  }
}
