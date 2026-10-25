import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'

const LABELS: Record<string, string> = {
  OS: '操作系统',
  KERNEL: '内核版本',
  HOST: '主机名',
  CPU: 'CPU 型号',
  CORES: '核心数',
  MEM: '内存',
  ARCH: '架构'
}

export function SysInfoModal({ tabId }: { tabId: string }): JSX.Element {
  const [info, setInfo] = useState<Record<string, string> | null>(null)
  const [error, setError] = useState('')
  const tab = useApp((s) => s.tabs.find((t) => t.id === tabId))

  useEffect(() => {
    let cancelled = false
    window.api.session
      .sysinfo(tabId)
      .then((d: Record<string, string>) => !cancelled && setInfo(d))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [tabId])

  return (
    <div className="modal-mask">
      <div className="modal sysinfo-modal">
        <div className="modal-head">
          <span>系统信息 · {tab?.title}</span>
          <button className="x" onClick={() => useApp.getState().setSysinfoTab(null)}>
            ×
          </button>
        </div>
        <div className="sysinfo-body">
          {error && <div style={{ color: '#c05a5a' }}>{error}</div>}
          {!info && !error && <div style={{ color: '#888' }}>读取中…</div>}
          {info &&
            Object.keys(LABELS).map((k) =>
              info[k] ? (
                <div key={k}>
                  <b>{LABELS[k]}</b>
                  {info[k]}
                </div>
              ) : null
            )}
          {info && !Object.keys(info).length && (
            <div style={{ color: '#888' }}>当前系统不支持 /etc/os-release 等信息</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => useApp.getState().setSysinfoTab(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
