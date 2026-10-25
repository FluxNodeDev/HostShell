import { app, BrowserWindow, Menu, nativeImage, nativeTheme, shell, Tray } from 'electron'
import { join } from 'node:path'
import { registerIpc, closeAllSessions } from './ipc'
import { store } from './store'

app.setName('HostShell')
app.setAppUserModelId('com.hostshell.app')
nativeTheme.themeSource = 'light'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(() => {
    registerIpc(
      () => mainWindow,
      {
        showWindow,
        quit: () => {
          quitting = true
          app.quit()
        }
      }
    )
    createWindow()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

function trayIcon(): Electron.NativeImage {
  const p = app.isPackaged ? join(process.resourcesPath, 'icon.png') : join(app.getAppPath(), 'build', 'icon.png')
  const img = nativeImage.createFromPath(p)
  return img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 16, height: 16 })
}

function createTray(): void {
  if (tray) return
  tray = new Tray(trayIcon())
  tray.setToolTip('HostShell')
  refreshTrayMenu()
  tray.on('click', () => showWindow())
  tray.on('double-click', () => showWindow())
}

function refreshTrayMenu(): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => showWindow() },
    {
      label: '连接管理器',
      click: () => {
        showWindow()
        mainWindow?.webContents.send('app:open-manager')
      }
    },
    { type: 'separator' },
    {
      label: '开机启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked })
        store().saveConfig({ auto_start: item.checked })
        mainWindow?.webContents.send('app:config-changed')
        refreshTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: '退出 HostShell',
      click: () => {
        quitting = true
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

export function showWindow(): void {
  if (!mainWindow) {
    createWindow()
    return
  }
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createWindow(): void {
  const cfg = store().config
  mainWindow = new BrowserWindow({
    width: cfg.window.width || 1500,
    height: cfg.window.height || 940,
    x: cfg.window.x,
    y: cfg.window.y,
    minWidth: 1000,
    minHeight: 640,
    title: 'HostShell',
    backgroundColor: '#f2f2f2',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('close', (e) => {
    if (!mainWindow) return
    const b = mainWindow.getBounds()
    store().saveConfig({ window: { width: b.width, height: b.height, x: b.x, y: b.y } })
    // 关闭到托盘：只隐藏窗口，会话保持连接
    if (store().config.close_to_tray && !quitting) {
      e.preventDefault()
      mainWindow.hide()
      return
    }
    closeAllSessions()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('window-all-closed', () => {
  if (store().config.close_to_tray && tray) return
  closeAllSessions()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  quitting = true
  closeAllSessions()
})
