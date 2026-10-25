# 参与贡献 / Contributing

感谢你愿意花时间改进 HostShell。这个项目是 MIT 开源的，没有商业版本，所有功能对所有人一致。

## 开发环境

```bash
npm install
npm run dev        # 开发模式（HMR）
npm run typecheck  # 类型检查（提交前必须通过）
npm run build      # 构建
```

需要 Node 18+。建议在 Windows / macOS / Linux 任一平台开发，界面改动请附截图。

## 目录速览

```
src/main       Electron 主进程（SSH/SFTP/监控/代理/Zmodem/托盘）
src/preload    contextBridge API
src/renderer   React 界面（components / state / i18n / lib / styles.css）
tools          Mock SSH 服务器、Docker 联调镜像、CDP 驱动
build          图标与 NSIS 安装脚本
```

## 提交 Pull Request

1. Fork 并新建分支：`feat/xxx`、`fix/xxx`、`docs/xxx`
2. 保持改动聚焦，一个 PR 只做一件事
3. 提交前跑：`npm run typecheck && npm run build`
4. 界面改动附截图；修 bug 附复现步骤
5. PR 描述里写清「改了什么 / 为什么 / 怎么验证」

## 报告问题

- Bug 用 [Bug report](https://github.com/FluxNodeDev/HostShell/issues/new?template=bug_report.yml)
- 想法、用法讨论用 [Discussions](https://github.com/FluxNodeDev/HostShell/discussions)
- 安全漏洞请走私密渠道，不要公开提 issue

## 翻译

界面文案集中在 `src/renderer/src/i18n/index.ts`，文档在 `README.md` / `README.en.md` / `docs/i18n/`。
新增语言只需：

1. 在 `LOCALES` 里加一项
2. 在 `DICTS` 里加一份词条（缺失的键会自动回落到英文）
3. 文档加 `docs/i18n/README.<locale>.md`

## 代码风格

- TypeScript strict，尽量不引入 `any`
- 主进程逻辑放 `src/main`，渲染层不直接碰 Node API（走 `window.api`）
- 新增 IPC 时同步更新 `preload/index.ts` 的类型

## 行为准则

讨论对事不对人。可以尖锐地批评代码，但不要攻击人。
