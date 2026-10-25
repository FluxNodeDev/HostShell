import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { useT } from '../i18n/useT'
import { kbStr, pctStr, speedStr } from '../lib/format'
import { formatUptime, normalizeLocale } from '../i18n'
import type { Metrics, PingSample, Tab } from '../types'

function Bar({ value, kind }: { value: number; kind: 'cpu' | 'mem' | 'swap' }): JSX.Element {
  return (
    <div className={'sbar ' + kind}>
      <i style={{ width: Math.max(0, Math.min(100, value)) + '%' }} />
    </div>
  )
}

function NetChart({ data, max }: { data: { rx: number; tx: number }[]; max: number }): JSX.Element {
  const W = 100
  const H = 40
  const build = (key: 'rx' | 'tx'): string => {
    if (!data.length) return `M0,${H} L${W},${H} Z`
    const pts = data.map((d, i) => {
      const x = data.length === 1 ? 0 : (i / (data.length - 1)) * W
      const y = H - Math.min(1, d[key] / max) * (H - 1)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    const last = data.length === 1 ? 0 : W
    return `M0,${H} L${pts.join(' L')} L${last},${H} Z`
  }
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      <path d={build('rx')} fill="rgba(63,154,90,0.55)" stroke="#3f9a5a" strokeWidth="0.6" />
      <path d={build('tx')} fill="rgba(217,83,79,0.45)" stroke="#d9534f" strokeWidth="0.5" />
    </svg>
  )
}

function PingChart({ samples }: { samples: PingSample[] }): JSX.Element {
  const W = 100
  const H = 34
  const maxRtt = Math.max(20, ...samples.filter((s) => s.rtt !== null).map((s) => s.rtt as number))
  const barW = W / Math.max(1, samples.length)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%' }}>
      {samples.map((s, i) => {
        const h = s.timeout ? H : Math.max(1, ((s.rtt as number) / maxRtt) * (H - 2))
        return (
          <rect
            key={s.seq + '-' + i}
            x={i * barW}
            y={H - h}
            width={Math.max(0.6, barW - 0.3)}
            height={h}
            fill={s.timeout ? '#d9534f' : '#8fb6d8'}
          />
        )
      })}
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#ddd" strokeWidth="0.4" />
    </svg>
  )
}

function buildTicks(max: number): string[] {
  return [1, 2 / 3, 1 / 3, 0].map((f) => speedStr(max * f))
}

function ProcTable({ metrics, onOpen }: { metrics?: Metrics; onOpen?: () => void }): JSX.Element {
  const t = useT()
  const [by, setBy] = useState<'mem' | 'cpu' | 'cmd'>('mem')
  const procs = useMemo(() => {
    const list = [...(metrics?.procs || [])]
    if (by === 'mem') list.sort((a, b) => b.rss - a.rss)
    else if (by === 'cpu') list.sort((a, b) => b.cpu - a.cpu)
    else list.sort((a, b) => a.cmd.localeCompare(b.cmd))
    return list.slice(0, 9)
  }, [metrics?.procs, by])
  return (
    <div>
      <div className="proctabs">
        <div className={'proctab' + (by === 'mem' ? ' active' : '')} onClick={() => setBy('mem')}>
          内存
        </div>
        <div
          className={'proctab cpu' + (by === 'cpu' ? ' active' : '')}
          onClick={() => setBy('cpu')}
        >
          CPU
        </div>
        <div className={'proctab' + (by === 'cmd' ? ' active' : '')} onClick={() => setBy('cmd')}>
          命令
        </div>
        <div className="proctab icon" title="打开进程管理器" onClick={() => onOpen?.()}>
          <Icon name="window" />
        </div>
      </div>
      <div className="ptable" title="双击打开进程管理器">
        {procs.map((p) => (
          <div
            className="prow"
            key={p.pid}
            title={`${p.pid} ${p.user} ${p.cmd}（双击查看进程管理器）`}
            onDoubleClick={() => onOpen?.()}
          >
            <span className="mem">{kbStr(p.rss)}</span>
            <span className="cpu">{p.cpu ? p.cpu.toFixed(1) : '0'}</span>
            <span className="cmd">{p.cmd}</span>
          </div>
        ))}
        {!procs.length && <div className="prow" />}
      </div>
    </div>
  )
}

export function Sidebar({ tab }: { tab: Tab }): JSX.Element | null {
  const t = useT()
  const locale = useApp((s) => normalizeLocale(s.config.locale))
  const m = useApp((s) => s.metrics[tab.id])
  const pingSamples = useApp((s) => s.pings[tab.id]) || []
  const pingStats = useApp((s) => s.pingStats[tab.id])
  const setSysinfoTab = useApp((s) => s.setSysinfoTab)
  const [netHist, setNetHist] = useState<{ rx: number; tx: number }[]>([])

  useEffect(() => {
    if (!m) return
    setNetHist((h) => [...h.slice(-59), { rx: m.net.rxBps, tx: m.net.txBps }])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m?.ts])

  const netMax = useMemo(() => {
    const peak = Math.max(1024, ...netHist.map((d) => Math.max(d.rx, d.tx)))
    const mag = Math.pow(10, Math.floor(Math.log10(peak)))
    return Math.ceil(peak / mag) * mag
  }, [netHist])

  if (!m) {
    return (
      <div className="sidebar">
        <div className="sidebar-scroll">
          <div className="sync-row">
            {t('side.sync')} <span className="dot" />
          </div>
          <div className="ip-row">
            <span>IP</span>
            <span className="ip">{tab.host}</span>
            <button className="copy" onClick={() => window.api.clipboard.write(tab.host)}>
              {t('side.copy')}
            </button>
          </div>
          <button className="sysbtn" onClick={() => setSysinfoTab(tab.id)}>
            {t('side.systemInfo')}
          </button>
          <div className="sline">
            <span className="k">{t('side.uptime')}</span>
            <span className="v" style={{ color: '#999' }}>{t(tab.status === 'connecting' ? 'side.connecting' : 'side.waiting')}</span>
          </div>
        </div>
      </div>
    )
  }

  const ticks = buildTicks(netMax)
  const lastPing = [...pingSamples].reverse().find((s) => s.rtt !== null)

  return (
    <div className="sidebar">
      <div className="sidebar-scroll">
        <div className="sync-row">
          {t('side.sync')} <span className="dot" />
        </div>
        <div className="ip-row">
          <span>IP</span>
          <span className="ip" title={tab.host}>
            {tab.host}
          </span>
          <button className="copy" onClick={() => window.api.clipboard.write(tab.host)}>
            复制
          </button>
        </div>
        <button className="sysbtn" onClick={() => setSysinfoTab(tab.id)}>
          系统信息
        </button>

        <div className="sline">
          <span className="k">{t('side.uptime')}</span>
          <span className="v">{formatUptime(m.uptime, locale)}</span>
        </div>
        <div className="sline">
          <span className="k">{t('side.load')}</span>
          <span className="v">{m.load.map((v) => v.toFixed(2)).join(', ')}</span>
        </div>

        <div className="sline">
          <span className="k">CPU</span>
          <span className="v metric-pct cpu">{pctStr(m.cpu)}</span>
        </div>
        <Bar value={m.cpu} kind="cpu" />

        <div className="sline">
          <span className="k">{t('side.memory')}</span>
          <span className="metric-pct mem">{pctStr(m.mem.pct)}</span>
          <span className="v" style={{ marginLeft: 'auto', color: '#666' }}>
            {kbStr(m.mem.used)}/{kbStr(m.mem.total)}
          </span>
        </div>
        <Bar value={m.mem.pct} kind="mem" />

        <div className="sline">
          <span className="k">{t('side.swap')}</span>
          <span className="metric-pct swap">{pctStr(m.swap.pct)}</span>
          <span className="v" style={{ marginLeft: 'auto', color: '#666' }}>
            {m.swap.total ? `${kbStr(m.swap.used)}/${kbStr(m.swap.total)}` : '无'}
          </span>
        </div>
        <Bar value={m.swap.pct} kind="swap" />

        <ProcTable metrics={m} onOpen={() => useApp.getState().setProcTab(tab.id)} />

        <div className="net-head">
          <span className="up">↑{speedStr(m.net.txBps)}</span>
          <span className="down">↓{speedStr(m.net.rxBps)}</span>
          <span className="iface">{m.net.iface || '-'}</span>
        </div>
        <div className="chart-box">
          <div className="chart-y">
            {ticks.map((t, i) => (
              <span key={i}>{t}</span>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <NetChart data={netHist} max={netMax} />
          </div>
        </div>

        <div className="ping-head">
          <span>{t('side.local')}</span>
          <span className="val">
            {lastPing ? `${(lastPing.rtt as number).toFixed(0)}ms` : '超时'}
            {pingStats && pingStats.loss > 0 ? ` · 丢包${pingStats.loss.toFixed(0)}%` : ''}
          </span>
        </div>
        <div className="ping-box">
          <PingChart samples={pingSamples.slice(-40)} />
        </div>

        <div className="disk-head">
          <span>路径</span>
          <span>{t('side.available')}</span>
        </div>
        {m.disks.slice(0, 10).map((d) => (
          <div className="disk-row" key={d.mount} title={`${d.fs} ${d.mount} ${d.pct}%`}>
            <i
              className={'fill' + (d.pct > 90 ? ' danger' : d.pct > 75 ? ' warn' : '')}
              style={{ width: Math.min(100, d.pct) + '%' }}
            />
            <span className="mnt">{d.mount}</span>
            <span className="size">
              {kbStr(d.avail)}/{kbStr(d.total)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
