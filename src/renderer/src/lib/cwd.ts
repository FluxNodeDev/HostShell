/** 归一化远端绝对路径：合并 //、处理 . 与 .. */
export function normalize(p: string): string {
  const parts = (p || '/').split('/')
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      out.pop()
      continue
    }
    out.push(part)
  }
  return '/' + out.join('/')
}

/** 把 cd 参数解析成绝对路径 */
export function resolveCwd(cwd: string, arg: string | undefined, home: string): string {
  const t = (arg ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
  if (!t || t === '~') return home || '/root'
  if (t === '-') return cwd
  if (t.startsWith('~/')) return normalize((home || '/root') + '/' + t.slice(2))
  if (t.startsWith('/')) return normalize(t)
  return normalize((cwd || '/') + '/' + t)
}

/** 匹配 cd / cd xxx 命令，返回参数（空串表示 cd 本身） */
export function parseCd(line: string): string | null {
  const m = line.match(/^\s*cd(?:\s+(.+?))?\s*$/)
  if (!m) return null
  return m[1] ?? ''
}

/** 从提示符行里提取最后一个绝对路径（用于兜底跟随） */
export function extractPath(line: string): string | null {
  // 排除路径里不会出现的字符：引号、括号、#（root 提示符）、$、%、> 等
  const re = /(?:^|[\s:>~=])(\/[^\s:;'"()[\]{}#$%&|<>*,]+)/g
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) last = m[1].replace(/[.,]+$/, '')
  return last
}
