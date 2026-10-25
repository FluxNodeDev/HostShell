import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { useT } from '../i18n/useT'

export function StatusBar(): JSX.Element {
  const tabs = useApp((s) => s.tabs)
  const config = useApp((s) => s.config)
  const t = useT()
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const connected = tabs.filter((tab) => tab.status === 'connected').length

  return (
    <div className="statusbar">
      <div className="left">
        <span className="link">{t('status.opensource')}</span>
        <span>HostShell 0.17.2</span>
        <span>{t('status.workbench')}</span>
      </div>
      <div className="right">
        <span>
          {t('status.theme')} {config.theme_name}
        </span>
        <span>
          {t('status.sessions')} {connected}/{tabs.length}
        </span>
        <span>{now.toLocaleTimeString('zh-CN', { hour12: false })}</span>
      </div>
    </div>
  )
}
