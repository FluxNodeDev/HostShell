# HostShell

[中文](../README.md) · [English](../README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · **Español** · [Русский](README.ru.md) · [Português](README.pt-BR.md)

Un puesto de trabajo todo en uno para servidores: terminal SSH, SFTP, métricas en vivo, túneles y Zmodem en una sola ventana.

> Código abierto (MIT), local primero. La interfaz usa una barra de iconos a la izquierda y un terminal tipo tarjeta,
> de modo que más adelante se puedan añadir la gestión de Redis / SQL y la asistencia con IA en la misma ventana.

![HostShell](../shots/app-final.png)

## Funciones

- **Conexiones**: grupos en árbol, arrastrar para reorganizar, selección múltiple, abrir/eliminar en lote, importar JSON
- **Terminal**: pestañas, vista dividida, entrada difundida, búsqueda, 124 esquemas de color, imagen de fondo
- **SFTP**: panel que sigue el directorio del terminal, subir/descargar, arrastrar y soltar, acciones en lote, transferencia tar.gz
- **Monitorización**: CPU / memoria / swap / carga, tabla de procesos, red, discos, ping
- **Herramientas**: gestor de procesos, diagnóstico de host (traceroute), información del sistema, redirección de puertos, ping multisitio, Zmodem
- **Comandos**: historial, autocompletado, sugerencias de rutas, comandos rápidos con parámetros
- **Conexión**: SSH (contraseña/clave), escritorio remoto de Windows, proxy HTTP CONNECT / SOCKS5
- **Escritorio**: bandeja, minimizar a la bandeja, inicio automático, instancia única
- **Multiidioma**: Español / English / 简体中文 / 日本語 / 한국어 / Deutsch / Français / Русский / Português (BR)

## Inicio rápido

```powershell
npm install
npm run dev        # desarrollo
npm run build      # compilar en out/
npm start          # previsualizar
```

Node 18+; Windows / macOS / Linux.

### Empaquetado

```powershell
npm run dist:dir     # carpeta portable → release/win-unpacked/HostShell.exe
npm run dist:setup   # instalador → release/HostShell-<version>-setup.exe
```

| Artefacto | Descripción |
|---|---|
| `release/win-unpacked/` | Portable (232 MB) |
| `release/HostShell-0.17.0-win.zip` | ZIP portable (97,3 MB) |
| `release/HostShell-0.17.0-setup.exe` | Instalador (71,7 MB) |

## Patrocinio

HostShell es código abierto MIT — sin licencias ni edición «pro». Si te resulta útil, puedes invitar un café al autor:

| Alipay | WeChat Pay |
|---|---|
| <img src="../sponsor/alipay-qr.png" width="200" alt="Alipay" /> | <img src="../sponsor/wechat-qr.png" width="200" alt="WeChat Pay" /> |

El patrocinio es opcional y no desbloquea nada. Las issues y pull requests son igual de bienvenidas.

## Documentación

- Detallada (chino): [Arquitectura](../02-架构设计.md) · [Informe de aceptación](../03-验收报告.md)
- [English README](../README.en.md)
