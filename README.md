# Streams Brasil (Multi-Fonte) - Addon para Nuvio

Coleção de providers PT-BR para o app **Nuvio**. Busca filmes, séries e animes **dublados/legendados em português do Brasil** em múltiplas fontes simultaneamente, entregando **URL direta** de vídeo (`.mp4` / `.m3u8`) para o player nativo — sem iframe, sem erro de "source player".

## Instalação no Nuvio

No app Nuvio, vá em **Settings → Plugins → Add Repository** e cole:

```
https://raw.githubusercontent.com/JOAO2666/addon-nuvio/refs/heads/main/manifest.json
```

Depois é só ativar os providers desejados e começar a assistir.

## Providers Incluídos (v3.2.0)

| Provider | Site / API | Conteúdo | Idioma | Formato | Status | Velocidade (séries) |
|----------|------------|----------|--------|---------|--------|---------------------|
| **RedeCanais** | redecanaistv.autos | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ✅ | ~2,6 s |
| **RedeCanais PH** | redecanais.ph | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ⚠️ Cloudflare | <0,5 s (fail-fast) |
| **VideasyBR** | api.videasy.net | Filmes, Séries, Animes | PT-BR | HLS (m3u8) | ✅ | ~0,8 s |
| **AnimeFire** | animefire.io | Animes (EP individuais) | PT-BR (Dub/Leg) | MP4 direto | ✅ | ~2,2 s (anime) |
| **AnimesDigital** | animesdigital.org | Animes, Desenhos, Doramas | PT-BR (Dub/Leg) | HLS direto | ✅ | 5–16 s (anime) |

### O que mudou na v3.2.0

- **Séries agora respondem em ≤3 s** (antes passavam de 15 s e o Nuvio dava "no streams found" por timeout).
- **RedeCanais**: os embeds agora são extraídos **em paralelo** via `Promise.all` (eram sequenciais). Hosts sabidamente quebrados (Filemoon/Byse, DoodStream) são **pulados antes da requisição** — economizava 2 a 5 s por host falhando em silêncio.
- **VideasyBR**: removidos OverFlix e VisionCine (o upstream do videasy.net estava retornando HTTP 500 em qualquer request, travando ~30 s cada). Só SuperFlix fica ativo e um **timeout de 8 s por request** garante que nada trava o app.
- **RedeCanais PH**: paralelização idem, mas Cloudflare continua bloqueando de Node/dispositivos móveis. Mantido no manifesto, mas pronto pra fail-fast sem atrasar o restante.

### Detalhes por Provider

**RedeCanais (.autos)** — Fonte principal. Busca no site, extrai os embeds (MixDrop / StreamTape) e resolve a URL direta de cada host **em paralelo**. Filemoon e DoodStream são pulados porque nunca retornam stream extraível no ambiente do Nuvio.

**RedeCanais PH** — Mirror alternativo. Mesmo catálogo, mas protegido por Cloudflare: em alguns IPs/dispositivos retorna 403. Se acontecer, desative este e deixe só o `.autos`.

**VideasyBR** — SuperFlix via `api.videasy.net`. Retorna **HLS multi-áudio** (playlist `.m3u8`) com faixa em português já embutida. Baseado apenas em TMDB ID, funciona pra praticamente tudo que tem dublagem BR. (OverFlix e VisionCine estão fora do ar no upstream; serão reativados se voltarem.)

**AnimeFire** — Catálogo brasileiro de animes. Usa o endpoint JSON público `/video/{slug}/{episode}` do site, que devolve **MP4 direto** do CDN `lightspeedst.net` em 360p / 720p / 1080p. Resolução de slug automática a partir do TMDB (título PT + título original).

**AnimesDigital** — Novo catálogo BR de animes. Extrai **HLS direto** (`cdn-s01.mywallpaper-4k-image.net/…/index.m3u8`) — sem iframe, sem packer. Palpites de slug primeiro (`<nome>-dublado`, `<nome>`), fallback pra busca. Usa **paginação inteligente** pra achar EP alvo direto na página certa mesmo em séries longas (One Piece, Naruto Classic). Só responde pra conteúdo com `original_language=ja`.

## Cobertura por Tipo

| Tipo                | Melhor Provider                          |
|---------------------|------------------------------------------|
| Filme Hollywood     | VideasyBR (HLS) + RedeCanais (MP4)       |
| Filme Nacional      | RedeCanais + VideasyBR                   |
| Série               | VideasyBR + RedeCanais                   |
| Anime dublado       | **AnimeFire** + **AnimesDigital** + VideasyBR |
| Anime filme         | AnimeFire + AnimesDigital + RedeCanais   |

Com os 5 ativos, você costuma ter **4 a 8 streams** diferentes por título, em qualidades variadas.

## Sites pedidos mas não adicionados

Sites que foram investigados mas **não são viáveis** (pra não gerar streams quebrados):

| Site | Problema |
|------|----------|
| `xfilmetorrenthd.com.br` | Site de **torrent** (`.torrent`/magnet), não tem streaming direto que o Nuvio saiba tocar. |
| `topflix.online` | Usa "VideoBalancer" privado (`sempra.pro`) que só aceita requests vindas do próprio site — API externa retorna 404. |
| `bludvplay.xyz` | Dos slots de player na página só vem trailer do YouTube — não tem streams reais públicos. |
| `assistironlinee.org` | Retorna URLs de **embed** de terceiros (2embed, fembed, embedplayer, superflixapi) — iframes que o Nuvio não toca nativo. |
| `animesonlinecc.to` | Usa iframe do **Blogger** (`blogger.com/video.g?token=…`) — extração exige chamadas adicionais assinadas, instável. |

Se quiser algum deles, precisa de solução dedicada por site (Cloudflare bypass, extrator de Blogger, etc).

## Hosts Suportados (RedeCanais)

| Host | Status | Saída |
|------|--------|-------|
| **MixDrop** | ✅ Funciona | `.mp4` direto (`mxcontent.net`) |
| **StreamTape** | ✅ Funciona | `.mp4` direto (`tapecontent.net`) |
| **DoodStream** | ❌ Pulado (v3.2) | Cloudflare bloqueia `/pass_md5` do lado do app |
| **Filemoon / Byse** | ❌ Pulado (v3.2) | SPA Vite moderno, exige JS runtime; sempre falhava |

Em v3.2 a extração só tenta os hosts que **realmente respondem** (MixDrop/StreamTape), economizando 2–5 s por episódio.

## Estrutura

```
Addon para o Nuvio/
├── manifest.json              # Registro dos providers
├── providers/
│   ├── redecanais.js          # RedeCanais (.autos)
│   ├── redecanais-ph.js       # RedeCanais (.ph mirror)
│   ├── videasy-br.js          # api.videasy.net (SuperFlix HLS)
│   ├── animefire.js           # animefire.io (MP4 direto)
│   └── animesdigital.js       # animesdigital.org (HLS direto + paginação inteligente)
├── test.js                    # Teste local Node.js com cronômetro por provider
└── README.md
```

## Testando localmente

```bash
node test.js
```

Saída esperada (v3.2.0) — atenção aos tempos:

```
RedeCanais (.autos)    OK=6  FAIL=0  total=15920ms  avg=2653ms
RedeCanais PH          OK=0  FAIL=6  total=2913ms   avg=486ms   (Cloudflare em Node)
VideasyBR              OK=6  FAIL=0  total=5061ms   avg=844ms
AnimeFire              OK=3  FAIL=3  total=13013ms  avg=2169ms  (só anime)
AnimesDigital          OK=2  FAIL=4  total=29491ms  avg=4915ms  (só anime)
```

Suite inteira roda em ~75 s (era 287 s na v3.1.0 — **~4× mais rápido**). Dentro do Nuvio, VideasyBR e AnimeFire costumam ter sucesso ainda maior porque o dispositivo do usuário não está bloqueado por Cloudflare.

## Compatibilidade Hermes

Todos os providers são **single-file em ES5** com `async/await` transpilado manualmente para generator + helper `__async`, exatamente como o Hermes/React-Native exige. Sem dependências externas, sem build step.

## Aviso Legal

- Este repositório **não hospeda** nenhum conteúdo.
- Os providers apenas indexam conteúdo publicamente disponível em sites de terceiros.
- O uso é de responsabilidade do usuário.
- Para questões DMCA, contate os hosts reais do conteúdo.

## Licença

GPL-3.0
