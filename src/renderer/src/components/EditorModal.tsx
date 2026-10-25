import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { python } from '@codemirror/lang-python'
import { sql } from '@codemirror/lang-sql'
import { markdown } from '@codemirror/lang-markdown'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { yaml } from '@codemirror/legacy-modes/mode/yaml'
import { toml } from '@codemirror/legacy-modes/mode/toml'
import { properties } from '@codemirror/legacy-modes/mode/properties'
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile'
import { powerShell } from '@codemirror/legacy-modes/mode/powershell'
import { useApp } from '../state/store'
import { Icon } from './Icon'
import type { Extension } from '@codemirror/state'

function langFor(path: string): Extension[] {
  const ext = path.split('.').pop()?.toLowerCase() || ''
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext))
    return [javascript({ typescript: ext.startsWith('ts'), jsx: ext.endsWith('x') })]
  if (ext === 'json') return [json()]
  if (['html', 'htm', 'vue', 'xml'].includes(ext)) return [html()]
  if (['css', 'scss', 'less'].includes(ext)) return [css()]
  if (['py', 'pyw'].includes(ext)) return [python()]
  if (['sql'].includes(ext)) return [sql()]
  if (['md', 'markdown'].includes(ext)) return [markdown()]
  if (['sh', 'bash', 'zsh', 'ksh', 'fish', 'bashrc', 'profile'].includes(ext))
    return [StreamLanguage.define(shell)]
  if (['yml', 'yaml'].includes(ext)) return [StreamLanguage.define(yaml)]
  if (['toml'].includes(ext)) return [StreamLanguage.define(toml)]
  if (['ini', 'conf', 'cfg', 'properties', 'env'].includes(ext))
    return [StreamLanguage.define(properties)]
  if (['ps1', 'psm1'].includes(ext)) return [StreamLanguage.define(powerShell)]
  if (path.split(/[\\/]/).pop() === 'Dockerfile' || path.endsWith('.dockerfile'))
    return [StreamLanguage.define(dockerFile)]
  return []
}

export function EditorModal(): JSX.Element {
  const editor = useApp((s) => s.editor)!
  const setEditor = useApp((s) => s.setEditor)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [content, setContent] = useState(editor.content)
  const [dirty, setDirty] = useState(false)
  const [msg, setMsg] = useState('')

  const save = async (): Promise<void> => {
    if (!viewRef.current) return
    const text = viewRef.current.state.doc.toString()
    try {
      await window.api.sftp.write(editor.tabId, editor.path, text)
      setDirty(false)
      setMsg('已保存')
      setTimeout(() => setMsg(''), 1500)
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  useEffect(() => {
    if (!hostRef.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: editor.content,
        extensions: [
          basicSetup,
          oneDark,
          ...langFor(editor.path),
          keymap.of([
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                void save()
                return true
              }
            }
          ]),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              setDirty(true)
              setContent(u.state.doc.toString())
            }
          })
        ]
      }),
      parent: hostRef.current
    })
    viewRef.current = view
    return () => view.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor.path])

  return (
    <div className="modal-mask">
      <div className="modal editor-modal">
        <div className="modal-head">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="fileCode" />
            编辑文件
            <span className="editor-head-path">{editor.path}</span>
            {dirty && <span style={{ color: '#d08a2e', fontSize: 11 }}>● 未保存</span>}
          </span>
          <span style={{ color: '#7a9a7a', fontSize: 11, marginLeft: 'auto', marginRight: 10 }}>{msg}</span>
          <button
            className="x"
            onClick={() => {
              if (dirty && !confirm('内容未保存，确定关闭？')) return
              setEditor(null)
            }}
          >
            ×
          </button>
        </div>
        <div className="editor-body" ref={hostRef} />
        <div className="modal-foot">
          <span style={{ marginRight: 'auto', color: '#999', fontSize: 11 }}>
            {content.split('\n').length} 行 · Ctrl+S 保存
          </span>
          <button className="btn primary" onClick={() => void save()}>
            保存
          </button>
          <button
            className="btn"
            onClick={() => {
              if (dirty && !confirm('内容未保存，确定关闭？')) return
              setEditor(null)
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
