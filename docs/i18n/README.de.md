# HostShell

[中文](../README.md) · [English](../README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · **Deutsch** · [Français](README.fr.md) · [Español](README.es.md) · [Русский](README.ru.md) · [Português](README.pt-BR.md)

Eine All-in-One-Werkbank für Server: SSH-Terminal, SFTP, Live-Metriken, Tunnel und Zmodem in einem Fenster.

> Open Source (MIT), lokal zuerst. Die Oberfläche nutzt eine linke Icon-Leiste und ein Terminal im Kartenstil,
> sodass später Redis-/SQL-Verwaltung und KI-Funktionen im selben Fenster ergänzt werden können.

![HostShell](../shots/app-final.png)

## Funktionen

- **Verbindungen**: Baumgruppen, Drag & Drop zum Umsortieren, Mehrfachauswahl, Sammelöffnen/-löschen, Import aus JSON
- **Terminal**: Tabs, geteilte Ansicht, Broadcast-Eingabe, Suche, 124 Farbschemata, Hintergrundbild
- **SFTP**: Dateibereich folgt dem Terminal-Verzeichnis, Upload/Download, Drag & Drop, Sammelaktionen, tar.gz-Transfer
- **Monitoring**: CPU / RAM / Swap / Last, Prozesstabelle, Netzwerk, Datenträger, Ping
- **Werkzeuge**: Prozessmanager, Host-Diagnose (Traceroute), Systeminfo, Portweiterleitung, Ping von mehreren Standorten, Zmodem
- **Befehle**: Verlauf, Vervollständigung, Pfadvorschläge, Quick-Befehle mit Parametern
- **Verbindungsarten**: SSH (Passwort/Key), Windows-Remotedesktop, HTTP-CONNECT-/SOCKS5-Proxy
- **Desktop**: Tray, Minimieren in den Tray, Autostart, Einzelinstanz
- **Mehrsprachig**: Deutsch / English / 简体中文 / 日本語 / 한국어 / Français / Español / Русский / Português (BR)

## Schnellstart

```powershell
npm install
npm run dev        # Entwicklung
npm run build      # nach out/ bauen
npm start          # Build ansehen
```

Node 18+; läuft unter Windows / macOS / Linux.

### Paketierung

```powershell
npm run dist:dir     # portable Ordner → release/win-unpacked/HostShell.exe
npm run dist:setup   # Installer → release/HostShell-<version>-setup.exe
```

| Artefakt | Beschreibung |
|---|---|
| `release/win-unpacked/` | Portabel (232 MB) |
| `release/HostShell-0.17.0-win.zip` | Portables ZIP (97,3 MB) |
| `release/HostShell-0.17.0-setup.exe` | Installer (71,7 MB) |

## Sponsoring

HostShell ist MIT-Open-Source — keine Lizenzen, keine „Pro"-Version. Wenn es hilft, darfst du dem Autor einen Kaffee spendieren:

| Alipay | WeChat Pay |
|---|---|
| <img src="../sponsor/alipay-qr.png" width="200" alt="Alipay" /> | <img src="../sponsor/wechat-qr.png" width="200" alt="WeChat Pay" /> |

Sponsoring ist freiwillig und schaltet nichts frei. Issues und Pull Requests sind genauso willkommen.

## Dokumentation

- Ausführlich (Chinesisch): [Architektur](../02-架构设计.md) · [Abnahmeprotokoll](../03-验收报告.md)
- [English README](../README.en.md)
