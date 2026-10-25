import type { ITheme } from '@xterm/xterm'

export interface RawTheme {
  ansi_color: string[]
  background_color: string
  cursor_color: string
  foreground_color: string
  selected_color: string
}

export interface ThemeEntry {
  name: string
  raw: RawTheme
  xterm: ITheme
}

const modules = import.meta.glob('../assets/themes/*.json', { eager: true }) as Record<
  string,
  { default: RawTheme } | RawTheme
>

function toXterm(raw: RawTheme): ITheme {
  const a = raw.ansi_color || []
  return {
    background: raw.background_color,
    foreground: raw.foreground_color,
    cursor: raw.cursor_color,
    cursorAccent: raw.background_color,
    selectionBackground: raw.selected_color + 'cc',
    black: a[0],
    red: a[1],
    green: a[2],
    yellow: a[3],
    blue: a[4],
    magenta: a[5],
    cyan: a[6],
    white: a[7],
    brightBlack: a[8],
    brightRed: a[9],
    brightGreen: a[10],
    brightYellow: a[11],
    brightBlue: a[12],
    brightMagenta: a[13],
    brightCyan: a[14],
    brightWhite: a[15]
  }
}

export const THEMES: ThemeEntry[] = Object.entries(modules)
  .map(([path, mod]) => {
    const raw = ((mod as any).default ?? mod) as RawTheme
    const name = path.split('/').pop()!.replace(/\.json$/, '')
    return { name, raw, xterm: toXterm(raw) }
  })
  .filter((t) => t.raw && t.raw.ansi_color)
  .sort((a, b) => {
    if (a.name === 'Default') return -1
    if (b.name === 'Default') return 1
    return a.name.localeCompare(b.name)
  })

export function getTheme(name: string | undefined): ThemeEntry {
  return THEMES.find((t) => t.name === name) || THEMES[0]
}

export const FONT_FAMILIES = [
  { label: 'Consolas', value: 'Consolas' },
  { label: 'Cascadia Mono', value: 'Cascadia Mono' },
  { label: 'DejaVu Sans Mono', value: 'DejaVu Sans Mono' },
  { label: 'JetBrains Mono', value: 'JetBrains Mono' },
  { label: 'Source Code Pro', value: 'Source Code Pro' },
  { label: 'Courier New', value: 'Courier New' }
]
