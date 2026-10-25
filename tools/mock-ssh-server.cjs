/* 本地 Mock SSH 服务器：用于 HostShell 端到端联调与截图
 * 用法：node tools/mock-ssh-server.cjs [port]
 * 账号任意，密码任意。
 */
const { Server } = require('ssh2')
const { generateKeyPairSync } = require('node:crypto')
const { gzipSync, gunzipSync } = require('node:zlib')
const net = require('node:net')

const PORT = Number(process.argv[2] || process.env.MOCK_SSH_PORT || 2222)
const HOME = '/opt/teyes-staging'

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})

/* ---------------- 虚拟文件系统 ---------------- */
const VFS = new Map()
const T = 1792924900 // 2026-10-25 18:41 左右
const d = (p, mtime = T) => VFS.set(p, { isDir: true, size: 4096, mtime, mode: 0o040755 })
const f = (p, size, content = '', mtime = T) =>
  VFS.set(p, { isDir: false, size, content, mtime, mode: 0o100644 })

;['/', '/etc', '/etc/nginx', '/opt', HOME, '/root', '/var', '/var/log', '/var/log/nginx', '/home', '/usr', '/tmp'].forEach((p) => d(p))
d(HOME + '/clickhouse')
d(HOME + '/clickhouse/data')
f(HOME + '/clickhouse/config.xml', 118, '<clickhouse>\n  <path>/var/lib/clickhouse</path>\n  <listen_host>0.0.0.0</listen_host>\n</clickhouse>\n')
f(HOME + '/clickhouse/data/sample.csv', 32, 'id,name\n1,alpha\n2,beta\n')
d(HOME + '/e2e')
d(HOME + '/initdb')
d(HOME + '/releases')
d(HOME + '/secrets')
f(HOME + '/.env', 3266, 'CLICKHOUSE_USER=default\nCLICKHOUSE_PASSWORD=***\nKAFKA_BROKERS=kafka:9092\n')
f(HOME + '/ACCESS.txt', 972, '# 访问说明\n\nssh root@203.0.113.10 -p 22\n')
f(HOME + '/docker-compose.yml', 12480, 'services:\n  clickhouse:\n    image: clickhouse/clickhouse-server:24.8-alpine\n')
f(HOME + '/e2e.sh', 1240, '#!/bin/bash\nset -e\n')
f(HOME + '/kafka-topics.txt', 7450, 'clickhouse-events\nclickhouse-logs\n')
f(HOME + '/rollback.sh', 1400, '#!/bin/bash\n')
f(HOME + '/seed-demo.sh', 6930, '#!/bin/bash\n')
f(HOME + '/smoke.sh', 6120, '#!/bin/bash\n')
f('/etc/hosts', 221, '127.0.0.1 localhost\n203.0.113.10 mock-server\n')
f('/etc/os-release', 380, 'PRETTY_NAME="Ubuntu 22.04.4 LTS"\nVERSION="22.04.4 LTS (Jammy Jellyfish)"\nID=ubuntu\n')
f('/etc/nginx/nginx.conf', 1442, 'user nginx;\nworker_processes auto;\n')
f('/root/.bashrc', 3771, '# ~/.bashrc\n')
f('/root/README.md', 512, '# mock server\n')
f('/var/log/messages', 12000, 'Oct 25 18:00:00 mock systemd[1]: Started Session 1.\n')
f('/var/log/nginx/access.log', 90400, '10.0.0.1 - - [25/Oct/2026:18:00:00 +0800] "GET / HTTP/1.1" 200 612\n')
f('/tmp/a.txt', 12, 'hello world\n')

function childrenOf(p) {
  const prefix = p === '/' ? '/' : p + '/'
  const out = []
  for (const [path, node] of VFS) {
    if (path === p || !path.startsWith(prefix)) continue
    const rest = path.slice(prefix.length)
    if (!rest || rest.includes('/')) continue
    out.push({ path, name: rest, ...node })
  }
  return out.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name))
}

const pad = (s, n) => String(s).padEnd(n)

/* ---------------- tar.gz（内存实现，供打包传输联调） ---------------- */
function nodeBuffer(node) {
  if (!node) return Buffer.alloc(0)
  if (Buffer.isBuffer(node.content)) return node.content
  return Buffer.from(node.content || '', 'utf8')
}

function tarHeader(name, size, mode, mtime, isDir) {
  const h = Buffer.alloc(512, 0)
  h.write(name, 0, 100, 'utf8')
  h.write((mode & 0o777).toString(8).padStart(7, '0') + '\0', 100)
  h.write('0000000\0', 108)
  h.write('0000000\0', 116)
  h.write((isDir ? 0 : size).toString(8).padStart(11, '0') + '\0', 124)
  h.write(Math.floor(mtime || Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136)
  h.write('        ', 148)
  h.write(isDir ? '5' : '0', 156)
  h.write('ustar\0', 257)
  h.write('00', 263)
  h.write('root', 265)
  h.write('root', 297)
  let sum = 0
  for (let i = 0; i < 512; i++) sum += h[i]
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148)
  return h
}

function buildTar(rootPath) {
  const chunks = []
  const rootName = rootPath.split('/').filter(Boolean).pop() || 'root'
  const walk = (p, rel) => {
    const n = VFS.get(p)
    if (!n) return
    const isDir = !!n.isDir
    const content = isDir ? Buffer.alloc(0) : nodeBuffer(n)
    chunks.push(tarHeader(rel + (isDir ? '/' : ''), content.length, n.mode || 0o644, n.mtime, isDir))
    if (isDir) {
      for (const c of childrenOf(p)) walk(c.path, rel + '/' + c.name)
    } else {
      chunks.push(content)
      const padLen = (512 - (content.length % 512)) % 512
      if (padLen) chunks.push(Buffer.alloc(padLen))
    }
  }
  walk(rootPath, rootName)
  chunks.push(Buffer.alloc(1024))
  return gzipSync(Buffer.concat(chunks))
}

function extractTar(buf, destDir) {
  const raw = gunzipSync(buf)
  const base = destDir.replace(/\/+$/, '')
  const ensureDir = (p) => {
    const parts = p.split('/').filter(Boolean)
    let cur = ''
    for (const part of parts) {
      cur += '/' + part
      const n = VFS.get(cur)
      if (!n) VFS.set(cur, { isDir: true, size: 4096, mtime: Math.floor(Date.now() / 1000), mode: 0o040755 })
    }
  }
  let off = 0
  while (off + 512 <= raw.length) {
    const header = raw.subarray(off, off + 512)
    if (header.every((b) => b === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/, '')
    const size = parseInt(header.subarray(124, 136).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0
    const mode = parseInt(header.subarray(100, 108).toString('utf8').replace(/\0.*$/, '').trim(), 8) || 0o644
    const type = String.fromCharCode(header[156])
    const content = Buffer.from(raw.subarray(off + 512, off + 512 + size))
    off += 512 + Math.ceil(size / 512) * 512
    if (!name) continue
    const full = (base + '/' + name).replace(/\/+/g, '/').replace(/\/$/, '')
    if (type === '5') {
      ensureDir(full)
      VFS.set(full, { isDir: true, size: 4096, mtime: Math.floor(Date.now() / 1000), mode: 0o040755 })
    } else {
      ensureDir(full.split('/').slice(0, -1).join('/'))
      VFS.set(full, {
        isDir: false,
        size: content.length,
        content,
        mtime: Math.floor(Date.now() / 1000),
        mode: 0o100000 | (mode & 0o777)
      })
    }
  }
}

const unquote = (s) => s.replace(/^['"]|['"]$/g, '')
const permStr = (mode) => {
  let s = (mode & 0o170000) === 0o040000 ? 'd' : '-'
  for (let i = 0; i < 9; i++) s += (mode >> (8 - i)) & 1 ? 'rwxrwxrwx'[i] : '-'
  return s
}

function attrsOf(node, size) {
  return {
    mode: node ? node.mode : 0o100644,
    uid: 0,
    gid: 0,
    size: size != null ? size : node ? node.size : 0,
    atime: node ? node.mtime : T,
    mtime: node ? node.mtime : T
  }
}

function longName(name, node) {
  const date = new Date(node.mtime * 1000)
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getMonth()]
  const dd = String(date.getDate()).padStart(2, ' ')
  const hh = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  return `${permStr(node.mode)} 1 root root ${String(node.size).padStart(6)} ${mon} ${dd} ${hh} ${name}`
}

/* ---------------- 动态指标 ---------------- */
const stat = {
  jiffies: 987654321,
  idle: 812345678,
  rx: 128 * 1024 * 1024,
  tx: 42 * 1024 * 1024,
  t0: Date.now()
}

function metricsReply() {
  const now = Date.now()
  const dt = Math.max(1, (now - stat.t0) / 1000)
  stat.t0 = now
  const cpuPct = 30 + Math.random() * 40
  const totalDelta = Math.round(dt * 400)
  stat.jiffies += totalDelta
  stat.idle += Math.round(totalDelta * (1 - cpuPct / 100))
  const rxRate = (0.4 + Math.random() * 0.8) * 1024 * 1024
  const txRate = (0.05 + Math.random() * 0.35) * 1024 * 1024
  stat.rx += Math.round(rxRate * dt)
  stat.tx += Math.round(txRate * dt)
  const memTotal = 126779392
  const memAvail = Math.round(memTotal * (0.36 + Math.random() * 0.08))
  const procs = [
    ['1841', 'root', 46.6, 693, 1420000, 'java'],
    ['2107', 'root', 21.5, 391, 981000, 'syncing'],
    ['3355', 'root', 3.4, 129, 256000, 'go'],
    ['4102', 'root', 0.3, 12, 143000, 'top'],
    ['2210', 'root', 1.1, 88, 188000, 'containerd'],
    ['1180', 'root', 0.1, 22, 96000, 'sshd'],
    ['992', 'root', 0.2, 41, 78000, 'dockerd'],
    ['3301', 'root', 0.7, 9, 42000, 'nginx'],
    ['1842', 'root', 32.1, 210, 640000, 'clickhouse'],
    ['4410', 'root', 0.0, 5, 21000, 'bash']
  ]
  return [
    '@@@STAT',
    `cpu  ${stat.jiffies} 2345 45678 ${stat.idle} 3456 0 2345 0 0 0`,
    '@@@MEM',
    `MemTotal:       ${memTotal} kB`,
    `MemAvailable:   ${memAvail} kB`,
    `MemFree:        ${Math.round(memAvail * 0.2)} kB`,
    'SwapTotal:      0 kB',
    'SwapFree:       0 kB',
    '@@@LOAD',
    `${(0.3 + Math.random() * 3).toFixed(2)} 2.62 2.40 3/812 5678`,
    '@@@UPTIME',
    '18144000.12 12345.67',
    '@@@NET',
    'Inter-|   Receive                                                |  Transmit',
    ' face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed',
    `    lo: 1234567 1234 0 0 0 0 0 0 1234567 1234 0 0 0 0 0 0`,
    `  eth0: ${stat.rx} 998877 0 0 0 0 0 0 ${stat.tx} 776655 0 0 0 0 0 0`,
    '@@@DISK',
    'Filesystem     1024-blocks      Used Available Capacity Mounted on',
    'overlay          25165312  12345678  12819634      50% /',
    'tmpfs              6553600         0   6553600       0% /dev',
    'shm                6553600      1234   6552378       1% /dev/shm',
    'tmpfs             25165312     12000  25153312       1% /run',
    '/dev/sda1          983040    245760    737280      25% /etc/hosts',
    'tmpfs              6553600         0   6553600       0% /sys/fs/cgroup',
    'tmpfs              1310720       128   1310592       1% /run/user/0',
    '@@@PROC',
    '  PID USER     %CPU %MEM   RSS COMMAND',
    ...procs.map((p) => `${String(p[0]).padStart(5)} ${pad(p[1], 8)} ${String(p[2]).padStart(4)} ${String(p[3]).padStart(4)} ${String(p[4]).padStart(6)} ${p[5]}`),
    '@@@END'
  ].join('\n')
}

const PROC_ROWS = [
  [1841, 'root', 46.6, 0.6, 1420000, '12:31', 'java -XX:MaxRAMPercentage=75 -jar /opt/app/teyes-identity.jar'],
  [2107, 'root', 21.5, 0.3, 981000, '1-02:15:30', 'syncing --config /opt/app/config.yml'],
  [1842, 'root', 32.1, 0.2, 640000, '12:30', '/usr/bin/clickhouse-server --config-file=/etc/clickhouse-server/config.xml'],
  [3355, 'root', 3.4, 0.1, 256000, '05:12', 'go run ./cmd/server'],
  [4102, 'root', 0.3, 0.0, 143000, '00:42', 'top'],
  [2210, 'root', 1.1, 0.1, 188000, '1-02:15:30', '/usr/bin/containerd'],
  [1180, 'root', 0.1, 0.0, 96000, '2-04:10:02', 'sshd: root@pts/0'],
  [992, 'root', 0.2, 0.0, 78000, '3-11:20:11', '/usr/bin/dockerd -H fd://'],
  [3301, 'root', 0.7, 0.0, 42000, '05:10', 'nginx: worker process'],
  [4410, 'root', 0.0, 0.0, 21000, '00:03', '-bash'],
  [1201, 'root', 0.0, 0.0, 18000, '2-04:10:02', '/usr/sbin/cron -f'],
  [1202, 'root', 0.4, 0.0, 32000, '2-04:10:02', '/usr/sbin/rsyslogd -n'],
  [2150, 'root', 0.0, 0.0, 15000, '1-02:15:30', 'kafka-server-start.sh /opt/kafka/config/server.properties'],
  [2151, 'root', 12.3, 0.2, 512000, '1-02:15:30', '/opt/kafka/bin/kafka-server-start.sh'],
  [3401, 'postgres', 0.2, 0.1, 89000, '05:12', 'postgres: checkpointer'],
  [3402, 'postgres', 0.1, 0.2, 106000, '05:12', 'postgres: walwriter'],
  [3501, 'redis', 0.3, 0.1, 72000, '05:11', 'redis-server *:6379'],
  [3601, 'root', 0.0, 0.0, 12000, '00:42', 'ps -eo pid,user,pcpu,pmem,rss,etime,args'],
  [1010, 'root', 0.0, 0.0, 8000, '3-11:20:11', '/sbin/init'],
  [1011, 'root', 0.0, 0.0, 9000, '3-11:20:11', '/lib/systemd/systemd-journald'],
  [1012, 'root', 0.0, 0.0, 7000, '3-11:20:11', '/lib/systemd/systemd-udevd'],
  [1013, 'root', 0.0, 0.0, 6500, '3-11:20:11', '/lib/systemd/systemd-logind'],
  [1014, 'messagebus', 0.0, 0.0, 6800, '3-11:20:11', '/usr/bin/dbus-daemon --system'],
  [4411, 'root', 0.0, 0.0, 6000, '00:10', 'tail -f /var/log/messages'],
  [4412, 'root', 0.0, 0.0, 5800, '00:02', 'vi /etc/nginx/nginx.conf']
]

function psListReply() {
  return PROC_ROWS.map(
    (r) =>
      `${String(r[0]).padStart(6)} ${String(r[1]).padEnd(9)} ${String(r[2]).padStart(4)} ${String(r[3]).padStart(4)} ${String(r[4]).padStart(7)} ${String(r[5]).padStart(10)} ${r[6]}`
  ).join('\n')
}

function procDetailReply(pid) {
  const row = PROC_ROWS.find((r) => String(r[0]) === String(pid)) || PROC_ROWS[0]
  return [
    '@@@ARGS',
    row[6],
    '@@@EXE',
    row[6].startsWith('/') ? row[6].split(' ')[0] : '/usr/bin/' + row[6].split(' ')[0],
    '@@@CWD',
    '/opt/teyes-staging',
    '@@@ENV',
    'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    'HOME=/root',
    'LANG=C.UTF-8',
    'SHELL=/bin/bash',
    'PWD=/opt/teyes-staging',
    'JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64',
    'HOSTNAME=mock-server',
    '@@@END'
  ].join('\n')
}

function pingReply(cmd) {
  const m = cmd.match(/ping\s+-c\s+\d+\s+-W\s+\d+\s+'?([^'\s]+)'?/)
  const target = m ? m[1] : '127.0.0.1'
  const local = target === '127.0.0.1'
  const loss = local ? 0 : Math.random() < 0.06 ? 33 : 0
  const base = local ? 0.05 : 12 + Math.random() * 160
  const recv = loss ? 2 : 3
  return [
    `PING ${target} (${target}) 56(84) bytes of data.`,
    `64 bytes from ${target}: icmp_seq=1 ttl=54 time=${base.toFixed(1)} ms`,
    `64 bytes from ${target}: icmp_seq=2 ttl=54 time=${(base * 1.1).toFixed(1)} ms`,
    loss ? '' : `64 bytes from ${target}: icmp_seq=3 ttl=54 time=${(base * 0.95).toFixed(1)} ms`,
    '',
    `--- ${target} ping statistics ---`,
    `3 packets transmitted, ${recv} received, ${loss}% packet loss, time 2003ms`,
    `rtt min/avg/max/mdev = ${(base * 0.8).toFixed(3)}/${(base * 0.95).toFixed(3)}/${(base * 1.2).toFixed(3)}/0.010 ms`
  ]
    .filter((x) => x !== '')
    .join('\n')
}

function sysinfoReply() {
  return [
    '@@@OS',
    'PRETTY_NAME="Ubuntu 22.04.4 LTS"',
    'VERSION="22.04.4 LTS (Jammy Jellyfish)"',
    '@@@KERNEL',
    'Linux 5.15.0-101-generic',
    '@@@HOST',
    'mock-server',
    '@@@CPU',
    'Intel(R) Xeon(R) Platinum 8269CY CPU @ 2.50GHz',
    '@@@CORES',
    '8',
    '@@@MEM',
    'MemTotal:       126779392 kB',
    'SwapTotal:      0 kB',
    '@@@ARCH',
    'x86_64',
    '@@@END'
  ].join('\n')
}

/* ---------------- 交互 shell ---------------- */
function ansi(code, s) {
  return `\x1b[${code}m${s}\x1b[0m`
}

function banner() {
  return [
    'Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-101-generic x86_64)',
    '',
    ' * Documentation:  https://help.ubuntu.com',
    ' * Management:     https://landscape.canonical.com',
    ' * Support:        https://ubuntu.com/advantage',
    '',
    '  System information as of Sun Oct 25 18:42:11 CST 2026',
    '',
    '  System load:  2.62               Processes:             812',
    '  Usage of /:   49.1% of 24.00GB   Users logged in:       1',
    '  Memory usage: 61%                IPv4 address for eth0: 203.0.113.10',
    '  Swap usage:   0%',
    '',
    '0 updates can be applied immediately.',
    '',
    'Last login: Sun Oct 25 18:40:02 2026 from 112.64.68.1',
    ''
  ].join('\r\n')
}

function dockerPs() {
  const rows = [
    ['a0fa525cf720', 'teyes/identity:75bbd8097f', '"java -XX:MaxRAMPer..."', '25 minutes ago', 'Up 25 minutes (healthy)', '0.0.0.0:8080->8080/tcp'],
    ['1eb8b3c4b8eb', 'redis:7-alpine', '"docker-entrypoint.s..."', '42 minutes ago', 'Up 42 minutes', '6379/tcp'],
    ['a1e9a8b12810', 'apache/kafka:4.1.0', '"/etc/kafka/docker/..."', '42 minutes ago', 'Up 42 minutes (healthy)', '9092/tcp, 9093/tcp'],
    ['7b052b50222e', 'clickhouse/clickhouse-server:24.8-alpine', '"/entrypoint.sh"', 'About an hour ago', 'Up About an hour (healthy)', '8123/tcp, 9000/tcp'],
    ['56a85656cbeb', 'teyes/identity:75bbd8097f', '"java -XX:MaxRAMPer..."', 'About an hour ago', 'Up About an hour', '0.0.0.0:8081->8080/tcp'],
    ['f6b5424cf1d1', 'postgres:16-alpine', '"docker-entrypoint.s..."', '7 seconds ago', 'Up 7 seconds', '5432/tcp']
  ]
  const head = `${pad('CONTAINER ID', 14)}${pad('IMAGE', 52)}${pad('COMMAND', 26)}${pad('CREATED', 20)}${pad('STATUS', 28)}PORTS`
  const body = rows
    .map(
      (r) =>
        `${r[0]}   ${pad(r[1], 44)}${pad(r[2], 26)}${pad(r[3], 20)}${pad(r[4], 28)}${r[5]}`
    )
    .join('\r\n')
  return head + '\r\n' + body
}

function startShell(stream) {
  const state = { cwd: HOME, buf: '' }
  const prompt = () => {
    stream.write(
      `${ansi('01;32', 'root@mock-server')}:${ansi('01;34', state.cwd)}# `
    )
  }

  const run = (line) => {
    const [cmd, ...args] = line.trim().split(/\s+/)
    const out = []
    switch (cmd) {
      case '':
        break
      case 'pwd':
        out.push(state.cwd)
        break
      case 'whoami':
        out.push('root')
        break
      case 'hostname':
        out.push('mock-server')
        break
      case 'uname':
        out.push('Linux mock-server 5.15.0-101-generic #111-Ubuntu SMP x86_64 GNU/Linux')
        break
      case 'cd': {
        const target = args[0] || '/root'
        const next = target.startsWith('/') ? target : state.cwd.replace(/\/$/, '') + '/' + target
        if (VFS.has(next) && VFS.get(next).isDir) state.cwd = next
        else out.push(`bash: cd: ${target}: No such file or directory`)
        break
      }
      case 'ls': {
        const long = args.some((a) => a.startsWith('-') && /l/.test(a))
        const items = childrenOf(state.cwd)
        if (long) {
          out.push(`total ${items.length * 4}`)
          out.push('drwxr-xr-x 1 root root 4096 Oct 25 18:42 .')
          out.push('drwxr-xr-x 1 root root 4096 Oct 20 09:11 ..')
          items.forEach((it) =>
            out.push(
              `${permStr(it.mode)} 1 root root ${String(it.size).padStart(5)} Oct 25 18:42 ${
                it.isDir ? ansi('01;34', it.name) : it.mode & 0o111 ? ansi('01;32', it.name) : it.name
              }`
            )
          )
        } else {
          out.push(
            items
              .map((it) => (it.isDir ? ansi('01;34', it.name) : it.mode & 0o111 ? ansi('01;32', it.name) : it.name))
              .join('   ')
          )
        }
        break
      }
      case 'df':
        out.push('Filesystem      Size  Used Avail Use% Mounted on')
        out.push('overlay          24G   12G   12G  50% /')
        out.push('tmpfs           6.3G     0  6.3G   0% /dev')
        out.push('tmpfs           6.3G   12K  6.3G   1% /run')
        break
      case 'free':
        out.push('               total        used        free      shared  buff/cache   available')
        out.push('Mem:          123.8G       48.6G       11.2G        1.1G       64.0G       74.2G')
        out.push('Swap:             0B          0B          0B')
        break
      case 'ps':
        out.push('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND')
        out.push('root      1841 46.6  0.6 8123456 1420000 ?     Sl   18:00  12:31 java -XX:MaxRAMPercentage=75')
        out.push('root      2107 21.5  0.3 3123456 981000 ?      Ssl  18:00   5:02 syncing --config /opt/app.yml')
        out.push('root      3355  3.4  0.1 1123456 256000 ?      Ssl  18:00   0:41 go run ./cmd/server')
        break
      case 'docker':
        if (args[0] === 'ps') {
          out.push(dockerPs())
        } else if (args[0] === 'images') {
          out.push('REPOSITORY                              TAG          IMAGE ID       CREATED       SIZE')
          out.push('teyes/identity                          75bbd8097f   c9f2a1b7d1e2   2 weeks ago   512MB')
        } else {
          out.push('Usage: docker [OPTIONS] COMMAND')
        }
        break
      case 'cat':
        if (args[0] && VFS.has(args[0])) {
          const n = VFS.get(args[0])
          out.push(n.isDir ? `cat: ${args[0]}: Is a directory` : nodeBuffer(n).toString('utf8'))
        } else out.push(`cat: ${args[0] || ''}: No such file or directory`)
        break
      case 'clear':
        stream.write('\x1b[2J\x1b[H')
        break
      case 'exit':
        stream.write('logout\r\n')
        stream.exit(0)
        stream.end()
        return
      case 'echo':
        out.push(args.join(' '))
        break
      default:
        out.push(`bash: ${cmd}: command not found`)
    }
    if (out.length) stream.write(out.join('\n').replace(/\n/g, '\r\n') + '\r\n')
    prompt()
  }

  stream.write(banner())
  prompt()

  // 演示：连接后自动展示一条 docker ps 输出
  setTimeout(() => {
    const line = 'docker ps -a'
    stream.write(line)
    stream.write('\r\n')
    run(line)
  }, 500)

  stream.on('data', (chunk) => {
    const text = chunk.toString('utf8')
    for (const ch of text) {
      if (ch === '\r' || ch === '\n') {
        stream.write('\r\n')
        run(state.buf)
        state.buf = ''
      } else if (ch === '\x7f' || ch === '\b') {
        if (state.buf) {
          state.buf = state.buf.slice(0, -1)
          stream.write('\b \b')
        }
      } else if (ch === '\x03') {
        stream.write('^C\r\n')
        state.buf = ''
        prompt()
      } else if (ch === '\t') {
        // 简单补全忽略
      } else if (ch >= ' ') {
        state.buf += ch
        stream.write(ch)
      }
    }
  })
}

/* ---------------- SFTP ---------------- */
function startSftp(sftp) {
  const handles = new Map()
  let seq = 1
  const mkHandle = (obj) => {
    const h = Buffer.alloc(4)
    h.writeUInt32BE(seq, 0)
    handles.set(seq, obj)
    seq++
    return h
  }

  sftp.on('REALPATH', (reqid, path) => {
    let p = path === '.' || path === '' ? HOME : path
    if (!p.startsWith('/')) p = '/' + p
    const node = VFS.get(p) || { isDir: true, mode: 0o040755, size: 4096, mtime: T }
    sftp.name(reqid, [{ filename: p, longname: p, attrs: attrsOf(node) }])
  })

  sftp.on('STAT', (reqid, path) => {
    const node = VFS.get(path)
    if (!node) return sftp.status(reqid, 2)
    sftp.attrs(reqid, attrsOf(node))
  })

  sftp.on('LSTAT', (reqid, path) => {
    const node = VFS.get(path)
    if (!node) return sftp.status(reqid, 2)
    sftp.attrs(reqid, attrsOf(node))
  })

  sftp.on('OPENDIR', (reqid, path) => {
    const node = VFS.get(path)
    if (!node || !node.isDir) return sftp.status(reqid, 2)
    sftp.handle(reqid, mkHandle({ type: 'dir', path, sent: false }))
  })

  sftp.on('READDIR', (reqid, handle) => {
    const h = handles.get(handle.readUInt32BE(0))
    if (!h || h.type !== 'dir') return sftp.status(reqid, 4)
    if (h.sent) return sftp.status(reqid, 1)
    h.sent = true
    const list = childrenOf(h.path).map((it) => ({
      filename: it.name,
      longname: longName(it.name, it),
      attrs: attrsOf(it)
    }))
    sftp.name(reqid, list.length ? list : [])
  })

  sftp.on('OPEN', (reqid, filename, flags) => {
    let node = VFS.get(filename)
    const write = !!(flags & 0x02) || !!(flags & 0x04)
    if (!node && !write) return sftp.status(reqid, 2)
    if (!node) {
      node = { isDir: false, size: 0, content: '', mtime: T, mode: 0o100644 }
      VFS.set(filename, node)
    }
    sftp.handle(reqid, mkHandle({ type: 'file', path: filename, buf: nodeBuffer(node) }))
  })

  sftp.on('READ', (reqid, handle, offset, length) => {
    const h = handles.get(handle.readUInt32BE(0))
    if (!h || h.type !== 'file') return sftp.status(reqid, 4)
    if (offset >= h.buf.length) return sftp.status(reqid, 1)
    sftp.data(reqid, h.buf.subarray(offset, Math.min(h.buf.length, offset + length)))
  })

  sftp.on('WRITE', (reqid, handle, offset, data) => {
    const h = handles.get(handle.readUInt32BE(0))
    if (!h || h.type !== 'file') return sftp.status(reqid, 4)
    const need = offset + data.length
    if (h.buf.length < need) {
      const nb = Buffer.alloc(need)
      h.buf.copy(nb)
      h.buf = nb
    }
    data.copy(h.buf, offset)
    const node = VFS.get(h.path)
    if (node) {
      node.content = Buffer.from(h.buf)
      node.size = h.buf.length
    }
    sftp.status(reqid, 0)
  })

  sftp.on('CLOSE', (reqid, handle) => {
    handles.delete(handle.readUInt32BE(0))
    sftp.status(reqid, 0)
  })

  sftp.on('FSTAT', (reqid, handle) => {
    const h = handles.get(handle.readUInt32BE(0))
    if (!h) return sftp.status(reqid, 4)
    const node = VFS.get(h.path) || { mode: 0o100644, size: h.buf ? h.buf.length : 0, mtime: T }
    sftp.attrs(reqid, attrsOf(node))
  })

  sftp.on('MKDIR', (reqid, path) => {
    if (VFS.has(path)) return sftp.status(reqid, 4)
    d(path)
    sftp.status(reqid, 0)
  })

  sftp.on('RMDIR', (reqid, path) => {
    VFS.delete(path)
    sftp.status(reqid, 0)
  })

  sftp.on('REMOVE', (reqid, path) => {
    VFS.delete(path)
    sftp.status(reqid, 0)
  })

  sftp.on('RENAME', (reqid, from, to) => {
    const n = VFS.get(from)
    if (!n) return sftp.status(reqid, 2)
    VFS.delete(from)
    VFS.set(to, n)
    sftp.status(reqid, 0)
  })

  sftp.on('SETSTAT', (reqid, path, attrs) => {
    const n = VFS.get(path)
    if (n && attrs && attrs.mode != null) n.mode = attrs.mode
    sftp.status(reqid, 0)
  })
}

/* ---------------- 服务器 ---------------- */
const server = new Server({ hostKeys: [privateKey] }, (client) => {
  client.on('authentication', (ctx) => {
    if (ctx.method === 'password' || ctx.method === 'keyboard-interactive') return ctx.accept()
    ctx.reject(['password', 'keyboard-interactive'])
  })

  client.on('ready', () => {
    // direct-tcpip：本地端口转发（ssh -L）
    client.on('tcpip', (accept, reject, info) => {
      const stream = accept()
      const sock = net.connect(info.destPort, info.destIP, () => {
        sock.pipe(stream).pipe(sock)
      })
      sock.on('error', () => {
        try {
          stream.close()
        } catch {
          /* ignore */
        }
      })
      stream.on('error', () => sock.destroy())
      sock.on('close', () => {
        try {
          stream.close()
        } catch {
          /* ignore */
        }
      })
    })

    client.on('session', (accept) => {
      const session = accept()
      session.on('pty', (a) => a && a())
      session.on('window-change', (a) => a && a())
      session.on('env', (a) => a && a())

      session.on('shell', (accept) => startShell(accept()))

      session.on('exec', (accept, reject, info) => {
        const stream = accept()
        const cmd = info.command || ''
        let out = ''
        if (cmd.includes('@@@STAT')) out = metricsReply()
        else if (cmd.includes('@@@OS')) out = sysinfoReply()
        else if (cmd.includes('@@@ARGS')) {
          const m = cmd.match(/ps -o args= -p (\d+)/)
          out = procDetailReply(m ? m[1] : 0)
        } else if (cmd.includes('pid=,user=,pcpu=,pmem=,rss=,etime=,args=')) out = psListReply()
        else if (/tar\s+czf\s/.test(cmd)) {
          const m = cmd.match(/tar\s+czf\s+('[^']*'|\S+)\s+-C\s+('[^']*'|\S+)\s+('[^']*'|\S+)/)
          if (!m) out = 'EXIT:2'
          else {
            const tmp = unquote(m[1])
            const dir = unquote(m[2])
            const name = unquote(m[3])
            const src = (dir.replace(/\/+$/, '') + '/' + name).replace(/\/+/g, '/')
            if (!VFS.has(src)) {
              out = `tar: ${name}: Cannot stat: No such file or directory\nEXIT:2`
            } else {
              const buf = buildTar(src)
              VFS.set(tmp, {
                isDir: false,
                size: buf.length,
                content: buf,
                mtime: Math.floor(Date.now() / 1000),
                mode: 0o100644
              })
              out = 'EXIT:0'
            }
          }
        } else if (/tar\s+xzf\s/.test(cmd)) {
          const m = cmd.match(/tar\s+xzf\s+('[^']*'|\S+)\s+-C\s+('[^']*'|\S+)/)
          if (!m) out = 'EXIT:2'
          else {
            const tmp = unquote(m[1])
            const dir = unquote(m[2])
            const node = VFS.get(tmp)
            if (!node) out = `tar: ${tmp}: Cannot open: No such file or directory\nEXIT:2`
            else {
              try {
                extractTar(nodeBuffer(node), dir)
                out = 'EXIT:0'
              } catch (e) {
                out = `tar: ${e.message}\nEXIT:2`
              }
            }
          }
        } else if (/^rm -f\s/.test(cmd.trim())) {
          const m = cmd.match(/rm -f\s+('[^']*'|\S+)/)
          if (m) VFS.delete(unquote(m[1]))
          out = ''
        } else if (/^ping\s/.test(cmd.trim())) out = pingReply(cmd)
        else if (/^kill\s/.test(cmd.trim())) out = 'EXIT:0'
        else if (cmd.trim() === 'pwd') out = HOME
        else out = ''
        stream.write(out)
        stream.exit(0)
        stream.end()
      })

      session.on('sftp', (accept) => startSftp(accept()))
    })
  })

  client.on('error', () => {})
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mock-ssh] listening on 127.0.0.1:${PORT} (user root / any password)`)
})
