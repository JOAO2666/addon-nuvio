/**
 * AnimeFire - Nuvio Provider
 *
 * Scrapes animefire.io — a Brazilian anime-only catalog that exposes a public
 * JSON endpoint `/video/{slug}/{episode}` returning direct lightspeedst.net
 * MP4 URLs (no Cloudflare, no iframe resolution, no obfuscation).
 *
 * IMPORTANT: This provider ONLY returns streams for content that is actually
 * anime (original_language=ja OR origin_country includes JP OR Animation +
 * Japanese). For everything else (Breaking Bad, The Boys, House of the
 * Dragon, ...) it returns an empty list so the user is not served a random
 * unrelated anime that happens to share one word with the title.
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
  to: 1, in: 1, on: 1, at: 1, for: 1, ni: 1, wa: 1, ga: 1, wo: 1, ka: 1,
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

function tokensOf(title, minLen) {
  if (!minLen) minLen = 3;
  return normalize(title)
    .split(" ")
    .filter(function (w) { return w && !STOPWORDS[w] && w.length >= minLen; });
}

function pickSearchWord(title) {
  var words = tokensOf(title, 3);
  // Prefer the longest non-stopword
  words.sort(function (a, b) { return b.length - a.length; });
  return words[0] || "";
}

// Turn "foo-bar-dublado-todos-os-episodios" → "foo-bar-dublado"
function stripListSuffix(slug) {
  return slug
    .replace(/-todos-os-episodios$/, "")
    .replace(/-todos-episodios$/, "");
}

// Strip trailing qualifiers we add/commonly see: -dublado, -legendado,
// -2nd-season, -final-season, -(number), so we can compare the "body".
function slugBody(slug) {
  return slug
    .replace(/-dublado$/, "")
    .replace(/-legendado$/, "")
    .replace(/-(1st|2nd|3rd|[0-9]+th)-season$/, "")
    .replace(/-season-[0-9]+$/, "")
    .replace(/-final-season$/, "")
    .replace(/-[0-9]+$/, "");
}

function seasonOrdinalToken(season) {
  if (!season || season <= 1) return "";
  var s = parseInt(season, 10);
  var ord = s + "th";
  if (s === 1) ord = "1st";
  else if (s === 2) ord = "2nd";
  else if (s === 3) ord = "3rd";
  return ord + "-season";
}

// ─────────────────────────────────────────────
// Strict slug <-> title matching
// ─────────────────────────────────────────────
//
// A slug is considered a valid candidate if EITHER:
//   (a) its "body" (without trailing season/dubbed markers) starts with one
//       of the expected slug roots (built from TMDB titles), OR
//   (b) its body equals a title slug entirely, OR
//   (c) for single-word titles, the body equals the title token exactly
//       (e.g. "naruto" matches "naruto", "naruto-dublado", but NOT
//       "naruto-shippuden" unless user asked for shippuden).
//
// This avoids "dear-boys-dublado" matching "The Boys" (score by token
// intersection was 1/1 = 100% previously, which was wrong).
function isStrictMatch(slug, expectedRoots, strongTokens) {
  if (!slug) return false;
  var body = slugBody(stripListSuffix(slug));

  // (a) body starts with a known root (tightest possible)
  for (var i = 0; i < expectedRoots.length; i++) {
    var root = expectedRoots[i];
    if (!root) continue;
    if (body === root) return true;
    if (body.indexOf(root + "-") === 0) return true;
  }

  // (b) body contains a root as a "word" boundary anywhere ("-root-" or
  //     "-root" at end). Covers "fullmetal-alchemist-brotherhood-dublado"
  //     vs root "fullmetal-alchemist".
  for (var j = 0; j < expectedRoots.length; j++) {
    var r2 = expectedRoots[j];
    if (!r2 || r2.length < 6) continue; // avoid short roots (e.g. "naruto" ok, "the" not)
    if (body.indexOf("-" + r2 + "-") !== -1) return true;
    if (body.length > r2.length && body.substring(body.length - r2.length - 1) === "-" + r2) return true;
  }

  // (c) For multi-token titles, accept if a **majority** of the strong
  //     tokens (>=4 chars, non-stopword) appear in the slug, with a
  //     minimum of 2 matches. This catches romaji variants such as:
  //       "Demon Slayer: Kimetsu no Yaiba" → "kimetsu-no-yaiba-*"
  //       (2 of 4 strong tokens match)
  //     but rejects "dear-boys-dublado" for "The Boys" (strongTokens=[boys], only 1).
  if (strongTokens && strongTokens.length >= 2) {
    var hits = 0;
    for (var k = 0; k < strongTokens.length; k++) {
      if (body.indexOf(strongTokens[k]) !== -1) hits++;
    }
    var needed = Math.max(2, Math.ceil(strongTokens.length * 0.5));
    if (hits >= needed) return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// TMDB — includes origin info so we can refuse non-anime titles
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    var path = type === "tv" ? "tv" : "movie";
    var base = "https://api.themoviedb.org/3/" + path + "/" + tmdbId;
    var ptRes = yield fetchJson(base + "?api_key=" + TMDB_API_KEY + "&language=pt-BR");
    if (!ptRes.data) return null;
    var d = ptRes.data;

    var origin = d.origin_country || [];
    var genres = (d.genres || []).map(function (g) { return g.name; });
    var isJapaneseOrigin =
      d.original_language === "ja" ||
      origin.indexOf("JP") !== -1 ||
      origin.indexOf("JA") !== -1;
    var isAnime = isJapaneseOrigin;

    // Fetch alternative titles (gives us romaji aliases like "Shingeki no
    // Kyojin" for "Attack on Titan"). This is optional — if it fails we
    // still work with title + originalTitle.
    var altTitles = [];
    var altRes = yield fetchJson(base + "/alternative_titles?api_key=" + TMDB_API_KEY);
    if (altRes && altRes.data) {
      var results = altRes.data.results || altRes.data.titles || [];
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r || !r.title) continue;
        // Keep romaji / english / portuguese aliases; skip Chinese/Korean/etc.
        var c = (r.iso_3166_1 || "").toUpperCase();
        if (c === "JP" || c === "US" || c === "GB" || c === "BR" || c === "PT") {
          altTitles.push(r.title);
        }
      }
    }

    return {
      title: d.title || d.name || "",
      originalTitle: d.original_title || d.original_name || "",
      altTitles: altTitles,
      year: ((d.release_date || d.first_air_date || "").split("-")[0]) || null,
      originalLanguage: d.original_language || "",
      originCountry: origin,
      genres: genres,
      isAnime: isAnime,
    };
  });
}

// ─────────────────────────────────────────────
// Search animefire (lowercase single-word search is the most reliable)
// ─────────────────────────────────────────────
function searchSlugs(word) {
  return __async(this, null, function* () {
    if (!word) return [];
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
// Build list of expected slug roots (for strict matching)
// ─────────────────────────────────────────────
function buildExpectedRoots(tmdbInfo, season) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle]
    .concat(tmdbInfo.altTitles || [])
    .filter(Boolean);
  var roots = [];
  var seen = {};
  function push(s) { if (s && !seen[s]) { seen[s] = 1; roots.push(s); } }
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    // Variant without leading "the"
    push(base.replace(/^the-/, ""));
    // Variant after colon (e.g. "Demon Slayer: Kimetsu no Yaiba" → "kimetsu-no-yaiba")
    var afterColon = titles[i].indexOf(":") !== -1
      ? titles[i].split(":").slice(1).join(":")
      : "";
    if (afterColon) {
      var slug = slugify(afterColon);
      if (slug) push(slug);
    }
  }
  return roots;
}

// ─────────────────────────────────────────────
// Build list of candidate slugs to try (direct guesses)
// ─────────────────────────────────────────────
function buildDirectCandidates(tmdbInfo, season) {
  var titles = [tmdbInfo.title, tmdbInfo.originalTitle].filter(Boolean);
  var direct = [];
  var seen = {};
  function push(s) { if (s && !seen[s]) { seen[s] = 1; direct.push(s); } }
  for (var i = 0; i < titles.length; i++) {
    var base = slugify(titles[i]);
    if (!base) continue;
    push(base);
    push(base + "-dublado");
    push(base + "-legendado");
    var ord = seasonOrdinalToken(season);
    if (ord) {
      push(base + "-" + ord);
      push(base + "-" + ord + "-dublado");
      push(base + "-season-" + season);
    }
    if (season && season > 1) {
      push(base + "-final-season");
      push(base + "-" + season);
      push(base + "-" + season + "-dublado");
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

function toStream(sourceItem, info, slug, season, episode, relevance) {
  var isHls = sourceItem.src.indexOf(".m3u8") !== -1;
  var quality = labelToQuality(sourceItem.label);
  var titleBase =
    (info.title || info.originalTitle || "Anime") +
    (info.year ? " (" + info.year + ")" : "");
  var epTag = episode
    ? " · EP" + (season > 1 ? "S" + season + "E" + episode : String(episode))
    : "";
  return {
    _relevance: relevance || 0,
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

      // GATE: only run for anime-ish content. Otherwise we risk returning
      // a random anime that shares a word with the title.
      if (!info.isAnime) {
        console.log(
          "[" + PROVIDER_TAG + "] skipping non-anime title: " +
          (info.title || info.originalTitle) +
          " (lang=" + info.originalLanguage +
          ", origin=" + (info.originCountry || []).join(",") + ")"
        );
        return [];
      }

      console.log(
        "[" + PROVIDER_TAG + "] anime " + type + " " +
        (info.title || info.originalTitle) + " (" + (info.year || "?") + ")"
      );

      var expectedRoots = buildExpectedRoots(info, season);
      // Strong tokens: 4+ chars, non-stopword, pulled from ALL known
      // titles (pt, original, romaji alternatives).
      var strongTokens = [];
      var tokenSource = [info.title, info.originalTitle].concat(info.altTitles || []);
      var seenTok = {};
      for (var si = 0; si < tokenSource.length; si++) {
        var toks = tokensOf(tokenSource[si], 4);
        for (var ti = 0; ti < toks.length; ti++) {
          if (!seenTok[toks[ti]]) { seenTok[toks[ti]] = 1; strongTokens.push(toks[ti]); }
        }
      }

      // 1) direct guesses (always strict-pass)
      var candidates = buildDirectCandidates(info, season);

      // 2) plus slugs discovered via search, but filtered through isStrictMatch
      var searchWords = [];
      var allTitlesForSearch = [info.title, info.originalTitle].concat(info.altTitles || []);
      for (var ws = 0; ws < allTitlesForSearch.length; ws++) {
        var w = pickSearchWord(allTitlesForSearch[ws]);
        if (w && searchWords.indexOf(w) === -1) searchWords.push(w);
      }

      for (var s = 0; s < searchWords.length; s++) {
        var slugs = yield searchSlugs(searchWords[s]);
        for (var t = 0; t < slugs.length; t++) {
          var raw = slugs[t];
          var clean = stripListSuffix(raw);
          // Require strict match — no more false positives.
          if (!isStrictMatch(clean, expectedRoots, strongTokens)) continue;
          if (candidates.indexOf(clean) === -1) candidates.push(clean);
          if (candidates.indexOf(raw) === -1) candidates.push(raw);
        }
      }

      console.log(
        "[" + PROVIDER_TAG + "] " + candidates.length +
        " candidates (roots=" + JSON.stringify(expectedRoots) + ")"
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
        // Double-check: the resolved slug must still strict-match the title.
        if (!isStrictMatch(slug, expectedRoots, strongTokens)) continue;

        // Compute relevance: body starts-with a root > body-contains-root > token-only match.
        var body = slugBody(stripListSuffix(slug));
        var relevance = 0;
        for (var rr = 0; rr < expectedRoots.length; rr++) {
          var root = expectedRoots[rr];
          if (!root) continue;
          if (body === root) { relevance = Math.max(relevance, 100); break; }
          if (body.indexOf(root + "-") === 0) { relevance = Math.max(relevance, 90); break; }
          if (body.indexOf("-" + root + "-") !== -1) relevance = Math.max(relevance, 70);
        }
        if (!relevance) relevance = 50; // token-only match

        console.log(
          "[" + PROVIDER_TAG + "] OK slug=" + slug + " ep=" + ep +
          " sources=" + r.sources.length + " rel=" + relevance
        );
        for (var i = 0; i < r.sources.length; i++) {
          streams.push(toStream(r.sources[i], info, slug, season, ep, relevance));
        }
        // Stop once we have at least one high-relevance match with multiple qualities.
        if (streams.length >= 3 && relevance >= 90) break;
        if (streams.length >= 6) break;
      }

      // Sort: highest relevance first, then highest quality.
      streams.sort(function (a, b) {
        if (a._relevance !== b._relevance) return b._relevance - a._relevance;
        var qa = parseInt(String(a.quality).replace("p", ""), 10) || 0;
        var qb = parseInt(String(b.quality).replace("p", ""), 10) || 0;
        return qb - qa;
      });
      // Strip internal fields before returning.
      streams = streams.map(function (s) { delete s._relevance; return s; });
      // Cap to 6 to keep the UI clean.
      if (streams.length > 6) streams = streams.slice(0, 6);

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
