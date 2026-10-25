import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import type { IDisposable, ITheme } from '@xterm/xterm'
import { useApp } from '../state/store'
import { getTheme } from '../lib/themes'
import { registerHub } from '../lib/termHubs'
import { extractPath, parseCd, resolveCwd } from '../lib/cwd'
import { Icon } from './Icon'
import type { Tab } from '../types'

/** 有背景图时让终端底色透明，露出底层图片 */
function xtermTheme(name: string | undefined, hasBg: boolean): ITheme {
  const base = getTheme(name).xterm
  return hasBg ? { ...base, background: 'rgba(0,0,0,0)' } : base
}

export function TerminalView({
  tab,
  active,
  visible,
  side,
  ratio,
  onFocus
}: {
  tab: Tab
  active: boolean
  visible: boolean
  side?: 'left' | 'right' | null
  ratio?: number
  onFocus?: () => void
}): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const searchRef = useRef<SearchAddon | null>(null)
  const openedRef = useRef(false)
  const [error, setError] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState('0/0')

  const config = useApp((s) => s.config)
  const password = useApp((s) => s.passwords[tab.connId])

  // 创建终端 + 建立 SSH 会话（只执行一次）
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const cfg = useApp.getState().config
    const term = new Terminal({
      fontFamily: `${cfg.en_font_name}, "Microsoft YaHei UI", monospace`,
      fontSize: cfg.font_size,
      lineHeight: 1.2,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
      allowTransparency: true,
      rightClickSelectsWord: false,
      theme: xtermTheme(cfg.theme_name, !!cfg.bg_image)
    })
    const fit = new FitAddon()
    const search = new SearchAddon()
    const links = new WebLinksAddon((_e, uri) => void window.api.openExternal(uri))
    term.loadAddon(fit)
    term.loadAddon(search)
    term.loadAddon(links)
    term.open(el)
    termRef.current = term
    fitRef.current = fit
    searchRef.current = search
    try {
      fit.fit()
    } catch {
      /* ignore */
    }

    const unregister = registerHub(tab.id, (data) => term.write(data))

    // ---- 终端工作目录跟踪（驱动 SFTP 跟随）----
    let lineBuf = ''
    let homeDir = ''
    const trackCwd = async (cmd: string): Promise<void> => {
      if (!openedRef.current) return
      const buf = term.buffer.active
      const promptLine = buf.getLine(buf.baseY + buf.cursorY)?.translateToString(true) || ''
      const fromPrompt = extractPath(promptLine)
      let candidate: string | null = null
      const cdArg = parseCd(cmd)
      if (cdArg !== null) {
        if (!homeDir) {
          try {
            homeDir = await window.api.sftp.home(tab.id)
          } catch {
            homeDir = '/root'
          }
        }
        candidate = resolveCwd(useApp.getState().cwd[tab.id] || homeDir, cdArg, homeDir)
      }
      // 提示符里解析出的路径优先，失败再退回 cd 参数推导
      const targets = [fromPrompt, candidate].filter((x): x is string => !!x)
      for (const target of targets) {
        try {
          const st = await window.api.sftp.stat(tab.id, target)
          if (st && st.isDir) {
            useApp.getState().setCwd(tab.id, target)
            return
          }
        } catch {
          /* try next */
        }
      }
    }
    const onLine = (cmd: string): void => {
      window.setTimeout(() => void trackCwd(cmd), 320)
    }
    const capture = (raw: string): void => {
      const clean = raw
        .replace(/\x1b\[20[01]~/g, '') // 括号粘贴标记
        .replace(/\x1b\[[0-9;?]*[A-Za-z~]/g, '')
        .replace(/\x1b./g, '')
      for (const ch of clean) {
        if (ch === '\r' || ch === '\n') {
          onLine(lineBuf)
          lineBuf = ''
        } else if (ch === '\x7f' || ch === '\b') {
          lineBuf = lineBuf.slice(0, -1)
        } else if (ch === '\x03' || ch === '\x15') {
          lineBuf = ''
        } else if (ch >= ' ') {
          lineBuf += ch
        }
      }
    }

    const d1: IDisposable = term.onData((data) => {
      if (openedRef.current) void window.api.session.write(tab.id, data)
      capture(data)
    })
    const d2: IDisposable = term.onResize(({ cols, rows }) => {
      if (openedRef.current) void window.api.session.resize(tab.id, cols, rows)
    })
    const d3: IDisposable = search.onDidChangeResults((r) => {
      setHits(r.resultCount ? `${r.resultIndex + 1}/${r.resultCount}` : `0/${r.resultCount}`)
    })

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const k = e.key.toLowerCase()
      if (e.ctrlKey && !e.shiftKey && k === 'f') {
        setShowSearch(true)
        return false
      }
      if (e.ctrlKey && e.shiftKey && k === 'c' && term.hasSelection()) {
        e.preventDefault()
        window.api.clipboard.write(term.getSelection())
        return false
      }
      if (e.ctrlKey && e.shiftKey && k === 'v') {
        e.preventDefault()
        term.paste(window.api.clipboard.read())
        return false
      }
      return true
    })

    const onCtx = (ev: MouseEvent): void => {
      ev.preventDefault()
      ev.stopPropagation()
      if (term.hasSelection()) {
        window.api.clipboard.write(term.getSelection())
        term.clearSelection()
      } else {
        const text = window.api.clipboard.read()
        if (text) term.paste(text)
      }
    }
    el.addEventListener('contextmenu', onCtx)

    void window.api.session
      .open({
        connId: tab.connId,
        cols: term.cols,
        rows: term.rows,
        password,
        clientId: tab.id
      })
      .then(() => {
        openedRef.current = true
        useApp.getState().setTabStatus(tab.id, 'connected')
        void window.api.monitor.start(tab.id, 2000)
        void window.api.ping.start(tab.id, tab.host, 2000)
        void window.api.sftp
          .home(tab.id)
          .then((h: string) => {
            homeDir = h
            useApp.getState().setCwd(tab.id, h)
          })
          .catch(() => {
            /* ignore */
          })
      })
      .catch((e: Error) => {
        const msg = e?.message || String(e)
        setError(msg)
        useApp.getState().setTabStatus(tab.id, 'error', msg)
        term.write(`\r\n\x1b[31m连接失败: ${msg}\x1b[0m\r\n`)
      })

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      el.removeEventListener('contextmenu', onCtx)
      d1.dispose()
      d2.dispose()
      d3.dispose()
      unregister()
      openedRef.current = false
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 命令栏「搜索」按钮
  useEffect(() => {
    const handler = (): void => setShowSearch(true)
    window.addEventListener('hs:search', handler)
    return () => window.removeEventListener('hs:search', handler)
  }, [])

  // 可见性 / 分屏位置变化时重新适配尺寸；成为当前栏时聚焦
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
        // 隐藏期间写入的内容可能停在历史位置，显示时回到最新输出
        termRef.current?.scrollToBottom()
        if (active) termRef.current?.focus()
      } catch {
        /* ignore */
      }
    }, 30)
    return () => clearTimeout(t)
  }, [visible, active, side, ratio])

  // 主题 / 字体热更新
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    term.options.theme = xtermTheme(config.theme_name, !!config.bg_image)
    term.options.fontFamily = `${config.en_font_name}, "Microsoft YaHei UI", monospace`
    term.options.fontSize = config.font_size
    const t = setTimeout(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
    }, 30)
    return () => clearTimeout(t)
  }, [config.theme_name, config.font_size, config.en_font_name, config.bg_image])

  const splitStyle =
    side === 'left'
      ? { right: `${(1 - (ratio ?? 0.5)) * 100}%` }
      : side === 'right'
        ? { left: `${(ratio ?? 0.5) * 100}%` }
        : undefined

  return (
    <div
      className={'term-host' + (visible ? '' : ' hidden') + (side ? ' split' : '')}
      style={splitStyle}
      onMouseDown={() => onFocus?.()}
    >
      {config.bg_image && (
        <>
          <div
            className="term-bg"
            style={{
              backgroundImage: `url(${config.bg_image})`,
              filter: `blur(${config.bg_image_blur}px)`,
              opacity: config.bg_image_opacity
            }}
          />
          <div
            className="term-bg-tint"
            style={{ background: getTheme(config.theme_name).raw.background_color }}
          />
        </>
      )}
      <div className="term-mount" ref={hostRef} />
      {error && <div className="term-error">{error}</div>}
      {showSearch && (
        <div className="search-box">
          <Icon name="search" style={{ color: '#667' }} />
          <input
            autoFocus
            value={query}
            placeholder="搜索"
            onChange={(e) => {
              setQuery(e.target.value)
              searchRef.current?.findNext(e.target.value, { incremental: true, caseSensitive: false })
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (e.shiftKey) searchRef.current?.findPrevious(query)
                else searchRef.current?.findNext(query)
              }
              if (e.key === 'Escape') setShowSearch(false)
            }}
          />
          <span className="cnt">{hits}</span>
          <button title="上一个" onClick={() => searchRef.current?.findPrevious(query)}>
            <Icon name="arrowUp" />
          </button>
          <button title="下一个" onClick={() => searchRef.current?.findNext(query)}>
            <Icon name="arrowDown" />
          </button>
          <button
            title="关闭"
            onClick={() => {
              setShowSearch(false)
              searchRef.current?.clearDecorations()
              termRef.current?.focus()
            }}
          >
            <Icon name="x" />
          </button>
        </div>
      )}
    </div>
  )
}
