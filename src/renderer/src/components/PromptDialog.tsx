import { useState } from 'react'

export function PromptDialog({
  title,
  label,
  defaultValue = '',
  placeholder,
  okText = '确定',
  onOk,
  onCancel
}: {
  title: string
  label?: string
  defaultValue?: string
  placeholder?: string
  okText?: string
  onOk: (value: string) => void
  onCancel: () => void
}): JSX.Element {
  const [value, setValue] = useState(defaultValue)

  return (
    <div className="modal-mask" style={{ zIndex: 200 }}>
      <div className="modal" style={{ width: 400 }}>
        <div className="modal-head">
          <span>{title}</span>
          <button className="x" onClick={onCancel}>
            ×
          </button>
        </div>
        <div style={{ padding: '16px 18px' }}>
          {label && <div style={{ color: '#666', marginBottom: 8 }}>{label}</div>}
          <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onOk(value)
              if (e.key === 'Escape') onCancel()
            }}
            style={{
              width: '100%',
              height: 26,
              border: '1px solid #c4c4c4',
              background: '#fff',
              padding: '0 6px'
            }}
          />
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={() => onOk(value)}>
            {okText}
          </button>
          <button className="btn" onClick={onCancel}>
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
