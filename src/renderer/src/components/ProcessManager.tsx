import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { kbStr } from '../lib/format'
import type { ProcDetail, ProcFull } from '../types'

export function ProcessManager({ tabId }: { tabId: string }): JSX.Element {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId))
  const setProcTab = useApp((s) => s.setProcTab)
  const [list, setList] = useState<ProcFull[]>([])
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'cpu' | 'mem' | 'rss' | 'pid'>('cpu')
  const [selected, setSelected] = useState<ProcFull | null>(null)
  const [detail, setDetail] = useState<ProcDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const load = async (silent = false): Promise<void> => {
    if (!silent) setLoading(true)
    try {
      const l = (await window.api.proc.list(tabId)) as ProcFull[]
      setList(l)
      setErr('')
      setSelected((prev) => (prev ? l.find((p) => p.pid === prev.pid) || null : prev))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(true), 4000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  useEffect(() => {
    if (!selected) {
      setDetail(null)
      return
    }
    let cancelled = false
    window.api.proc
      .detail(tabId, selected.pid)
      .then((d: ProcDetail) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setDetail(null))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.pid, tabId])

  const rows = useMemo(() => {
    const key = q.trim().toLowerCase()
    const arr = list.filter(
      (p) =>
        !key ||
        String(p.pid).includes(key) ||
        p.cmd.toLowerCase().includes(key) ||
        p.user.toLowerCase().includes(key)
    )
    arr.sort((a, b) => {
      if (sort === 'cpu') return b.cpu - a.cpu
      if (sort === 'mem') return b.mem - a.mem
      if (sort === 'rss') return b.rss - a.rss
      return a.pid - b.pid
    })
    return arr.slice(0, 200)
  }, [list, q, sort])

  const kill = async (force: boolean): Promise<void> => {
    if (!selected) return
    if (!confirm(`确定${force ? '强制' : ''}结束进程 ${selected.pid}？\n${selected.cmd.slice(0, 120)}`))
      return
    const r = await window.api.proc.kill(tabId, selected.pid, force)
    if (r.code !== 0) setErr(r.output || `结束失败（exit ${r.code}）`)
    else setErr('')
    await load(true)
  }

  return (
    <div className="modal-mask">
      <div className="modal proc-modal">
        <div className="modal-head">
          <span>进程管理器 · {tab?.title}</span>
          <button className="x" onClick={() => setProcTab(null)}>
            ×
          </button>
        </div>
        <div className="proc-toolbar">
          <div className="proc-search">
            <Icon name="search" />
            <input
              value={q}
              placeholder="搜索 PID / 用户 / 命令"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <button className="tbtn" onClick={() => void load()} title="刷新">
            <Icon name="refresh" /> 刷新
          </button>
          <span className="proc-count">{rows.length} 个进程</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <button className="btn" disabled={!selected} onClick={() => void kill(false)}>
              结束进程
            </button>
            <button className="btn danger" disabled={!selected} onClick={() => void kill(true)}>
              强制结束
            </button>
          </div>
        </div>
        {err && <div className="proc-err">{err}</div>}
        <div className="proc-body">
          <table className="proc-table">
            <colgroup>
              <col style={{ width: 74 }} />
              <col style={{ width: 96 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 66 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 84 }} />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th onClick={() => setSort('pid')}>PID {sort === 'pid' && '▲'}</th>
                <th>用户</th>
                <th onClick={() => setSort('cpu')}>CPU% {sort === 'cpu' && '▼'}</th>
                <th onClick={() => setSort('mem')}>内存% {sort === 'mem' && '▼'}</th>
                <th onClick={() => setSort('rss')}>RSS {sort === 'rss' && '▼'}</th>
                <th>运行时长</th>
                <th>命令</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.pid}
                  className={selected?.pid === p.pid ? 'sel' : ''}
                  onClick={() => setSelected(p)}
                >
                  <td>{p.pid}</td>
                  <td className="dim">{p.user}</td>
                  <td className={p.cpu > 50 ? 'hot' : ''}>{p.cpu.toFixed(1)}</td>
                  <td>{p.mem.toFixed(1)}</td>
                  <td className="dim">{kbStr(p.rss)}</td>
                  <td className="dim">{p.elapsed}</td>
                  <td className="cmd">{p.cmd}</td>
                </tr>
              ))}
              {!rows.length && !loading && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: 20 }}>
                    没有匹配的进程
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="proc-detail">
          {!selected && <div className="ph">选择上方进程查看详情（命令行 / 可执行文件 / 工作目录 / 环境变量）</div>}
          {selected && (
            <>
              <div className="row">
                <b>命令行</b>
                <span className="mono">{detail?.args || selected.cmd}</span>
              </div>
              <div className="row">
                <b>可执行文件</b>
                <span className="mono">{detail?.exe || '-'}</span>
              </div>
              <div className="row">
                <b>工作目录</b>
                <span className="mono">{detail?.cwd || '-'}</span>
              </div>
              <div className="row env">
                <b>环境变量</b>
                <div className="envlist mono">
                  {detail?.env?.length ? detail.env.join('\n') : '（无权限读取或当前系统不支持）'}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: 'auto', color: '#999', fontSize: 11 }}>
            数据来源：ps · 每 4 秒自动刷新
          </span>
          <button className="btn" onClick={() => setProcTab(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
