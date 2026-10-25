import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import type { ForwardRule } from '../types'

export function PortForward({ tabId }: { tabId: string }): JSX.Element {
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId))
  const connections = useApp((s) => s.connections)
  const refreshLinks = useApp((s) => s.refreshLinks)
  const setForwardTab = useApp((s) => s.setForwardTab)

  const conn = connections.find((c) => c.id === tab?.connId)
  const [rules, setRules] = useState<ForwardRule[]>(
    () => (conn?.port_forwarding_list as ForwardRule[]) || []
  )
  const [running, setRunning] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ local: '8080', host: '127.0.0.1', port: '80' })

  useEffect(() => {
    window.api.forward
      .list(tabId)
      .then((ids: string[]) => setRunning(ids))
      .catch(() => undefined)
  }, [tabId])

  const persist = async (next: ForwardRule[]): Promise<void> => {
    setRules(next)
    if (!conn) return
    await window.api.conn.save({ id: conn.id, port_forwarding_list: next })
    await refreshLinks()
  }

  const add = async (): Promise<void> => {
    const lp = Number(form.local)
    const rp = Number(form.port)
    const host = form.host.trim()
    if (!lp || lp < 1 || lp > 65535 || !host || !rp || rp < 1 || rp > 65535) {
      setErr('请填写合法的本地端口和目标地址')
      return
    }
    if (rules.some((r) => r.local_port === lp)) {
      setErr(`本地端口 ${lp} 已被其它规则占用`)
      return
    }
    const rule: ForwardRule = {
      id: Math.random().toString(36).slice(2, 10),
      type: 'local',
      local_port: lp,
      remote_host: host,
      remote_port: rp
    }
    await persist([...rules, rule])
    setErr('')
  }

  const toggle = async (r: ForwardRule): Promise<void> => {
    try {
      if (running.includes(r.id)) {
        await window.api.forward.stop(tabId, r.id)
        setRunning((v) => v.filter((x) => x !== r.id))
      } else {
        await window.api.forward.start(tabId, r)
        setRunning((v) => [...v, r.id])
      }
      setErr('')
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const remove = async (r: ForwardRule): Promise<void> => {
    if (running.includes(r.id)) {
      await window.api.forward.stop(tabId, r.id).catch(() => undefined)
      setRunning((v) => v.filter((x) => x !== r.id))
    }
    await persist(rules.filter((x) => x.id !== r.id))
  }

  return (
    <div className="modal-mask">
      <div className="modal forward-modal">
        <div className="modal-head">
          <span>SSH 端口转发 · {tab?.title}</span>
          <button className="x" onClick={() => setForwardTab(null)}>
            ×
          </button>
        </div>
        <div className="forward-tip">
          本地监听 <code>127.0.0.1:&lt;本地端口&gt;</code>，流量经 SSH 通道转发到远端{' '}
          <code>目标地址</code>。规则随连接配置一起保存。
        </div>
        {err && <div className="proc-err">{err}</div>}
        <div className="forward-body">
          <table className="forward-table">
            <colgroup>
              <col style={{ width: 150 }} />
              <col />
              <col style={{ width: 96 }} />
              <col style={{ width: 150 }} />
            </colgroup>
            <thead>
              <tr>
                <th>本地地址</th>
                <th>目标地址</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const on = running.includes(r.id)
                return (
                  <tr key={r.id}>
                    <td className="mono">127.0.0.1:{r.local_port}</td>
                    <td className="mono">
                      {r.remote_host}:{r.remote_port}
                    </td>
                    <td>
                      <span className={'fwd-badge' + (on ? ' on' : '')}>{on ? '运行中' : '已停止'}</span>
                    </td>
                    <td>
                      <button className="linkbtn" onClick={() => void toggle(r)}>
                        {on ? '停止' : '启动'}
                      </button>
                      <button className="linkbtn danger" onClick={() => void remove(r)}>
                        删除
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!rules.length && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#999', padding: 22 }}>
                    还没有转发规则，在下方添加一条
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="forward-add">
          <span>本地端口</span>
          <input
            value={form.local}
            onChange={(e) => setForm({ ...form, local: e.target.value })}
            style={{ width: 80 }}
          />
          <span>→ 目标</span>
          <input
            value={form.host}
            onChange={(e) => setForm({ ...form, host: e.target.value })}
            style={{ width: 150 }}
            placeholder="127.0.0.1"
          />
          <span>:</span>
          <input
            value={form.port}
            onChange={(e) => setForm({ ...form, port: e.target.value })}
            style={{ width: 70 }}
          />
          <button className="btn primary" onClick={() => void add()}>
            <Icon name="plus" /> 添加
          </button>
        </div>
        <div className="modal-foot">
          <span style={{ marginRight: 'auto', color: '#999', fontSize: 11 }}>
            共 {rules.length} 条规则 · {running.length} 条运行中
          </span>
          <button className="btn" onClick={() => setForwardTab(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
