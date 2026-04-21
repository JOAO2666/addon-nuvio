/**
 * AnimeFire - Nuvio Provider
 *
 * Scrapes animefire.io — a Brazilian anime catalog that exposes a public
 * JSON endpoint `/video/{slug}/{episode}` returning direct lightspeedst.net
 * MP4 URLs (no Cloudflare, no iframe resolution, no obfuscation).
 *
 * Flow:
 *   1) Pull Portuguese + original titles from TMDB
 *   2) Search animefire with a few title variations (/pesquisar/{word})
 *   3) Extract candidate slugs, normalize them (strip the -todos-os-episodios
 *      suffix, build dubbed / season variants)
 *   4) Hit /video/{slug}/{ep} for each candidate and return every source the
 *      upstream emits — already labelled "360p / 720p / 1080p" and in MP4.
 *
 * Hermes-safe (generator + __async helper, no async/await).
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://animefire.io";
var PROVIDER_TAG = "AnimeFire";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

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
// HTTP helpers
// ─────────────────────────────────────────────
function fetchText(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          {
            "User-Agent": USER_AGENT,
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9",
          },
          opts.headers || {}
        ),
      });
      return { status: r.status, text: yield r.text() };
    } catch (e) {
      return { status: -1, text: "" };
    }
  });
}

function fetchJson(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          {
            "User-Agent": USER_AGENT,
            Accept: "application/json, text/plain, */*",
            "Accept-Language": "pt-BR,pt;q=0.9",
            "X-Requested-With": "XMLHttpRequest",
          },
          opts.headers || {}
        ),
      });
      var t = yield r.text();
      try { return { status: r.status, data: JSON.parse(t) }; }
      catch (e) { return { status: r.status, data: null, raw: t }; }
    } catch (e) {
      return { status: -1, data: null };
    }
  });
}

// ─────────────────────────────────────────────
// Slug utilities
// ─────────────────────────────────────────────
var STOPWORDS = {
  a: 1, o: 1, os: 1, as: 1, de: 1, do: 1, da: 1, dos: 1, das: 1,
  the: 1, of: 1, and: 1, e: 1, "no": 1, na: 1, nos: 1, nas: 1,
};

function normalize(str) {
  if (!str) return "";
  str = str.toLowerCase();
  str = str.replace(/[áàâãä]/g, "a")
           .replace(/[éèêë]/g, "e")
           .replace(/[íìîï]/g, "i")
           .replace(/[óòôõö]/g, "o")
           .replace(/[úùûü]/g, "u")
           .replace(/[ç]/g, "c")
           .replace(/[ñ]/g, "n")
           .replace(/[:：]/g, " ")
           .replace(/[^a-z0-9\s-]/g, " ")
           .replace(/\s+/g, " ")
           .trim();
  return str;
}

function slugify(str) {
  return normalize(str).replace(/\s+/g, "-");
}

function pickSearchWord(title) {
  var norm = normalize(title);
  var words = norm.split(" ").filter(function (w) { return w && !STOPWORDS[w]; });
  // Prefer the longest non-stopword that contains only letters
  words.sort(function (a, b) { return b.length - a.length; });
  return words[0] || "anime";
}

// Turn "foo-bar-dublado-todos-os-episodios" → "foo-bar-dublado"
function stripListSuffix(slug) {
  return slug
    .replace(/-todos-os-episodios$/, "")
    .replace(/-todos-episodios$/, "");
}

function seasonOrdinalToken(season) {
  if (!season || season <= 1) return "";
  // Anime-BR usually uses "2nd-season", "3rd-season", "4th-season" ...
  var s = parseInt(season, 10);
  var ord = s + "th";
  if (s === 1) ord = "1st";
  else if (s === 2) ord = "2nd";
  else if (s === 3) ord = "3rd";
  return ord + "-season";
}

// Score a slug vs a list of tokens from the title (prefer slugs that include more tokens)
function scoreSlug(slug, tokens) {
  var score = 0;
  for (var i = 0; i < tokens.length; i++) {
    if (tokens[i] && slug.indexOf(tokens[i]) !== -1) score += 1;
  }
  if (/-dublado/.test(slug)) score += 0.25; // slight preference for dubbed
  if (/-todos-os-episodios/.test(slug)) score += 0.1; // search-result slug
  return score;
}

// ─────────────────────────────────────────────
// TMDB
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    var path = type === "tv" ? "tv" : "movie";
    var base = "https://api.themoviedb.org/3/" + path + "/" + tmdbId;
    var ptRes = yield fetchJson(base + "?api_key=" + TMDB_API_KEY + "&language=pt-BR");
    if (!ptRes.data) return null;
    var d = ptRes.data;
    return {
      title: d.title || d.name || "",
      originalTitle: d.original_title || d.original_name || "",
      year: ((d.release_date || d.first_air_date || "").split("-")[0]) || null,
    };
  });
}

// ─────────────────────────────────────────────
// Search animefire
// ─────────────────────────────────────────────
function searchSlugs(word) {
  return __async(this, null, function* () {
    var url = BASE_URL + "/pesquisar/" + encodeURIComponent(word);
    var res = yield fetchText(url);
    if (!res || !res.text || res.status !== 200 || res.text.length < 2000) return [];
    var slugs = [];
    var re = /href=["']https?:\/\/animefire\.[a-z]+\/animes\/([^"'\/\?#]+)["']/gi;
    var m;
    while ((m = re.exec(res.text)) !== null) {
      var slug = m[1];
      if (slugs.indexOf(slug) === -1) slugs.push(slug);
    }
    return slugs;
  });
}

// ─────────────────────────────────────────────
// Fetch /video/{slug}/{ep} (returns direct mp4 URLs)
// ─────────────────────────────────────────────
function fetchEpisodeSources(slug, episode) {
  return __async(this, null, function* () {
    var ep = episode || 1;
    var url = BASE_URL + "/video/" + slug + "/" + ep;
    var res = yield fetchJson(url, {
      headers: { Referer: BASE_URL + "/animes/" + slug + "/" + ep },
    });
    if (!res || !res.data) return null;
    var j = res.data;
    if (!j.data || !j.data.length) return null;
    return { slug: slug, ep: ep, sources: j.data };
  });
}

// ─────────────────────────────────────────────
// Build list of candidate slugs to try
// ─────────────────────────────────────────────
function buildCandidateSlugs(tmdbInfo, season) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle].filter(Boolean);
  var direct = [];
  var seen = {};
  function push(s) {
    if (s && !seen[s]) { seen[s] = 1; direct.push(s); }
  }
  // Direct slugs from both titles
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    push(base + "-dublado");
    var ord = seasonOrdinalToken(season);
    if (ord) {
      push(base + "-" + ord);
      push(base + "-" + ord + "-dublado");
      push(base + "-season-" + season);
    }
    // "second-season" / "final-season" fallbacks
    if (season && season > 1) {
      push(base + "-final-season");
      push(base + "-" + season);
    }
  }
  return direct;
}

// ─────────────────────────────────────────────
// Stream formatting
// ─────────────────────────────────────────────
function labelToQuality(label) {
  if (!label) return "Auto";
  var m = String(label).match(/(\d{3,4})/);
  if (m) return m[1] + "p";
  if (/fhd|full/i.test(label)) return "1080p";
  if (/hd/i.test(label)) return "720p";
  if (/sd/i.test(label)) return "360p";
  return String(label);
}

function toStream(sourceItem, info, slug, season, episode) {
  var isHls = sourceItem.src.indexOf(".m3u8") !== -1;
  var quality = labelToQuality(sourceItem.label);
  var titleBase =
    (info.title || info.originalTitle || "Anime") +
    (info.year ? " (" + info.year + ")" : "");
  var epTag = episode
    ? " · EP" + (season > 1 ? "S" + season + "E" + episode : String(episode))
    : "";
  return {
    name: PROVIDER_TAG + " · MP4",
    title: titleBase + epTag + " · " + slug + " [PT-BR]",
    quality: quality,
    url: sourceItem.src,
    type: isHls ? "hls" : "url",
    behaviorHints: {
      notWebReady: false,
      bingeGroup: "animefire-" + slug,
    },
    headers: {
      "User-Agent": USER_AGENT,
      Referer: BASE_URL + "/",
      Origin: BASE_URL,
      Accept: isHls
        ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
        : "video/mp4,video/*;q=0.9,*/*;q=0.8",
    },
    provider: "animefire",
  };
}

// ─────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (!tmdbId) return [];
      var info = yield getTmdbInfo(tmdbId, type);
      if (!info || (!info.title && !info.originalTitle)) return [];

      console.log(
        "[" + PROVIDER_TAG + "] " + type + " " +
        (info.title || info.originalTitle) + " (" + (info.year || "?") + ")"
      );

      // 1) direct slug guesses
      var candidates = buildCandidateSlugs(info, season);

      // 2) plus slugs discovered via search
      var searchWords = [];
      if (info.title) searchWords.push(pickSearchWord(info.title));
      if (info.originalTitle) {
        var w2 = pickSearchWord(info.originalTitle);
        if (searchWords.indexOf(w2) === -1) searchWords.push(w2);
      }

      var titleTokens = (
        normalize(info.title) + " " + normalize(info.originalTitle)
      )
        .split(" ")
        .filter(function (w) { return w && !STOPWORDS[w] && w.length >= 3; });

      for (var s = 0; s < searchWords.length; s++) {
        var slugs = yield searchSlugs(searchWords[s]);
        slugs.sort(function (a, b) {
          return scoreSlug(b, titleTokens) - scoreSlug(a, titleTokens);
        });
        // keep the top 10 scored entries
        var top = slugs.slice(0, 10);
        for (var t = 0; t < top.length; t++) {
          var rawSlug = top[t];
          var clean = stripListSuffix(rawSlug);
          if (candidates.indexOf(clean) === -1) candidates.push(clean);
          if (candidates.indexOf(rawSlug) === -1) candidates.push(rawSlug);
        }
      }

      console.log(
        "[" + PROVIDER_TAG + "] trying " + candidates.length + " slug candidates"
      );

      var ep = type === "tv" ? (episode || 1) : 1;
      var streams = [];
      var resolved = {};
      var tried = 0;
      var MAX_ATTEMPTS = 14;

      for (var c = 0; c < candidates.length && tried < MAX_ATTEMPTS; c++) {
        var slug = candidates[c];
        if (resolved[slug]) continue;
        resolved[slug] = 1;
        tried++;
        var r = yield fetchEpisodeSources(slug, ep);
        if (!r) continue;
        console.log(
          "[" + PROVIDER_TAG + "] OK slug=" + slug + " ep=" + ep +
          " sources=" + r.sources.length
        );
        for (var i = 0; i < r.sources.length; i++) {
          streams.push(toStream(r.sources[i], info, slug, season, ep));
        }
        // once we have found at least one working slug with 2+ qualities, stop
        if (streams.length >= 3) break;
      }

      // Sort by quality desc (1080 > 720 > 360)
      streams.sort(function (a, b) {
        var qa = parseInt(String(a.quality).replace("p", ""), 10) || 0;
        var qb = parseInt(String(b.quality).replace("p", ""), 10) || 0;
        return qb - qa;
      });

      console.log(
        "[" + PROVIDER_TAG + "] total streams: " + streams.length
      );
      return streams;
    } catch (e) {
      console.log("[" + PROVIDER_TAG + "] fatal: " + (e && e.message));
      return [];
    }
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams: getStreams };
} else if (typeof global !== "undefined") {
  global.getStreams = getStreams;
}
