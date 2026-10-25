import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'

interface ProbeResult {
  sessionId: string
  name: string
  host: string
  ok: boolean
  loss?: number
  min?: number
  avg?: number
  max?: number
  error?: string
  raw?: string
}

export function ProbeModal({ tabId }: { tabId: string }): JSX.Element {
  const tabs = useApp((s) => s.tabs)
  const setProbeTab = useApp((s) => s.setProbeTab)
  const sessions = useMemo(() => tabs.filter((t) => t.status === 'connected'), [tabs])

  const [target, setTarget] = useState('8.8.8.8')
  const [selected, setSelected] = useState<string[]>(() => sessions.map((s) => s.id))
  const [running, setRunning] = useState(true)
  const [results, setResults] = useState<ProbeResult[]>([])
  const [round, setRound] = useState(0)
  const timer = useRef<number | null>(null)

  const runOnce = async (): Promise<void> => {
    if (!selected.length || !target.trim()) return
    try {
      const r = (await window.api.probe.ping(selected, target.trim())) as ProbeResult[]
      setResults(r)
      setRound((x) => x + 1)
    } catch {
      /* 单轮失败不影响下一轮 */
    }
  }

  useEffect(() => {
    if (!running) {
      if (timer.current) window.clearInterval(timer.current)
      timer.current = null
      return
    }
    void runOnce()
    timer.current = window.setInterval(() => void runOnce(), 2500)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
      timer.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, selected.join(','), target])

  const toggle = (id: string): void => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="modal-mask">
      <div className="modal probe-modal">
        <div className="modal-head">
          <span>多地点 Ping</span>
          <button className="x" onClick={() => setProbeTab(null)}>
            ×
          </button>
        </div>
        <div className="probe-toolbar">
          <span>目标</span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="IP 或域名"
            style={{ width: 200 }}
          />
          <button className="tbtn" onClick={() => setRunning((v) => !v)}>
            <Icon name={running ? 'stop' : 'play'} /> {running ? '暂停' : '开始'}
          </button>
          <span className="probe-round">
            第 {round} 轮 · 每 2.5 秒 · 以已连接会话为探测节点
          </span>
        </div>
        <div className="probe-nodes">
          {sessions.map((s) => (
            <label key={s.id} className={'probe-chip' + (selected.includes(s.id) ? ' on' : '')}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
              />
              {s.title}
            </label>
          ))}
          {!sessions.length && <span className="dim">没有已连接的会话</span>}
        </div>
        <div className="probe-body">
          <table className="probe-table">
            <colgroup>
              <col style={{ width: 180 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 90 }} />
              <col style={{ width: 80 }} />
              <col style={{ width: 150 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>探测节点</th>
                <th>节点地址</th>
                <th>延迟 (avg)</th>
                <th>丢包</th>
                <th>min / max</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.sessionId}>
                  <td>{r.name}</td>
                  <td className="mono">{r.host}</td>
                  <td className={r.ok && (r.avg ?? 0) > 150 ? 'hot' : ''}>
                    {r.ok ? `${(r.avg ?? 0).toFixed(1)} ms` : '-'}
                  </td>
                  <td className={(r.loss ?? 0) >= 50 ? 'hot' : 'dim'}>
                    {r.ok ? `${r.loss ?? 0}%` : '-'}
                  </td>
                  <td className="dim">
                    {r.ok ? `${(r.min ?? 0).toFixed(1)} / ${(r.max ?? 0).toFixed(1)}` : '-'}
                  </td>
                  <td className={r.ok ? 'dim' : 'hot'}>{r.ok ? '正常' : r.error || '失败'}</td>
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={6} style={{ padding: 26, textAlign: 'center', color: '#999' }}>
                    选择节点并点击开始
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: 'auto', color: '#999', fontSize: 11 }}>
            {selected.length} 个节点 · 目标 {target || '-'}
          </span>
          <button className="btn" onClick={() => setProbeTab(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
