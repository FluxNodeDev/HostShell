import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'

interface TraceHop {
  hop: number
  ip: string
  rtts: (number | null)[]
}

interface HopState {
  hop: number
  ip: string
  rtt: number | null
  sent: number
  lost: number
  loss: number
  samples: (number | null)[]
}

function locationOf(ip: string): string {
  if (!ip) return '超时'
  if (ip.startsWith('127.')) return '本机'
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip))
    return '局域网'
  if (ip.startsWith('169.254.')) return '链路本地'
  return '公网'
}

function Spark({ samples }: { samples: (number | null)[] }): JSX.Element {
  const W = 92
  const H = 16
  const SLOTS = 30
  const bw = W / SLOTS
  const vals = samples.filter((s): s is number => s !== null)
  const max = Math.max(10, ...vals)
  const offset = SLOTS - Math.min(SLOTS, samples.length)
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {samples.slice(-SLOTS).map((s, i) => {
        const h = s === null ? H : Math.max(1.5, (s / max) * (H - 1))
        return (
          <rect
            key={i}
            x={(offset + i) * bw}
            y={H - h}
            width={Math.max(1.5, bw - 0.5)}
            height={h}
            fill={s === null ? '#d9534f' : '#7fa9cd'}
          />
        )
      })}
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#e2e2e2" strokeWidth="0.6" />
    </svg>
  )
}

export function HostInspector({ tabId }: { tabId: string }): JSX.Element {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId))
  const setInspectTab = useApp((s) => s.setInspectTab)
  const [hops, setHops] = useState<TraceHop[]>([])
  const [states, setStates] = useState<HopState[]>([])
  const [running, setRunning] = useState(true)
  const [tracing, setTracing] = useState(false)
  const [err, setErr] = useState('')

  const host = tab?.host || ''

  useEffect(() => {
    if (!host) return
    const offs = [
      window.api.net.onHops((p: any) => {
        if (p.id !== tabId) return
        setHops(p.hops || [])
        setTracing(false)
      }),
      window.api.net.onSample((p: any) => {
        if (p.id !== tabId) return
        setStates(p.states || [])
      })
    ]
    window.api.net.start(tabId, host).catch((e: Error) => setErr(e.message))
    return () => {
      offs.forEach((f) => f())
      void window.api.net.stop(tabId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, host])

  const rows = useMemo(() => {
    if (states.length) return states
    return hops.map((h) => ({
      hop: h.hop,
      ip: h.ip,
      rtt: null,
      sent: 0,
      lost: 0,
      loss: 0,
      samples: [] as (number | null)[]
    }))
  }, [states, hops])

  const avg = useMemo(() => {
    const vals = rows.map((r) => r.rtt).filter((v): v is number => v !== null)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }, [rows])

  const toggle = async (): Promise<void> => {
    if (running) {
      await window.api.net.stop(tabId)
      setRunning(false)
    } else {
      await window.api.net.start(tabId, host)
      setRunning(true)
    }
  }

  const retrace = async (): Promise<void> => {
    setTracing(true)
    try {
      await window.api.net.retrace(tabId)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setTracing(false)
    }
  }

  return (
    <div className="modal-mask">
      <div className="modal inspect-modal">
        <div className="modal-head">
          <span>主机检测 · {host}</span>
          <button className="x" onClick={() => setInspectTab(null)}>
            ×
          </button>
        </div>
        <div className="inspect-toolbar">
          <span className="stat">
            共 <b>{rows.length}</b> 跳 · 平均 <b>{avg.toFixed(1)}</b> ms
          </span>
          <button className="tbtn" onClick={() => void retrace()} disabled={tracing}>
            <Icon name="refresh" /> {tracing ? '探测中…' : '重新探测路由'}
          </button>
          <button className="tbtn" onClick={() => void toggle()}>
            <Icon name={running ? 'stop' : 'play'} /> {running ? '暂停' : '继续'}
          </button>
          <span className="tip">数据来源：tracert + 逐跳 ping，2 秒一轮</span>
        </div>
        {err && <div className="proc-err">{err}</div>}
        <div className="inspect-body">
          <table className="inspect-table">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 86 }} />
              <col style={{ width: 76 }} />
              <col style={{ width: 90 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>IP</th>
                <th>延迟</th>
                <th>丢包</th>
                <th>位置</th>
                <th>最近 30 次</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.hop}>
                  <td className="dim">{r.hop}</td>
                  <td className="mono">{r.ip || '*'}</td>
                  <td className={r.rtt === null ? 'dim' : r.rtt > 150 ? 'hot' : ''}>
                    {r.rtt === null ? '超时' : `${r.rtt} ms`}
                  </td>
                  <td className={r.loss >= 50 ? 'hot' : 'dim'}>
                    {r.sent ? `${r.loss}%` : '-'}
                  </td>
                  <td className="dim">{locationOf(r.ip)}</td>
                  <td>
                    <Spark samples={r.samples} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#999' }}>
                    正在探测路由…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: 'auto', color: '#999', fontSize: 11 }}>
            目标 {host} · 最多 16 跳
          </span>
          <button className="btn" onClick={() => setInspectTab(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
