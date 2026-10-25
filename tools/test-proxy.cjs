/* 本地 HTTP CONNECT 代理，用于验证 HostShell 的 SSH 代理链路
 * 用法：node tools/test-proxy.cjs [port]
 */
const net = require('node:net')

const PORT = Number(process.argv[2] || 3128)

const server = net.createServer((client) => {
  let buf = Buffer.alloc(0)
  let done = false
  const onData = (d) => {
    if (done) return
    buf = Buffer.concat([buf, d])
    const idx = buf.indexOf('\r\n\r\n')
    if (idx < 0) return
    done = true
    client.removeListener('data', onData)
    const head = buf.subarray(0, idx).toString('latin1')
    const rest = buf.subarray(idx + 4)
    const m = head.match(/^CONNECT\s+([^:\s]+):(\d+)/i)
    if (!m) {
      client.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      return
    }
    const host = m[1]
    const port = Number(m[2])
    console.log(`[proxy] CONNECT ${host}:${port}`)
    const upstream = net.connect(port, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (rest.length) upstream.write(rest)
      client.pipe(upstream).pipe(client)
    })
    upstream.on('error', (e) => {
      console.log(`[proxy] upstream error ${e.message}`)
      client.destroy()
    })
  }
  client.on('data', onData)
  client.on('error', () => undefined)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[proxy] listening 127.0.0.1:${PORT}`)
})
