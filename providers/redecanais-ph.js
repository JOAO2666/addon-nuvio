/**
 * RedeCanais PH - Nuvio Provider (Mirror)
 * Scrapes movies, TV series and anime from redecanais.ph
 * Returns DIRECT video URLs (m3u8 / mp4) resolving the embed pages
 * so the Nuvio native player can play them.
 *
 * Hermes compatible (generator based, no async/await syntax at top level).
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://redecanais.ph";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
var PROVIDER_TAG = "RedeCanais.ph";

var SERVER_NAMES = {
  filemoon: "Filemoon",
  byse: "Filemoon",
  doodstream: "DoodStream",
  dood: "DoodStream",
  mixdrop: "MixDrop",
  streamtape: "StreamTape",
};

var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (v) { try { step(generator.next(v)); } catch (e) { reject(e); } };
    var rejected  = function (v) { try { step(generator.throw(v)); } catch (e) { reject(e); } };
    var step = function (x) {
      return x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

function httpGet(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    var headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      opts.headers || {}
    );
    return yield fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      redirect: opts.redirect || "follow",
    });
  });
}

function fetchText(url, opts) {
  return __async(this, null, function* () {
    try {
      var r = yield httpGet(url, opts);
      return yield r.text();
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] fetchText failed: " + url);
      return "";
    }
  });
}

function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var ep = mediaType === "tv" ? "tv" : "movie";
    var ptResp = yield httpGet("https://api.themoviedb.org/3/" + ep + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=pt-BR",
      { headers: { Accept: "application/json" } });
    var pt = yield ptResp.json();
    var enResp = yield httpGet("https://api.themoviedb.org/3/" + ep + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=en-US",
      { headers: { Accept: "application/json" } });
    var en = yield enResp.json();

    var titlePtBr = mediaType === "tv" ? pt.name : pt.title;
    var titleEn = mediaType === "tv" ? en.name : en.title;
    var year = mediaType === "tv"
      ? (pt.first_air_date ? pt.first_air_date.substring(0, 4) : "")
      : (pt.release_date ? pt.release_date.substring(0, 4) : "");
    console.log("[" + PROVIDER_TAG + "] TMDB: \"" + titlePtBr + "\" (" + year + ")");
    return { titlePtBr: titlePtBr, titleEn: titleEn, year: year };
  });
}

function generateSlug(title) {
  return title.toLowerCase()
    .replace(/[àáâãäå]/g, "a").replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i").replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u").replace(/[ç]/g, "c").replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-")
    .replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function searchSite(query) {
  return __async(this, null, function* () {
    var url = BASE_URL + "/pesquisar/?p=" + encodeURIComponent(query);
    var html = yield fetchText(url);
    var results = [];
    var re = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var u = m[1].replace(/&amp;/g, "&");
      if (u.charAt(0) === "/") u = BASE_URL + u;
      if (u.indexOf("/assistir/") !== -1) continue;
      if (/\/assistir-[^/]+-\d+\/?$/.test(u) && results.indexOf(u) === -1) results.push(u);
    }
    return results;
  });
}

function getEpisodeLinks(seriesUrl) {
  return __async(this, null, function* () {
    var html = yield fetchText(seriesUrl);
    var episodes = {};
    var re = /href=['"]([^'"]*\/assistir-[^'"]*-\d+x\d+-[^'"]+)['"]/gi;
    var m;
    while ((m = re.exec(html)) !== null) {
      var u = m[1].replace(/&amp;/g, "&");
      if (u.charAt(0) === "/") u = BASE_URL + u;
      var se = u.match(/-(\d+)x(\d+)-/i);
      if (se) {
        var key = parseInt(se[1]) + "x" + parseInt(se[2]);
        if (!episodes[key]) episodes[key] = { url: u, season: parseInt(se[1]), episode: parseInt(se[2]) };
      }
    }
    return episodes;
  });
}

function extractEmbeds(pageUrl) {
  return __async(this, null, function* () {
    var playerUrl = pageUrl.replace(/\/$/, "") + "/?area=online";
    var html = yield fetchText(playerUrl);
    var embeds = [];

    function add(srv, id, tok) {
      for (var i = 0; i < embeds.length; i++) {
        if (embeds[i].server === srv && embeds[i].contentId === id) return;
      }
      embeds.push({
        server: srv, contentId: id, token: tok,
        redirectUrl: BASE_URL + "/e/redirect.php?sv=" + srv + "&id=" + id + "&token=" + tok,
      });
    }

    var re1 = /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    var m;
    while ((m = re1.exec(html)) !== null) add(m[1], m[2], m[3]);

    var re2 = /getembed\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    while ((m = re2.exec(html)) !== null) add(m[1], m[2], m[3]);

    var re3 = /C_Video\s*\(\s*['"](\d+)['"]\s*,\s*['"]([^'"]+)['"]\)/gi;
    while ((m = re3.exec(html)) !== null) {
      var id = m[1], srv = m[2], tok = "";
      for (var i = 0; i < embeds.length; i++) {
        if (embeds[i].contentId === id) { tok = embeds[i].token; break; }
      }
      if (tok) add(srv, id, tok);
    }

    var isDubbed = /Dublado|DUB\b/i.test(html);
    var isLegendado = /Legendado|LEG\b/i.test(html);
    var qualityMatch = html.match(/\b(4k|2160p|1080p|720p|480p|CAM|HD|SD)\b/i);
    var quality = qualityMatch ? qualityMatch[1].toUpperCase() : "HD";

    return { playerUrl: playerUrl, embeds: embeds, isDubbed: isDubbed, isLegendado: isLegendado, quality: quality };
  });
}

function resolveRedirect(embed, playerUrl) {
  return __async(this, null, function* () {
    try {
      var r = yield fetch(embed.redirectUrl, {
        method: "GET", redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Referer: playerUrl },
      });
      var loc = r.headers.get("location") || r.headers.get("Location");
      if (!loc && r.url && r.url !== embed.redirectUrl) loc = r.url;
      return loc || null;
    } catch (e) { return null; }
  });
}

// ═════════════════════════════════════════════
// Host extractors (return direct m3u8/mp4 URL)
// ═════════════════════════════════════════════

function unpack(source) {
  var re = /\}\s*\('([^]+?)'\s*,\s*(\d+|\[\])\s*,\s*(\d+)\s*,\s*'([^]+?)'\.split\('\|'\)/;
  var m = source.match(re);
  if (!m) return source;
  var payload = m[1];
  var radix = parseInt(m[2]); if (isNaN(radix)) radix = 62;
  var count = parseInt(m[3]);
  var symtab = m[4].split("|");
  if (count === 0) count = symtab.length;
  function enc(c) {
    return (c < radix ? "" : enc(Math.floor(c / radix))) +
      ((c = c % radix) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
  }
  while (count--) {
    if (symtab[count]) {
      try { payload = payload.replace(new RegExp("\\b" + enc(count) + "\\b", "g"), symtab[count]); }
      catch (e) {}
    }
  }
  return payload;
}

function extractFilemoon(embedUrl) {
  return __async(this, null, function* () {
    var html = yield fetchText(embedUrl, { headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT } });
    if (!html) return null;
    var p = html.match(/eval\(function\(p,a,c,k,e,d\)\{[\s\S]*?\}\('([\s\S]+?)',\s*\d+,\s*\d+,\s*'[\s\S]+?'\.split\('\|'\)[^)]*\)\)/);
    if (!p) {
      var direct = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
      return direct ? direct[1] : null;
    }
    var u = unpack(p[0]);
    var m = u.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/) ||
            u.match(/sources\s*:\s*\[\s*\{[^}]*file\s*:\s*["']([^"']+)["']/) ||
            u.match(/src\s*:\s*["']([^"']+\.m3u8[^"']*)["']/);
    return m ? m[1] : null;
  });
}

function extractMixDrop(embedUrl) {
  return __async(this, null, function* () {
    var workingUrl = embedUrl
      .replace(/mixdrop\.co/i, "mixdrop.ag")
      .replace(/mixdrop\.to/i, "mixdrop.ag")
      .replace(/\/f\/([a-zA-Z0-9]+)/, "/e/$1");
    var html = yield fetchText(workingUrl, { headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT } });
    if (!html) return null;
    var p = html.match(/eval\(function\(p,a,c,k,e,d\)[^]*?\}\([^]*?\.split\('\|'\)[^)]*\)\)/);
    if (!p) return null;
    var u = unpack(p[0]);
    var m = u.match(/MDCore\.wurl\s*=\s*["']([^"']+)["']/) || u.match(/wurl\s*=\s*["']([^"']+)["']/);
    if (!m) return null;
    var url = m[1].trim();
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url;
  });
}

function extractStreamTape(embedUrl) {
  return __async(this, null, function* () {
    var html = yield fetchText(embedUrl, { headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT } });
    if (!html) return null;
    var m = html.match(/robotlink['"]\)\.innerHTML\s*=\s*["']([^"']+)["']\s*\+\s*\(['"]([^'"]+)['"]\)/);
    if (!m) return null;
    var url = m[1] + m[2].substring(3);
    if (url.indexOf("//") === 0) url = "https:" + url;
    return url;
  });
}

function extractDoodStream(embedUrl) {
  return __async(this, null, function* () {
    var html = yield fetchText(embedUrl, { headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT } });
    if (!html) return null;

    var pm = html.match(/\$\.get\s*\(\s*['"]([^'"]*\/pass_md5\/[^'"]+)['"]/) ||
             html.match(/['"]([^'"]*\/pass_md5\/[^'"]+)['"]/);
    if (!pm) return null;

    var passPath = pm[1];
    var origin = embedUrl.match(/^(https?:\/\/[^\/]+)/);
    if (!origin) return null;
    var passUrl = passPath.indexOf("http") === 0 ? passPath : origin[1] + passPath;

    var tokenMatch = passPath.match(/\/pass_md5\/[^/]+\/([^/?]+)/) || passPath.match(/\/pass_md5\/([^/?]+)/);
    var token = tokenMatch ? tokenMatch[tokenMatch.length - 1] : "";

    try {
      var r = yield fetch(passUrl, { headers: { Referer: embedUrl, "User-Agent": USER_AGENT } });
      var text = yield r.text();
      if (!text || text.indexOf("http") !== 0) return null;
      var rand = "", chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      for (var i = 0; i < 10; i++) rand += chars.charAt(Math.floor(Math.random() * chars.length));
      return text + rand + "?token=" + token + "&expiry=" + Date.now();
    } catch (e) { return null; }
  });
}

// Known-broken hosts (same as redecanais.js): skip to save seconds per title.
var SKIP_HOSTS_PH = {
  filemoon: 1, byse: 1, doodstream: 1, dood: 1,
};

function isSkippableHostPh(server, embedUrl) {
  var s = (server || "").toLowerCase();
  if (SKIP_HOSTS_PH[s]) return true;
  if (/filemoon|bysebuho|byse\.|dood(stream|\.|s\.)|myvidplay/i.test(embedUrl || "")) return true;
  return false;
}

function extractDirectFromHost(server, embedUrl) {
  return __async(this, null, function* () {
    var s = (server || "").toLowerCase();
    if (isSkippableHostPh(s, embedUrl)) return null;
    if (s === "mixdrop" || embedUrl.indexOf("mixdrop") !== -1 || embedUrl.indexOf("mdbekjwqa") !== -1 || embedUrl.indexOf("md3b0j6hj") !== -1) {
      return yield extractMixDrop(embedUrl);
    }
    if (s === "streamtape" || embedUrl.indexOf("streamtape") !== -1) {
      return yield extractStreamTape(embedUrl);
    }
    return null;
  });
}

function findMoviePage(tmdb) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdb.titlePtBr) titles.push(tmdb.titlePtBr);
    if (tmdb.titleEn && tmdb.titleEn !== tmdb.titlePtBr) titles.push(tmdb.titleEn);
    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchSite(titles[t]);
      var movies = [];
      for (var i = 0; i < results.length; i++) {
        if (!/\d+x\d+/.test(results[i].toLowerCase())) movies.push(results[i]);
      }
      for (var i = 0; i < movies.length; i++) {
        var u = movies[i].toLowerCase();
        if (u.indexOf(slug) !== -1 && tmdb.year && u.indexOf(tmdb.year) !== -1) return movies[i];
      }
      for (var i = 0; i < movies.length; i++) {
        if (movies[i].toLowerCase().indexOf(slug) !== -1) return movies[i];
      }
      if (movies.length > 0) return movies[0];
    }
    return null;
  });
}

function findEpisodePage(tmdb, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdb.titlePtBr) titles.push(tmdb.titlePtBr);
    if (tmdb.titleEn && tmdb.titleEn !== tmdb.titlePtBr) titles.push(tmdb.titleEn);
    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchSite(titles[t]);
      var seriesPages = [], episodePages = [];
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
        var pad = parseInt(seasonNum) + "x" + (parseInt(episodeNum) < 10 ? "0" + parseInt(episodeNum) : parseInt(episodeNum));
        if (episodes[pad]) return episodes[pad].url;
      }
    }
    return null;
  });
}

function formatTitle(m) {
  if (m.mediaType === "tv" && m.season && m.episode) {
    var s = String(m.season); if (s.length < 2) s = "0" + s;
    var e = String(m.episode); if (e.length < 2) e = "0" + e;
    return m.titlePtBr + " S" + s + "E" + e;
  }
  return m.titlePtBr + (m.year ? " (" + m.year + ")" : "");
}

function buildStream(directUrl, host, hostDomain, embedInfo, mediaInfo) {
  var audio = embedInfo.isDubbed ? "Dublado" : embedInfo.isLegendado ? "Legendado" : "PT-BR";
  var quality = embedInfo.quality || "HD";
  var refererHost = "https://" + hostDomain + "/";
  return {
    name: PROVIDER_TAG + " - " + (SERVER_NAMES[host] || host),
    title: formatTitle(mediaInfo) + " [" + audio + "] [" + quality + "]",
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
      if (!contentUrl) return [];
      var embedInfo = yield extractEmbeds(contentUrl);
      if (embedInfo.embeds.length === 0) return [];

      var mediaInfo = {
        titlePtBr: tmdb.titlePtBr || tmdb.titleEn,
        year: tmdb.year, mediaType: mediaType,
        season: seasonNum, episode: episodeNum,
      };

      // Drop known-broken hosts before hitting the network, then extract
      // the remaining embeds in parallel.
      var usable = [];
      for (var fi = 0; fi < embedInfo.embeds.length; fi++) {
        var em = embedInfo.embeds[fi];
        if (!isSkippableHostPh(em.server, em.url)) usable.push(em);
      }

      var tasks = usable.map(function (emb) {
        return (function () {
          return __async(null, null, function* () {
            var canonical = yield resolveRedirect(emb, embedInfo.playerUrl);
            if (!canonical) return null;
            var hostMatch = canonical.match(/^https?:\/\/([^\/]+)/);
            var hostDomain = hostMatch ? hostMatch[1] : "";
            var direct = yield extractDirectFromHost(emb.server, canonical);
            if (!direct) return null;
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

      console.log("[" + PROVIDER_TAG + "] returning " + streams.length + " streams");
      return streams;
    } catch (e) {
      console.error("[" + PROVIDER_TAG + "] error: " + e.message);
      return [];
    }
  });
}

module.exports = { getStreams };
