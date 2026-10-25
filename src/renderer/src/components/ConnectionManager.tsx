import { useEffect, useMemo, useState } from 'react'
import { requestOpen, useApp } from '../state/store'
import { Icon } from './Icon'
import type { ConnConfig } from '../types'

interface TNode extends ConnConfig {
  children: TNode[]
}

function buildTree(list: ConnConfig[]): TNode[] {
  const map = new Map<string, TNode>()
  for (const c of list) map.set(c.id, { ...c, children: [] })
  const roots: TNode[] = []
  for (const n of map.values()) {
    const parent = map.get(n.parent_id)
    if (parent && parent.id !== n.id) parent.children.push(n)
    else roots.push(n)
  }
  const sortRec = (arr: TNode[]): void => {
    arr.sort((a, b) => Number(!!b.is_group) - Number(!!a.is_group) || a.order - b.order || a.name.localeCompare(b.name, 'zh-CN'))
    arr.forEach((a) => sortRec(a.children))
  }
  sortRec(roots)
  return roots
}

function draft(parentId: string, isGroup: boolean): ConnConfig {
  const t = Date.now()
  return {
    id: crypto.randomUUID(),
    name: isGroup ? '新建分组' : '新建连接',
    host: '',
    port: 22,
    user_name: 'root',
    password: '',
    authentication_type: 1,
    secret_key_id: '',
    conection_type: 100,
    parent_id: parentId,
    description: '',
    proxy_id: '0',
    accelerate: false,
    terminal_encoding: 'UTF-8',
    backspace_key_sequence: 2,
    exec_channel_enable: true,
    port_forwarding_list: [],
    remote_port_forwarding: {},
    forwarding_auto_reconnect: false,
    custom_size: false,
    width: 0,
    height: 0,
    fullscreen: false,
    drivestoredirect: true,
    order: 0,
    create_time: t,
    modified_time: t,
    access_time: 0,
    delete_time: 0,
    delete_key_sequence: 0,
    sort_time: 0,
    rename_time: 0,
    parent_update_time: 0,
    is_group: isGroup
  }
}

export function ConnectionManager(): JSX.Element {
  const connections = useApp((s) => s.connections)
  const appConfig = useApp((s) => s.config)
  const refreshLinks = useApp((s) => s.refreshLinks)
  const openManager = useApp((s) => s.openManager)

  const [selected, setSelected] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [editing, setEditing] = useState<ConnConfig | null>(null)
  const [pwdChanged, setPwdChanged] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [dragNode, setDragNode] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const tree = useMemo(() => buildTree(connections), [connections])

  /** 当前展开状态下可见节点的顺序（用于 Shift 区间选择） */
  const flatIds = useMemo(() => {
    const out: string[] = []
    const walk = (nodes: TNode[]): void => {
      for (const n of nodes) {
        out.push(n.id)
        if (expanded[n.id] !== false) walk(n.children)
      }
    }
    walk(tree)
    return out
  }, [tree, expanded])

  useEffect(() => {
    if (selected) return
    const first = connections.find((c) => !c.is_group)
    if (first) setSelected(first.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections])

  useEffect(() => {
    if (!selected) return
    const c = connections.find((x) => x.id === selected)
    if (c) {
      setEditing({ ...c })
      setPwdChanged(false)
    }
  }, [selected, connections])

  const save = async (thenConnect = false): Promise<void> => {
    if (!editing) return
    if (!editing.is_group && !editing.host.trim()) {
      setMessage('请填写主机地址')
      return
    }
    setBusy(true)
    try {
      const payload: Partial<ConnConfig> = { ...editing }
      if (!pwdChanged) delete (payload as Record<string, unknown>).password
      const saved = (await window.api.conn.save(payload)) as ConnConfig
      await refreshLinks()
      setSelected(saved.id)
      setMessage('已保存')
      setTimeout(() => setMessage(''), 1500)
      if (thenConnect) {
        openManager(false)
        requestOpen(saved)
      }
    } catch (e) {
      setMessage((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!editing) return
    if (!confirm(`确定删除「${editing.name}」${editing.is_group ? '（包含其下所有连接）' : ''}？`)) return
    await window.api.conn.remove(editing.id)
    await refreshLinks()
    setSelected(null)
    setEditing(null)
  }

  const importFinal = async (): Promise<void> => {
    const r = await window.api.conn.importConnections()
    await refreshLinks()
    setMessage(r.imported ? `已导入 ${r.imported} 个连接` : '未导入任何连接')
    setTimeout(() => setMessage(''), 3000)
  }

  /** candidate 是否是 ancestor 的子孙（或它本身） */
  const isDescendant = (candidate: string, ancestor: string): boolean => {
    let cur: string | undefined = candidate
    const guard = new Set<string>()
    while (cur) {
      if (cur === ancestor) return true
      if (guard.has(cur)) return false
      guard.add(cur)
      cur = connections.find((c) => c.id === cur)?.parent_id
    }
    return false
  }

  const moveNode = async (id: string, targetParent: string): Promise<void> => {
    const node = connections.find((c) => c.id === id)
    if (!node) return
    if (node.parent_id === targetParent) return
    if (targetParent !== 'root' && isDescendant(targetParent, id)) {
      setMessage('不能移动到自己的子分组')
      setTimeout(() => setMessage(''), 2000)
      return
    }
    try {
      await window.api.conn.save({
        id,
        parent_id: targetParent,
        parent_update_time: Date.now()
      })
      await refreshLinks()
      if (targetParent !== 'root') setExpanded((s) => ({ ...s, [targetParent]: true }))
      setMessage(targetParent === 'root' ? '已移动到根目录' : '已移动到分组')
      setTimeout(() => setMessage(''), 1500)
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const handleDrop = (e: React.DragEvent, targetParent: string): void => {
    e.preventDefault()
    e.stopPropagation()
    const id = e.dataTransfer.getData('text/hs-node') || dragNode
    setDragNode(null)
    setDropTarget(null)
    if (id) void moveNode(id, targetParent)
  }

  const pickNode = (n: TNode, e: React.MouseEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) =>
        prev.includes(n.id) ? prev.filter((x) => x !== n.id) : [...prev, n.id]
      )
      setSelected(n.id)
      return
    }
    if (e.shiftKey && selected) {
      const a = flatIds.indexOf(selected)
      const b = flatIds.indexOf(n.id)
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a]
        setSelectedIds(flatIds.slice(lo, hi + 1))
        setSelected(n.id)
        return
      }
    }
    setSelectedIds([n.id])
    setSelected(n.id)
  }

  const batchOpen = (): void => {
    const targets = selectedIds
      .map((id) => connections.find((c) => c.id === id))
      .filter((c): c is ConnConfig => !!c && !c.is_group)
    if (!targets.length) {
      setMessage('请选择要打开的连接')
      setTimeout(() => setMessage(''), 2000)
      return
    }
    openManager(false)
    targets.forEach((c) => requestOpen(c))
  }

  const batchRemove = async (): Promise<void> => {
    const targets = selectedIds
      .map((id) => connections.find((c) => c.id === id))
      .filter((c): c is ConnConfig => !!c && !c.is_group)
    if (!targets.length) return
    if (!confirm(`确定删除选中的 ${targets.length} 个连接？`)) return
    for (const c of targets) await window.api.conn.remove(c.id)
    await refreshLinks()
    setSelectedIds([])
    setSelected(null)
    setEditing(null)
  }

  const renderNode = (n: TNode, depth: number): JSX.Element => {
    const isOpen = expanded[n.id] !== false
    return (
      <div key={n.id}>
        <div
          className={
            'ctnode' +
            (selectedIds.includes(n.id) ? ' sel' : '') +
            (dropTarget === n.id ? ' drop-target' : '')
          }
          style={{ paddingLeft: 4 + depth * 14 }}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/hs-node', n.id)
            setDragNode(n.id)
          }}
          onDragEnd={() => {
            setDragNode(null)
            setDropTarget(null)
          }}
          onDragOver={(e) => {
            if (!dragNode || dragNode === n.id) return
            const parent = n.is_group ? n.id : n.parent_id
            if (isDescendant(parent, dragNode)) return
            e.preventDefault()
            e.stopPropagation()
            e.dataTransfer.dropEffect = 'move'
            setDropTarget(n.id)
          }}
          onDragLeave={() => setDropTarget((v) => (v === n.id ? null : v))}
          onDrop={(e) => handleDrop(e, n.is_group ? n.id : n.parent_id)}
          onClick={(e) => pickNode(n, e)}
          onDoubleClick={() => !n.is_group && save(true)}
        >
          <span
            className="tw"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((s) => ({ ...s, [n.id]: !isOpen }))
            }}
          >
            {n.children.length ? (isOpen ? '▾' : '▸') : ''}
          </span>
          <span className="ico">
            <Icon
              name={
                n.is_group
                  ? isOpen
                    ? 'folderOpen'
                    : 'folder'
                  : n.conection_type === 200
                    ? 'window'
                    : 'server'
              }
              style={{
                color: n.is_group ? '#e2b13c' : n.conection_type === 200 ? '#7b6fb0' : '#5b8fbe'
              }}
            />
          </span>
          <span className="nm">{n.name || '(未命名)'}</span>
        </div>
        {isOpen && n.children.map((c) => renderNode(c, depth + 1))}
      </div>
    )
  }

  const isGroup = !!editing?.is_group
  const isRdp = editing?.conection_type === 200

  return (
    <div className="modal-mask">
      <div className="modal conn-modal">
        <div className="modal-head">
          <span>连接管理器</span>
          <button className="x" onClick={() => openManager(false)}>
            ×
          </button>
        </div>
        <div className="conn-toolbar">
          <button
            className="tbtn"
            onClick={() => {
              const parent = editing?.is_group ? editing.id : 'root'
              setEditing(draft(parent, false))
              setSelected(null)
              setSelectedIds([])
              setPwdChanged(false)
            }}
          >
            <Icon name="plus" /> 新建连接
          </button>
          <button
            className="tbtn"
            onClick={() => {
              setEditing(draft('root', true))
              setSelected(null)
              setSelectedIds([])
              setPwdChanged(false)
            }}
          >
            <Icon name="folder" /> 新建分组
          </button>
          <button className="tbtn" onClick={() => void importFinal()}>
            <Icon name="download" /> 从文件导入
          </button>
          <button className="tbtn" disabled={!editing} onClick={() => void remove()}>
            <Icon name="trash" /> 删除
          </button>
          <div className="tbsep" />
          <button className="tbtn" disabled={!selectedIds.length} onClick={batchOpen}>
            <Icon name="play" /> 打开选中{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </button>
          <button
            className="tbtn"
            disabled={!selectedIds.length}
            onClick={() => void batchRemove()}
          >
            <Icon name="trash" /> 删除选中
          </button>
          <button className="tbtn" disabled={!flatIds.length} onClick={() => setSelectedIds(flatIds)}>
            全选
          </button>
          <div style={{ marginLeft: 'auto', color: '#999', paddingRight: 8 }}>{message}</div>
        </div>
        <div className="conn-body">
          <div
            className={'conn-tree' + (dropTarget === 'root' ? ' drop-root' : '')}
            onDragOver={(e) => {
              if (!dragNode) return
              if (e.target !== e.currentTarget) return
              e.preventDefault()
              setDropTarget('root')
            }}
            onDragLeave={(e) => {
              if (e.target !== e.currentTarget) return
              setDropTarget((v) => (v === 'root' ? null : v))
            }}
            onDrop={(e) => handleDrop(e, 'root')}
          >
            {tree.length === 0 && (
              <div style={{ padding: 12, color: '#999' }}>还没有连接，点击「新建连接」开始</div>
            )}
            {tree.map((n) => renderNode(n, 0))}
          </div>
          <div className="conn-form">
            {!editing ? (
              <div style={{ color: '#999', paddingTop: 20 }}>请选择左侧连接，或新建一个</div>
            ) : (
              <>
                <div className="form-grid">
                  <label>名称</label>
                  <input
                    type="text"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />

                  {!isGroup && (
                    <>
                      <label>类型</label>
                      <div className="seg">
                        <button
                          className={!isRdp ? 'on' : ''}
                          onClick={() =>
                            setEditing({
                              ...editing,
                              conection_type: 100,
                              port: editing.port === 3389 ? 22 : editing.port
                            })
                          }
                        >
                          SSH
                        </button>
                        <button
                          className={isRdp ? 'on' : ''}
                          disabled={window.api.platform !== 'win32'}
                          title={
                            window.api.platform === 'win32'
                              ? ''
                              : 'Windows 远程桌面（mstsc）仅在 Windows 客户端可用'
                          }
                          onClick={() =>
                            setEditing({
                              ...editing,
                              conection_type: 200,
                              port: editing.port === 22 ? 3389 : editing.port
                            })
                          }
                        >
                          Windows 远程桌面
                        </button>
                      </div>

                      <label>主机</label>
                      <input
                        type="text"
                        value={editing.host}
                        placeholder="IP 或域名"
                        onChange={(e) => setEditing({ ...editing, host: e.target.value })}
                      />

                      <label>端口</label>
                      <input
                        type="number"
                        style={{ width: 100 }}
                        value={editing.port}
                        onChange={(e) => setEditing({ ...editing, port: Number(e.target.value) })}
                      />

                      <label>用户名</label>
                      <input
                        type="text"
                        value={editing.user_name}
                        onChange={(e) => setEditing({ ...editing, user_name: e.target.value })}
                      />

                      {!isRdp && (
                        <>
                      <label>认证方式</label>
                      <div className="seg">
                        <button
                          className={editing.authentication_type === 1 ? 'on' : ''}
                          onClick={() => setEditing({ ...editing, authentication_type: 1 })}
                        >
                          密码
                        </button>
                        <button
                          className={editing.authentication_type === 2 ? 'on' : ''}
                          onClick={() => setEditing({ ...editing, authentication_type: 2 })}
                        >
                          密钥
                        </button>
                      </div>

                      {editing.authentication_type === 1 ? (
                        <>
                          <label>密码</label>
                          <input
                            type="password"
                            value={/^(enc|plain|legacy|final):/.test(editing.password) ? '' : editing.password}
                            placeholder={
                              /^(enc|plain|legacy|final):/.test(editing.password)
                                ? '已保存，留空表示不修改'
                                : '登录密码'
                            }
                            onChange={(e) => {
                              setEditing({ ...editing, password: e.target.value })
                              setPwdChanged(true)
                            }}
                          />
                        </>
                      ) : (
                        <>
                          <label>密钥</label>
                          <input
                            type="text"
                            value={editing.secret_key_id}
                            placeholder="密钥文件路径（后续版本支持）"
                            onChange={(e) => setEditing({ ...editing, secret_key_id: e.target.value })}
                          />
                        </>
                      )}

                      <label>编码</label>
                      <select
                        value={editing.terminal_encoding}
                        onChange={(e) => setEditing({ ...editing, terminal_encoding: e.target.value })}
                      >
                        <option>UTF-8</option>
                        <option>GBK</option>
                        <option>GB18030</option>
                        <option>ISO-8859-1</option>
                      </select>

                      <label>代理</label>
                      <select
                        value={editing.proxy_id || '0'}
                        onChange={(e) => setEditing({ ...editing, proxy_id: e.target.value })}
                      >
                        <option value="0">不使用代理（直连）</option>
                        {(appConfig.proxies || []).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}（{p.type.toUpperCase()} {p.host}:{p.port}）
                          </option>
                        ))}
                      </select>
                        </>
                      )}

                      {isRdp && (
                        <>
                          <label>分辨率</label>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="number"
                              style={{ width: 90 }}
                              value={editing.width || 1920}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  width: Number(e.target.value),
                                  custom_size: true
                                })
                              }
                            />
                            <span>×</span>
                            <input
                              type="number"
                              style={{ width: 90 }}
                              value={editing.height || 1080}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  height: Number(e.target.value),
                                  custom_size: true
                                })
                              }
                            />
                          </div>

                          <label>全屏</label>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#555' }}>
                            <input
                              type="checkbox"
                              checked={!!editing.fullscreen}
                              onChange={(e) => setEditing({ ...editing, fullscreen: e.target.checked })}
                            />
                            启动后全屏
                          </label>

                          <label>磁盘重定向</label>
                          <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#555' }}>
                            <input
                              type="checkbox"
                              checked={!!editing.drivestoredirect}
                              onChange={(e) =>
                                setEditing({ ...editing, drivestoredirect: e.target.checked })
                              }
                            />
                            把本机磁盘带到远程会话
                          </label>

                          <label>密码</label>
                          <div style={{ color: '#999', fontSize: 11 }}>
                            由 Windows 远程桌面弹窗输入（不落盘）
                          </div>
                        </>
                      )}
                    </>
                  )}

                  <label>备注</label>
                  <textarea
                    value={editing.description}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  />
                </div>

                <div className="form-tip">
                  {isGroup
                    ? '把连接/分组拖到分组上即可调整归属；拖到空白处移回根目录。'
                    : '连接以单个 JSON 文件保存，可直接备份或从文件导入。'}
                </div>
              </>
            )}
          </div>
        </div>
        <div className="modal-foot">
          {!isGroup && editing && (
            <button className="btn" disabled={busy} onClick={() => void save(true)}>
              保存并连接
            </button>
          )}
          <button className="btn primary" disabled={!editing || busy} onClick={() => void save(false)}>
            保存
          </button>
          <button className="btn" onClick={() => openManager(false)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
