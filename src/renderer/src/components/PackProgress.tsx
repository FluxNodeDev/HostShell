import { useApp } from '../state/store'

export function PackProgress(): JSX.Element | null {
  const pack = useApp((s) => s.pack)
  const setPack = useApp((s) => s.setPack)
  if (!pack) return null
  const done = !pack.error && pack.percent >= 100
  return (
    <div className="modal-mask" style={{ zIndex: 260 }}>
      <div className="modal" style={{ width: 440 }}>
        <div className="modal-head">
          <span>打包传输</span>
          <button className="x" onClick={() => setPack(null)}>
            ×
          </button>
        </div>
        <div style={{ padding: '18px 20px' }}>
          <div style={{ color: '#333', marginBottom: 12 }}>{pack.title}</div>
          <div className="pack-bar">
            <i style={{ width: `${Math.max(0, Math.min(100, pack.percent))}%` }} />
          </div>
          <div className="pack-meta">
            <span>{pack.error ? '传输失败' : done ? '已完成' : '压缩 / 传输 / 解压中…'}</span>
            <span>{pack.percent}%</span>
          </div>
          {pack.error && <div className="pack-err">{pack.error}</div>}
          {done && !pack.error && (
            <div className="pack-ok">已保存到下载目录，可在「设置 → 下载目录」中查看</div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={() => setPack(null)}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
