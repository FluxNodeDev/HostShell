/* 通过 CDP 驱动 HostShell 渲染层（需以 --remote-debugging-port=9222 启动）
 *
 * 用法：
 *   node tools/cdp.mjs eval "<js 表达式>"
 *   node tools/cdp.mjs click "<css 选择器>"
 *   node tools/cdp.mjs key "F9"
 *   node tools/cdp.mjs shot <输出文件>
 */
const PORT = process.env.CDP_PORT || 9222

async function pageTarget() {
  for (let i = 0; i < 30; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
      if (page) return page
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('CDP: 找不到页面目标，请确认以 --remote-debugging-port=9222 启动')
}

async function connect() {
  const page = await pageTarget()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  return { ws, send }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const { ws, send } = await connect()

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    })
    if (r.result?.exceptionDetails) {
      console.error('JS 异常:', r.result.exceptionDetails.text)
      process.exitCode = 1
      return undefined
    }
    return r.result?.result?.value
  }

  try {
    if (cmd === 'eval') {
      const v = await evaluate(rest.join(' '))
      console.log(typeof v === 'string' ? v : JSON.stringify(v))
    } else if (cmd === 'click') {
      const sel = rest[0]
      const ok = await evaluate(
        `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'NOT_FOUND'; el.click(); return 'OK'; })()`
      )
      console.log(ok)
    } else if (cmd === 'key') {
      const key = rest[0]
      const ok = await evaluate(
        `(() => {
          const opts = { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true };
          window.dispatchEvent(new KeyboardEvent('keydown', opts));
          window.dispatchEvent(new KeyboardEvent('keyup', opts));
          return 'OK';
        })()`
      )
      console.log(ok)
    } else if (cmd === 'drag') {
      const [x, y, filesArg] = rest
      const files = (filesArg || '').split(',').filter(Boolean)
      const data = { items: [], files, dragOperationsMask: 1 }
      const base = { x: Number(x), y: Number(y), data }
      await send('Input.dispatchDragEvent', { type: 'dragEnter', ...base })
      await new Promise((r) => setTimeout(r, 120))
      await send('Input.dispatchDragEvent', { type: 'dragOver', ...base })
      await new Promise((r) => setTimeout(r, 120))
      await send('Input.dispatchDragEvent', { type: 'drop', ...base })
      console.log('dragged ' + files.length + ' file(s)')
    } else if (cmd === 'dragenter') {
      const [x, y, filesArg] = rest
      const files = (filesArg || '').split(',').filter(Boolean)
      const data = { items: [], files, dragOperationsMask: 1 }
      const base = { x: Number(x), y: Number(y), data }
      await send('Input.dispatchDragEvent', { type: 'dragEnter', ...base })
      await new Promise((r) => setTimeout(r, 120))
      await send('Input.dispatchDragEvent', { type: 'dragOver', ...base })
      console.log('drag hovering')
    } else if (cmd === 'eval-shot') {
      // 先执行 JS（不等待 Promise），稍后截图，用于抓瞬时 UI
      const [out, ...jsParts] = rest
      await evaluate(jsParts.join(' '))
      await new Promise((r) => setTimeout(r, 250))
      const r = await send('Page.captureScreenshot', { format: 'png' })
      const fs = await import('node:fs')
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'))
      console.log('saved ' + out)
    } else if (cmd === 'shot') {
      const out = rest[0]
      const r = await send('Page.captureScreenshot', { format: 'png' })
      const fs = await import('node:fs')
      fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'))
      console.log('saved ' + out)
    } else {
      console.log('用法: eval|click|key|shot')
      process.exitCode = 2
    }
  } finally {
    ws.close()
  }
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
