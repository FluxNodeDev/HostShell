const UNITS = ['B', 'K', 'M', 'G', 'T', 'P']

/** kB -> 人类可读（1.3G / 959M / 4.0K） */
export function kbStr(kb: number | undefined | null): string {
  if (!kb || kb <= 0) return '0'
  let v = kb * 1024
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1)
  return s.replace(/\.0$/, '') + UNITS[i]
}

/** 文件大小：3.2 KB / 972 B（单位前带空格） */
export function sizeStr(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(1)} ${units[i]}`
}

export function byteStr(bytes: number): string {
  if (!bytes || bytes <= 0) return '0'
  let v = bytes
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(0) : v.toFixed(1)
  return s.replace(/\.0$/, '') + UNITS[i]
}

/** 字节/秒 -> 网速字符串 */
export function speedStr(bps: number): string {
  if (!bps || bps <= 0) return '0'
  return byteStr(bps) + '/s'
}

export function timeStr(sec: number): string {
  if (!sec) return '-'
  const d = new Date(sec * 1000)
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function uptimeStr(sec: number): string {
  if (!sec) return '0'
  const days = Math.floor(sec / 86400)
  const hours = Math.floor((sec % 86400) / 3600)
  if (days > 0) return `${days}天${hours > 0 ? hours + '小时' : ''}`
  const mins = Math.floor((sec % 3600) / 60)
  return `${hours}小时${mins}分`
}

export function pctStr(v: number): string {
  if (!isFinite(v) || v <= 0) return '0%'
  return (v >= 10 ? v.toFixed(0) : v.toFixed(1)) + '%'
}

/** 数字权限 -> drwxr-xr-x */
export function permStr(mode: number | undefined): string {
  if (!mode) return ''
  const type = (mode & 0o170000) === 0o040000 ? 'd' : (mode & 0o170000) === 0o120000 ? 'l' : '-'
  const rwx = (m: number): string =>
    (m & 4 ? 'r' : '-') + (m & 2 ? 'w' : '-') + (m & 1 ? 'x' : '-')
  return type + rwx((mode >> 6) & 7) + rwx((mode >> 3) & 7) + rwx(mode & 7)
}

/** 8 进制字符串 -> 数字 */
export function parseMode(s: string): number {
  return parseInt(s.replace(/[^0-7]/g, ''), 8) || 0o644
}

export function fileType(name: string, isDir: boolean): string {
  if (isDir) return '文件夹'
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const map: Record<string, string> = {
    txt: '文本文件', log: '日志文件', md: 'Markdown', json: 'JSON 文件', xml: 'XML 文件',
    yml: 'YAML 文件', yaml: 'YAML 文件', conf: '配置文件', ini: '配置文件', env: 'ENV 文件',
    sh: 'SH 文件', bash: 'SH 文件', zsh: 'SH 文件', py: 'Python 文件', js: 'JS 文件',
    ts: 'TS 文件', java: 'Java 文件', go: 'Go 文件', c: 'C 文件', h: 'C 头文件',
    cpp: 'C++ 文件', html: 'HTML 文件', css: 'CSS 文件', sql: 'SQL 文件',
    png: 'PNG 图片', jpg: 'JPEG 图片', jpeg: 'JPEG 图片', gif: 'GIF 图片', svg: 'SVG 图片',
    zip: 'ZIP 压缩包', gz: 'GZ 压缩包', tar: 'TAR 归档', rar: 'RAR 压缩包', '7z': '7Z 压缩包',
    deb: 'DEB 包', rpm: 'RPM 包', jar: 'JAR 包', pdf: 'PDF 文档'
  }
  return map[ext] || '文件'
}

export function fileIcon(name: string, isDir: boolean): { icon: string; color: string } {
  if (isDir) return { icon: 'folder', color: '#e2b13c' }
  const ext = name.split('.').pop()?.toLowerCase() || ''
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'].includes(ext))
    return { icon: 'image', color: '#3f9a5a' }
  if (['zip', 'gz', 'tar', 'rar', '7z', 'xz', 'bz2'].includes(ext))
    return { icon: 'file-zipper', color: '#b08a3e' }
  if (['sh', 'bash', 'zsh', 'py', 'js', 'ts', 'java', 'go', 'c', 'cpp', 'rs'].includes(ext))
    return { icon: 'file-code', color: '#3f7fd0' }
  if (['conf', 'ini', 'yml', 'yaml', 'env', 'properties'].includes(ext))
    return { icon: 'gear', color: '#8a8f98' }
  if (['txt', 'log', 'md'].includes(ext)) return { icon: 'file-lines', color: '#6b7d8f' }
  return { icon: 'file', color: '#8a9aa8' }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}
