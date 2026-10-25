import { useMemo, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { useT } from '../i18n/useT'
import type { Tab } from '../types'

const BUILTIN = [
  'ls -alh',
  'ls -lh',
  'pwd',
  'cd ..',
  'cd -',
  'df -h',
  'du -sh *',
  'free -m',
  'top',
  'htop',
  'ps aux',
  'ps -ef | grep ',
  'netstat -tunlp',
  'ss -tunlp',
  'ip addr',
  'ifconfig',
  'uname -a',
  'cat /etc/os-release',
  'uptime',
  'who',
  'last',
  'history',
  'tail -f ',
  'tail -n 200 ',
  'less ',
  'vim ',
  'cat ',
  'grep -rn ',
  'find / -name ',
  'chmod +x ',
  'chown -R root:root ',
  'tar -czf ',
  'tar -xzf ',
  'systemctl status ',
  'systemctl restart ',
  'systemctl list-units --type=service',
  'journalctl -u  -f',
  'docker ps -a',
  'docker images',
  'docker logs -f ',
  'docker exec -it  bash',
  'docker compose ps',
  'kubectl get pods -A',
  'kubectl get svc -A',
  'iptables -L -n',
  'ss -s',
  'vmstat 1',
  'iostat -x 1',
  'ping -c 4 ',
  'curl -I ',
  'wget ',
  'reboot',
  'poweroff',
  'exit'
]

export function CommandBar({ tab }: { tab: Tab }): JSX.Element {
  const t = useT()
  const config = useApp((s) => s.config)
  const setConfig = useApp((s) => s.setConfig)
  const openSettings = useApp((s) => s.openSettings)
  const tabs = useApp((s) => s.tabs)
  const broadcast = useApp((s) => s.broadcast)
  const toggleBroadcast = useApp((s) => s.toggleBroadcast)
  const flash = useApp((s) => s.flash)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState(-1)
  const [histIdx, setHistIdx] = useState(-1)

  const suggestions = useMemo(() => {
    const pool = [...config.cmd_history.map((h) => h.text), ...BUILTIN]
    const seen = new Set<string>()
    const key = q.trim().toLowerCase()
    const out: string[] = []
    for (const c of pool) {
      if (seen.has(c)) continue
      seen.add(c)
      if (!key || c.toLowerCase().includes(key)) out.push(c)
      if (out.length >= 12) break
    }
    return out
  }, [q, config.cmd_history])

  const pushHistory = (text: string): void => {
    const hist = [
      { text, type: '', index: 0, active_time: Date.now() },
      ...config.cmd_history.filter((h) => h.text !== text)
    ].slice(0, 300)
    setConfig({ cmd_history: hist })
    setHistIdx(-1)
  }

  const send = (text?: string): void => {
    const cmd = (text ?? q).trim()
    if (!cmd) return
    if (broadcast) {
      const targets = tabs.filter((t) => t.status === 'connected')
      if (!targets.length) {
        flash('没有已连接的会话')
        return
      }
      targets.forEach((t) => void window.api.session.write(t.id, cmd + '\r'))
      pushHistory(cmd)
      flash(`已广播到 ${targets.length} 个会话`)
    } else {
      void window.api.session.write(tab.id, cmd + '\r')
      pushHistory(cmd)
    }
    setQ('')
    setOpen(false)
    setSel(-1)
    setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>('.cmdbar input')
      el?.focus()
    }, 0)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        setSel(0)
      } else setSel((v) => Math.min(suggestions.length - 1, v + 1))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (open && sel >= 0) {
        setSel((v) => Math.max(0, v - 1))
      } else {
        const hist = config.cmd_history
        const next = Math.min(hist.length - 1, histIdx + 1)
        if (next >= 0 && hist[next]) {
          setHistIdx(next)
          setQ(hist[next].text)
        }
      }
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (open && suggestions[sel >= 0 ? sel : 0]) {
        setQ(suggestions[sel >= 0 ? sel : 0])
        setSel(-1)
        setOpen(false)
      }
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (open && sel >= 0 && suggestions[sel]) {
        setQ(suggestions[sel])
        setOpen(false)
        setSel(-1)
        return
      }
      send()
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      setSel(-1)
    }
  }

  return (
    <div className="cmdbar">
      <div className="cinput-wrap">
        <Icon name="terminal" style={{ marginLeft: 6, color: '#7c95a7', fontSize: 11 }} />
        <input
          value={q}
          placeholder={t('cmd.placeholder')}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(e.target.value.trim().length > 0)
            setSel(-1)
          }}
          onFocus={() => q.trim() && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={onKeyDown}
        />
      </div>
      <button
        className={'btn' + (broadcast ? ' on' : '')}
        onClick={toggleBroadcast}
        title="批量发送到所有已连接会话 (Ctrl+Shift+B)"
      >
        <Icon name="tasks" /> {broadcast ? t('cmd.send') + ' ✓' : t('cmd.send')}
      </button>
      <button className="btn" onClick={() => setOpen((v) => !v)} title={t('cmd.history')}>
        {t('cmd.history')}
      </button>
      <button className="btn" onClick={() => openSettings(true)} title="设置">
        {t('cmd.settings')}
      </button>
      <div className="icons">
        <span className="ic" title="加速（未启用）" style={{ opacity: 0.55 }}>
          <Icon name="bolt" />
        </span>
        <span
          className="ic"
          title="复制当前输入"
          onClick={() => q && window.api.clipboard.write(q)}
        >
          <Icon name="clone" />
        </span>
        <span
          className="ic"
          title="快捷命令"
          onClick={() => {
            /* 由底部命令面板承载 */
          }}
        >
          <Icon name="fileLines" />
        </span>
        <span
          className="ic"
          title="搜索终端 (Ctrl+F)"
          onClick={() => window.dispatchEvent(new CustomEvent('hs:search'))}
        >
          <Icon name="search" />
        </span>
        <span className="ic" title="设置" onClick={() => openSettings(true)}>
          <Icon name="gear" />
        </span>
        <span className="ic" title="下载目录" onClick={() => openSettings(true)}>
          <Icon name="download" />
        </span>
        <span className="ic" title="保存" onClick={() => send('')}>
          <Icon name="save" />
        </span>
        <span className="ic" title="弹出窗口（暂未实现）" style={{ opacity: 0.55 }}>
          <Icon name="window" />
        </span>
      </div>

      {open && suggestions.length > 0 && (
        <div className="suggest" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((s, i) => (
            <div
              key={s}
              className={'item' + (i === sel ? ' sel' : '')}
              onMouseEnter={() => setSel(i)}
              onClick={() => {
                setQ(s)
                setOpen(false)
                setSel(-1)
              }}
            >
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
