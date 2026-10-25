import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ConnConfig } from './store'

/** 生成 mstsc 的 .rdp 文件内容（UTF-16LE 写入，兼容中文用户名） */
export function buildRdpFile(cfg: ConnConfig): string {
  const port = cfg.port && cfg.port !== 22 ? cfg.port : 3389
  const width = cfg.custom_size && cfg.width > 0 ? cfg.width : 1920
  const height = cfg.custom_size && cfg.height > 0 ? cfg.height : 1080
  const lines = [
    'screen mode id:i:' + (cfg.fullscreen ? 2 : 1),
    'use multimon:i:0',
    `desktopwidth:i:${width}`,
    `desktopheight:i:${height}`,
    'session bpp:i:32',
    `full address:s:${cfg.host}:${port}`,
    `username:s:${cfg.user_name || ''}`,
    'prompt for credentials:i:1',
    'authentication level:i:0',
    'enablecredsspsupport:i:1',
    'audiomode:i:0',
    'redirectclipboard:i:1',
    'redirectprinters:i:0',
    'redirectcomports:i:0',
    'redirectsmartcards:i:0',
    'redirectposdevices:i:0',
    `drivestoredirect:s:${cfg.drivestoredirect ? '*' : ''}`,
    'autoreconnection enabled:i:1',
    'bandwidthautodetect:i:1',
    'networkautodetect:i:1',
    'connection type:i:7',
    'disable wallpaper:i:1',
    'allow font smoothing:i:1',
    'allow desktop composition:i:1',
    'smart sizing:i:1',
    'dynamic resolution:i:1'
  ]
  return lines.join('\r\n') + '\r\n'
}

export interface RdpLaunchResult {
  file: string
  pid?: number
}

/** 写 .rdp 并调起 mstsc（仅 Windows） */
export function launchRdp(cfg: ConnConfig): RdpLaunchResult {
  if (process.platform !== 'win32') {
    throw new Error('远程桌面（RDP）目前仅支持 Windows 客户端')
  }
  const file = join(tmpdir(), `hostshell-rdp-${cfg.id}.rdp`)
  writeFileSync(file, '\uFEFF' + buildRdpFile(cfg), 'utf16le')
  const child = spawn('mstsc.exe', [file], { detached: true, stdio: 'ignore', windowsHide: false })
  child.unref()
  return { file, pid: child.pid }
}
