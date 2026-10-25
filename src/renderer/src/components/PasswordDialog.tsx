import { useState } from 'react'
import { useApp } from '../state/store'
import type { ConnConfig } from '../types'

export function PasswordDialog({ conn }: { conn: ConnConfig }): JSX.Element {
  const [pwd, setPwd] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')

  const submit = async (): Promise<void> => {
    if (!pwd) {
      setError('请输入密码')
      return
    }
    if (remember) {
      await window.api.conn.save({ id: conn.id, password: pwd })
      await useApp.getState().refreshLinks()
    }
    useApp.getState().setPending(null)
    useApp.getState().addTab(conn, pwd)
  }

  return (
    <div className="modal-mask">
      <div className="modal" style={{ width: 380 }}>
        <div className="modal-head">
          <span>输入密码 · {conn.name || conn.host}</span>
          <button className="x" onClick={() => useApp.getState().setPending(null)}>
            ×
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ color: '#666', marginBottom: 10 }}>
            {conn.user_name}@{conn.host}:{conn.port}
          </div>
          <input
            autoFocus
            type="password"
            value={pwd}
            placeholder="密码"
            onChange={(e) => {
              setPwd(e.target.value)
              setError('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            style={{
              width: '100%',
              height: 26,
              border: '1px solid #c4c4c4',
              padding: '0 6px',
              background: '#fff'
            }}
          />
          {error && <div style={{ color: '#c05a5a', marginTop: 6 }}>{error}</div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, color: '#666' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            记住密码（本机加密保存）
          </label>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={() => void submit()}>
            连接
          </button>
          <button className="btn" onClick={() => useApp.getState().setPending(null)}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
