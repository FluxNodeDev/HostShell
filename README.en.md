# HostShell

[![Release](https://img.shields.io/github/v/release/FluxNodeDev/HostShell?color=0d9488)](https://github.com/FluxNodeDev/HostShell/releases)
[![License](https://img.shields.io/github/license/FluxNodeDev/HostShell?color=0d9488)](LICENSE)
[![CI](https://github.com/FluxNodeDev/HostShell/actions/workflows/ci.yml/badge.svg)](https://github.com/FluxNodeDev/HostShell/actions/workflows/ci.yml)
[![Downloads](https://img.shields.io/github/downloads/FluxNodeDev/HostShell/total?color=0d9488)](https://github.com/FluxNodeDev/HostShell/releases)
[![Stars](https://img.shields.io/github/stars/FluxNodeDev/HostShell?style=social)](https://github.com/FluxNodeDev/HostShell/stargazers)

[中文](README.md) · **English** · [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Deutsch](docs/i18n/README.de.md) · [Français](docs/i18n/README.fr.md) · [Español](docs/i18n/README.es.md) · [Русский](docs/i18n/README.ru.md) · [Português](docs/i18n/README.pt-BR.md)

An all-in-one server workbench: SSH terminal, SFTP file manager, live metrics, tunnels and Zmodem — in a single window.
No account, no cloud sync: connection configs stay on your machine.

## Why HostShell

- **Stop switching between four tools** — terminal, file panel, metrics and tunnels live in one window; the SFTP panel follows your `cd`
- **Agent-free metrics** — CPU / memory / disk / network / processes collected from `/proc` in a single `exec`
- **Local-first** — no account system, no upload; passwords encrypted with the OS keychain via `safeStorage`
- **Three platforms, nine languages** — Windows installer, macOS dmg, Linux AppImage & deb
- **Small and fast** — 72 MB installer, under a second cold start
- **MIT, no pro edition** — no activation, no paywall, no telemetry

> Open source (MIT), local-first. The UI uses a left icon rail with a card-style terminal, so modules such as Redis / SQL management and AI assistance can be added to the same shell later.

![HostShell](docs/shots/app-final.png)

| | |
|---|---|
| ![Editor](docs/shots/editor.png) | ![Themes](docs/shots/themes.png) |
| ![Split view](docs/shots/split.png) | ![Multi-location ping](docs/shots/multiping.png) |
| ![System info](docs/shots/sysinfo.png) | ![Process manager](docs/shots/procmgr.png) |
| ![Settings](docs/shots/settings-general.png) | ![Installer](docs/shots/installer.png) |

## Features

| Module | Capability |
|---|---|
| Connections | Tree groups, drag to regroup, multi-select, batch open/delete, import from JSON, passwords protected by OS keychain |
| Terminal | Tabs, drag reorder, split view, broadcast input, search, 124 color schemes, background image, font/encoding |
| SFTP | Docked file panel, follows the terminal directory, upload/download, drag & drop, multi-select batch actions, chmod/rename/mkdir, tar.gz transfer |
| Monitoring | CPU / memory / swap / load, process table (sort by mem/CPU/cmd), network throughput, disk usage, ping latency & loss |
| Tools | Process manager, host inspector (traceroute + hop ping), system info, port forwarding, multi-location ping, Zmodem (send & receive) |
| Command bar | History, completion, remote path suggestions, quick-command groups with template parameters |
| Connectivity | SSH (password/key), Windows Remote Desktop (.rdp + mstsc), HTTP CONNECT / SOCKS5 proxy |
| Desktop | Tray, minimize-to-tray, autostart, single instance, window bounds memory |
| i18n | 简体中文 / English / 日本語 / 한국어 / Deutsch / Français / Español / Русский / Português (BR), follows the system by default |
| Modular UI | Left icon rail (connections / metrics / files / commands / settings), card-style terminal, room for database and AI modules |

## Quick start

```powershell
npm install
npm run dev        # dev mode with HMR
npm run build      # build into out/
npm start          # preview the production build
```

Requires Node 18+; runs on Windows / macOS / Linux.

### Packaging

```powershell
npm run dist:dir     # portable folder → release/win-unpacked/HostShell.exe
npm run dist:setup   # installer → release/HostShell-<version>-setup.exe (NSIS)
```

| Artifact | Description |
|---|---|
| `release/win-unpacked/` | Portable folder (232 MB), run `HostShell.exe` directly |
| `release/HostShell-0.17.0-win.zip` | Portable archive, **97.3 MB** |
| `release/HostShell-0.17.0-setup.exe` | Installer, **71.7 MB**: Program Files install, shortcuts, uninstall entry |

The installer is built from `build/installer.nsi` (NSIS 3.04) and has been verified end to end:

```powershell
release\HostShell-0.17.0-setup.exe /S /D=C:\path\to\install
```

### Docker test server

```powershell
docker build -t hostshell/sshd:latest tools/docker/sshd
docker run -d --name hostshell-sshd -p 127.0.0.1:2223:2222 hostshell/sshd:latest
# connect to 127.0.0.1:2223 with root / hostshell
```

The image ships `sz`/`rz`, which is handy to verify Zmodem in both directions.

### Built-in mock server

```powershell
node tools/mock-ssh-server.cjs 2222
```

Create a connection to `127.0.0.1:2222` (user `root`, any password). The mock returns a realistic Ubuntu banner, `docker ps` output, `/proc` metrics and a virtual file tree.

## Data & security

- Config directory: `%APPDATA%\HostShell\data` (Electron userData on macOS/Linux)
- Connections: `conn/<id>_connect_config.json`, one file per connection — easy to back up or migrate
- Passwords: encrypted through Electron `safeStorage` (DPAPI/Keychain) as `enc:`; undecryptable external secrets are marked `legacy:` and re-prompted on connect
- Everything stays on your machine; nothing is uploaded

## Project layout

```
src/
  main/        Electron main: window/tray/store/session/monitor/sftp/proxy/zmodem
  preload/     contextBridge API
  renderer/    React UI: components / state / i18n / lib / styles.css
build/         icons and NSIS installer script
tools/         mock SSH server, Docker test image, CDP driver
docs/          architecture, acceptance report, i18n docs, screenshots
```

## Tech stack

Electron 33 · React 18 · TypeScript · electron-vite · xterm.js 5 · ssh2 · CodeMirror 6 · zustand · FontAwesome

## Docs

- [Architecture](docs/02-架构设计.md) (Chinese)
- [Acceptance report](docs/03-验收报告.md) (Chinese)
- Localized READMEs: [日本語](docs/i18n/README.ja.md) · [한국어](docs/i18n/README.ko.md) · [Deutsch](docs/i18n/README.de.md) · [Français](docs/i18n/README.fr.md) · [Español](docs/i18n/README.es.md) · [Русский](docs/i18n/README.ru.md) · [Português](docs/i18n/README.pt-BR.md)

## Community

- Questions and ideas: [Discussions](https://github.com/FluxNodeDev/HostShell/discussions)
- Bugs: [issue](https://github.com/FluxNodeDev/HostShell/issues/new?template=bug_report.yml)
- Feature requests: [feature request](https://github.com/FluxNodeDev/HostShell/issues/new?template=feature_request.yml)
- PRs (code / docs / translations) are welcome — see [CONTRIBUTING](CONTRIBUTING.md)

A **star** is the most direct support:

[![Star History Chart](https://api.star-history.com/svg?repos=FluxNodeDev/HostShell&type=Date)](https://star-history.com/#FluxNodeDev/HostShell&Date)

## Sponsor

HostShell is MIT open source — no licenses, no "pro" edition. If it helps you, you can buy the author a coffee:

| Alipay | WeChat Pay |
|---|---|
| <img src="docs/sponsor/alipay-qr.png" width="220" alt="Alipay" /> | <img src="docs/sponsor/wechat-qr.png" width="220" alt="WeChat Pay" /> |

Sponsorship is entirely optional and unlocks nothing. Issues and pull requests are equally welcome.

## License

MIT License. Icons, color schemes and copy are original to this project; the color data comes from the community iTerm2 color schemes (MIT).
