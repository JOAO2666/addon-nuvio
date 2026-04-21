# RedeCanais Brasil - Addon para Nuvio

Addon de providers para o app **Nuvio** que busca filmes, séries e animes dublados/legendados em PT-BR a partir dos sites **RedeCanais**.

Diferente de outros providers, este **resolve as URLs diretas dos hosts** (MixDrop, StreamTape) em vez de retornar apenas as páginas embed — isso evita o erro "source player" / "player não suportado" que acontece quando o Nuvio tenta tocar uma página HTML como vídeo.

## Instalação no Nuvio

No app Nuvio, vá em **Settings → Plugins → Add Repository** e cole:

```
https://raw.githubusercontent.com/JOAO2666/addon-nuvio/refs/heads/main/manifest.json
```

Depois ative os providers desejados e já pode usar.

## Providers Incluídos

| Provider | Site | Conteúdo | Idioma |
|----------|------|----------|--------|
| **RedeCanais** | redecanaistv.autos | Filmes, Séries, Animes | PT-BR (Dub/Leg) |
| **RedeCanais PH** | redecanais.ph | Filmes, Séries, Animes | PT-BR (Dub/Leg) |

> Obs.: o mirror `.ph` é protegido por Cloudflare. Em alguns dispositivos/IPs ele pode retornar 403. Se acontecer, desative o mirror e use apenas o principal.

## Hosts Suportados (extração direta)

O addon busca no RedeCanais, pega os embeds disponíveis e tenta extrair a **URL direta de vídeo** de cada host:

| Host | Status | Saída |
|------|--------|-------|
| **MixDrop** | ✅ Funciona | `.mp4` direto (`mxcontent.net`) |
| **StreamTape** | ✅ Funciona | `.mp4` direto (`tapecontent.net`) |
| **DoodStream** | ⚠️ Pode falhar | `.mp4` via `/pass_md5` (Cloudflare) |
| **Filemoon / Byse** | ⚠️ SPA moderno | Página SPA Vite, extração não confiável |

Na prática **MixDrop + StreamTape** já entregam pelo menos 2 streams playáveis para cada filme/episódio — suficiente para o Nuvio.

## Como Funciona

```
Nuvio → getStreams(tmdbId, "movie"|"tv", season?, episode?)
   ↓
Provider consulta TMDB (pt-BR + en-US) para obter título e ano
   ↓
Busca /pesquisar/?p=TITULO no RedeCanais
   ↓
Filme  → pega a URL correta do filme
Serie  → pega página da série, lista episódios, acha SxE
   ↓
Fetch /?area=online → regex em getembed.php / redirect.php / C_Video()
   ↓
Resolve cada redirect.php → URL canônica do host
   ↓
Para cada host, executa o extractor dedicado:
  - MixDrop : GET /e/, unpack p,a,c,k,e,d, lê MDCore.wurl
  - StreamTape : GET /e/, lê robotlink e monta a URL
  - DoodStream : GET /e/, acha /pass_md5/, fetch, monta URL
   ↓
Retorna streams com URL direta + headers (Referer/Origin)
```

## Estrutura

```
Addon para o Nuvio/
├── manifest.json           # Registro dos providers
├── providers/
│   ├── redecanais.js       # Provider principal (redecanaistv.autos)
│   └── redecanais-ph.js    # Provider mirror (redecanais.ph)
├── test.js                 # Teste local Node.js
└── README.md
```

## Testando localmente

```bash
node test.js
```

Saída esperada: `passed=5 failed=0` para `RedeCanais (.autos)` (MixDrop + StreamTape retornando URLs diretas de `.mp4`).

Para testar dentro do Nuvio (Plugin Tester), use um servidor local (`npm start` do repo `nuvio-providers`) ou publique no GitHub e cole a URL raw do `manifest.json`.

## Compatibilidade Hermes

Os providers são **single-file em ES5** com `async/await` transpilado manualmente para generator + helper `__async`, exatamente como o Hermes/React-Native exige. Sem dependências externas.

## Aviso Legal

- Este repositório **não hospeda** nenhum conteúdo
- Os providers apenas indexam conteúdo publicamente disponível em sites de terceiros
- O uso é de responsabilidade do usuário
- Para questões DMCA, contate os hosts reais do conteúdo

## Licença

GPL-3.0
