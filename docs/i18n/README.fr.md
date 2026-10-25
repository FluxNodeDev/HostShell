# HostShell

[中文](../README.md) · [English](../README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · **Français** · [Español](README.es.md) · [Русский](README.ru.md) · [Português](README.pt-BR.md)

Un atelier tout-en-un pour serveurs : terminal SSH, SFTP, métriques temps réel, tunnels et Zmodem dans une seule fenêtre.

> Open source (MIT), local d'abord. L'interface utilise un rail d'icônes à gauche et un terminal en carte,
> pour accueillir plus tard la gestion Redis / SQL et l'assistance IA dans la même fenêtre.

![HostShell](../shots/app-final.png)

## Fonctionnalités

- **Connexions** : groupes arborescents, glisser-déposer, sélection multiple, ouverture/suppression en lot, import JSON
- **Terminal** : onglets, vue partagée, saisie diffusée, recherche, 124 palettes, image de fond
- **SFTP** : panneau qui suit le répertoire du terminal, envoi/téléchargement, glisser-déposer, actions en lot, transfert tar.gz
- **Supervision** : CPU / mémoire / swap / charge, table des processus, réseau, disques, ping
- **Outils** : gestionnaire de processus, diagnostic d'hôte (traceroute), infos système, redirection de ports, ping multi-sites, Zmodem
- **Commandes** : historique, complétion, suggestions de chemins, commandes rapides avec paramètres
- **Connexion** : SSH (mot de passe/clé), bureau à distance Windows, proxy HTTP CONNECT / SOCKS5
- **Bureau** : zone de notification, réduction dans la zone, démarrage auto, instance unique
- **Multilingue** : Français / English / 简体中文 / 日本語 / 한국어 / Deutsch / Español / Русский / Português (BR)

## Démarrage rapide

```powershell
npm install
npm run dev        # développement
npm run build      # compilation dans out/
npm start          # aperçu du build
```

Node 18+ ; Windows / macOS / Linux.

### Packaging

```powershell
npm run dist:dir     # dossier portable → release/win-unpacked/HostShell.exe
npm run dist:setup   # installateur → release/HostShell-<version>-setup.exe
```

| Artefact | Description |
|---|---|
| `release/win-unpacked/` | Portable (232 Mo) |
| `release/HostShell-0.17.0-win.zip` | ZIP portable (97,3 Mo) |
| `release/HostShell-0.17.0-setup.exe` | Installateur (71,7 Mo) |

## Soutien

HostShell est un projet open source MIT — pas de licence, pas d'édition « pro ». S'il vous aide, vous pouvez offrir un café à l'auteur :

| Alipay | WeChat Pay |
|---|---|
| <img src="../sponsor/alipay-qr.png" width="200" alt="Alipay" /> | <img src="../sponsor/wechat-qr.png" width="200" alt="WeChat Pay" /> |

Le soutien est facultatif et ne débloque rien. Les issues et pull requests sont tout aussi bienvenues.

## Documentation

- Détaillée (chinois) : [Architecture](../02-架构设计.md) · [Rapport de recette](../03-验收报告.md)
- [English README](../README.en.md)
