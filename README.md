# Streams Brasil (Multi-Fonte) - Addon para Nuvio

Coleção de providers PT-BR para o app **Nuvio**. Busca filmes, séries e animes **dublados/legendados em português do Brasil** em múltiplas fontes simultaneamente, entregando **URL direta** de vídeo (`.mp4` / `.m3u8`) para o player nativo — sem iframe, sem erro de "source player".

## Instalação no Nuvio

No app Nuvio, vá em **Settings → Plugins → Add Repository** e cole:

```
https://raw.githubusercontent.com/JOAO2666/addon-nuvio/refs/heads/main/manifest.json
```

Depois é só ativar os providers desejados e começar a assistir.

## Providers Incluídos (v3.3.0)

| Provider | Site / API | Conteúdo | Idioma | Formato | Status | Velocidade (séries) |
|----------|------------|----------|--------|---------|--------|---------------------|
| **RedeCanais** | redecanaistv.autos | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ✅ 92% de hit em séries | ~2,8 s |
| **RedeCanais PH** | redecanais.ph | Filmes, Séries, Animes | PT-BR (Dub/Leg) | MP4 / M3U8 | ⚠️ Cloudflare | <0,5 s (fail-fast) |
| **VideasyBR** | api.videasy.net | Filmes, Séries, Animes | PT-BR | HLS (m3u8) | ✅ | ~0,8 s |
| **AnimeFire** | animefire.io | Animes (EP individuais) | PT-BR (Dub/Leg) | MP4 direto | ✅ | ~2,2 s (anime) |
| **AnimesDigital** | animesdigital.org | Animes, Desenhos, Doramas | PT-BR (Dub/Leg) | HLS direto | ✅ | 5–16 s (anime) |

### O que mudou na v3.3.0

**Foco**: consertar o "no streams found" em **todas** as séries populares — não só as duas ou três que eu testei.

Bateria de 49 séries populares (BB, GoT, ST, Boys, Friends, The Office, Witcher, Lost, South Park, Death Note, Naruto, JJK, MHA, HxH, Attack on Titan, Demon Slayer, One Piece live-action, Arcane, Invincible, Rick and Morty, Peaky Blinders, Narcos, Ozark, Money Heist, Dark, Mindhunter, Loki, Wanda, Mandalorian, Squid Game, Euphoria, Supernatural, Grey's Anatomy, Wednesday, Dexter, Simpsons, Modern Family, Brooklyn 99, HIMYM, 3%, Cidade Invisível, Breaking Bad S3E5 etc): **73% → 92% de sucesso**.

Os dois bugs que estavam matando a maioria das séries:

1. **Scoring burro** — a busca do RedeCanais retorna o nome da série misturado com filmes/especiais (`friends-a-reuniao-legendado-2021` aparecia antes da `friends-dublado-1994`). O código antigo pegava o primeiro que tivesse "friends" no slug — e caía num especial que não tem episódios. **Agora** cada URL ganha um score:
   - Slug exato = +100, prefixo = +70, substring = +30
   - Ano do TMDB bate = +40, diferença de 1 ano = +15
   - Slug com sufixo de filme/especial (`-o-filme`, `-reuniao`, `-ascensao`, `-o-ultimo-nome` etc.) = **–60**
   - Pega o melhor score, empata pro idioma dublado.
   - Consulta também o `original_name` do TMDB (animes que só existem no site com nome romaji).

2. **Só achava temporada 1** — a página da série no RedeCanais só lista os eps de S1. O código antigo desistia pra qualquer S>1. **Agora** o provider:
   - Descobre o ID da S1E1 na URL (`.../series-1x1-dublado-3417/`).
   - Usa `episode_count` de cada temporada do TMDB pra **prever o ID** do episódio alvo (IDs do site são sequenciais por série).
   - Tenta 7 variações em paralelo (±3 IDs) pra absorver gaps, valida por `<title>` da página.
   - Exemplo: Breaking Bad S3E5 passou a funcionar — antes falhava.

Ainda falham **algumas temporadas muito recentes** de séries grandes (ST S4, GoT S8, Boys S3+, TWD S5+): o site publicou essas em IDs **fora** da sequência da S1 (pulou milhares de IDs). Esses casos ficam pro usuário ir via VideasyBR, que não depende de scraping.

Melhorias anteriores (v3.2.0) mantidas:
- Embeds extraídos em paralelo (Promise.all).
- Hosts quebrados (Filemoon/DoodStream) pulados antes do request.
- VideasyBR com timeout agressivo de 8 s + só SuperFlix ativo.

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
