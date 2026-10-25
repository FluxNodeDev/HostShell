import { useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { useT } from '../i18n/useT'
import { ContextMenu, type MenuItem } from './ContextMenu'
import type { Tab } from '../types'

export function TabBar(): JSX.Element {
  const t = useT()
  const tabs = useApp((s) => s.tabs)
  const activeId = useApp((s) => s.activeId)
  const setActive = useApp((s) => s.setActive)
  const closeTab = useApp((s) => s.closeTab)
  const openManager = useApp((s) => s.openManager)
  const setInspectTab = useApp((s) => s.setInspectTab)
  const setForwardTab = useApp((s) => s.setForwardTab)
  const splitId = useApp((s) => s.splitId)
  const setProbeTab = useApp((s) => s.setProbeTab)

  const toggleSplit = (): void => {
    const st = useApp.getState()
    if (st.splitId) {
      st.setSplit(null)
      return
    }
    const other = st.tabs.find((t) => t.id !== st.activeId && t.status === 'connected')
    if (!other) {
      st.flash('需要至少两个已连接的标签才能分屏')
      return
    }
    st.setSplit(other.id)
  }
  const moveTab = useApp((s) => s.moveTab)
  const addTab = useApp((s) => s.addTab)
  const connections = useApp((s) => s.connections)
  const passwords = useApp((s) => s.passwords)
  const flash = useApp((s) => s.flash)

  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; tab: Tab } | null>(null)

  const duplicate = (t: Tab): void => {
    const conn = connections.find((c) => c.id === t.connId)
    if (!conn) {
      flash('连接配置不存在')
      return
    }
    addTab(conn, passwords[conn.id])
  }

  const reconnect = (t: Tab): void => {
    const conn = connections.find((c) => c.id === t.connId)
    closeTab(t.id)
    if (!conn) {
      flash('连接配置不存在')
      return
    }
    setTimeout(() => addTab(conn, passwords[conn.id]), 150)
  }

  const closeOthers = (keep: Tab): void => {
    tabs.filter((x) => x.id !== keep.id).forEach((x) => closeTab(x.id))
  }

  const closeAll = (): void => {
    tabs.forEach((x) => closeTab(x.id))
  }

  const menuItems: MenuItem[] = menu
    ? [
        { label: '复制标签', icon: 'clone', onClick: () => duplicate(menu.tab) },
        { label: '重新连接', icon: 'refresh', onClick: () => reconnect(menu.tab) },
        { sep: true },
        { label: '关闭', icon: 'x', onClick: () => closeTab(menu.tab.id) },
        { label: '关闭其他', icon: 'window', onClick: () => closeOthers(menu.tab) },
        { label: '全部关闭', icon: 'trash', danger: true, onClick: closeAll }
      ]
    : []

  return (
    <div className="tabbar">
      <div className="tools">
        <button title={t('conn.title')} onClick={() => openManager(true)}>
          <Icon name="layout" />
        </button>
      </div>
      <div className="tabs">
        {tabs.map((t, i) => (
          <div
            key={t.id}
            draggable
            className={
              'tab' +
              (t.id === activeId ? ' active' : '') +
              (dragId === t.id ? ' dragging' : '') +
              (overId === t.id ? ' drop-target' : '')
            }
            onMouseDown={() => setActive(t.id)}
            onAuxClick={(e) => {
              if (e.button === 1) closeTab(t.id)
            }}
            onContextMenu={(e) => {
              e.preventDefault()
              setActive(t.id)
              setMenu({ x: e.clientX, y: e.clientY, tab: t })
            }}
            onDragStart={(e) => {
              setDragId(t.id)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', t.id)
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === t.id) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setOverId(t.id)
            }}
            onDragLeave={() => setOverId((v) => (v === t.id ? null : v))}
            onDrop={(e) => {
              e.preventDefault()
              const from = e.dataTransfer.getData('text/plain') || dragId
              if (from && from !== t.id) moveTab(from, t.id)
              setDragId(null)
              setOverId(null)
            }}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
            title={t.title}
          >
            <span className="idx">{i + 1}</span>
            <span className={'status ' + t.status} />
            <span className="title">{t.title}</span>
            <span
              className="x"
              onMouseDown={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
            >
              ×
            </span>
          </div>
        ))}
        <div className="tab-add" title={t('conn.new')} onClick={() => openManager(true)}>
          <Icon name="plus" />
        </div>
      </div>
      <div className="tools right">
        <button
          title={t('tab.probe')}
          disabled={!activeId}
          onClick={() => activeId && setProbeTab(activeId)}
        >
          <Icon name="globe" />
        </button>
        <button
          title={splitId ? t('tab.unsplit') : t('tab.split')}
          disabled={!activeId}
          className={splitId ? 'on' : ''}
          onClick={toggleSplit}
        >
          <Icon name="columns" />
        </button>
        <button
          title={t('tab.forward')}
          disabled={!activeId}
          onClick={() => activeId && setForwardTab(activeId)}
        >
          <Icon name="link" />
        </button>
        <button
          title={t('tab.inspect')}
          disabled={!activeId}
          onClick={() => activeId && setInspectTab(activeId)}
        >
          <Icon name="route" />
        </button>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  )
}
