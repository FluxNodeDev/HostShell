# HostShell

[中文](../README.md) · [English](../README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Deutsch](README.de.md) · [Français](README.fr.md) · [Español](README.es.md) · [Русский](README.ru.md) · **Português (BR)**

Uma bancada tudo-em-um para servidores: terminal SSH, SFTP, métricas ao vivo, túneis e Zmodem em uma única janela.

> Código aberto (MIT), local primeiro. A interface usa uma barra de ícones à esquerda e terminal em cartão,
> permitindo adicionar depois o gerenciamento de Redis / SQL e assistência de IA na mesma janela.

![HostShell](../shots/app-final.png)

## Recursos

- **Conexões**: grupos em árvore, arrastar para reorganizar, seleção múltipla, abrir/excluir em lote, importar JSON
- **Terminal**: abas, visão dividida, entrada em broadcast, busca, 124 esquemas de cores, imagem de fundo
- **SFTP**: painel acompanha o diretório do terminal, envio/download, arrastar e soltar, ações em lote, transferência tar.gz
- **Monitoramento**: CPU / memória / swap / carga, tabela de processos, rede, discos, ping
- **Ferramentas**: gerenciador de processos, diagnóstico de host (traceroute), informações do sistema, encaminhamento de portas, ping multi-local, Zmodem
- **Comandos**: histórico, autocompletar, sugestões de caminho, comandos rápidos com parâmetros
- **Conexão**: SSH (senha/chave), área de trabalho remota do Windows, proxy HTTP CONNECT / SOCKS5
- **Desktop**: bandeja, minimizar para bandeja, inicialização automática, instância única
- **Idiomas**: Português (BR) / English / 简体中文 / 日本語 / 한국어 / Deutsch / Français / Español / Русский

## Início rápido

```powershell
npm install
npm run dev        # desenvolvimento
npm run build      # compila em out/
npm start          # pré-visualiza o build
```

Node 18+; Windows / macOS / Linux.

### Empacotamento

```powershell
npm run dist:dir     # pasta portátil → release/win-unpacked/HostShell.exe
npm run dist:setup   # instalador → release/HostShell-<version>-setup.exe
```

| Artefato | Descrição |
|---|---|
| `release/win-unpacked/` | Portátil (232 MB) |
| `release/HostShell-0.17.0-win.zip` | ZIP portátil (97,3 MB) |
| `release/HostShell-0.17.0-setup.exe` | Instalador (71,7 MB) |

## Apoio

HostShell é código aberto MIT — sem licenças, sem edição "pro". Se ele ajudar, você pode pagar um café ao autor:

| Alipay | WeChat Pay |
|---|---|
| <img src="../sponsor/alipay-qr.png" width="200" alt="Alipay" /> | <img src="../sponsor/wechat-qr.png" width="200" alt="WeChat Pay" /> |

O apoio é opcional e não desbloqueia nada. Issues e pull requests são igualmente bem-vindos.

## Documentação

- Detalhada (chinês): [Arquitetura](../02-架构设计.md) · [Relatório de aceitação](../03-验收报告.md)
- [English README](../README.en.md)
