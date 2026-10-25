import { useEffect, useState } from 'react'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import { THEMES, FONT_FAMILIES } from '../lib/themes'
import type { ProxyConfig } from '../types'
import { useT } from '../i18n/useT'
import { LOCALES, type Locale } from '../i18n'
import alipayQr from '../assets/sponsor/alipay.jpg'
import wechatQr from '../assets/sponsor/wechat.jpg'

export function SettingsModal(): JSX.Element {
  const config = useApp((s) => s.config)
  const setConfig = useApp((s) => s.setConfig)
  const openSettings = useApp((s) => s.openSettings)
  const t = useT()
  const [nav, setNav] = useState<'general' | 'appearance' | 'terminal' | 'proxy' | 'about'>(
    'general'
  )
  const [autoStart, setAutoStart] = useState(false)

  useEffect(() => {
    void window.api.appCtl.autostart().then((v: boolean) => setAutoStart(!!v))
  }, [])
  const blankProxy: ProxyConfig = { id: '', name: '', type: 'http', host: '', port: 3128 }
  const [px, setPx] = useState<ProxyConfig>(blankProxy)

  const saveProxy = (): void => {
    if (!px.host.trim() || !px.port) return
    const item: ProxyConfig = {
      ...px,
      id: px.id || Math.random().toString(36).slice(2, 8),
      name: px.name.trim() || `${px.host}:${px.port}`
    }
    const list = config.proxies.some((p) => p.id === item.id)
      ? config.proxies.map((p) => (p.id === item.id ? item : p))
      : [...config.proxies, item]
    setConfig({ proxies: list })
    setPx(blankProxy)
  }

  return (
    <div className="modal-mask">
      <div className="modal settings-modal">
        <div className="modal-head">
          <span>{t('settings.title')}</span>
          <button className="x" onClick={() => openSettings(false)}>
            ×
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-nav">
            <div className={'snav' + (nav === 'general' ? ' active' : '')} onClick={() => setNav('general')}>
              {t('settings.general')}
            </div>
            <div className={'snav' + (nav === 'appearance' ? ' active' : '')} onClick={() => setNav('appearance')}>
              {t('settings.appearance')}
            </div>
            <div className={'snav' + (nav === 'terminal' ? ' active' : '')} onClick={() => setNav('terminal')}>
              {t('settings.terminal')}
            </div>
            <div className={'snav' + (nav === 'proxy' ? ' active' : '')} onClick={() => setNav('proxy')}>
              {t('settings.proxy')}
            </div>
            <div className={'snav' + (nav === 'about' ? ' active' : '')} onClick={() => setNav('about')}>
              {t('settings.about')}
            </div>
          </div>
          <div className="settings-pane">
            {nav === 'general' && (
              <>
                <div className="set-row">
                  <label className="chk">{t('settings.language')}</label>
                  <select
                    value={config.locale || 'auto'}
                    onChange={(e) =>
                      setConfig({ locale: e.target.value === 'auto' ? '' : (e.target.value as Locale) })
                    }
                    style={{ minWidth: 220 }}
                  >
                    <option value="auto">{t('settings.languageAuto')}</option>
                    {LOCALES.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.native}
                      </option>
                    ))}
                  </select>
                  <div className="hint">{t('settings.languageHint')}</div>
                </div>
                <div className="set-row">
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={!!config.close_to_tray}
                      onChange={async (e) => {
                        const on = e.target.checked
                        await window.api.appCtl.setCloseToTray(on)
                        setConfig({ close_to_tray: on })
                      }}
                    />
                    {t('settings.tray')}
                  </label>
                  <div className="hint">{t('settings.trayHint')}</div>
                </div>

                <div className="set-row">
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={autoStart}
                      onChange={async (e) => {
                        const on = e.target.checked
                        const v = await window.api.appCtl.autostart(on)
                        setAutoStart(!!v)
                        setConfig({ auto_start: !!v })
                      }}
                    />
                    {t('settings.autostart')}
                  </label>
                  <div className="hint">
                    {t('settings.autostartHint')}
                  </div>
                </div>

                <div className="set-row">
                  <button className="btn" onClick={() => void window.api.appCtl.show()}>
                    {t('settings.showWindow')}
                  </button>
                  <div className="hint">{t('settings.showWindowHint')}</div>
                </div>
              </>
            )}

            {nav === 'appearance' && (
              <>
                <div className="bg-setting">
                  <div className="bg-row">
                    <span className="lbl">终端背景图</span>
                    <button
                      className="btn"
                      onClick={async () => {
                        try {
                          const d = await window.api.pickImage()
                          if (d) setConfig({ bg_image: d })
                        } catch (e) {
                          alert((e as Error).message)
                        }
                      }}
                    >
                      选择图片
                    </button>
                    {config.bg_image ? (
                      <button className="btn" onClick={() => setConfig({ bg_image: '' })}>
                        清除
                      </button>
                    ) : (
                      <span className="hint">未设置（图片仅保存在本机配置）</span>
                    )}
                  </div>
                  {config.bg_image && (
                    <>
                      <div className="bg-row">
                        <span className="lbl">模糊</span>
                        <input
                          type="range"
                          min={0}
                          max={20}
                          step={1}
                          value={config.bg_image_blur}
                          onChange={(e) => setConfig({ bg_image_blur: Number(e.target.value) })}
                        />
                        <span className="val">{config.bg_image_blur}px</span>
                      </div>
                      <div className="bg-row">
                        <span className="lbl">不透明度</span>
                        <input
                          type="range"
                          min={0.2}
                          max={1}
                          step={0.05}
                          value={config.bg_image_opacity}
                          onChange={(e) =>
                            setConfig({ bg_image_opacity: Number(e.target.value) })
                          }
                        />
                        <span className="val">{Math.round(config.bg_image_opacity * 100)}%</span>
                      </div>
                    </>
                  )}
                </div>
                <div style={{ marginBottom: 10, color: '#555' }}>
                  终端配色（{THEMES.length} 套）
                </div>
                <div className="theme-grid">
                  {THEMES.map((t) => (
                    <div
                      key={t.name}
                      className={'theme-card' + (config.theme_name === t.name ? ' on' : '')}
                      onClick={() => setConfig({ theme_name: t.name })}
                    >
                      <div
                        className="preview"
                        style={{ background: t.raw.background_color, color: t.raw.foreground_color }}
                      >
                        <span style={{ color: t.raw.ansi_color[2] }}>root</span>@host:~#
                        <span style={{ color: t.raw.ansi_color[6], marginLeft: 4 }}>ls</span>
                      </div>
                      <div className="swatches">
                        {t.raw.ansi_color.slice(0, 8).map((c, i) => (
                          <i key={i} style={{ background: c }} />
                        ))}
                      </div>
                      <div className="nm" title={t.name}>
                        {t.name}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {nav === 'terminal' && (
              <div className="form-grid" style={{ maxWidth: 480 }}>
                <label>字号</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="range"
                    min={10}
                    max={22}
                    value={config.font_size}
                    onChange={(e) => setConfig({ font_size: Number(e.target.value) })}
                    style={{ flex: 1 }}
                  />
                  <span style={{ width: 24, textAlign: 'right' }}>{config.font_size}</span>
                </div>
                <label>英文字体</label>
                <select
                  value={config.en_font_name}
                  onChange={(e) => setConfig({ en_font_name: e.target.value })}
                >
                  {FONT_FAMILIES.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <label>配色方案</label>
                <select
                  value={config.theme_name}
                  onChange={(e) => setConfig({ theme_name: e.target.value })}
                >
                  {THEMES.map((t) => (
                    <option key={t.name} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                <label>显示侧栏</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={config.show_sidebar}
                    onChange={(e) => setConfig({ show_sidebar: e.target.checked })}
                  />
                  显示左侧监控栏
                </label>
                <label>命令提示</label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center', color: '#555' }}>
                  <input
                    type="checkbox"
                    checked={config.command_input_full_path}
                    onChange={(e) => setConfig({ command_input_full_path: e.target.checked })}
                  />
                  命令输入框显示完整路径
                </label>
              </div>
            )}

            {nav === 'proxy' && (
              <>
                <div style={{ marginBottom: 10, color: '#555' }}>
                  SSH 连接代理（HTTP CONNECT / SOCKS5）。添加后可在「连接管理器 → 代理」里为单条连接选用。
                </div>
                <div className="proxy-list">
                  {config.proxies.map((p) => (
                    <div className="proxy-row" key={p.id}>
                      <span className="nm">{p.name}</span>
                      <span className="addr">
                        {p.type.toUpperCase()} · {p.host}:{p.port}
                        {p.username ? ` · ${p.username}` : ''}
                      </span>
                      <button className="linkbtn" onClick={() => setPx({ ...p })}>
                        编辑
                      </button>
                      <button
                        className="linkbtn danger"
                        onClick={() =>
                          setConfig({ proxies: config.proxies.filter((x) => x.id !== p.id) })
                        }
                      >
                        删除
                      </button>
                    </div>
                  ))}
                  {!config.proxies.length && (
                    <div className="proxy-empty">还没有代理，用下面的表单添加一条</div>
                  )}
                </div>
                <div className="proxy-form">
                  <input
                    placeholder="名称"
                    value={px.name}
                    onChange={(e) => setPx({ ...px, name: e.target.value })}
                    style={{ width: 120 }}
                  />
                  <select
                    value={px.type}
                    onChange={(e) => setPx({ ...px, type: e.target.value as 'http' | 'socks5' })}
                  >
                    <option value="http">HTTP</option>
                    <option value="socks5">SOCKS5</option>
                  </select>
                  <input
                    placeholder="主机"
                    value={px.host}
                    onChange={(e) => setPx({ ...px, host: e.target.value })}
                    style={{ width: 140 }}
                  />
                  <input
                    placeholder="端口"
                    value={px.port || ''}
                    onChange={(e) => setPx({ ...px, port: Number(e.target.value) })}
                    style={{ width: 70 }}
                  />
                  <input
                    placeholder="用户名（可选）"
                    value={px.username || ''}
                    onChange={(e) => setPx({ ...px, username: e.target.value })}
                    style={{ width: 120 }}
                  />
                  <input
                    placeholder="密码（可选）"
                    type="password"
                    value={px.password || ''}
                    onChange={(e) => setPx({ ...px, password: e.target.value })}
                    style={{ width: 110 }}
                  />
                  <button className="btn primary" onClick={saveProxy}>
                    {px.id ? '保存' : '添加'}
                  </button>
                  {px.id && (
                    <button className="btn" onClick={() => setPx(blankProxy)}>
                      取消
                    </button>
                  )}
                </div>
              </>
            )}

            {nav === 'about' && (
              <div style={{ lineHeight: 2, color: '#555' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Icon name="terminal" style={{ fontSize: 22, color: '#5b8fbe' }} />
                  <b style={{ fontSize: 15, color: '#333' }}>HostShell 0.17.3</b>
                </div>
                <div>一体化服务器管理工具：SSH 终端、SFTP、实时监控、隧道与 Zmodem。</div>
                <div>技术栈：Electron + React + TypeScript + xterm.js + ssh2</div>
                <div>配色：124 套 iTerm2 风格终端主题</div>
                <div style={{ marginTop: 6, color: '#999' }}>
                  MIT License · 本地优先：连接配置与密码只保存在本机。
                </div>

                <div className="sponsor-block">
                  <div className="sponsor-title">{t('settings.sponsor')}</div>
                  <div className="sponsor-hint">{t('settings.sponsorHint')}</div>
                  <div className="sponsor-qr">
                    <figure>
                      <img src={alipayQr} alt="Alipay" />
                      <figcaption>{t('settings.alipay')}</figcaption>
                    </figure>
                    <figure>
                      <img src={wechatQr} alt="WeChat Pay" />
                      <figcaption>{t('settings.wechat')}</figcaption>
                    </figure>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn primary" onClick={() => openSettings(false)}>
            {t('common.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
