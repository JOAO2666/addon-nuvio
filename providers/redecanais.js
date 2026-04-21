/**
 * RedeCanais - Nuvio Provider
 * Scrapes movies, TV series and anime from redecanaistv.autos
 * Returns DIRECT video URLs (m3u8 / mp4) by resolving the embed pages
 * (Filemoon / MixDrop / StreamTape / DoodStream) so the Nuvio native
 * player (KSPlayer / AndroidVideoPlayer) can play them without errors.
 *
 * Hermes compatible (no async/await – uses generator + __async helper)
 */
"use strict";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://www.redecanaistv.autos";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var PROVIDER_TAG = "RedeCanais";

var SERVER_NAMES = {
  filemoon: "Filemoon",
  byse: "Filemoon",
  doodstream: "DoodStream",
  dood: "DoodStream",
  mixdrop: "MixDrop",
  streamtape: "StreamTape",
};

// ─────────────────────────────────────────────
// Async helper (Hermes-safe generator runner)
// ─────────────────────────────────────────────
var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) {
      try { step(generator.next(v)); } catch (e) { reject(e); }
    };
    var rejected = function (v) {
      try { step(generator.throw(v)); } catch (e) { reject(e); }
    };
    var step = function (x) {
      return x.done
        ? resolve(x.value)
        : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

// ─────────────────────────────────────────────
// HTTP helper
// ─────────────────────────────────────────────
function httpGet(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    var headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      opts.headers || {}
    );
    var response = yield fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      redirect: opts.redirect || "follow",
    });
    return response;
  });
}

function fetchText(url, opts) {
  return __async(this, null, function* () {
    try {
      var r = yield httpGet(url, opts);
      return yield r.text();
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] fetchText failed: " + url + " -> " + e.message);
      return "";
    }
  });
}

// ─────────────────────────────────────────────
// TMDB helper (PT-BR + EN + seasons for TV)
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var ep = mediaType === "tv" ? "tv" : "movie";
    var ptUrl = "https://api.themoviedb.org/3/" + ep + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
    var enUrl = "https://api.themoviedb.org/3/" + ep + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=en-US";

    var ptResp = yield httpGet(ptUrl, { headers: { Accept: "application/json" } });
    var ptData = yield ptResp.json();
    var enResp = yield httpGet(enUrl, { headers: { Accept: "application/json" } });
    var enData = yield enResp.json();

    var titlePtBr = mediaType === "tv" ? ptData.name : ptData.title;
    var titleEn = mediaType === "tv" ? enData.name : enData.title;
    var originalTitle = mediaType === "tv" ? enData.original_name : enData.original_title;
    var year = mediaType === "tv"
      ? (ptData.first_air_date ? ptData.first_air_date.substring(0, 4) : "")
      : (ptData.release_date ? ptData.release_date.substring(0, 4) : "");

    // Season metadata (needed to predict episode URLs for seasons > 1)
    var seasons = [];
    if (mediaType === "tv" && enData.seasons) {
      for (var i = 0; i < enData.seasons.length; i++) {
        var s = enData.seasons[i];
        if (s && s.season_number > 0) {
          seasons.push({ season: s.season_number, count: s.episode_count || 0 });
        }
      }
      seasons.sort(function (a, b) { return a.season - b.season; });
    }

    console.log("[" + PROVIDER_TAG + "] TMDB: \"" + titlePtBr + "\" / \"" + titleEn + "\" (" + year + ")" +
      (seasons.length ? " seasons=[" + seasons.map(function (x) { return "S" + x.season + ":" + x.count; }).join(",") + "]" : ""));
    return {
      titlePtBr: titlePtBr,
      titleEn: titleEn,
      originalTitle: originalTitle,
      year: year,
      seasons: seasons,
    };
  });
}

// ─────────────────────────────────────────────
// Slug helper
// ─────────────────────────────────────────────
function generateSlug(title) {
  return title.toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/[ç]/g, "c").replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

// ─────────────────────────────────────────────
// Search RedeCanais
// ─────────────────────────────────────────────
function searchSite(query) {
  return __async(this, null, function* () {
    var searchUrl = BASE_URL + "/pesquisar/?p=" + encodeURIComponent(query);
    console.log("[" + PROVIDER_TAG + "] search: " + query);
    var html = yield fetchText(searchUrl);
    var results = [];
    var re = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var url = m[1].replace(/&amp;/g, "&");
      if (url.charAt(0) === "/") url = BASE_URL + url;
      if (url.indexOf("/assistir/") !== -1) continue;
      if (/\/assistir-[^/]+-\d+\/?$/.test(url) && results.indexOf(url) === -1) {
        results.push(url);
      }
    }
    console.log("[" + PROVIDER_TAG + "] search -> " + results.length + " results");
    return results;
  });
}

// ─────────────────────────────────────────────
// Episode links from a series page
// ─────────────────────────────────────────────
function getEpisodeLinks(seriesUrl) {
  return __async(this, null, function* () {
    var html = yield fetchText(seriesUrl);
    var episodes = {};
    var re = /href=['"]([^'"]*\/assistir-[^'"]*-\d+x\d+-[^'"]+)['"]/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var url = m[1].replace(/&amp;/g, "&");
      if (url.charAt(0) === "/") url = BASE_URL + url;
      var se = url.match(/-(\d+)x(\d+)-/i);
      if (se) {
        var key = parseInt(se[1]) + "x" + parseInt(se[2]);
        if (!episodes[key]) {
          episodes[key] = {
            season: parseInt(se[1]),
            episode: parseInt(se[2]),
            url: url,
          };
        }
      }
    }
    console.log("[" + PROVIDER_TAG + "] episodes found: " + Object.keys(episodes).length);
    return episodes;
  });
}

// ─────────────────────────────────────────────
// Extract embed info (server + id + token) from player page
// ─────────────────────────────────────────────
function extractEmbeds(pageUrl) {
  return __async(this, null, function* () {
    var playerUrl = pageUrl.replace(/\/$/, "") + "/?area=online";
    var html = yield fetchText(playerUrl);

    var embeds = [];

    function addEmbed(server, id, token) {
      for (var i = 0; i < embeds.length; i++) {
        if (embeds[i].server === server && embeds[i].contentId === id) return;
      }
      embeds.push({
        server: server,
        contentId: id,
        token: token,
        redirectUrl: BASE_URL + "/e/redirect.php?sv=" + server + "&id=" + id + "&token=" + token,
      });
    }

    var re1 = /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    var m;
    while ((m = re1.exec(html)) !== null) addEmbed(m[1], m[2], m[3]);

    var re2 = /getembed\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    while ((m = re2.exec(html)) !== null) addEmbed(m[1], m[2], m[3]);

    var re3 = /C_Video\s*\(\s*['"](\d+)['"]\s*,\s*['"]([^'"]+)['"]\)/gi;
    while ((m = re3.exec(html)) !== null) {
      var id = m[1], srv = m[2], tok = "";
      for (var i = 0; i < embeds.length; i++) {
        if (embeds[i].contentId === id) { tok = embeds[i].token; break; }
      }
      if (tok) addEmbed(srv, id, tok);
    }

    var isDubbed = /Dublado|DUB\b/i.test(html);
    var isLegendado = /Legendado|LEG\b/i.test(html);
    var qualityMatch = html.match(/\b(4k|2160p|1080p|720p|480p|CAM|HD|SD)\b/i);
    var quality = qualityMatch ? qualityMatch[1].toUpperCase() : "HD";

    console.log("[" + PROVIDER_TAG + "] embeds: " + embeds.length + " quality=" + quality);
    return {
      playerUrl: playerUrl,
      embeds: embeds,
      isDubbed: isDubbed,
      isLegendado: isLegendado,
      quality: quality,
    };
  });
}

// ─────────────────────────────────────────────
// Resolve redirect.php -> canonical host URL
// ─────────────────────────────────────────────
function resolveRedirect(embed, playerUrl) {
  return __async(this, null, function* () {
    try {
      var r = yield fetch(embed.redirectUrl, {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Referer: playerUrl },
      });
      var loc = r.headers.get("location") || r.headers.get("Location");
      if (!loc) {
        // Some runtimes follow redirect anyway - use final URL
        if (r.url && r.url !== embed.redirectUrl) loc = r.url;
      }
      if (!loc) return null;
      return loc;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] redirect resolve failed: " + e.message);
      return null;
    }
  });
}

// ═════════════════════════════════════════════
// VIDEO HOST EXTRACTORS (return direct m3u8/mp4)
// ═════════════════════════════════════════════

// Dean Edwards p,a,c,k,e,d unpacker (handles count=0 fallback)
function unpack(source) {
  var re = /\}\s*\('([^]+?)'\s*,\s*(\d+|\[\])\s*,\s*(\d+)\s*,\s*'([^]+?)'\.split\('\|'\)/;
  var m = source.match(re);
  if (!m) return source;
  var payload = m[1];
  var radix = parseInt(m[2]);
  if (isNaN(radix)) radix = 62;
  var count = parseInt(m[3]);
  var symtab = m[4].split("|");
  if (count === 0) count = symtab.length;

  function enc(c) {
    return (c < radix ? "" : enc(Math.floor(c / radix))) +
      ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
  }

  while (count--) {
    if (symtab[count]) {
      try {
        payload = payload.replace(new RegExp("\\b" + enc(count) + "\\b", "g"), symtab[count]);
      } catch (e) { /* ignore bad regex */ }
    }
  }
  return payload;
}

// Extract direct URL from Filemoon/Byse
function extractFilemoon(embedUrl) {
  return __async(this, null, function* () {
    try {
      var html = yield fetchText(embedUrl, {
        headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT },
      });
      if (!html) return null;

      var packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]+?)',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)[^)]*\)\)/);
      if (!packedMatch) {
        var fileMatch = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
        if (fileMatch) return fileMatch[1];
        return null;
      }
      var unpacked = unpack(packedMatch[0]);
      var m = unpacked.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
      if (m) return m[1];
      m = unpacked.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/);
      if (m) return m[1];
      m = unpacked.match(/src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
      if (m) return m[1];
      return null;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] filemoon extract failed: " + e.message);
      return null;
    }
  });
}

// Extract direct URL from MixDrop
// Notes:
//   - mixdrop.co redirects to ads; use mixdrop.ag/.sx instead
//   - /f/ endpoint is the download page; /e/ is the embed with packed source
function extractMixDrop(embedUrl) {
  return __async(this, null, function* () {
    try {
      var workingUrl = embedUrl
        .replace(/mixdrop\.co/i, "mixdrop.ag")
        .replace(/mixdrop\.to/i, "mixdrop.ag")
        .replace(/\/f\/([a-zA-Z0-9]+)/, "/e/$1");

      var html = yield fetchText(workingUrl, {
        headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT },
      });
      if (!html) return null;

      var packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\)[^]*?\}\([^]*?\.split\('\|'\)[^)]*\)\)/);
      if (!packedMatch) return null;
      var unpacked = unpack(packedMatch[0]);
      var m = unpacked.match(/MDCore\.wurl\s*=\s*["']([^"']+)["']/) ||
              unpacked.match(/wurl\s*=\s*["']([^"']+)["']/);
      if (!m) return null;
      var u = m[1].trim();
      if (u.indexOf("//") === 0) u = "https:" + u;
      return u;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] mixdrop extract failed: " + e.message);
      return null;
    }
  });
}

// Extract direct URL from StreamTape
function extractStreamTape(embedUrl) {
  return __async(this, null, function* () {
    try {
      var html = yield fetchText(embedUrl, {
        headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT },
      });
      if (!html) return null;

      var m = html.match(/id=["']robotlink["'][^>]*>([^<]+)<\/[^>]+>\s*<script[^>]*>[\s\S]*?innerHTML\s*=\s*(['"])([^'"]+)\2\s*\+\s*(['"])([^'"]+)\4/);
      if (m) {
        var part1 = m[3];
        var part2 = m[5];
        var raw = part1 + part2.substring(3);
        if (raw.indexOf("//") === 0) raw = "https:" + raw;
        return raw;
      }
      var simple = html.match(/robotlink['"]\)\.innerHTML\s*=\s*["']([^"']+)["']\s*\+\s*\(['"]([^'"]+)['"]\)/);
      if (simple) {
        var r2 = simple[1] + simple[2].substring(3);
        if (r2.indexOf("//") === 0) r2 = "https:" + r2;
        return r2;
      }
      return null;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] streamtape extract failed: " + e.message);
      return null;
    }
  });
}

// Extract direct URL from DoodStream
function extractDoodStream(embedUrl) {
  return __async(this, null, function* () {
    try {
      var html = yield fetchText(embedUrl, {
        headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT },
      });
      if (!html) return null;

      var pathMatch = html.match(/\$\.get\s*\(\s*['"]([^'"]*\/pass_md5\/[^'"]+)['"]/);
      if (!pathMatch) pathMatch = html.match(/['"]([^'"]*\/pass_md5\/[^'"]+)['"]/);
      if (!pathMatch) return null;

      var passPath = pathMatch[1];
      var origin = embedUrl.match(/^(https?:\/\/[^\/]+)/);
      if (!origin) return null;
      var passUrl = passPath.indexOf("http") === 0 ? passPath : origin[1] + passPath;

      var tokenMatch = passPath.match(/\/pass_md5\/[^/]+\/([^/?]+)/);
      if (!tokenMatch) tokenMatch = passPath.match(/\/pass_md5\/([^/?]+)/);
      var token = tokenMatch ? tokenMatch[tokenMatch.length - 1] : "";

      var baseResp = yield fetch(passUrl, {
        headers: { Referer: embedUrl, "User-Agent": USER_AGENT },
      });
      var baseText = yield baseResp.text();
      if (!baseText || baseText.indexOf("http") !== 0) return null;

      var rand = "";
      var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (var i = 0; i < 10; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));

      var finalUrl = baseText + rand + "?token=" + token + "&expiry=" + Date.now();
      return finalUrl;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] doodstream extract failed: " + e.message);
      return null;
    }
  });
}

// Hosts that we know fail from Node/Nuvio (Cloudflare-protected SPAs or
// redirect-heavy players we cannot reliably extract without a headless
// browser). Skipping them saves ~5–10s per title on series with multiple
// embeds — which is usually the difference between a fast "found streams"
// response and a timeout in the Nuvio app.
var SKIP_HOSTS = {
  filemoon: 1, byse: 1, doodstream: 1, dood: 1,
};

function isSkippableHost(server, embedUrl) {
  var s = (server || "").toLowerCase();
  if (SKIP_HOSTS[s]) return true;
  if (/filemoon|bysebuho|byse\.|dood(stream|\.|s\.)|myvidplay/i.test(embedUrl || "")) return true;
  return false;
}

function extractDirectFromHost(server, embedUrl) {
  return __async(this, null, function* () {
    var s = (server || "").toLowerCase();
    // Fast path: fail-known hosts don't even try (saves seconds per embed).
    if (isSkippableHost(s, embedUrl)) return null;
    if (s === "mixdrop" || embedUrl.indexOf("mixdrop") !== -1 || embedUrl.indexOf("mdbekjwqa") !== -1 || embedUrl.indexOf("md3b0j6hj") !== -1) {
      return yield extractMixDrop(embedUrl);
    }
    if (s === "streamtape" || embedUrl.indexOf("streamtape") !== -1) {
      return yield extractStreamTape(embedUrl);
    }
    return null;
  });
}

// ─────────────────────────────────────────────
// URL parsing + candidate scoring
// ─────────────────────────────────────────────
// Words/patterns that indicate a movie/special/spin-off and NOT the main series.
// Keep this focused on common BR-indexing patterns seen on the site.
var MOVIE_SUFFIX_RE =
  /(^|-)(o-filme|filme-\d+|a-reuniao|reuniao|especial|uma-historia-de|lenda-do-lobo|a-origem|a-era-de-ouro|a-lenda-da|confronto-ninja|lacos|herdeiros-da|o-caminho-ninja|ascensao|missao|mundial-de-herois|pos-covid|entrando-no|nao-recomendado|guerras-do-streaming|o-fim-da|maior-melhor|panderverso|para-sempre|iluminando-um|l-change|o-ultimo-nome|o-primeiro-nome|yo-o-retorno|sereias-das|os-ratos|a-ultima-aventura|bastidores|agora-e-a-sua|vigilantes|3d2y|contagem-regressiva|amizade-de-ferias|amigos-sorridentes|0-o-filme)(-|$)/;

// Extract info from a RedeCanais URL (series or episode).
function parseSiteUrl(url) {
  var m = url.match(/\/assistir-(.+?)-(dublado|legendado)-(\d{4})-(\d+)\/?$/i);
  if (m) return { kind: "series", slug: m[1], lang: m[2].toLowerCase(), year: m[3], id: parseInt(m[4]) };
  m = url.match(/\/assistir-(.+?)-(\d+)x(\d+)-(dublado|legendado)-(\d+)\/?$/i);
  if (m) return {
    kind: "episode", slug: m[1],
    season: parseInt(m[2]), episode: parseInt(m[3]),
    lang: m[4].toLowerCase(), id: parseInt(m[5]),
  };
  m = url.match(/\/assistir-(.+?)-(dublado|legendado)-(\d+)\/?$/i);
  if (m) return { kind: "series", slug: m[1], lang: m[2].toLowerCase(), year: "", id: parseInt(m[3]) };
  return null;
}

function norm(s) { return s ? s.toLowerCase().replace(/[^a-z0-9]/g, "") : ""; }

function scoreSeriesCandidate(urlSlug, targetSlugs, urlYear, targetYear) {
  var best = 0, bestTargetIdx = -1;
  var u = norm(urlSlug);
  for (var i = 0; i < targetSlugs.length; i++) {
    var t = norm(targetSlugs[i]);
    if (!t) continue;
    var s = 0;
    if (u === t) s = 100;
    else if (u.indexOf(t) === 0) s = 70;
    else if (u.indexOf(t) !== -1) s = 30;
    if (s > best) { best = s; bestTargetIdx = i; }
  }
  if (best === 0) return -999;

  if (targetYear && urlYear) {
    var diff = Math.abs(parseInt(urlYear) - parseInt(targetYear));
    if (diff === 0) best += 40;
    else if (diff === 1) best += 15;
    else if (diff <= 3) best += 5;
    else best -= 15;
  }

  var residue = urlSlug.toLowerCase();
  if (bestTargetIdx >= 0 && targetSlugs[bestTargetIdx]) {
    var tgt = targetSlugs[bestTargetIdx].toLowerCase();
    if (residue.indexOf(tgt) === 0) residue = residue.substring(tgt.length);
  }
  if (MOVIE_SUFFIX_RE.test(residue)) best -= 60;

  // Slight bonus for dublado (most users prefer it, and dublado playlists usually more complete)
  // Neutral-ish; scoring stays deterministic.
  return best;
}

// Validate a guessed episode URL: status 200, has the target SxE in title, and title mentions the series name.
function validateEpisodeUrl(url, expectedSlug, s, e) {
  return __async(this, null, function* () {
    try {
      var r = yield httpGet(url);
      if (!r || !r.ok) return false;
      var html = yield r.text();
      if (!html) return false;
      var titleMatch = html.match(/<title>([^<]+)</i);
      if (!titleMatch) return false;
      var title = titleMatch[1].toLowerCase();
      if (title.indexOf(s + "x" + e) === -1) return false;
      // Title must mention the first meaningful token of the slug
      // so we don't accept an accidental match for another series.
      var parts = expectedSlug.toLowerCase().split("-");
      var firstToken = "";
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].length >= 3 && parts[i] !== "the") { firstToken = parts[i]; break; }
      }
      if (firstToken && title.indexOf(firstToken) === -1) return false;
      return true;
    } catch (_) { return false; }
  });
}

// Predict the URL of a specific episode by extrapolating from a known episode.
// Uses TMDB season counts + sequential site IDs (confirmed pattern for most series).
function predictEpisodeUrl(baseSlug, baseId, baseS, baseE, lang, seasons, targetS, targetE) {
  if (!seasons || seasons.length === 0) return null;
  if (targetS === baseS && targetE === baseE) return null;

  var offset = 0;
  if (targetS === baseS) {
    offset = targetE - baseE;
  } else if (targetS > baseS) {
    var baseInfo = null;
    for (var i = 0; i < seasons.length; i++) if (seasons[i].season === baseS) { baseInfo = seasons[i]; break; }
    if (!baseInfo || !baseInfo.count) return null;
    offset = baseInfo.count - baseE;
    for (var s = baseS + 1; s < targetS; s++) {
      var info = null;
      for (var i = 0; i < seasons.length; i++) if (seasons[i].season === s) { info = seasons[i]; break; }
      if (!info || !info.count) return null;
      offset += info.count;
    }
    offset += targetE;
  } else {
    return null;
  }

  var predictedId = baseId + offset;
  return BASE_URL + "/assistir-" + baseSlug + "-" + targetS + "x" + targetE + "-" + lang + "-" + predictedId + "/";
}

// ─────────────────────────────────────────────
// Gather + score candidates from several search queries
// ─────────────────────────────────────────────
function gatherCandidates(tmdbInfo) {
  return __async(this, null, function* () {
    var queries = [];
    var addedQ = {};
    function pushQ(q) { if (q && !addedQ[q.toLowerCase()]) { addedQ[q.toLowerCase()] = 1; queries.push(q); } }
    pushQ(tmdbInfo.titlePtBr);
    pushQ(tmdbInfo.titleEn);
    pushQ(tmdbInfo.originalTitle);

    var targetSlugs = [];
    var seenSlug = {};
    function pushSlug(v) { var s = generateSlug(v); if (s && !seenSlug[s]) { seenSlug[s] = 1; targetSlugs.push(s); } }
    pushSlug(tmdbInfo.titlePtBr);
    pushSlug(tmdbInfo.titleEn);
    pushSlug(tmdbInfo.originalTitle);

    var all = [];
    var seenUrl = {};
    for (var qi = 0; qi < queries.length; qi++) {
      var res = yield searchSite(queries[qi]);
      for (var i = 0; i < res.length; i++) {
        if (!seenUrl[res[i]]) { seenUrl[res[i]] = 1; all.push(res[i]); }
      }
    }
    return { urls: all, targetSlugs: targetSlugs };
  });
}

// ─────────────────────────────────────────────
// Find movie content page
// ─────────────────────────────────────────────
function findMoviePage(tmdbInfo) {
  return __async(this, null, function* () {
    var gathered = yield gatherCandidates(tmdbInfo);
    var all = gathered.urls, targetSlugs = gathered.targetSlugs;

    var candidates = [];
    for (var i = 0; i < all.length; i++) {
      var parsed = parseSiteUrl(all[i]);
      if (!parsed || parsed.kind !== "series") continue;
      var sc = scoreSeriesCandidate(parsed.slug, targetSlugs, parsed.year, tmdbInfo.year);
      if (sc > 0) candidates.push({ url: all[i], score: sc, lang: parsed.lang });
    }
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.lang === "dublado" && b.lang !== "dublado") return -1;
      if (b.lang === "dublado" && a.lang !== "dublado") return 1;
      return 0;
    });
    if (candidates.length === 0) {
      console.log("[" + PROVIDER_TAG + "] no movie candidates");
      return null;
    }
    console.log("[" + PROVIDER_TAG + "] movie pick (score=" + candidates[0].score + "): " + candidates[0].url);
    return candidates[0].url;
  });
}

// ─────────────────────────────────────────────
// Find episode page
// ─────────────────────────────────────────────
function findEpisodePage(tmdbInfo, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    seasonNum = parseInt(seasonNum);
    episodeNum = parseInt(episodeNum);
    var gathered = yield gatherCandidates(tmdbInfo);
    var all = gathered.urls, targetSlugs = gathered.targetSlugs;

    // 1) Direct episode match in search results. This happens when the target
    //    episode was recently added and the site surfaces it in search.
    for (var i = 0; i < all.length; i++) {
      var p = parseSiteUrl(all[i]);
      if (!p || p.kind !== "episode") continue;
      if (p.season !== seasonNum || p.episode !== episodeNum) continue;
      // Ensure slug belongs to our target series
      var sc = scoreSeriesCandidate(p.slug, targetSlugs, "", "");
      if (sc >= 30) {
        console.log("[" + PROVIDER_TAG + "] direct episode hit: " + all[i]);
        return all[i];
      }
    }

    // 2) Score series candidates (the main series page listing episodes).
    var candidates = [];
    for (var i = 0; i < all.length; i++) {
      var p2 = parseSiteUrl(all[i]);
      if (!p2 || p2.kind !== "series") continue;
      var sc2 = scoreSeriesCandidate(p2.slug, targetSlugs, p2.year, tmdbInfo.year);
      if (sc2 > 0) candidates.push({
        url: all[i], slug: p2.slug, year: p2.year, id: p2.id, lang: p2.lang, score: sc2,
      });
    }
    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.lang === "dublado" && b.lang !== "dublado") return -1;
      if (b.lang === "dublado" && a.lang !== "dublado") return 1;
      return 0;
    });
    if (candidates.length === 0) {
      console.log("[" + PROVIDER_TAG + "] no series candidates");
      return null;
    }
    console.log("[" + PROVIDER_TAG + "] series candidates: " +
      candidates.slice(0, 3).map(function (c) { return c.score + ":" + c.url; }).join(" | "));

    // 3) For each top candidate, try to find the target episode:
    //    a) load series page → get listed episodes (usually season 1)
    //    b) predict URL using TMDB season counts + sequential IDs → validate
    //    c) if prediction fails with a small offset, try nearby IDs (±5)
    var topN = Math.min(3, candidates.length);
    for (var ci = 0; ci < topN; ci++) {
      var cand = candidates[ci];
      var episodes = yield getEpisodeLinks(cand.url);
      var key = seasonNum + "x" + episodeNum;
      if (episodes[key]) return episodes[key].url;

      // Find a known episode on this series to use as the "base" for prediction.
      // Prefer an episode from season 1 (most reliable).
      var baseEp = null;
      var epKeys = Object.keys(episodes);
      for (var k = 0; k < epKeys.length; k++) {
        var info = episodes[epKeys[k]];
        if (info.season === 1) { baseEp = info; break; }
      }
      if (!baseEp && epKeys.length > 0) baseEp = episodes[epKeys[0]];
      if (!baseEp) continue; // series page with no episode links at all

      // Use candidate slug (e.g. "breaking-bad-a-quimica-do-mal") from the episode URL.
      var baseParsed = parseSiteUrl(baseEp.url);
      if (!baseParsed || baseParsed.kind !== "episode") continue;

      var predicted = predictEpisodeUrl(
        baseParsed.slug, baseParsed.id,
        baseParsed.season, baseParsed.episode,
        baseParsed.lang,
        tmdbInfo.seasons,
        seasonNum, episodeNum
      );
      if (!predicted) continue;

      // Try predicted + ±3 around it IN PARALLEL — keeps latency bounded.
      var pm = predicted.match(/-(\d+)\/?$/);
      if (!pm) continue;
      var pid = parseInt(pm[1]);
      var idsToTry = [pid, pid + 1, pid - 1, pid + 2, pid - 2, pid + 3, pid - 3];
      var parallel = idsToTry.map(function (candidateId) {
        var u = predicted.replace(/-\d+\/?$/, "-" + candidateId + "/");
        return (function () {
          return __async(null, null, function* () {
            var ok = yield validateEpisodeUrl(u, baseParsed.slug, seasonNum, episodeNum);
            return ok ? { url: u, delta: candidateId - pid } : null;
          });
        })();
      });
      var results = yield Promise.all(parallel);
      // Prefer lowest |delta|
      var best = null;
      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri];
        if (!r) continue;
        if (!best || Math.abs(r.delta) < Math.abs(best.delta)) best = r;
      }
      if (best) {
        console.log("[" + PROVIDER_TAG + "] predicted episode OK (Δ=" + best.delta + "): " + best.url);
        return best.url;
      }
    }

    return null;
  });
}

// ─────────────────────────────────────────────
// Build streams from resolved direct URLs
// ─────────────────────────────────────────────
function formatTitle(mediaInfo) {
  if (mediaInfo.mediaType === "tv" && mediaInfo.season && mediaInfo.episode) {
    var s = String(mediaInfo.season);
    var e = String(mediaInfo.episode);
    if (s.length < 2) s = "0" + s;
    if (e.length < 2) e = "0" + e;
    return mediaInfo.titlePtBr + " S" + s + "E" + e;
  }
  return mediaInfo.titlePtBr + (mediaInfo.year ? " (" + mediaInfo.year + ")" : "");
}

function buildStream(directUrl, host, hostDomain, embedInfo, mediaInfo) {
  var audio = embedInfo.isDubbed ? "Dublado" : embedInfo.isLegendado ? "Legendado" : "PT-BR";
  var quality = embedInfo.quality || "HD";
  var title = formatTitle(mediaInfo) + " [" + audio + "] [" + quality + "]";
  var refererHost = "https://" + hostDomain + "/";

  return {
    name: PROVIDER_TAG + " - " + (SERVER_NAMES[host] || host),
    title: title,
    url: directUrl,
    quality: quality,
    type: directUrl.indexOf(".m3u8") !== -1 ? "hls" : "url",
    headers: {
      "User-Agent": USER_AGENT,
      Referer: refererHost,
      Origin: refererHost.replace(/\/$/, ""),
    },
  };
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (!mediaType) mediaType = "movie";
  return __async(this, null, function* () {
    console.log("[" + PROVIDER_TAG + "] getStreams tmdb=" + tmdbId + " type=" + mediaType +
      (mediaType === "tv" ? " S" + seasonNum + "E" + episodeNum : ""));

    try {
      var tmdb = yield getTmdbInfo(tmdbId, mediaType);
      if (!tmdb.titlePtBr && !tmdb.titleEn) return [];

      var contentUrl = mediaType === "tv"
        ? yield findEpisodePage(tmdb, seasonNum, episodeNum)
        : yield findMoviePage(tmdb);

      if (!contentUrl) {
        console.log("[" + PROVIDER_TAG + "] content page not found");
        return [];
      }

      var embedInfo = yield extractEmbeds(contentUrl);
      if (embedInfo.embeds.length === 0) {
        console.log("[" + PROVIDER_TAG + "] no embeds on player page");
        return [];
      }

      var mediaInfo = {
        titlePtBr: tmdb.titlePtBr || tmdb.titleEn,
        year: tmdb.year,
        mediaType: mediaType,
        season: seasonNum,
        episode: episodeNum,
      };

      // 1) Filter out known-broken hosts BEFORE hitting the network.
      //    Each redirect resolve + extract would cost ~3-5s of dead time.
      var usable = [];
      for (var fi = 0; fi < embedInfo.embeds.length; fi++) {
        var em = embedInfo.embeds[fi];
        if (isSkippableHost(em.server, em.url)) {
          console.log("[" + PROVIDER_TAG + "] skip host " + em.server + " (known broken)");
          continue;
        }
        usable.push(em);
      }
      if (usable.length === 0) {
        console.log("[" + PROVIDER_TAG + "] no playable hosts (all embeds filtered)");
        return [];
      }

      // 2) Resolve redirects + extract direct URLs IN PARALLEL. Sequential
      //    was adding up: 5 embeds × 2-3s = 10-15s per series, and Nuvio
      //    would frequently time out. Promise.all is Hermes-safe.
      var tasks = usable.map(function (emb) {
        return (function () {
          return __async(null, null, function* () {
            var canonical = yield resolveRedirect(emb, embedInfo.playerUrl);
            if (!canonical) return null;
            var hostMatch = canonical.match(/^https?:\/\/([^\/]+)/);
            var hostDomain = hostMatch ? hostMatch[1] : "";
            var direct = yield extractDirectFromHost(emb.server, canonical);
            if (!direct) {
              console.log("[" + PROVIDER_TAG + "] ✗ " + emb.server + " failed");
              return null;
            }
            console.log("[" + PROVIDER_TAG + "] ✓ " + emb.server + " -> " + direct.substring(0, 80));
            return buildStream(direct, emb.server, hostDomain, embedInfo, mediaInfo);
          });
        })();
      });

      var settled = yield Promise.all(tasks);
      var streams = [];
      for (var si = 0; si < settled.length; si++) {
        if (settled[si]) streams.push(settled[si]);
      }

      console.log("[" + PROVIDER_TAG + "] returning " + streams.length + " playable streams");
      return streams;
    } catch (e) {
      console.error("[" + PROVIDER_TAG + "] fatal: " + e.message);
      return [];
    }
  });
}

module.exports = { getStreams };
