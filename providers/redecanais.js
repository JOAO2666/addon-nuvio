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
// TMDB helper (PT-BR + EN)
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
    var year = mediaType === "tv"
      ? (ptData.first_air_date ? ptData.first_air_date.substring(0, 4) : "")
      : (ptData.release_date ? ptData.release_date.substring(0, 4) : "");

    console.log("[" + PROVIDER_TAG + "] TMDB: \"" + titlePtBr + "\" / \"" + titleEn + "\" (" + year + ")");
    return { titlePtBr: titlePtBr, titleEn: titleEn, year: year };
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

function extractDirectFromHost(server, embedUrl) {
  return __async(this, null, function* () {
    var s = (server || "").toLowerCase();
    if (s === "filemoon" || s === "byse" || embedUrl.indexOf("filemoon") !== -1 || embedUrl.indexOf("byse") !== -1) {
      return yield extractFilemoon(embedUrl);
    }
    if (s === "mixdrop" || embedUrl.indexOf("mixdrop") !== -1 || embedUrl.indexOf("mdbekjwqa") !== -1 || embedUrl.indexOf("md3b0j6hj") !== -1) {
      return yield extractMixDrop(embedUrl);
    }
    if (s === "streamtape" || embedUrl.indexOf("streamtape") !== -1) {
      return yield extractStreamTape(embedUrl);
    }
    if (s === "doodstream" || s === "dood" || /dood(?:\.|stream|s\.)/i.test(embedUrl)) {
      return yield extractDoodStream(embedUrl);
    }
    return yield extractFilemoon(embedUrl);
  });
}

// ─────────────────────────────────────────────
// Find movie content page
// ─────────────────────────────────────────────
function findMoviePage(tmdbInfo) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) titles.push(tmdbInfo.titleEn);

    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchSite(titles[t]);
      if (results.length === 0) continue;

      var movies = [];
      for (var i = 0; i < results.length; i++) {
        if (!/\d+x\d+/.test(results[i].toLowerCase())) movies.push(results[i]);
      }
      for (var i = 0; i < movies.length; i++) {
        var u = movies[i].toLowerCase();
        if (u.indexOf(slug) !== -1 && tmdbInfo.year && u.indexOf(tmdbInfo.year) !== -1) return movies[i];
      }
      for (var i = 0; i < movies.length; i++) {
        if (movies[i].toLowerCase().indexOf(slug) !== -1) return movies[i];
      }
      if (movies.length > 0) return movies[0];
    }
    return null;
  });
}

// ─────────────────────────────────────────────
// Find episode page
// ─────────────────────────────────────────────
function findEpisodePage(tmdbInfo, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) titles.push(tmdbInfo.titleEn);

    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchSite(titles[t]);
      if (results.length === 0) continue;

      var seriesPages = [];
      var episodePages = [];
      for (var i = 0; i < results.length; i++) {
        if (/\d+x\d+/.test(results[i].toLowerCase())) episodePages.push(results[i]);
        else seriesPages.push(results[i]);
      }

      for (var i = 0; i < episodePages.length; i++) {
        var se = episodePages[i].toLowerCase().match(/-(\d+)x(\d+)-/);
        if (se && parseInt(se[1]) === parseInt(seasonNum) && parseInt(se[2]) === parseInt(episodeNum)) {
          return episodePages[i];
        }
      }

      var seriesUrl = null;
      for (var i = 0; i < seriesPages.length; i++) {
        if (seriesPages[i].toLowerCase().indexOf(slug) !== -1) { seriesUrl = seriesPages[i]; break; }
      }
      if (!seriesUrl && seriesPages.length > 0) seriesUrl = seriesPages[0];

      if (seriesUrl) {
        var episodes = yield getEpisodeLinks(seriesUrl);
        var key = parseInt(seasonNum) + "x" + parseInt(episodeNum);
        if (episodes[key]) return episodes[key].url;

        // Try zero padded
        var pad = parseInt(seasonNum) + "x" + (parseInt(episodeNum) < 10 ? "0" + parseInt(episodeNum) : parseInt(episodeNum));
        if (episodes[pad]) return episodes[pad].url;
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

      var streams = [];

      for (var i = 0; i < embedInfo.embeds.length; i++) {
        var emb = embedInfo.embeds[i];
        var canonical = yield resolveRedirect(emb, embedInfo.playerUrl);
        if (!canonical) continue;

        var hostDomain = "";
        var hostMatch = canonical.match(/^https?:\/\/([^\/]+)/);
        if (hostMatch) hostDomain = hostMatch[1];

        var direct = yield extractDirectFromHost(emb.server, canonical);
        if (direct) {
          streams.push(buildStream(direct, emb.server, hostDomain, embedInfo, mediaInfo));
          console.log("[" + PROVIDER_TAG + "] ✓ " + emb.server + " -> " + direct.substring(0, 80));
        } else {
          console.log("[" + PROVIDER_TAG + "] ✗ failed to extract direct from " + emb.server + " (" + canonical + ")");
        }
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
