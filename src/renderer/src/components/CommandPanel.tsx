import { useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { PromptDialog } from './PromptDialog'
import { DEFAULT_GROUPS, applyInput, newId, resolveTemplate } from '../lib/quickCommands'
import type { QuickCmd, QuickGroup, Tab } from '../types'

function AddCmdDialog({
  group,
  onSave,
  onCancel
}: {
  group: string
  onSave: (name: string, cmd: string) => void
  onCancel: () => void
}): JSX.Element {
  const [name, setName] = useState('')
  const [cmd, setCmd] = useState('')
  return (
    <div className="modal-mask" style={{ zIndex: 220 }}>
      <div className="modal" style={{ width: 480 }}>
        <div className="modal-head">
          <span>添加快捷命令 · {group}</span>
          <button className="x" onClick={onCancel}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ color: '#666', marginBottom: 6 }}>名称</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：查看 Nginx 日志"
            style={{ width: '100%', height: 26, border: '1px solid #c4c4c4', background: '#fff', padding: '0 6px' }}
          />
          <div style={{ color: '#666', margin: '12px 0 6px' }}>命令</div>
          <textarea
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="tail -f /var/log/nginx/access.log"
            style={{
              width: '100%',
              height: 70,
              border: '1px solid #c4c4c4',
              background: '#fff',
              padding: '6px',
              fontFamily: 'Consolas, monospace',
              resize: 'none'
            }}
          />
          <div style={{ color: '#999', fontSize: 11, marginTop: 8, lineHeight: 1.8 }}>
            支持变量：<code>{'{host}'}</code> 主机、<code>{'{user}'}</code> 用户、<code>{'{path}'}</code>{' '}
            当前目录、<code>{'{input:提示}'}</code> 运行时输入。
          </div>
        </div>
        <div className="modal-foot">
          <button
            className="btn primary"
            disabled={!name.trim() || !cmd.trim()}
            onClick={() => onSave(name.trim(), cmd.trim())}
          >
            添加
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

export function CommandPanel({ tab }: { tab: Tab }): JSX.Element {
  const config = useApp((s) => s.config)
  const setConfig = useApp((s) => s.setConfig)
  const cwd = useApp((s) => s.cwd[tab.id])
  const connections = useApp((s) => s.connections)

  const groups: QuickGroup[] = config.cmd_groups?.length ? config.cmd_groups : DEFAULT_GROUPS
  const [gid, setGid] = useState<string>(groups[0]?.id ?? 'sys')
  const [addOpen, setAddOpen] = useState(false)
  const [newGroupOpen, setNewGroupOpen] = useState(false)
  const [pending, setPending] = useState<{ text: string; prompt: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; item: QuickCmd } | null>(null)

  const active = groups.find((g) => g.id === gid) || groups[0]
  const conn = connections.find((c) => c.id === tab.connId)
  const ctx = { host: tab.host, user: conn?.user_name || 'root', path: cwd || '/' }

  const persist = (next: QuickGroup[], select?: string): void => {
    setConfig({ cmd_groups: next })
    if (select) setGid(select)
  }

  const send = (text: string): void => {
    void window.api.session.write(tab.id, text + '\r')
    const hist = [
      { text, type: '', index: 0, active_time: Date.now() },
      ...config.cmd_history.filter((h) => h.text !== text)
    ].slice(0, 300)
    setConfig({ cmd_history: hist })
  }

  const runItem = (item: QuickCmd): void => {
    const { text, prompt } = resolveTemplate(item.cmd, ctx)
    if (prompt) setPending({ text, prompt })
    else send(text)
  }

  const addCommand = (name: string, cmd: string): void => {
    if (!active) return
    const item: QuickCmd = { id: newId(), name, cmd }
    const next = groups.map((g) => (g.id === active.id ? { ...g, items: [...g.items, item] } : g))
    persist(next, active.id)
    setAddOpen(false)
  }

  const addGroup = (name: string): void => {
    const g: QuickGroup = { id: newId(), name, items: [] }
    persist([...groups, g], g.id)
    setNewGroupOpen(false)
  }

  const deleteItem = (item: QuickCmd): void => {
    const next = groups.map((g) =>
      g.id === active.id ? { ...g, items: g.items.filter((i) => i.id !== item.id) } : g
    )
    persist(next, active.id)
  }

  const menuItems: MenuItem[] = menu
    ? [
        { label: '执行', icon: 'play', onClick: () => runItem(menu.item) },
        { label: '复制命令', icon: 'copy', onClick: () => window.api.clipboard.write(menu.item.cmd) },
        { sep: true },
        {
          label: '删除',
          icon: 'trash',
          danger: true,
          onClick: () => deleteItem(menu.item)
        }
      ]
    : []

  return (
    <div className="qcmd">
      <div className="qcmd-groups">
        <div className="qcmd-gh">
          <span>分组</span>
          <button title="新建分组" onClick={() => setNewGroupOpen(true)}>
            <Icon name="plus" />
          </button>
        </div>
        {groups.map((g) => (
          <div
            key={g.id}
            className={'qcmd-group' + (active?.id === g.id ? ' active' : '')}
            onClick={() => setGid(g.id)}
          >
            <span className="nm">{g.name}</span>
            <span className="cnt">{g.items.length}</span>
          </div>
        ))}
      </div>
      <div className="qcmd-main">
        <div className="qcmd-toolbar">
          <span className="title">{active?.name}</span>
          <span className="tip">点击执行 · 右键更多</span>
          <button className="btn" onClick={() => setAddOpen(true)}>
            <Icon name="plus" /> 添加命令
          </button>
        </div>
        <div className="qcmd-grid">
          {active?.items.map((it) => (
            <div
              key={it.id}
              className="qcmd-item"
              title={it.cmd}
              onClick={() => runItem(it)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, item: it })
              }}
            >
              <div className="n">{it.name}</div>
              <div className="c">{it.cmd}</div>
            </div>
          ))}
          {!active?.items.length && (
            <div className="empty" style={{ gridColumn: '1 / -1' }}>
              该分组暂无命令，点击「添加命令」创建
            </div>
          )}
        </div>
      </div>
      {addOpen && active && (
        <AddCmdDialog
          group={active.name}
          onSave={addCommand}
          onCancel={() => setAddOpen(false)}
        />
      )}
      {newGroupOpen && (
        <PromptDialog
          title="新建分组"
          label="分组名称"
          onOk={(v) => v.trim() && addGroup(v.trim())}
          onCancel={() => setNewGroupOpen(false)}
        />
      )}
      {pending && (
        <PromptDialog
          title="输入参数"
          label={pending.prompt}
          onOk={(v) => {
            const p = pending
            setPending(null)
            if (p) send(applyInput(p.text, v))
          }}
          onCancel={() => setPending(null)}
        />
      )}
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}
