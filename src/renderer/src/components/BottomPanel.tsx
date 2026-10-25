import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { PromptDialog } from './PromptDialog'
import { fileIcon, fileType, parseMode, permStr, sizeStr, timeStr } from '../lib/format'
import { CommandPanel } from './CommandPanel'
import { useT } from '../i18n/useT'
import type { SftpEntry, Tab } from '../types'

function FileTree({
  sessionId,
  current,
  onOpen,
  refreshToken
}: {
  sessionId: string
  current: string
  onOpen: (p: string) => void
  refreshToken: number
}): JSX.Element {
  const [kids, setKids] = useState<Record<string, SftpEntry[]>>({})
  const [exp, setExp] = useState<Record<string, boolean>>({ '/': true })

  const load = async (p: string): Promise<void> => {
    try {
      const list = await window.api.sftp.list(sessionId, p)
      setKids((k) => ({ ...k, [p]: list.filter((e) => e.isDir) }))
    } catch {
      setKids((k) => ({ ...k, [p]: [] }))
    }
  }

  useEffect(() => {
    void load('/')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // 新建/删除后刷新已展开的目录
  useEffect(() => {
    if (!refreshToken) return
    const paths = ['/', ...Object.keys(exp).filter((k) => exp[k])]
    paths.forEach((p) => void load(p))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  const toggle = (p: string): void => {
    setExp((e) => ({ ...e, [p]: !e[p] }))
    if (!kids[p]) void load(p)
  }

  const renderNode = (p: string, name: string, depth: number): JSX.Element => {
    const open = !!exp[p]
    const children = kids[p] || []
    return (
      <div key={p}>
        <div
          className={'tnode' + (p === current ? ' sel' : '')}
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={() => onOpen(p)}
          onDoubleClick={() => toggle(p)}
        >
          <span
            className="tw"
            onClick={(e) => {
              e.stopPropagation()
              toggle(p)
            }}
          >
            {open ? '▾' : '▸'}
          </span>
          <span className="ico">
            <Icon name={open ? 'folderOpen' : 'folder'} style={{ color: '#e2b13c' }} />
          </span>
          <span>{name}</span>
        </div>
        {open && children.map((c) => renderNode(c.path, c.name, depth + 1))}
      </div>
    )
  }

  return <div className="tree">{renderNode('/', '/', 0)}</div>
}

function FilePanel({ tab }: { tab: Tab }): JSX.Element {
  const sessionId = tab.id
  const status = tab.status
  const config = useApp((s) => s.config)
  const setConfig = useApp((s) => s.setConfig)
  const setEditor = useApp((s) => s.setEditor)
  const setPack = useApp((s) => s.setPack)
  const flash = useApp((s) => s.flash)
  const [dropActive, setDropActive] = useState(false)
  const dragDepth = useRef(0)

  const [path, setPath] = useState('')
  const [pathInput, setPathInput] = useState('')
  const [entries, setEntries] = useState<SftpEntry[]>([])
  const [selPaths, setSelPaths] = useState<string[]>([])
  const [sort, setSort] = useState<{ key: 'name' | 'size' | 'mtime' | 'perm'; dir: 1 | -1 }>({
    key: 'name',
    dir: 1
  })
  const [tick, setTick] = useState(0)
  const [treeBump, setTreeBump] = useState(0)
  const [err, setErr] = useState('')
  const [histOpen, setHistOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: SftpEntry | null } | null>(null)
  const [prompt, setPrompt] = useState<
    | { kind: 'mkdir' }
    | { kind: 'rename'; entry: SftpEntry }
    | { kind: 'chmod'; entry: SftpEntry }
    | null
  >(null)

  const cwd = useApp((s) => s.cwd[tab.id])
  const follow = useApp((s) => s.followCwd)
  const toggleFollow = useApp((s) => s.toggleFollow)

  useEffect(() => {
    if (status !== 'connected') return
    let cancelled = false
    void window.api.sftp.home(sessionId).then((h: string) => {
      if (!cancelled) {
        setPath(h)
        setPathInput(h)
      }
    })
    return () => {
      cancelled = true
    }
  }, [status, sessionId])

  useEffect(() => {
    if (!path || status !== 'connected') return
    let cancelled = false
    setLoading(true)
    window.api.sftp
      .list(sessionId, path)
      .then((list: SftpEntry[]) => {
        if (cancelled) return
        setEntries(list)
        setErr('')
        setSelPaths([])
        const dirs = config.file_history.filter((h) => h.text !== path)
        setConfig({
          file_history: [
            { text: path, type: 'dir', index: 0, active_time: Date.now() },
            ...dirs
          ].slice(0, 100)
        })
      })
      .catch((e: Error) => !cancelled && setErr(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, status])

  const go = (p: string): void => {
    setPath(p)
    setPathInput(p)
  }

  const sorted = useMemo(() => {
    const arr = [...entries]
    arr.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      let r = 0
      if (sort.key === 'name') r = a.name.localeCompare(b.name, 'zh-CN')
      else if (sort.key === 'size') r = a.size - b.size
      else if (sort.key === 'mtime') r = a.mtime - b.mtime
      else if (sort.key === 'perm') r = a.mode - b.mode
      return r * sort.dir
    })
    return arr
  }, [entries, sort])

  const selectedEntries = entries.filter((e) => selPaths.includes(e.path))

  const batchOf = (entry: SftpEntry | null): SftpEntry[] => {
    if (!entry) return []
    return selPaths.includes(entry.path)
      ? entries.filter((e) => selPaths.includes(e.path))
      : [entry]
  }

  const openEntry = async (e: SftpEntry): Promise<void> => {
    if (e.isDir) return go(e.path)
    try {
      const content = await window.api.sftp.read(sessionId, e.path)
      setEditor({ tabId: sessionId, path: e.path, content })
    } catch (ex) {
      setErr((ex as Error).message)
    }
  }

  const doUpload = async (): Promise<void> => {
    try {
      await window.api.sftp.upload(sessionId, path)
      setTick((t) => t + 1)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const doDownload = async (list?: SftpEntry[]): Promise<void> => {
    const targets = list ?? selectedEntries
    if (!targets.length) return
    for (const e of targets) {
      try {
        await window.api.sftp.download(sessionId, e.path)
      } catch (err) {
        setErr((err as Error).message)
        return
      }
    }
  }

  const up = (): void => {
    const p = path.replace(/\/+$/, '')
    const idx = p.lastIndexOf('/')
    go(idx <= 0 ? '/' : p.slice(0, idx))
  }

  const sortBy = (key: typeof sort.key): void =>
    setSort((s) => ({ key, dir: s.key === key ? ((s.dir * -1) as 1 | -1) : 1 }))

  // 终端 cd 后跟随
  useEffect(() => {
    if (follow && cwd && cwd !== path) {
      setPath(cwd)
      setPathInput(cwd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, follow])

  const bump = (): void => {
    setTick((t) => t + 1)
    setTreeBump((b) => b + 1)
  }

  /** 打包传输：带进度弹窗的统一包装 */
  const runPack = async (title: string, fn: () => Promise<unknown>): Promise<void> => {
    setPack({ title, percent: 0 })
    try {
      await fn()
      setPack({ title, percent: 100 })
      setTimeout(() => setPack(null), 1200)
      bump()
    } catch (e) {
      setPack({ title, percent: 0, error: (e as Error).message })
    }
  }

  const parentOf = (p: string): string => p.slice(0, p.lastIndexOf('/')) || '/'

  const doMkdir = async (name: string): Promise<void> => {
    const n = name.trim()
    if (!n) return
    try {
      await window.api.sftp.mkdir(sessionId, `${path.replace(/\/+$/, '')}/${n}`)
      bump()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const doRename = async (entry: SftpEntry, name: string): Promise<void> => {
    const n = name.trim()
    if (!n || n === entry.name) return
    try {
      await window.api.sftp.rename(sessionId, entry.path, `${parentOf(entry.path)}/${n}`)
      bump()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const doChmod = async (entry: SftpEntry, mode: string): Promise<void> => {
    const m = parseMode(mode)
    if (!m) return
    try {
      await window.api.sftp.chmod(sessionId, entry.path, m)
      bump()
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const doDelete = async (list: SftpEntry[]): Promise<void> => {
    if (!list.length) return
    const title =
      list.length === 1
        ? `确定删除「${list[0].name}」${list[0].isDir ? '（目录）' : ''}？`
        : `确定删除选中的 ${list.length} 项？`
    if (!confirm(title)) return
    for (const e of list) {
      try {
        await window.api.sftp.remove(sessionId, e.path, e.isDir)
      } catch (err) {
        setErr((err as Error).message)
        break
      }
    }
    bump()
  }

  const menuItems: MenuItem[] = menu
    ? [
        {
          label: menu.entry?.isDir ? '打开' : '编辑',
          icon: menu.entry?.isDir ? 'folderOpen' : 'fileCode',
          disabled: !menu.entry,
          onClick: () => menu.entry && void openEntry(menu.entry)
        },
        {
          label: '下载',
          icon: 'download',
          disabled: !menu.entry,
          onClick: () => {
            if (!menu.entry) return
            void doDownload(batchOf(menu.entry))
          }
        },
        {
          label: '打包下载 (.tar.gz)',
          icon: 'fileZipper',
          disabled: !menu.entry || batchOf(menu.entry).length !== 1,
          onClick: () => {
            if (!menu.entry) return
            void runPack(`打包下载 ${menu.entry.name}`, () =>
              window.api.sftp.packDownload(sessionId, menu.entry!.path)
            )
          }
        },
        { sep: true },
        { label: '新建文件夹', icon: 'folder', onClick: () => setPrompt({ kind: 'mkdir' }) },
        { label: '上传文件', icon: 'upload', onClick: () => void doUpload() },
        { sep: true },
        {
          label: '重命名',
          icon: 'edit',
          disabled: !menu.entry,
          onClick: () => menu.entry && setPrompt({ kind: 'rename', entry: menu.entry })
        },
        {
          label: '权限…',
          icon: 'gear',
          disabled: !menu.entry,
          onClick: () => menu.entry && setPrompt({ kind: 'chmod', entry: menu.entry })
        },
        {
          label:
            menu.entry && batchOf(menu.entry).length > 1
              ? `删除选中 (${batchOf(menu.entry).length})`
              : '删除',
          icon: 'trash',
          danger: true,
          disabled: !menu.entry,
          onClick: () => menu.entry && void doDelete(batchOf(menu.entry))
        },
        { sep: true },
        { label: '刷新', icon: 'refresh', onClick: () => bump() }
      ]
    : []

  const hasFiles = (e: React.DragEvent): boolean =>
    Array.from(e.dataTransfer.types || []).includes('Files')

  const onDragEnter = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current++
    setDropActive(true)
  }

  const onDragOver = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const onDragLeave = (e: React.DragEvent): void => {
    if (!hasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDropActive(false)
  }

  const onDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault()
    dragDepth.current = 0
    setDropActive(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (!files.length) return
    const paths = files.map((f) => window.api.filePath(f)).filter((p) => !!p)
    if (!paths.length) {
      flash('未能识别本地文件路径')
      return
    }
    try {
      await window.api.sftp.upload(sessionId, path, paths)
      flash(`已上传 ${paths.length} 个文件到 ${path}`)
      bump()
    } catch (err) {
      setErr((err as Error).message)
    }
  }

  if (status !== 'connected') {
    return (
      <div className="file-body">
        <div className="empty" style={{ flex: 1 }}>
          {status === 'connecting' ? '正在连接…' : '未连接'}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="pathbar" data-session={sessionId}>
        <input
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(pathInput.trim() || '/')
            if (e.key === 'Escape') setPathInput(path)
          }}
          style={{
            flex: 1,
            border: '1px solid #d8d8d8',
            height: 18,
            padding: '0 5px',
            background: '#fff',
            color: '#444'
          }}
        />
        <button
          className={'pbtn' + (follow ? ' on' : '')}
          title={follow ? '已跟随终端目录（点击关闭）' : '未跟随终端目录（点击开启）'}
          onClick={toggleFollow}
        >
          <Icon name="link" /> 跟随
        </button>
        <div style={{ position: 'relative' }}>
          <button className="pbtn" onClick={() => setHistOpen((v) => !v)}>
            <Icon name="history" /> 历史
          </button>
          {histOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 20,
                width: 280,
                maxHeight: 240,
                overflow: 'auto',
                background: '#fff',
                border: '1px solid #bbb',
                boxShadow: '0 4px 14px rgba(0,0,0,.18)',
                zIndex: 40
              }}
            >
              {config.file_history.slice(0, 40).map((h) => (
                <div
                  key={h.text + h.active_time}
                  style={{
                    padding: '3px 8px',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    cursor: 'default'
                  }}
                  onClick={() => {
                    go(h.text)
                    setHistOpen(false)
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#eef4fb')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                >
                  {h.text}
                </div>
              ))}
              {!config.file_history.length && (
                <div style={{ padding: 8, color: '#999' }}>暂无历史</div>
              )}
            </div>
          )}
        </div>
        <button className="pbtn" title="上级目录" onClick={up}>
          <Icon name="arrowUp" />
        </button>
        <button className="pbtn" title="刷新" onClick={() => setTick((t) => t + 1)}>
          <Icon name="refresh" />
        </button>
        <button
          className="pbtn"
          title="打包上传文件夹（tar.gz）"
          onClick={() =>
            void runPack('打包上传文件夹', () => window.api.sftp.packUpload(sessionId, path))
          }
        >
          <Icon name="fileZipper" />
        </button>
        <button className="pbtn" title="上传文件" onClick={() => void doUpload()}>
          <Icon name="upload" />
        </button>
        <button
          className="pbtn"
          title={selectedEntries.length > 1 ? `下载选中 (${selectedEntries.length})` : '下载'}
          onClick={() => void doDownload()}
          disabled={!selectedEntries.length}
        >
          <Icon name="download" />
        </button>
      </div>
      <div
        className={'file-body' + (dropActive ? ' drop-active' : '')}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={(e) => void onDrop(e)}
      >
        <FileTree sessionId={sessionId} current={path} onOpen={go} refreshToken={treeBump} />
        <div
          className="ftable-wrap"
          onContextMenu={(e) => {
            e.preventDefault()
            setMenu({ x: e.clientX, y: e.clientY, entry: null })
          }}
        >
          {err && <div className="empty" style={{ color: '#c05a5a' }}>{err}</div>}
          {loading && !entries.length && <div className="empty">加载中…</div>}
          <table className="ftable">
            <colgroup>
              <col style={{ width: '38%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
            </colgroup>
            <thead>
              <tr>
                <th onClick={() => sortBy('name')}>
                  文件名 {sort.key === 'name' && <span className="sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => sortBy('size')}>
                  大小 {sort.key === 'size' && <span className="sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </th>
                <th>类型</th>
                <th onClick={() => sortBy('mtime')}>
                  修改时间 {sort.key === 'mtime' && <span className="sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </th>
                <th onClick={() => sortBy('perm')}>
                  权限 {sort.key === 'perm' && <span className="sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </th>
                <th>用户/用户组</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((e) => {
                const ic = fileIcon(e.name, e.isDir)
                return (
                  <tr
                    key={e.path}
                    className={selPaths.includes(e.path) ? 'sel' : ''}
                    onClick={(ev) => {
                      const idx = sorted.findIndex((x) => x.path === e.path)
                      if (ev.ctrlKey || ev.metaKey) {
                        setSelPaths((prev) =>
                          prev.includes(e.path)
                            ? prev.filter((p) => p !== e.path)
                            : [...prev, e.path]
                        )
                      } else if (ev.shiftKey && selPaths.length) {
                        const anchor = sorted.findIndex(
                          (x) => x.path === selPaths[selPaths.length - 1]
                        )
                        if (anchor >= 0) {
                          const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor]
                          setSelPaths(sorted.slice(lo, hi + 1).map((x) => x.path))
                        }
                      } else {
                        setSelPaths([e.path])
                      }
                    }}
                    onDoubleClick={() => void openEntry(e)}
                    onContextMenu={(ev) => {
                      ev.preventDefault()
                      ev.stopPropagation()
                      if (!selPaths.includes(e.path)) setSelPaths([e.path])
                      setMenu({ x: ev.clientX, y: ev.clientY, entry: e })
                    }}
                    title={e.name}
                  >
                    <td className="name">
                      <span className="ico">
                        <Icon name={ic.icon} style={{ color: ic.color }} />
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.name}</span>
                    </td>
                    <td className="dim">{e.isDir ? '' : sizeStr(e.size)}</td>
                    <td className="dim">{fileType(e.name, e.isDir)}</td>
                    <td className="dim">{timeStr(e.mtime)}</td>
                    <td className="dim">{permStr(e.mode)}</td>
                    <td className="dim">{`${e.uid}/${e.gid}`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!loading && !entries.length && !err && <div className="empty">空目录</div>}
        </div>
        {dropActive && <div className="drop-overlay">松开鼠标上传到 {path}</div>}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
      {prompt?.kind === 'mkdir' && (
        <PromptDialog
          title="新建文件夹"
          label={`在 ${path} 下创建`}
          placeholder="文件夹名称"
          onOk={(v) => {
            const p = prompt
            setPrompt(null)
            if (p) void doMkdir(v)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'rename' && (
        <PromptDialog
          title="重命名"
          label={prompt.entry.path}
          defaultValue={prompt.entry.name}
          onOk={(v) => {
            const p = prompt
            setPrompt(null)
            if (p && p.kind === 'rename') void doRename(p.entry, v)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'chmod' && (
        <PromptDialog
          title="修改权限"
          label={`${prompt.entry.path}（八进制，如 755）`}
          defaultValue={(prompt.entry.mode & 0o777).toString(8)}
          onOk={(v) => {
            const p = prompt
            setPrompt(null)
            if (p && p.kind === 'chmod') void doChmod(p.entry, v)
          }}
          onCancel={() => setPrompt(null)}
        />
      )}
    </>
  )
}

export function BottomPanel({ tab }: { tab: Tab }): JSX.Element {
  const t = useT()
  const view = useApp((s) => s.bottomView)
  const setView = useApp((s) => s.setBottomView)
  return (
    <div className="bottom">
      <div className="bpanel-tabs">
        <div className={'btab' + (view === 'file' ? ' active' : '')} onClick={() => setView('file')}>
          {t('panel.files')}
        </div>
        <div className={'btab' + (view === 'cmd' ? ' active' : '')} onClick={() => setView('cmd')}>
          {t('panel.commands')}
        </div>
      </div>
      <div className="bpanel-body">
        {view === 'file' ? <FilePanel tab={tab} /> : <CommandPanel tab={tab} />}
      </div>
    </div>
  )
}
