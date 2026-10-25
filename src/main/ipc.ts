import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { join, basename, dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { store, type AppConfig, type ConnConfig } from './store'
import { SshSession } from './session'
import {
  Monitor,
  PROC_LIST_CMD,
  SYSINFO_CMD,
  parsePsFull,
  procDetailCmd,
  type Metrics
} from './monitor'
import { Pinger } from './ping'
import { launchRdp } from './rdp'
import { getInspector, startInspector, stopAllInspectors, stopInspector } from './hostinspect'

interface SessionRec {
  session: SshSession
  conn: ConnConfig
  monitor?: Monitor
  pinger?: Pinger
}

const sessions = new Map<string, SessionRec>()

function send(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function getSession(id: string): SshSession {
  const rec = sessions.get(id)
  if (!rec) throw new Error('会话不存在或已断开')
  return rec.session
}

export interface AppCtl {
  showWindow: () => void
  quit: () => void
}

export function registerIpc(getWindow: () => BrowserWindow | null, ctl: AppCtl): void {
  // ---------- 窗口 / 托盘 / 开机启动 ----------
  ipcMain.handle('app:set-close-to-tray', (_e, on: boolean) => {
    store().saveConfig({ close_to_tray: !!on })
    return store().config.close_to_tray
  })

  ipcMain.handle('app:show', () => {
    ctl.showWindow()
    return true
  })

  ipcMain.handle('app:quit', () => {
    ctl.quit()
    return true
  })

  ipcMain.handle('app:autostart', (_e, on?: boolean) => {
    // Linux 不支持 setLoginItemSettings，改用 XDG autostart 的 .desktop 文件
    if (process.platform === 'linux') {
      const file = join(
        process.env.XDG_CONFIG_HOME || join(process.env.HOME || '', '.config'),
        'autostart',
        'hostshell.desktop'
      )
      if (typeof on === 'boolean') {
        if (on) {
          mkdirSync(dirname(file), { recursive: true })
          const exec = process.execPath.includes(' ')
            ? `"${process.execPath}"`
            : process.execPath
          writeFileSync(
            file,
            [
              '[Desktop Entry]',
              'Type=Application',
              'Name=HostShell',
              'Comment=All-in-one server workbench',
              `Exec=${exec}`,
              'Terminal=false',
              'X-GNOME-Autostart-enabled=true',
              ''
            ].join('\n'),
            'utf8'
          )
        } else if (existsSync(file)) {
          unlinkSync(file)
        }
        store().saveConfig({ auto_start: on })
      }
      return existsSync(file)
    }
    if (typeof on === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: on })
      store().saveConfig({ auto_start: on })
    }
    return app.getLoginItemSettings().openAtLogin
  })

  // ---------- 配置 / 连接 ----------
  ipcMain.handle('app:init', () => ({
    config: store().config,
    connections: store().list(),
    autoConnect: process.env.HOSTSHELL_AUTO_CONNECT || ''
  }))

  ipcMain.handle('app:config:set', (_e, patch: Partial<AppConfig>) => store().saveConfig(patch))

  ipcMain.handle('app:pickImage', async () => {
    const win = getWindow()
    if (!win) return ''
    const r = await dialog.showOpenDialog(win, {
      title: '选择终端背景图片',
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'] }]
    })
    if (r.canceled || !r.filePaths[0]) return ''
    const p = r.filePaths[0]
    const buf = readFileSync(p)
    if (buf.length > 12 * 1024 * 1024) throw new Error('图片过大（超过 12MB）')
    const ext = (p.split('.').pop() || 'png').toLowerCase().replace('jpg', 'jpeg')
    return `data:image/${ext};base64,${buf.toString('base64')}`
  })

  ipcMain.handle('conn:list', () => store().list())
  ipcMain.handle('conn:save', (_e, c: Partial<ConnConfig>) => store().save(c))
  ipcMain.handle('conn:delete', (_e, id: string) => {
    store().remove(id)
    return true
  })
  ipcMain.handle('conn:import', async () => {
    const win = getWindow()
    const picked = win
      ? await dialog.showOpenDialog(win, {
          title: '选择连接配置文件',
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: '连接配置', extensions: ['json'] }]
        })
      : { canceled: true, filePaths: [] as string[] }
    if (picked.canceled || !picked.filePaths.length) return { imported: 0, source: '' }
    let imported = 0
    for (const f of picked.filePaths) {
      if (store().importConnFile(f)) imported += 1
    }
    return { imported, source: `${picked.filePaths.length} 个文件` }
  })

  // ---------- SSH 会话 ----------
  ipcMain.handle(
    'session:open',
    async (
      _e,
      args: { connId: string; cols: number; rows: number; password?: string; clientId?: string }
    ): Promise<{ sessionId: string }> => {
      const cfg = store().get(args.connId)
      if (!cfg) throw new Error('连接不存在')
      if (!cfg.host) throw new Error('主机地址为空')
      const sessionId = args.clientId || `${cfg.id}:${Date.now().toString(36)}`
      const proxy = store().config.proxies?.find((p) => p.id === cfg.proxy_id && p.host)
      const session = new SshSession(sessionId, cfg, proxy)
      sessions.set(sessionId, { session, conn: cfg })

      session.on('data', (data: string) => send('session:data', { sessionId, data }))
      session.on('zmodem-start', () => send('session:zmodem', { sessionId, phase: 'start' }))
      session.on('zmodem', (p: unknown) => send('session:zmodem', { sessionId, phase: 'done', ...(p as object) }))
      session.on('zmodem-error', (message: string) =>
        send('session:zmodem', { sessionId, phase: 'error', message })
      )
      session.on('zmodem-end', () => send('session:zmodem', { sessionId, phase: 'end' }))
      session.on('zmodem-send-start', () =>
        send('session:zmodem', { sessionId, phase: 'send-start' })
      )
      session.on('zmodem-sent', (p: { name: string; size: number }) =>
        send('session:zmodem', { sessionId, phase: 'sent', ...p })
      )
      session.on('shell-close', () => send('session:closed', { sessionId }))
      session.on('close', () => send('session:closed', { sessionId }))
      session.on('error', (err: Error) => send('session:error', { sessionId, message: err.message }))

      await session.connect(args.password)
      await session.openShell(args.cols || 120, args.rows || 32)
      store().save({ ...cfg, access_time: Date.now() })
      return { sessionId }
    }
  )

  ipcMain.handle('session:write', (_e, args: { sessionId: string; data: string }) => {
    getSession(args.sessionId).write(args.data)
  })

  ipcMain.handle('session:resize', (_e, args: { sessionId: string; cols: number; rows: number }) => {
    getSession(args.sessionId).resize(args.cols, args.rows)
  })

  ipcMain.handle('session:close', (_e, sessionId: string) => {
    const rec = sessions.get(sessionId)
    if (rec) {
      rec.monitor?.stop()
      rec.pinger?.stop()
      rec.session.close()
      sessions.delete(sessionId)
    }
  })

  ipcMain.handle('session:exec', (_e, args: { sessionId: string; cmd: string }) =>
    getSession(args.sessionId).exec(args.cmd)
  )

  ipcMain.handle('session:sysinfo', async (_e, sessionId: string) => {
    const raw = await getSession(sessionId).exec(SYSINFO_CMD, 15000)
    const info: Record<string, string> = {}
    let cur = ''
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^@@@(\w+)$/)
      if (m) {
        cur = m[1]
        continue
      }
      if (cur && line.trim()) info[cur] = (info[cur] ? info[cur] + ' ' : '') + line.trim()
    }
    return info
  })

  // ---------- 远程桌面 ----------
  ipcMain.handle('rdp:open', (_e, connId: string) => {
    const cfg = store().get(connId)
    if (!cfg) throw new Error('连接不存在')
    if (!cfg.host) throw new Error('主机地址为空')
    return launchRdp(cfg)
  })

  // ---------- 多地点 Ping（以已打开的 SSH 会话为探测节点）----------
  ipcMain.handle('probe:ping', async (_e, args: { sessionIds: string[]; target: string }) => {
    const target = String(args.target || '').replace(/[^\w.:\-/]/g, '')
    if (!target) return []
    return Promise.all(
      args.sessionIds.map(async (sid) => {
        const rec = sessions.get(sid)
        if (!rec) {
          return { sessionId: sid, name: '未知会话', host: '', ok: false, error: '会话已关闭' }
        }
        const base = {
          sessionId: sid,
          name: rec.conn.name || rec.conn.host,
          host: rec.conn.host
        }
        try {
          const out = await rec.session.exec(`ping -c 3 -W 1 '${target}'`, 9000)
          const loss = /(\d+(?:\.\d+)?)%\s*packet loss/.exec(out)
          const rtt = /=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/.exec(out)
          return {
            ...base,
            ok: true,
            loss: loss ? Number(loss[1]) : 100,
            min: rtt ? Number(rtt[1]) : 0,
            avg: rtt ? Number(rtt[2]) : 0,
            max: rtt ? Number(rtt[3]) : 0,
            raw: out.trim().slice(-400)
          }
        } catch (e) {
          return { ...base, ok: false, error: (e as Error).message }
        }
      })
    )
  })

  // ---------- 端口转发 ----------
  ipcMain.handle('forward:list', (_e, sessionId: string) => getSession(sessionId).runningForwards())

  ipcMain.handle(
    'forward:start',
    async (_e, args: { sessionId: string; rule: import('./session').ForwardRule }) => {
      await getSession(args.sessionId).startForward(args.rule)
      return true
    }
  )

  ipcMain.handle('forward:stop', (_e, args: { sessionId: string; ruleId: string }) => {
    getSession(args.sessionId).stopForward(args.ruleId)
    return true
  })

  // ---------- 进程管理器 ----------
  ipcMain.handle('proc:list', async (_e, sessionId: string) => {
    const raw = await getSession(sessionId).exec(PROC_LIST_CMD, 20000)
    return parsePsFull(raw)
  })

  ipcMain.handle('proc:detail', async (_e, args: { sessionId: string; pid: number }) => {
    const raw = await getSession(args.sessionId).exec(procDetailCmd(args.pid), 15000)
    const out: { args: string; exe: string; cwd: string; env: string[] } = {
      args: '',
      exe: '',
      cwd: '',
      env: []
    }
    let cur = ''
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^@@@(\w+)$/)
      if (m) {
        cur = m[1]
        continue
      }
      if (!cur || !line.trim()) continue
      if (cur === 'ENV') out.env.push(line)
      else if (cur === 'ARGS') out.args = (out.args ? out.args + ' ' : '') + line.trim()
      else if (cur === 'EXE') out.exe = line.trim()
      else if (cur === 'CWD') out.cwd = line.trim()
    }
    return out
  })

  ipcMain.handle(
    'proc:kill',
    async (_e, args: { sessionId: string; pid: number; force?: boolean }) => {
      const cmd = `kill ${args.force ? '-9 ' : ''}${args.pid} 2>&1; echo "EXIT:$?"`
      const out = await getSession(args.sessionId).exec(cmd, 10000)
      const m = out.match(/EXIT:(\d+)/)
      return { code: m ? Number(m[1]) : -1, output: out.replace(/EXIT:\d+\s*/, '').trim() }
    }
  )

  // ---------- 监控 ----------
  ipcMain.handle('monitor:start', (_e, args: { sessionId: string; interval?: number }) => {
    const rec = sessions.get(args.sessionId)
    if (!rec) return
    rec.monitor?.stop()
    rec.monitor = new Monitor(
      rec.session,
      (m: Metrics) => send('session:metrics', { sessionId: args.sessionId, metrics: m }),
      (err) => send('session:monitor-error', { sessionId: args.sessionId, message: err })
    )
    rec.monitor.start(args.interval || 2000)
  })

  ipcMain.handle('monitor:stop', (_e, sessionId: string) => {
    sessions.get(sessionId)?.monitor?.stop()
  })

  ipcMain.handle('ping:start', (_e, args: { sessionId: string; host: string; interval?: number }) => {
    const rec = sessions.get(args.sessionId)
    if (!rec) return
    rec.pinger?.stop()
    rec.pinger = new Pinger(args.host, (s) =>
      send('session:ping', { sessionId: args.sessionId, sample: s, stats: rec.pinger?.stats() })
    )
    rec.pinger.start(args.interval || 2000)
  })

  ipcMain.handle('ping:stop', (_e, sessionId: string) => {
    sessions.get(sessionId)?.pinger?.stop()
  })

  // ---------- 主机检测（Trace + 逐跳 Ping，本地发起）----------
  ipcMain.handle('net:inspect:start', (_e, args: { tabId: string; host: string }) => {
    const ins = startInspector(args.tabId, args.host)
    ins.removeAllListeners('hops')
    ins.removeAllListeners('sample')
    ins.on('hops', (p) => send('net:hops', p))
    ins.on('sample', (p) => send('net:hop', p))
    return true
  })

  ipcMain.handle('net:inspect:stop', (_e, tabId: string) => {
    stopInspector(tabId)
    return true
  })

  ipcMain.handle('net:inspect:retrace', async (_e, tabId: string) => {
    const ins = getInspector(tabId)
    if (ins) await ins.trace()
    return true
  })

  // ---------- SFTP ----------
  ipcMain.handle('sftp:home', async (_e, sessionId: string) => {
    const s = getSession(sessionId)
    try {
      return await s.realpath('.')
    } catch {
      return '/'
    }
  })

  ipcMain.handle('sftp:list', async (_e, args: { sessionId: string; path: string }) => {
    const s = getSession(args.sessionId)
    return s.readdir(args.path)
  })

  ipcMain.handle('sftp:stat', async (_e, args: { sessionId: string; path: string }) => {
    try {
      return await getSession(args.sessionId).stat(args.path)
    } catch {
      return null
    }
  })

  ipcMain.handle('sftp:mkdir', async (_e, args: { sessionId: string; path: string }) => {
    await getSession(args.sessionId).mkdir(args.path)
    return true
  })

  ipcMain.handle('sftp:rename', async (_e, args: { sessionId: string; from: string; to: string }) => {
    await getSession(args.sessionId).rename(args.from, args.to)
    return true
  })

  ipcMain.handle(
    'sftp:delete',
    async (_e, args: { sessionId: string; path: string; isDir: boolean }) => {
      await getSession(args.sessionId).remove(args.path, args.isDir)
      return true
    }
  )

  ipcMain.handle(
    'sftp:chmod',
    async (_e, args: { sessionId: string; path: string; mode: number }) => {
      await getSession(args.sessionId).chmod(args.path, args.mode)
      return true
    }
  )

  ipcMain.handle('sftp:read', async (_e, args: { sessionId: string; path: string }) => {
    const buf = await getSession(args.sessionId).readFile(args.path)
    return buf.toString('utf8')
  })

  ipcMain.handle(
    'sftp:write',
    async (_e, args: { sessionId: string; path: string; content: string }) => {
      await getSession(args.sessionId).writeFile(args.path, Buffer.from(args.content, 'utf8'))
      return true
    }
  )

  ipcMain.handle(
    'sftp:upload',
    async (_e, args: { sessionId: string; remoteDir: string; localPaths?: string[] }) => {
      let files = args.localPaths
      if (!files?.length) {
        const win = getWindow()
        const r = win
          ? await dialog.showOpenDialog(win, {
              title: '选择要上传的文件',
              properties: ['openFile', 'multiSelections']
            })
          : { canceled: true, filePaths: [] as string[] }
        if (r.canceled) return { uploaded: 0 }
        files = r.filePaths
      }
      const s = getSession(args.sessionId)
      let n = 0
      for (const f of files) {
        const target = join(args.remoteDir.replace(/\/+$/, ''), basename(f)).replace(/\\/g, '/')
        await s.upload(f, target)
        n++
      }
      return { uploaded: n }
    }
  )

  // 打包传输（tar.gz）
  ipcMain.handle(
    'sftp:packDownload',
    async (_e, args: { sessionId: string; remotePath: string }) => {
      const dest = store().config.download_path || app.getPath('downloads')
      mkdirSync(dest, { recursive: true })
      const out = await getSession(args.sessionId).packDownload(args.remotePath, dest, (p) =>
        send('sftp:progress', { sessionId: args.sessionId, percent: p })
      )
      return { ok: true, path: out }
    }
  )

  ipcMain.handle(
    'sftp:packUpload',
    async (_e, args: { sessionId: string; remoteDir: string; localPath?: string }) => {
      let local = args.localPath
      if (!local) {
        const win = getWindow()
        const r = win
          ? await dialog.showOpenDialog(win, {
              title: '选择要打包上传的文件夹',
              properties: ['openDirectory']
            })
          : { canceled: true, filePaths: [] as string[] }
        if (r.canceled || !r.filePaths[0]) return { ok: false }
        local = r.filePaths[0]
      }
      await getSession(args.sessionId).packUpload(local, args.remoteDir, (p) =>
        send('sftp:progress', { sessionId: args.sessionId, percent: p })
      )
      return { ok: true }
    }
  )

  ipcMain.handle(
    'sftp:download',
    async (_e, args: { sessionId: string; remotePath: string; isDir?: boolean }) => {
      const s = getSession(args.sessionId)
      const cfg = store().config
      let dir = cfg.download_path
      if (!dir || !existsSync(dir)) {
        const win = getWindow()
        const r = win
          ? await dialog.showOpenDialog(win, {
              title: '选择下载目录',
              properties: ['openDirectory', 'createDirectory']
            })
          : { canceled: true, filePaths: [] as string[] }
        if (r.canceled) return { ok: false }
        dir = r.filePaths[0]
        store().saveConfig({ download_path: dir })
      }
      mkdirSync(dir, { recursive: true })
      const target = join(dir, basename(args.remotePath)).replace(/\\/g, '/')
      await s.download(args.remotePath, target)
      return { ok: true, path: target }
    }
  )

  ipcMain.handle('shell:openExternal', async (_e, url: string) => {
    const { shell } = await import('electron')
    await shell.openExternal(url)
  })
}

export function closeAllSessions(): void {
  stopAllInspectors()
  for (const rec of sessions.values()) {
    rec.monitor?.stop()
    rec.pinger?.stop()
    rec.session.close()
  }
  sessions.clear()
}
