import { useEffect } from 'react'
import { Icon } from './Icon'

export interface MenuItem {
  label?: string
  icon?: string
  danger?: boolean
  disabled?: boolean
  sep?: boolean
  onClick?: () => void
}

export function ContextMenu({
  x,
  y,
  items,
  onClose
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}): JSX.Element {
  useEffect(() => {
    const close = (): void => onClose()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const width = 184
  const height = items.reduce((h, i) => h + (i.sep ? 7 : 26), 8)
  const left = Math.max(2, Math.min(x, window.innerWidth - width - 4))
  const top = Math.max(2, Math.min(y, window.innerHeight - height - 4))

  return (
    <div
      className="ctxmenu"
      style={{ left, top, width }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) =>
        it.sep ? (
          <div className="ctxsep" key={'s' + i} />
        ) : (
          <div
            key={it.label + i}
            className={
              'ctxitem' + (it.danger ? ' danger' : '') + (it.disabled ? ' disabled' : '')
            }
            onClick={() => {
              if (it.disabled) return
              it.onClick?.()
              onClose()
            }}
          >
            <span className="ci">{it.icon ? <Icon name={it.icon} /> : null}</span>
            <span className="cl">{it.label}</span>
          </div>
        )
      )}
    </div>
  )
}
