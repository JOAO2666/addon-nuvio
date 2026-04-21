# 🇧🇷 RedeCanais Brasil - Addon para Nuvio

Addon de providers para o app **Nuvio** que busca filmes e séries dublados/legendados em PT-BR a partir dos sites **RedeCanais**.

## 📦 Providers Incluídos

| Provider | Site | Conteúdo | Idioma |
|----------|------|----------|--------|
| **RedeCanais** | redecanaistv.autos | Filmes, Séries | PT-BR (Dub/Leg) |
| **RedeCanais PH** | redecanais.ph | Filmes, Séries | PT-BR (Dub/Leg) |

## 🚀 Como Instalar no Nuvio

1. Abra o **Nuvio** → **Settings** → **Plugins**
2. Cole a URL do seu repositório (se hospedar no GitHub):
   ```
   https://raw.githubusercontent.com/SEU_USUARIO/SEU_REPO/refs/heads/main/manifest.json
   ```
3. Atualize e ative os providers que desejar

### Teste Local

Se quiser testar localmente:

1. Clone/copie este repositório
2. Rode `npm start` (requer `server.js` do template oficial)
3. No Nuvio → Settings → Developer → Plugin Tester
4. Insira: `http://SEU_IP:3000/manifest.json`

## 🎬 Funcionalidades

- **Busca automática** via TMDB API (traduz título para PT-BR)
- **Múltiplos servidores** de streaming:
  - 🎯 Filemoon (Byse)
  - 🎯 DoodStream
  - 🎯 MixDrop
  - 🎯 StreamTape
- **Suporte a filmes e séries** (movies + tv)
- **Detecção de qualidade** (HD, CAM, SD)
- **Detecção de áudio** (Dublado, Legendado)
- **Fallback inteligente**: Busca por título PT-BR primeiro, depois EN

## 📁 Estrutura do Projeto

```
Addon para o Nuvio/
├── manifest.json          # Registro dos providers
├── providers/
│   ├── redecanais.js      # Provider principal (redecanaistv.autos)
│   └── redecanais-ph.js   # Provider mirror (redecanais.ph)
├── test.js                # Script de teste
└── README.md
```

## 🧪 Testando

```bash
node test.js
```

O script testa busca de um filme (Oppenheimer) e uma série (Breaking Bad).

## 🔧 Como Funciona

1. **Recebe TMDB ID** do Nuvio (ex: `872585` para Oppenheimer)
2. **Consulta TMDB API** para obter o título em PT-BR
3. **Busca no RedeCanais** usando o título traduzido
4. **Acessa a página do player** (`?area=online`)
5. **Extrai links dos servidores** (filemoon, doodstream, mixdrop, streamtape)
6. **Retorna streams formatados** para o Nuvio reproduzir

## ⚠️ Aviso Legal

- Este repositório **não hospeda** nenhum conteúdo
- Os providers apenas indexam conteúdo publicamente disponível em sites de terceiros
- O uso é de total responsabilidade do usuário
- Para questões DMCA, contate os hosts reais do conteúdo

## 📄 Licença

GPL-3.0
