import { useEffect, useRef } from 'react'
import { useApp } from './state/store'
import { writeHub } from './lib/termHubs'
import { Sidebar } from './components/Sidebar'
import { TabBar } from './components/TabBar'
import { TerminalView } from './components/TerminalView'
import { CommandBar } from './components/CommandBar'
import { BottomPanel } from './components/BottomPanel'
import { StatusBar } from './components/StatusBar'
import { ConnectionManager } from './components/ConnectionManager'
import { SettingsModal } from './components/SettingsModal'
import { PasswordDialog } from './components/PasswordDialog'
import { SysInfoModal } from './components/SysInfoModal'
import { EditorModal } from './components/EditorModal'
import { ProcessManager } from './components/ProcessManager'
import { HostInspector } from './components/HostInspector'
import { PackProgress } from './components/PackProgress'
import { PortForward } from './components/PortForward'
import { ProbeModal } from './components/ProbeModal'
import { Icon } from './components/Icon'
import { useT } from './i18n/useT'

export default function App(): JSX.Element {
  const t = useT()
  const ready = useApp((s) => s.ready)
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const managerOpen = useApp((s) => s.managerOpen)
  const settingsOpen = useApp((s) => s.settingsOpen)
  const editor = useApp((s) => s.editor)
  const sysinfoTab = useApp((s) => s.sysinfoTab)
  const procTab = useApp((s) => s.procTab)
  const inspectTab = useApp((s) => s.inspectTab)
  const forwardTab = useApp((s) => s.forwardTab)
  const probeTab = useApp((s) => s.probeTab)
  const pendingConn = useApp((s) => s.pendingConn)
  const toast = useApp((s) => s.toast)
  const splitId = useApp((s) => s.splitId)
  const splitRatio = useApp((s) => s.splitRatio)
  const sidebarOpen = useApp((s) => s.sidebarOpen)
  const bottomView = useApp((s) => s.bottomView)
  const stackRef = useRef<HTMLDivElement>(null)

  const startSplitDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const el = stackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const move = (ev: MouseEvent): void => {
      useApp.getState().setSplitRatio((ev.clientX - rect.left) / rect.width)
    }
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
      document.body.classList.remove('col-resizing')
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    document.body.classList.add('col-resizing')
  }

  useEffect(() => {
    void useApp.getState().init()
    // 托盘菜单：连接管理器 / 配置变更
    window.api.appCtl.onOpenManager(() => useApp.getState().openManager(true))
    window.api.appCtl.onConfigChanged(() => {
      void useApp.getState().init()
    })
    // Zmodem 传输提示
    window.api.sessionEvents.onZmodem((p) => {
      const st = useApp.getState()
      if (p.phase === 'start') st.flash('检测到 Zmodem 传输，正在接收…', 3000)
      else if (p.phase === 'send-start') st.flash('远端 rz 已就绪，正在发送文件…', 3000)
      else if (p.phase === 'sent') {
        const n = p.size || 0
        const size = n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
        st.flash(`已发送 ${p.name}（${size}）到远端`, 5000)
      }
      else if (p.phase === 'done') {
        const n = p.size || 0
        const size = n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`
        st.flash(`已接收 ${p.name}（${size}）→ ${p.path}`, 5000)
      }
      else if (p.phase === 'error') st.flash(`Zmodem 接收失败：${p.message}`, 5000)
    })
  }, [])

  useEffect(() => {
    const offs = [
      window.api.session.onData(({ sessionId, data }: any) => writeHub(sessionId, data)),
      window.api.session.onClosed(({ sessionId }: any) => {
        writeHub(sessionId, '\r\n\x1b[33m[连接已断开]\x1b[0m\r\n')
        useApp.getState().setTabStatus(sessionId, 'closed')
      }),
      window.api.session.onError(({ sessionId, message }: any) => {
        useApp.getState().setTabStatus(sessionId, 'error', message)
      }),
      window.api.monitor.onMetrics(({ sessionId, metrics }: any) => {
        useApp.getState().setMetrics(sessionId, metrics)
      }),
      window.api.ping.onSample(({ sessionId, sample, stats }: any) => {
        useApp.getState().pushPing(sessionId, sample, stats)
      }),
      window.api.sftp.onProgress(({ percent }: any) => {
        const st = useApp.getState()
        if (st.pack) st.setPack({ ...st.pack, percent })
      })
    ]
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        useApp.getState().openManager(true)
      }
      if (e.ctrlKey && e.key === ',') {
        e.preventDefault()
        useApp.getState().openSettings(true)
      }
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        useApp.getState().toggleBroadcast()
      }
      if (e.key === 'F9') {
        const st = useApp.getState()
        if (st.activeId) {
          e.preventDefault()
          st.setProcTab(st.activeId)
        }
      }
      if (e.key === 'F8') {
        const st = useApp.getState()
        if (st.activeId) {
          e.preventDefault()
          st.setInspectTab(st.activeId)
        }
      }
      if (e.key === 'F5') {
        const st = useApp.getState()
        if (st.activeId) {
          e.preventDefault()
          void window.api.monitor.stop(st.activeId).then(() => window.api.monitor.start(st.activeId, 2000))
        }
      }
    }
    // 捕获阶段：xterm 会对已处理的按键 stopPropagation，冒泡阶段收不到
    window.addEventListener('keydown', onKey, true)
    return () => {
      offs.forEach((f) => f())
      window.removeEventListener('keydown', onKey, true)
    }
  }, [])

  const activeTab = tabs.find((t) => t.id === activeId)

  return (
    <div className="app">
      <div className="body">
        <nav className="rail">
          <div className="rail-brand" title="HostShell">
            <Icon name="terminal" />
          </div>
          <button
            className="rail-btn"
            title={t('rail.connections')}
            onClick={() => useApp.getState().openManager(true)}
          >
            <Icon name="server" />
          </button>
          <button
            className={'rail-btn' + (sidebarOpen ? ' on' : '')}
            title={t('rail.monitor')}
            disabled={!activeTab}
            onClick={() => useApp.getState().toggleSidebar()}
          >
            <Icon name="gauge" />
          </button>
          <button
            className={'rail-btn' + (bottomView === 'file' ? ' on' : '')}
            title={t('rail.files')}
            disabled={!activeTab}
            onClick={() => useApp.getState().setBottomView('file')}
          >
            <Icon name="folder" />
          </button>
          <button
            className={'rail-btn' + (bottomView === 'cmd' ? ' on' : '')}
            title={t('rail.commands')}
            disabled={!activeTab}
            onClick={() => useApp.getState().setBottomView('cmd')}
          >
            <Icon name="terminal" />
          </button>
          <div className="rail-spacer" />
          <button
            className="rail-btn"
            title={t('rail.settings')}
            onClick={() => useApp.getState().openSettings(true)}
          >
            <Icon name="gear" />
          </button>
        </nav>
        {activeTab && sidebarOpen && <Sidebar tab={activeTab} />}
        <div className="main">
          <TabBar />
          {activeTab ? (
            <>
              <div className="workspace">
                <div className="terminal-stack" ref={stackRef}>
                  {tabs.map((t) => {
                    const isLeft = t.id === activeId
                    const isRight = !!splitId && t.id === splitId && !isLeft
                    const side = splitId ? (isLeft ? 'left' : isRight ? 'right' : null) : null
                    return (
                      <TerminalView
                        key={t.id}
                        tab={t}
                        active={isLeft}
                        visible={isLeft || isRight}
                        side={side}
                        ratio={splitRatio}
                        onFocus={() => useApp.getState().setActive(t.id)}
                      />
                    )
                  })}
                  {splitId && (
                    <div
                      className="split-divider"
                      style={{ left: `calc(${splitRatio * 100}% - 3px)` }}
                      onMouseDown={startSplitDrag}
                    />
                  )}
                </div>
                <CommandBar tab={activeTab} />
              </div>
              <BottomPanel tab={activeTab} />
            </>
          ) : (
            <div className="welcome">
              <div className="card">
                <div className="logo">
                  <Icon name="terminal" size={38} />
                </div>
                <h2>HostShell</h2>
                <p>{t('app.tagline')}</p>
                <div className="row">
                  <button className="btn primary" onClick={() => useApp.getState().openManager(true)}>
                    {t('welcome.manager')}
                  </button>
                  <button
                    className="btn"
                    onClick={async () => {
                      const r = await window.api.conn.importConnections()
                      await useApp.getState().refreshLinks()
                      useApp.getState().openManager(true)
                      if (r.imported === 0) alert(t('welcome.importEmpty'))
                    }}
                  >
                    {t('welcome.import')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      <StatusBar />
      {managerOpen && <ConnectionManager />}
      {settingsOpen && <SettingsModal />}
      {pendingConn && <PasswordDialog conn={pendingConn} />}
      {sysinfoTab && <SysInfoModal tabId={sysinfoTab} />}
      {procTab && <ProcessManager tabId={procTab} />}
      {inspectTab && <HostInspector tabId={inspectTab} />}
      {forwardTab && <PortForward tabId={forwardTab} />}
      {probeTab && <ProbeModal tabId={probeTab} />}
      <PackProgress />
      {toast && <div className="toast">{toast}</div>}
      {editor && <EditorModal />}
      {!ready && <div className="modal-mask" />}
    </div>
  )
}
