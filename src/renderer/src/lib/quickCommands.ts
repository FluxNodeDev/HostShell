import type { QuickGroup } from '../types'

/** 默认快捷命令分组（用户修改后整体写入 config.cmd_groups） */
export const DEFAULT_GROUPS: QuickGroup[] = [
  {
    id: 'sys',
    name: '系统',
    items: [
      { id: 'os', name: '系统版本', cmd: 'cat /etc/os-release' },
      { id: 'uname', name: '内核信息', cmd: 'uname -a' },
      { id: 'uptime', name: '运行时间', cmd: 'uptime' },
      { id: 'who', name: '当前登录', cmd: 'who && id' },
      { id: 'free', name: '内存使用', cmd: 'free -h' },
      { id: 'topcpu', name: 'CPU 前 10', cmd: 'ps aux --sort=-%cpu | head -11' },
      { id: 'topmem', name: '内存前 10', cmd: 'ps aux --sort=-%mem | head -11' },
      { id: 'dmesg', name: '内核日志', cmd: 'dmesg | tail -50' }
    ]
  },
  {
    id: 'disk',
    name: '磁盘',
    items: [
      { id: 'df', name: '磁盘使用', cmd: 'df -h' },
      { id: 'dfi', name: 'inode 使用', cmd: 'df -i' },
      { id: 'du1', name: '当前目录大小', cmd: 'du -sh .' },
      { id: 'du2', name: '一级目录大小', cmd: 'du -sh * 2>/dev/null | sort -hr | head -20' },
      {
        id: 'bigfile',
        name: '查找大文件',
        cmd: "find / -xdev -type f -size +{input:大小，如 100M} -exec ls -lh {} \\; 2>/dev/null | head -20"
      },
      { id: 'mount', name: '挂载信息', cmd: 'mount | column -t' }
    ]
  },
  {
    id: 'net',
    name: '网络',
    items: [
      { id: 'ss', name: '监听端口', cmd: 'ss -tunlp' },
      { id: 'ip', name: '网卡地址', cmd: 'ip addr' },
      { id: 'ping', name: 'Ping 主机', cmd: 'ping -c 4 {host}' },
      { id: 'trace', name: '路由追踪', cmd: 'traceroute -n {host}' },
      { id: 'conn', name: '连接统计', cmd: 'ss -s' },
      { id: 'curl', name: 'HTTP 头', cmd: 'curl -I {input:URL}' },
      { id: 'tcpdump', name: '抓包 20 个', cmd: 'tcpdump -i any -n port {input:端口} -c 20' }
    ]
  },
  {
    id: 'docker',
    name: 'Docker',
    items: [
      { id: 'ps', name: '容器列表', cmd: 'docker ps -a' },
      { id: 'images', name: '镜像列表', cmd: 'docker images' },
      { id: 'logs', name: '容器日志', cmd: 'docker logs --tail 200 -f {input:容器名}' },
      { id: 'stats', name: '资源占用', cmd: 'docker stats --no-stream' },
      { id: 'exec', name: '进入容器', cmd: 'docker exec -it {input:容器名} bash' },
      { id: 'compose', name: 'Compose 状态', cmd: 'docker compose ps' }
    ]
  },
  {
    id: 'svc',
    name: '服务',
    items: [
      { id: 'status', name: '服务状态', cmd: 'systemctl status {input:服务名} --no-pager' },
      { id: 'restart', name: '重启服务', cmd: 'systemctl restart {input:服务名}' },
      { id: 'journal', name: '最近日志', cmd: 'journalctl -xe --no-pager | tail -50' },
      { id: 'enable', name: '开机自启', cmd: 'systemctl enable {input:服务名}' },
      { id: 'units', name: '运行中的服务', cmd: 'systemctl list-units --type=service --state=running' }
    ]
  },
  {
    id: 'custom',
    name: '自定义',
    items: []
  }
]

export interface CmdContext {
  host: string
  user: string
  path: string
}

/** 替换 {host}/{user}/{path}，并返回第一个待输入的 {input:提示} */
export function resolveTemplate(
  cmd: string,
  ctx: CmdContext
): { text: string; prompt: string | null } {
  const text = cmd
    .replace(/\{host\}/g, ctx.host || '')
    .replace(/\{user\}/g, ctx.user || '')
    .replace(/\{path\}/g, ctx.path || '/')
  const m = text.match(/\{input:([^}]*)\}/)
  return { text, prompt: m ? m[1] : null }
}

export function applyInput(text: string, value: string): string {
  return text.replace(/\{input:[^}]*\}/g, value)
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
