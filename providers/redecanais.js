/**
 * RedeCanais - Nuvio Provider
 * Scrapes movies, TV series, and anime from redecanaistv.autos
 * Supports: Filemoon (Byse), DoodStream, MixDrop, StreamTape
 * Content Language: Portuguese (BR) - Dubbed & Subtitled
 *
 * Series/Anime Strategy:
 *   1. Search for the series main page
 *   2. Scrape episode links from the main page (format: SxE e.g. 1x1, 1x2)
 *   3. Navigate to the specific episode page
 *   4. Extract embed info from the episode page
 */
"use strict";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://www.redecanaistv.autos";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

var SERVER_NAMES = {
  filemoon: "Byse",
  doodstream: "DoodStream",
  mixdrop: "MixDrop",
  streamtape: "StreamTape",
};

// ─────────────────────────────────────────────
// Async Helper (compatibility with Hermes/RN)
// ─────────────────────────────────────────────
var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = function (value) {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
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
// HTTP Helper
// ─────────────────────────────────────────────
function makeRequest(url, options) {
  if (!options) options = {};
  return __async(this, null, function* () {
    var headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        Connection: "keep-alive",
      },
      options.headers || {}
    );

    try {
      var response = yield fetch(url, {
        method: options.method || "GET",
        headers: headers,
        redirect: options.redirect || "follow",
      });
      if (!response.ok) {
        throw new Error(
          "HTTP " + response.status + ": " + response.statusText
        );
      }
      return response;
    } catch (error) {
      console.error(
        "[RedeCanais] Request failed for " + url + ": " + error.message
      );
      throw error;
    }
  });
}

// ─────────────────────────────────────────────
// TMDB Helper - Get title in PT-BR and EN
// ─────────────────────────────────────────────
function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var endpoint = mediaType === "tv" ? "tv" : "movie";
    var url =
      "https://api.themoviedb.org/3/" +
      endpoint +
      "/" +
      tmdbId +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=pt-BR";
    var response = yield makeRequest(url, {
      headers: { Accept: "application/json" },
    });
    var data = yield response.json();

    var titlePtBr = mediaType === "tv" ? data.name : data.title;

    // Get EN title
    var urlEn =
      "https://api.themoviedb.org/3/" +
      endpoint +
      "/" +
      tmdbId +
      "?api_key=" +
      TMDB_API_KEY +
      "&language=en-US";
    var responseEn = yield makeRequest(urlEn, {
      headers: { Accept: "application/json" },
    });
    var dataEn = yield responseEn.json();
    var titleEn = mediaType === "tv" ? dataEn.name : dataEn.title;

    var year =
      mediaType === "tv"
        ? data.first_air_date
          ? data.first_air_date.substring(0, 4)
          : ""
        : data.release_date
        ? data.release_date.substring(0, 4)
        : "";

    var imdbId = data.imdb_id || (dataEn ? dataEn.imdb_id : null);

    if (!imdbId && mediaType === "tv") {
      try {
        var extUrl =
          "https://api.themoviedb.org/3/tv/" +
          tmdbId +
          "/external_ids?api_key=" +
          TMDB_API_KEY;
        var extResp = yield makeRequest(extUrl, {
          headers: { Accept: "application/json" },
        });
        var extData = yield extResp.json();
        imdbId = extData.imdb_id;
      } catch (e) {
        console.log("[RedeCanais] Could not fetch external IDs");
      }
    }

    console.log(
      '[RedeCanais] TMDB Info: "' +
        titlePtBr +
        '" / "' +
        titleEn +
        '" (' +
        year +
        ") IMDB: " +
        imdbId
    );

    return {
      titlePtBr: titlePtBr,
      titleEn: titleEn,
      year: year,
      imdbId: imdbId,
      data: data,
      totalSeasons: data.number_of_seasons || 0,
    };
  });
}

// ─────────────────────────────────────────────
// Slug helper
// ─────────────────────────────────────────────
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõö]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ç]/g, "c")
    .replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─────────────────────────────────────────────
// Search RedeCanais via /pesquisar/ endpoint
// ─────────────────────────────────────────────
function searchRedeCanais(query) {
  return __async(this, null, function* () {
    console.log('[RedeCanais] Searching for: "' + query + '"');

    var searchUrl =
      BASE_URL + "/pesquisar/?p=" + encodeURIComponent(query);

    try {
      var response = yield makeRequest(searchUrl);
      var html = yield response.text();

      var results = [];

      // Site uses SINGLE QUOTES for content links
      var linkRegex =
        /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
      var match;

      while ((match = linkRegex.exec(html)) !== null) {
        var url = match[1].replace(/&amp;/g, "&");
        if (url.charAt(0) === "/") {
          url = BASE_URL + url;
        }
        // Skip category/listing pages
        if (url.indexOf("/assistir/") !== -1) continue;
        // Must match pattern /assistir-SOMETHING-NUMBER/
        if (/\/assistir-[^/]+-\d+\/?$/.test(url)) {
          if (results.indexOf(url) === -1) {
            results.push(url);
          }
        }
      }

      console.log("[RedeCanais] Found " + results.length + " search results");
      return results;
    } catch (error) {
      console.error("[RedeCanais] Search failed: " + error.message);
      return [];
    }
  });
}

// ─────────────────────────────────────────────
// Extract episode links from a series main page
// Episode URLs follow pattern: /assistir-SERIES-SxE-AUDIO-ID/
// ─────────────────────────────────────────────
function getEpisodeLinks(seriesPageUrl) {
  return __async(this, null, function* () {
    console.log("[RedeCanais] Fetching series page for episodes: " + seriesPageUrl);

    try {
      var response = yield makeRequest(seriesPageUrl);
      var html = yield response.text();

      var episodes = {};

      // Find all episode links (format: NxN in URL)
      var linkRegex = /href=['"]([^'"]*\/assistir-[^'"]*-\d+x\d+-[^'"]+)['"]/gi;
      var match;

      while ((match = linkRegex.exec(html)) !== null) {
        var url = match[1].replace(/&amp;/g, "&");
        if (url.charAt(0) === "/") {
          url = BASE_URL + url;
        }

        // Extract season and episode from URL (e.g., -1x1- or -1x01-)
        var seMatch = url.match(/-(\d+)x(\d+)-/i);
        if (seMatch) {
          var season = parseInt(seMatch[1]);
          var episode = parseInt(seMatch[2]);
          var key = season + "x" + episode;

          if (!episodes[key]) {
            episodes[key] = {
              season: season,
              episode: episode,
              url: url,
            };
          }
        }
      }

      var count = Object.keys(episodes).length;
      console.log("[RedeCanais] Found " + count + " episode links");
      return episodes;
    } catch (error) {
      console.error("[RedeCanais] Failed to get episodes: " + error.message);
      return {};
    }
  });
}

// ─────────────────────────────────────────────
// Extract embed info from a content page
// ─────────────────────────────────────────────
function extractEmbedInfo(pageUrl) {
  return __async(this, null, function* () {
    console.log("[RedeCanais] Extracting embeds from: " + pageUrl);

    var playerUrl = pageUrl;
    if (playerUrl.indexOf("?area=online") === -1) {
      playerUrl = playerUrl.replace(/\/$/, "") + "/?area=online";
    }

    try {
      var response = yield makeRequest(playerUrl);
      var html = yield response.text();

      var embeds = [];

      // Method 1: Extract redirect.php links
      var redirectRegex =
        /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
      var match;

      while ((match = redirectRegex.exec(html)) !== null) {
        var server = match[1];
        var id = match[2];
        var token = match[3];

        embeds.push({
          server: server,
          contentId: id,
          token: token,
          embedUrl:
            BASE_URL +
            "/e/getembed.php?sv=" + server +
            "&id=" + id +
            "&token=" + token,
        });
      }

      // Method 2: Extract getembed.php links
      var embedRegex =
        /getembed\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;

      while ((match = embedRegex.exec(html)) !== null) {
        var server = match[1];
        var id = match[2];
        var token = match[3];

        var exists = false;
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].server === server && embeds[i].contentId === id) {
            exists = true;
            break;
          }
        }

        if (!exists) {
          embeds.push({
            server: server,
            contentId: id,
            token: token,
            embedUrl:
              BASE_URL +
              "/e/getembed.php?sv=" + server +
              "&id=" + id +
              "&token=" + token,
          });
        }
      }

      // Method 3: Extract C_Video JavaScript calls
      var cVideoRegex =
        /C_Video\s*\(\s*['"](\d+)['"],\s*['"]([^'"]+)['"]\)/gi;
      while ((match = cVideoRegex.exec(html)) !== null) {
        var id = match[1];
        var server = match[2];
        var tokenForId = "";
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].contentId === id) {
            tokenForId = embeds[i].token;
            break;
          }
        }

        var exists = false;
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].server === server && embeds[i].contentId === id) {
            exists = true;
            break;
          }
        }

        if (!exists && tokenForId) {
          embeds.push({
            server: server,
            contentId: id,
            token: tokenForId,
            embedUrl:
              BASE_URL +
              "/e/getembed.php?sv=" + server +
              "&id=" + id +
              "&token=" + tokenForId,
          });
        }
      }

      // Detect audio and quality
      var isDubbed =
        html.indexOf("Dublado") !== -1 || html.indexOf("DUB") !== -1;
      var isLegendado =
        html.indexOf("Legendado") !== -1 || html.indexOf("LEG") !== -1;
      var isHD = html.indexOf("HD") !== -1;
      var isCAM = html.indexOf("CAM") !== -1;
      var quality = isCAM ? "CAM" : isHD ? "HD" : "SD";

      console.log(
        "[RedeCanais] Found " + embeds.length + " embeds, Quality: " + quality
      );

      return {
        embeds: embeds,
        isDubbed: isDubbed,
        isLegendado: isLegendado,
        quality: quality,
      };
    } catch (error) {
      console.error(
        "[RedeCanais] Failed to extract embeds: " + error.message
      );
      return { embeds: [], quality: "Unknown" };
    }
  });
}

// ─────────────────────────────────────────────
// Find content page for MOVIES
// ─────────────────────────────────────────────
function findMoviePage(tmdbInfo) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) {
      titles.push(tmdbInfo.titleEn);
    }

    for (var t = 0; t < titles.length; t++) {
      var query = titles[t];
      var slug = generateSlug(query);
      var results = yield searchRedeCanais(query);

      if (results.length === 0) continue;

      // Filter only movie results (exclude series episodes)
      var movieResults = [];
      for (var i = 0; i < results.length; i++) {
        var url = results[i].toLowerCase();
        // Skip series episodes (contain SxE pattern like 1x1, 2x3)
        if (/\d+x\d+/.test(url)) continue;
        movieResults.push(results[i]);
      }

      // Priority 1: Slug + Year (most precise)
      for (var i = 0; i < movieResults.length; i++) {
        var url = movieResults[i].toLowerCase();
        if (
          url.indexOf(slug) !== -1 &&
          tmdbInfo.year &&
          url.indexOf(tmdbInfo.year) !== -1
        ) {
          console.log("[RedeCanais] Movie match (slug+year): " + movieResults[i]);
          return movieResults[i];
        }
      }

      // Priority 2: Slug only
      for (var i = 0; i < movieResults.length; i++) {
        var url = movieResults[i].toLowerCase();
        if (url.indexOf(slug) !== -1) {
          console.log("[RedeCanais] Movie match (slug): " + movieResults[i]);
          return movieResults[i];
        }
      }

      // Priority 3: Year only
      for (var i = 0; i < movieResults.length; i++) {
        var url = movieResults[i].toLowerCase();
        if (tmdbInfo.year && url.indexOf(tmdbInfo.year) !== -1) {
          console.log("[RedeCanais] Movie match (year): " + movieResults[i]);
          return movieResults[i];
        }
      }

      // Fallback: first movie result
      if (movieResults.length > 0) {
        console.log("[RedeCanais] Movie match (fallback): " + movieResults[0]);
        return movieResults[0];
      }
    }

    console.log("[RedeCanais] No movie page found");
    return null;
  });
}

// ─────────────────────────────────────────────
// Find content page for SERIES / ANIME
// Strategy: find series main page → get episode list → pick correct episode
// ─────────────────────────────────────────────
function findEpisodePage(tmdbInfo, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) {
      titles.push(tmdbInfo.titleEn);
    }

    for (var t = 0; t < titles.length; t++) {
      var query = titles[t];
      var slug = generateSlug(query);
      var results = yield searchRedeCanais(query);

      if (results.length === 0) continue;

      // Find the series main page (NOT an episode page)
      // Series main pages typically have the year and NO SxE pattern
      var seriesPages = [];
      var episodePages = [];

      for (var i = 0; i < results.length; i++) {
        var url = results[i].toLowerCase();
        if (/\d+x\d+/.test(url)) {
          episodePages.push(results[i]);
        } else {
          seriesPages.push(results[i]);
        }
      }

      // First check if any episode pages match exactly
      for (var i = 0; i < episodePages.length; i++) {
        var url = episodePages[i].toLowerCase();
        var seMatch = url.match(/-(\d+)x(\d+)-/);
        if (
          seMatch &&
          parseInt(seMatch[1]) === parseInt(seasonNum) &&
          parseInt(seMatch[2]) === parseInt(episodeNum)
        ) {
          console.log("[RedeCanais] Direct episode match: " + episodePages[i]);
          return episodePages[i];
        }
      }

      // Find the series main page and scrape episodes from it
      var seriesUrl = null;

      // Priority: slug match
      for (var i = 0; i < seriesPages.length; i++) {
        var url = seriesPages[i].toLowerCase();
        if (url.indexOf(slug) !== -1) {
          seriesUrl = seriesPages[i];
          break;
        }
      }

      // Fallback: first series page
      if (!seriesUrl && seriesPages.length > 0) {
        seriesUrl = seriesPages[0];
      }

      if (seriesUrl) {
        console.log("[RedeCanais] Found series page: " + seriesUrl);

        // Get all episode links from the series page
        var episodes = yield getEpisodeLinks(seriesUrl);
        var key = parseInt(seasonNum) + "x" + parseInt(episodeNum);

        if (episodes[key]) {
          console.log(
            "[RedeCanais] Found episode " + key + ": " + episodes[key].url
          );
          return episodes[key].url;
        }

        // Try zero-padded format
        var keyPadded =
          parseInt(seasonNum) +
          "x" +
          (parseInt(episodeNum) < 10
            ? "0" + parseInt(episodeNum)
            : parseInt(episodeNum));
        if (episodes[keyPadded]) {
          console.log(
            "[RedeCanais] Found episode " +
              keyPadded +
              ": " +
              episodes[keyPadded].url
          );
          return episodes[keyPadded].url;
        }

        console.log(
          "[RedeCanais] Episode " +
            key +
            " not found in " +
            Object.keys(episodes).length +
            " episodes"
        );

        // If no specific episode found but we have the series page,
        // return null (vs returning the series page which has no embeds)
      }
    }

    console.log("[RedeCanais] No episode page found");
    return null;
  });
}

// ─────────────────────────────────────────────
// Build stream objects for Nuvio
// ─────────────────────────────────────────────
function buildStreams(embedInfo, mediaInfo) {
  var streams = [];

  var audioLabel = embedInfo.isDubbed
    ? "Dublado"
    : embedInfo.isLegendado
    ? "Legendado"
    : "PT-BR";
  var qualityLabel = embedInfo.quality || "HD";

  var title =
    mediaInfo.mediaType === "tv" && mediaInfo.season && mediaInfo.episode
      ? mediaInfo.titlePtBr +
        " S" +
        String(mediaInfo.season).padStart(2, "0") +
        "E" +
        String(mediaInfo.episode).padStart(2, "0")
      : mediaInfo.titlePtBr +
        (mediaInfo.year ? " (" + mediaInfo.year + ")" : "");

  for (var i = 0; i < embedInfo.embeds.length; i++) {
    var embed = embedInfo.embeds[i];
    var serverName = SERVER_NAMES[embed.server] || embed.server;
    var streamName = "RedeCanais - " + serverName;

    streams.push({
      name: streamName,
      title: title + " [" + audioLabel + "] [" + qualityLabel + "]",
      url: embed.embedUrl,
      quality: qualityLabel,
      type: "direct",
      headers: {
        Referer: BASE_URL + "/",
        "User-Agent": USER_AGENT,
        Origin: BASE_URL,
      },
    });
  }

  return streams;
}

// ─────────────────────────────────────────────
// Main: getStreams - Entry point for Nuvio
// ─────────────────────────────────────────────
function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (!mediaType) mediaType = "movie";

  return __async(this, null, function* () {
    console.log(
      "[RedeCanais] Fetching streams for TMDB ID: " +
        tmdbId +
        ", Type: " +
        mediaType +
        (mediaType === "tv"
          ? ", S:" + seasonNum + "E:" + episodeNum
          : "")
    );

    try {
      // Step 1: Get TMDB info
      var tmdbInfo = yield getTmdbInfo(tmdbId, mediaType);

      if (!tmdbInfo.titlePtBr && !tmdbInfo.titleEn) {
        console.log("[RedeCanais] Could not get title from TMDB");
        return [];
      }

      // Step 2: Find the correct content page
      var contentUrl = null;

      if (mediaType === "movie") {
        contentUrl = yield findMoviePage(tmdbInfo);
      } else {
        // TV series or anime
        contentUrl = yield findEpisodePage(tmdbInfo, seasonNum, episodeNum);
      }

      if (!contentUrl) {
        console.log("[RedeCanais] Content not found on site");
        return [];
      }

      // Step 3: Extract embed info
      var embedInfo = yield extractEmbedInfo(contentUrl);

      if (embedInfo.embeds.length === 0) {
        console.log("[RedeCanais] No playable embeds found");
        return [];
      }

      // Step 4: Build stream objects
      var mediaInfo = {
        titlePtBr: tmdbInfo.titlePtBr || tmdbInfo.titleEn,
        titleEn: tmdbInfo.titleEn,
        year: tmdbInfo.year,
        mediaType: mediaType,
        season: seasonNum,
        episode: episodeNum,
      };

      var streams = buildStreams(embedInfo, mediaInfo);

      console.log(
        "[RedeCanais] Successfully processed " + streams.length + " streams"
      );
      return streams;
    } catch (error) {
      console.error("[RedeCanais] Error in getStreams: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
