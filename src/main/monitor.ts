import type { SshSession } from './session'

export interface ProcInfo {
  pid: number
  user: string
  cpu: number
  mem: number
  rss: number // kB
  cmd: string
}

export interface DiskInfo {
  fs: string
  mount: string
  total: number // kB
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

/** 一次 exec 采集所有指标，减少 SSH 往返 */
export const METRICS_CMD = [
  'export LC_ALL=C',
  'echo "@@@STAT"',
  "grep '^cpu ' /proc/stat",
  'echo "@@@MEM"',
  "grep -E '^(MemTotal|MemAvailable|MemFree|SwapTotal|SwapFree):' /proc/meminfo",
  'echo "@@@LOAD"',
  'cat /proc/loadavg',
  'echo "@@@UPTIME"',
  'cat /proc/uptime',
  'echo "@@@NET"',
  'cat /proc/net/dev',
  'echo "@@@DISK"',
  'df -kP 2>/dev/null',
  'echo "@@@PROC"',
  'ps -eo pid,user,pcpu,pmem,rss,comm --sort=-rss 2>/dev/null | head -n 32 || ps aux 2>/dev/null | head -n 32',
  'echo "@@@END"'
].join('\n')

function sections(raw: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  let cur = ''
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^@@@(\w+)$/)
    if (m) {
      cur = m[1]
      out[cur] = []
      continue
    }
    if (cur && line.trim() !== '') out[cur].push(line)
  }
  return out
}

function parseStat(line: string): { total: number; idle: number } {
  const nums = line.trim().split(/\s+/).slice(1).map(Number)
  const [user = 0, nice = 0, system = 0, idle = 0, iowait = 0, irq = 0, softirq = 0, steal = 0] = nums
  const total = user + nice + system + idle + iowait + irq + softirq + steal
  return { total, idle: idle + iowait }
}

function parseMem(lines: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const l of lines) {
    const m = l.match(/^(\w+):\s+(\d+)/)
    if (m) out[m[1]] = Number(m[2])
  }
  return out
}

function parseNet(lines: string[]): { name: string; rx: number; tx: number }[] {
  const res: { name: string; rx: number; tx: number }[] = []
  for (const l of lines) {
    if (l.includes('|')) continue
    const m = l.match(/^\s*([^:\s]+):\s*(.+)$/)
    if (!m) continue
    const f = m[2].trim().split(/\s+/).map(Number)
    if (f.length < 9) continue
    res.push({ name: m[1], rx: f[0], tx: f[8] })
  }
  return res
}

function parseDisks(lines: string[]): DiskInfo[] {
  const out: DiskInfo[] = []
  const seen = new Set<string>()
  for (const l of lines) {
    const m = l.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)%\s+(.+)$/)
    if (!m) continue
    const mount = m[6].trim()
    if (mount === '/proc' || mount === '/sys' || mount.startsWith('/sys/')) continue
    if (seen.has(mount)) continue
    seen.add(mount)
    const total = Number(m[2])
    const used = Number(m[3])
    if (total <= 0) continue
    out.push({
      fs: m[1],
      mount,
      total,
      used,
      avail: Number(m[4]),
      pct: total ? Math.round((used / total) * 1000) / 10 : 0
    })
  }
  return out.slice(0, 16)
}

function parseProcs(lines: string[]): ProcInfo[] {
  const out: ProcInfo[] = []
  const header = lines[0] || ''
  const gnu = header.includes('PID') && header.includes('RSS')
  for (const l of lines.slice(1)) {
    if (!l.trim()) continue
    if (gnu) {
      const m = l.match(/^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(.*)$/)
      if (m) {
        out.push({
          pid: Number(m[1]),
          user: m[2],
          cpu: Number(m[3]),
          mem: Number(m[4]),
          rss: Number(m[5]),
          cmd: m[6].trim()
        })
      }
    } else {
      // ps aux: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
      const m = l.match(/^\s*(\S+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+\S+\s+(.*)$/)
      if (m) {
        out.push({
          pid: Number(m[2]),
          user: m[1],
          cpu: Number(m[3]),
          mem: Number(m[4]),
          rss: Number(m[6]),
          cmd: m[7].trim().split(/\s+/)[0].replace(/.*\//, '')
        })
      }
    }
  }
  return out.slice(0, 30)
}

export class Monitor {
  private timer: NodeJS.Timeout | null = null
  private busy = false
  private prevCpu: { total: number; idle: number } | null = null
  private prevNet = new Map<string, { rx: number; tx: number; ts: number }>()
  private prevIface = ''

  constructor(
    private session: SshSession,
    private onMetrics: (m: Metrics) => void,
    private onError: (e: string) => void
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
    if (this.busy || !this.session.connected) return
    this.busy = true
    const ts = Date.now()
    try {
      const raw = await this.session.exec(METRICS_CMD, 15000)
      const sec = sections(raw)
      const m: Metrics = {
        ts,
        uptime: 0,
        load: [0, 0, 0],
        cpu: 0,
        mem: { used: 0, total: 0, pct: 0 },
        swap: { used: 0, total: 0, pct: 0 },
        net: { iface: '', rx: 0, tx: 0, rxBps: 0, txBps: 0, ifaces: [] },
        disks: [],
        procs: []
      }

      if (sec.STAT?.[0]) {
        const cur = parseStat(sec.STAT[0])
        if (this.prevCpu && cur.total > this.prevCpu.total) {
          const dt = cur.total - this.prevCpu.total
          const di = cur.idle - this.prevCpu.idle
          m.cpu = Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100)))
        }
        this.prevCpu = cur
      }

      if (sec.MEM) {
        const mem = parseMem(sec.MEM)
        const total = mem.MemTotal || 0
        const avail = mem.MemAvailable ?? mem.MemFree ?? 0
        const used = Math.max(0, total - avail)
        m.mem = { used, total, pct: total ? Math.round((used / total) * 1000) / 10 : 0 }
        const st = mem.SwapTotal || 0
        const sf = mem.SwapFree || 0
        m.swap = { used: Math.max(0, st - sf), total: st, pct: st ? Math.round(((st - sf) / st) * 1000) / 10 : 0 }
      }

      if (sec.LOAD?.[0]) {
        const n = sec.LOAD[0].split(/\s+/).map(Number)
        m.load = [n[0] || 0, n[1] || 0, n[2] || 0]
      }

      if (sec.UPTIME?.[0]) m.uptime = Math.floor(Number(sec.UPTIME[0].split(/\s+/)[0]) || 0)

      if (sec.NET) {
        const nets = parseNet(sec.NET)
        const ifaces = nets.map((n) => {
          const prev = this.prevNet.get(n.name)
          const dt = prev ? (ts - prev.ts) / 1000 : 0
          const rxBps = prev && dt > 0 ? Math.max(0, (n.rx - prev.rx) / dt) : 0
          const txBps = prev && dt > 0 ? Math.max(0, (n.tx - prev.tx) / dt) : 0
          this.prevNet.set(n.name, { rx: n.rx, tx: n.tx, ts })
          return { name: n.name, rx: n.rx, tx: n.tx, rxBps, txBps }
        })
        const real = ifaces.filter((i) => i.name !== 'lo')
        const preferred =
          real.find((i) => i.name === this.prevIface) ||
          real.find((i) => /^(eth0|ens\d+|enp\S+|eno\d+)$/.test(i.name)) ||
          real.sort((a, b) => b.rx + b.tx - (a.rx + a.tx))[0]
        if (preferred) {
          this.prevIface = preferred.name
          m.net = {
            iface: preferred.name,
            rx: preferred.rx,
            tx: preferred.tx,
            rxBps: preferred.rxBps,
            txBps: preferred.txBps,
            ifaces: real
          }
        }
      }

      if (sec.DISK) m.disks = parseDisks(sec.DISK)
      if (sec.PROC) m.procs = parseProcs(sec.PROC)

      this.onMetrics(m)
    } catch (e) {
      this.onError((e as Error).message)
    } finally {
      this.busy = false
    }
  }
}

/* ---------------- 进程管理器 ---------------- */

export interface ProcFull {
  pid: number
  user: string
  cpu: number
  mem: number
  rss: number
  elapsed: string
  cmd: string
}

export const PROC_LIST_CMD =
  "ps -eo pid=,user=,pcpu=,pmem=,rss=,etime=,args= --sort=-pcpu 2>/dev/null | head -n 300 || ps aux 2>/dev/null | head -n 300"

export function parsePsFull(raw: string): ProcFull[] {
  const out: ProcFull[] = []
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue
    const gnu = line.match(
      /^\s*(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+([\d:.-]+)\s+(.+)$/
    )
    if (gnu) {
      out.push({
        pid: Number(gnu[1]),
        user: gnu[2],
        cpu: Number(gnu[3]),
        mem: Number(gnu[4]),
        rss: Number(gnu[5]),
        elapsed: gnu[6],
        cmd: gnu[7].trim()
      })
      continue
    }
    // ps aux: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
    const aux = line.match(
      /^\s*(\S+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+\S+\s+\S+\s+\S+\s+(\S+)\s+(.+)$/
    )
    if (aux) {
      out.push({
        pid: Number(aux[2]),
        user: aux[1],
        cpu: Number(aux[3]),
        mem: Number(aux[4]),
        rss: Number(aux[6]),
        elapsed: aux[7],
        cmd: aux[8].trim()
      })
    }
  }
  return out
}

export function procDetailCmd(pid: number): string {
  return [
    'export LC_ALL=C',
    `echo "@@@ARGS"; ps -o args= -p ${pid} 2>/dev/null`,
    `echo "@@@EXE"; readlink /proc/${pid}/exe 2>/dev/null`,
    `echo "@@@CWD"; readlink /proc/${pid}/cwd 2>/dev/null`,
    `echo "@@@ENV"; tr '\\0' '\\n' < /proc/${pid}/environ 2>/dev/null | head -n 80`,
    'echo "@@@END"'
  ].join('\n')
}

/** 系统信息（发行版 / 内核 / CPU / 内存 / 主机名） */
export const SYSINFO_CMD = [
  'export LC_ALL=C',
  'echo "@@@OS"; (cat /etc/os-release 2>/dev/null | grep -E "^(PRETTY_NAME|VERSION)=") || uname -s',
  'echo "@@@KERNEL"; uname -sr',
  'echo "@@@HOST"; hostname',
  'echo "@@@CPU"; (grep -m1 "model name" /proc/cpuinfo 2>/dev/null | cut -d: -f2) || sysctl -n machdep.cpu.brand_string 2>/dev/null',
  'echo "@@@CORES"; nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null',
  'echo "@@@MEM"; grep -E "^(MemTotal|SwapTotal):" /proc/meminfo 2>/dev/null',
  'echo "@@@ARCH"; uname -m',
  'echo "@@@END"'
].join('\n')
