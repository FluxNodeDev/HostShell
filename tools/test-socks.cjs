/* 本地 SOCKS5 代理（无认证），用于验证 HostShell 的 SOCKS5 链路
 * 用法：node tools/test-socks.cjs [port]
 */
const net = require('node:net')

const PORT = Number(process.argv[2] || 1080)

const server = net.createServer((client) => {
  let stage = 0 // 0 = 握手, 1 = 请求, 2 = 已建立
  let buf = Buffer.alloc(0)

  const onData = (d) => {
    if (stage === 2) return
    buf = Buffer.concat([buf, d])
    for (;;) {
      if (stage === 0) {
        if (buf.length < 2) return
        const n = buf[1]
        if (buf.length < 2 + n) return
        const methods = buf.subarray(2, 2 + n)
        buf = buf.subarray(2 + n)
        if (!methods.includes(0)) {
          client.end(Buffer.from([5, 0xff]))
          return
        }
        client.write(Buffer.from([5, 0]))
        stage = 1
        continue
      }
      if (stage === 1) {
        if (buf.length < 5) return
        const atyp = buf[3]
        let host = ''
        let port = 0
        let need = 0
        if (atyp === 1) {
          need = 10
          if (buf.length < need) return
          host = [...buf.subarray(4, 8)].join('.')
          port = buf.readUInt16BE(8)
        } else if (atyp === 3) {
          const len = buf[4]
          need = 5 + len + 2
          if (buf.length < need) return
          host = buf.subarray(5, 5 + len).toString()
          port = buf.readUInt16BE(5 + len)
        } else {
          client.end(Buffer.from([5, 8, 0, 1, 0, 0, 0, 0, 0, 0]))
          return
        }
        const rest = buf.subarray(need)
        buf = Buffer.alloc(0)
        stage = 2
        console.log(`[socks] CONNECT ${host}:${port}`)
        const upstream = net.connect(port, host, () => {
          client.write(Buffer.from([5, 0, 0, 1, 127, 0, 0, 1, 0, 0]))
          if (rest.length) upstream.write(rest)
          client.pipe(upstream).pipe(client)
        })
        upstream.on('error', (e) => {
          console.log(`[socks] upstream error ${e.message}`)
          client.destroy()
        })
        return
      }
    }
  }

  client.on('data', onData)
  client.on('error', () => undefined)
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[socks] listening 127.0.0.1:${PORT}`)
})
