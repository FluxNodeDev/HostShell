# HostShell

[中文](../README.md) · [English](../README.en.md) · **日本語** · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Português](README.pt-BR.md)

SSH ターミナル、SFTP、リアルタイム監視、トンネル、Zmodem を 1 つのウィンドウにまとめたサーバー管理ツールです。

> MIT ライセンスのオープンソース。ローカル優先。左側のアイコンレールとカード型ターミナルにより、
> 将来 Redis / SQL 管理や AI 支援も同じ画面に追加できます。

![HostShell](../shots/app-final.png)

## 主な機能

- **接続管理**：ツリー型グループ、ドラッグで移動、複数選択、一括オープン/削除、JSON からインポート
- **ターミナル**：タブ、左右分割、ブロードキャスト入力、検索、124 種類の配色、背景画像
- **SFTP**：ターミナルのディレクトリに追従、アップロード/ダウンロード、ドラッグ＆ドロップ、一括操作、tar.gz 転送
- **監視**：CPU / メモリ / スワップ / 負荷、プロセス一覧、ネットワーク、ディスク、Ping
- **ツール**：プロセスマネージャー、ホスト検査（traceroute）、システム情報、ポート転送、複数拠点 Ping、Zmodem（送受信）
- **コマンド**：履歴、補完、リモートパス候補、ショートカットコマンド（テンプレート引数）
- **接続方式**：SSH（パスワード/鍵）、Windows リモートデスクトップ、HTTP CONNECT / SOCKS5 プロキシ
- **デスクトップ**：トレイ、トレイに最小化、自動起動、単一インスタンス
- **多言語**：日本語 / English / 简体中文 / 한국어 / Deutsch / Français / Español / Русский / Português (BR)

## クイックスタート

```powershell
npm install
npm run dev        # 開発モード
npm run build      # out/ にビルド
npm start          # ビルド結果をプレビュー
```

Node 18 以上。Windows / macOS / Linux で動作します。

### パッケージ

```powershell
npm run dist:dir     # ポータブル版 → release/win-unpacked/HostShell.exe
npm run dist:setup   # インストーラー → release/HostShell-<version>-setup.exe
```

| 成果物 | 説明 |
|---|---|
| `release/win-unpacked/` | ポータブル版（232 MB） |
| `release/HostShell-0.17.0-win.zip` | ポータブル ZIP（97.3 MB） |
| `release/HostShell-0.17.0-setup.exe` | インストーラー（71.7 MB） |

## スポンサー

HostShell は MIT のオープンソースです。ライセンス販売や「アップグレード版」はありません。
役に立ったら、任意でコーヒーをご馳走いただけると嬉しいです。

| Alipay | WeChat Pay |
|---|---|
| <img src="../sponsor/alipay-qr.png" width="200" alt="Alipay" /> | <img src="../sponsor/wechat-qr.png" width="200" alt="WeChat Pay" /> |

スポンサーは任意で、機能に影響しません。Issue / PR も歓迎します。

## ドキュメント

- 詳細（中国語）: [アーキテクチャ](../02-架构设计.md) · [受け入れレポート](../03-验收报告.md)
- [English README](../README.en.md)
