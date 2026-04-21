/**
 * Videasy BR - Nuvio Provider
 *
 * Uses api.videasy.net to fetch HLS (.m3u8) streams from Brazilian sources
 *   - SuperFlix  (api.videasy.net/superflix)
 *   - OverFlix   (api.videasy.net/overflix)
 *   - VisionCine (api.videasy.net/visioncine)
 *
 * The API returns encrypted hex payloads that are decrypted through
 * https://enc-dec.app/api/dec-videasy with the TMDB ID as the key.
 * Decrypted payload contains { subtitles, sources:[{quality,url}] } and the
 * URLs are already multi-audio HLS playlists with Portuguese (por) track,
 * so the Nuvio native player plays them with zero friction.
 *
 * Hermes-safe (generator + __async helper, no native async/await).
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var PROVIDER_TAG = "VideasyBR";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

var DECRYPT_ENDPOINT = "https://enc-dec.app/api/dec-videasy";
var PLAYER_ORIGIN = "https://player.videasy.net";

var SERVERS = [
  { id: "superflix",  label: "SuperFlix"  },
  { id: "overflix",   label: "OverFlix"   },
  { id: "visioncine", label: "VisionCine" },
];

// ─────────────────────────────────────────────
// Async helper compatible with Hermes engine
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
function fetchJson(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          { "User-Agent": USER_AGENT, Connection: "keep-alive" },
          opts.headers || {}
        ),
        body: opts.body || undefined,
      });
      var t = yield r.text();
      if (!r.ok) return { _error: r.status, _text: t };
      try { return JSON.parse(t); } catch (e) { return { _raw: t }; }
    } catch (e) {
      return { _error: -1, _text: e && e.message };
    }
  });
}

function fetchText(url, opts) {
  if (!opts) opts = {};
  return __async(this, null, function* () {
    try {
      var r = yield fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign(
          { "User-Agent": USER_AGENT, Connection: "keep-alive" },
          opts.headers || {}
        ),
        body: opts.body || undefined,
      });
      return yield r.text();
    } catch (e) {
      return "";
    }
  });
}

// ─────────────────────────────────────────────
// TMDB info (title, year, imdb_id)
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, type) {
  return __async(this, null, function* () {
    var url =
      "https://api.themoviedb.org/3/" +
      (type === "tv" ? "tv" : "movie") +
      "/" +
      tmdbId +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=pt-BR&append_to_response=external_ids";
    var data = yield fetchJson(url);
    if (!data || data._error) return null;
    var title = data.title || data.name || "";
    var originalTitle = data.original_title || data.original_name || "";
    var releaseDate = data.release_date || data.first_air_date || "";
    var year = releaseDate ? parseInt(releaseDate.split("-")[0], 10) : null;
    var imdbId = (data.external_ids && data.external_ids.imdb_id) || "";
    return {
      title: title || originalTitle,
      originalTitle: originalTitle,
      year: year,
      imdbId: imdbId,
    };
  });
}

// ─────────────────────────────────────────────
// Build request URL exactly like videasy's player
// (double-encodes the title to match the reference impl).
// ─────────────────────────────────────────────
function buildRequestUrl(server, media, season, episode) {
  var title = media.title || "";
  var doubleEncoded = encodeURIComponent(
    encodeURIComponent(title).replace(/\+/g, "%20")
  );
  var params = [
    "title=" + doubleEncoded,
    "mediaType=" + encodeURIComponent(media.type),
    "year=" + encodeURIComponent(media.year || ""),
    "tmdbId=" + encodeURIComponent(media.tmdbId),
    "imdbId=" + encodeURIComponent(media.imdbId || ""),
  ];
  if (media.type === "tv") {
    params.push("seasonId=" + encodeURIComponent(season || 1));
    params.push("episodeId=" + encodeURIComponent(episode || 1));
  }
  return (
    "https://api.videasy.net/" + server + "/sources-with-title?" + params.join("&")
  );
}

// ─────────────────────────────────────────────
// Decrypt a payload using enc-dec.app
// ─────────────────────────────────────────────
function decryptPayload(encrypted, tmdbId) {
  return __async(this, null, function* () {
    var r = yield fetchJson(DECRYPT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ text: encrypted, id: tmdbId }),
    });
    if (!r || r._error) return null;
    return r.result || null;
  });
}

// ─────────────────────────────────────────────
// Fetch sources from a single server id
// ─────────────────────────────────────────────
function fetchFromServer(serverId, serverLabel, media, season, episode) {
  return __async(this, null, function* () {
    var url = buildRequestUrl(serverId, media, season, episode);
    console.log("[" + PROVIDER_TAG + "] " + serverLabel + " -> " + url);
    var enc = yield fetchText(url);
    if (!enc || enc.indexOf("error") === 0 || enc.charAt(0) === "{") {
      // 500 JSON errors from the upstream — just skip
      return [];
    }
    var decrypted = yield decryptPayload(enc, media.tmdbId);
    if (!decrypted || !decrypted.sources) return [];

    var out = [];
    for (var i = 0; i < decrypted.sources.length; i++) {
      var s = decrypted.sources[i];
      if (!s || !s.url) continue;
      var quality = s.quality || "Auto";
      if (/^(hd|auto|high)$/i.test(String(quality))) quality = "Auto";
      if (/^(sd|low|standard)$/i.test(String(quality))) quality = "480p";

      var isHls = s.url.indexOf(".m3u8") !== -1 || s.url.indexOf("type=hls") !== -1;
      out.push({
        name: PROVIDER_TAG + " · " + serverLabel,
        title:
          (media.title || "") +
          (media.year ? " (" + media.year + ")" : "") +
          (media.type === "tv" && season != null && episode != null
            ? " S" + String(season).padStart(2, "0") + "E" + String(episode).padStart(2, "0")
            : "") +
          " · " + serverLabel + " [PT-BR]",
        quality: quality,
        url: s.url,
        type: isHls ? "hls" : "url",
        behaviorHints: {
          notWebReady: false,
          bingeGroup: "videasy-br-" + serverId,
        },
        headers: {
          "User-Agent": USER_AGENT,
          Referer: PLAYER_ORIGIN + "/",
          Origin: PLAYER_ORIGIN,
          Accept: isHls
            ? "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
            : "video/mp4,video/*;q=0.9,*/*;q=0.8",
        },
        provider: "videasy-br",
      });
    }
    return out;
  });
}

// ─────────────────────────────────────────────
// Public entry point required by Nuvio
// ─────────────────────────────────────────────
function getStreams(tmdbId, type, season, episode) {
  return __async(this, null, function* () {
    try {
      if (!tmdbId) return [];
      var info = yield getTmdbInfo(tmdbId, type);
      if (!info || !info.title) {
        console.log("[" + PROVIDER_TAG + "] TMDB lookup failed for " + tmdbId);
        return [];
      }
      var media = {
        tmdbId: tmdbId,
        title: info.title,
        year: info.year,
        imdbId: info.imdbId,
        type: type === "tv" ? "tv" : "movie",
      };

      console.log(
        "[" + PROVIDER_TAG + "] " + media.type + " " +
        media.title + " (" + (media.year || "?") + ") -> searching BR servers"
      );

      // Fetch from every server in parallel
      var promises = [];
      for (var i = 0; i < SERVERS.length; i++) {
        var s = SERVERS[i];
        promises.push(fetchFromServer(s.id, s.label, media, season, episode));
      }
      var results = yield Promise.all(promises);

      var all = [];
      for (var j = 0; j < results.length; j++) {
        for (var k = 0; k < results[j].length; k++) all.push(results[j][k]);
      }

      // De-duplicate by URL
      var seen = {};
      var unique = [];
      for (var u = 0; u < all.length; u++) {
        if (!seen[all[u].url]) {
          seen[all[u].url] = 1;
          unique.push(all[u]);
        }
      }

      console.log(
        "[" + PROVIDER_TAG + "] total streams: " + unique.length
      );
      return unique;
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
