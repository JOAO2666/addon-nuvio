# Streams Brasil (Multi-Fonte) - Addon para Nuvio

Coleção de providers PT-BR para o app **Nuvio**. Busca filmes, séries e animes **dublados/legendados em português do Brasil** em múltiplas fontes simultaneamente, entregando **URL direta** de vídeo (`.mp4` / `.m3u8`) para o player nativo — sem iframe, sem erro de "source player".

## Instalação no Nuvio

No app Nuvio, vá em **Settings → Plugins → Add Repository** e cole:

```
https://raw.githubusercontent.com/JOAO2666/addon-nuvio/refs/heads/main/manifest.json
```

Depois é só ativar os providers desejados e começar a assistir.

## Providers Incluídos (v3.0.0)

| Provider | Site / API | Conteúdo | Idioma | Formato | Status |
|----------|------------|----------|--------|---------|--------|
| **RedeCanais** | redecanaistv.autos | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ✅ |
| **RedeCanais PH** | redecanais.ph | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ⚠️ Cloudflare |
| **VideasyBR** | api.videasy.net | Filmes, Séries, Animes | PT-BR | HLS (m3u8) | ✅ |
| **AnimeFire** | animefire.io | Animes (EP individuais) | PT-BR (Dub/Leg) | MP4 direto | ✅ |

### Detalhes por Provider

**RedeCanais (.autos)** — Fonte principal. Busca no site, extrai os embeds (MixDrop / StreamTape / DoodStream / Filemoon) e resolve a URL direta de cada host.

**RedeCanais PH** — Mirror alternativo. Mesmo catálogo, mas protegido por Cloudflare: em alguns IPs/dispositivos retorna 403. Se acontecer, desative este e deixe só o `.autos`.

**VideasyBR** — Agrega 3 players BR (SuperFlix, OverFlix, VisionCine) via `api.videasy.net`. Retorna **HLS multi-áudio** (playlist `.m3u8`) com faixa em português já embutida. Baseado apenas em TMDB ID, funciona pra praticamente tudo que tem dublagem BR.

**AnimeFire** — Catálogo brasileiro de animes. Usa o endpoint JSON público `/video/{slug}/{episode}` do site, que devolve **MP4 direto** do CDN `lightspeedst.net` em 360p / 720p / 1080p. Resolução de slug automática a partir do TMDB (título PT + título original).

## Cobertura por Tipo

| Tipo                | Melhor Provider                          |
|---------------------|------------------------------------------|
| Filme Hollywood     | VideasyBR (HLS) + RedeCanais (MP4)       |
| Filme Nacional      | RedeCanais + VideasyBR                   |
| Série               | VideasyBR + RedeCanais                   |
| Anime dublado       | **AnimeFire** + VideasyBR                |
| Anime filme         | AnimeFire + RedeCanais                   |

Com os 4 ativos, você costuma ter **3 a 5 streams** diferentes por título, em qualidades variadas.

## Hosts Suportados (RedeCanais)

| Host | Status | Saída |
|------|--------|-------|
| **MixDrop** | ✅ Funciona | `.mp4` direto (`mxcontent.net`) |
| **StreamTape** | ✅ Funciona | `.mp4` direto (`tapecontent.net`) |
| **DoodStream** | ⚠️ Pode falhar | `.mp4` via `/pass_md5` (Cloudflare) |
| **Filemoon / Byse** | ⚠️ SPA moderno | Página SPA Vite, extração não confiável |

## Estrutura

```
Addon para o Nuvio/
├── manifest.json              # Registro dos providers
├── providers/
│   ├── redecanais.js          # RedeCanais (.autos)
│   ├── redecanais-ph.js       # RedeCanais (.ph mirror)
│   ├── videasy-br.js          # api.videasy.net (SuperFlix/OverFlix/VisionCine)
│   └── animefire.js           # animefire.io (MP4 direto)
├── test.js                    # Teste local Node.js (4 providers)
└── README.md
```

## Testando localmente

```bash
node test.js
```

Saída esperada (médio/bom):

```
RedeCanais (.autos)          OK=5   FAIL=1
RedeCanais PH                OK=0   FAIL=6    (Cloudflare 403 em Node)
VideasyBR                    OK=5   FAIL=1
AnimeFire                    OK=3   FAIL=3    (só anime; filmes/séries não-anime naturalmente falham)
```

Dentro do Nuvio, VideasyBR e AnimeFire tendem a ter sucesso um pouco maior porque o device do usuário não está bloqueado por Cloudflare.

## Compatibilidade Hermes

Todos os providers são **single-file em ES5** com `async/await` transpilado manualmente para generator + helper `__async`, exatamente como o Hermes/React-Native exige. Sem dependências externas, sem build step.

## Aviso Legal

- Este repositório **não hospeda** nenhum conteúdo.
- Os providers apenas indexam conteúdo publicamente disponível em sites de terceiros.
- O uso é de responsabilidade do usuário.
- Para questões DMCA, contate os hosts reais do conteúdo.

## Licença

GPL-3.0
