/**
 * RedeCanais PH - Nuvio Provider (Mirror)
 * Scrapes movies, TV series, and anime from redecanais.ph
 * Supports: Filemoon (Byse), DoodStream, MixDrop, StreamTape
 * Content Language: Portuguese (BR) - Dubbed & Subtitled
 */
"use strict";

var TMDB_API_KEY = "68e094699525b18a70bab2f86b1fa706";
var BASE_URL = "https://redecanais.ph";
var USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

var SERVER_NAMES = {
  filemoon: "Byse",
  doodstream: "DoodStream",
  mixdrop: "MixDrop",
  streamtape: "StreamTape",
};

var __async = function (__this, __arguments, generator) {
  return new Promise(function (resolve, reject) {
    var fulfilled = function (value) {
      try { step(generator.next(value)); } catch (e) { reject(e); }
    };
    var rejected = function (value) {
      try { step(generator.throw(value)); } catch (e) { reject(e); }
    };
    var step = function (x) {
      return x.done
        ? resolve(x.value)
        : Promise.resolve(x.value).then(fulfilled, rejected);
    };
    step((generator = generator.apply(__this, __arguments)).next());
  });
};

function makeRequest(url, options) {
  if (!options) options = {};
  return __async(this, null, function* () {
    var headers = Object.assign(
      {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
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
        throw new Error("HTTP " + response.status + ": " + response.statusText);
      }
      return response;
    } catch (error) {
      console.error("[RedeCanais.ph] Request failed: " + error.message);
      throw error;
    }
  });
}

function getTmdbInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    var endpoint = mediaType === "tv" ? "tv" : "movie";
    var url = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=pt-BR";
    var response = yield makeRequest(url, { headers: { Accept: "application/json" } });
    var data = yield response.json();
    var titlePtBr = mediaType === "tv" ? data.name : data.title;

    var urlEn = "https://api.themoviedb.org/3/" + endpoint + "/" + tmdbId +
      "?api_key=" + TMDB_API_KEY + "&language=en-US";
    var responseEn = yield makeRequest(urlEn, { headers: { Accept: "application/json" } });
    var dataEn = yield responseEn.json();
    var titleEn = mediaType === "tv" ? dataEn.name : dataEn.title;

    var year = mediaType === "tv"
      ? (data.first_air_date ? data.first_air_date.substring(0, 4) : "")
      : (data.release_date ? data.release_date.substring(0, 4) : "");

    var imdbId = data.imdb_id || (dataEn ? dataEn.imdb_id : null);
    if (!imdbId && mediaType === "tv") {
      try {
        var extUrl = "https://api.themoviedb.org/3/tv/" + tmdbId +
          "/external_ids?api_key=" + TMDB_API_KEY;
        var extResp = yield makeRequest(extUrl, { headers: { Accept: "application/json" } });
        var extData = yield extResp.json();
        imdbId = extData.imdb_id;
      } catch (e) {}
    }

    console.log('[RedeCanais.ph] TMDB: "' + titlePtBr + '" / "' + titleEn +
      '" (' + year + ") IMDB: " + imdbId);

    return {
      titlePtBr: titlePtBr, titleEn: titleEn, year: year,
      imdbId: imdbId, data: data, totalSeasons: data.number_of_seasons || 0,
    };
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

function searchRedeCanais(query) {
  return __async(this, null, function* () {
    console.log('[RedeCanais.ph] Searching for: "' + query + '"');
    var searchUrl = BASE_URL + "/pesquisar/?p=" + encodeURIComponent(query);
    try {
      var response = yield makeRequest(searchUrl);
      var html = yield response.text();
      var results = [];
      var linkRegex = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
      var match;
      while ((match = linkRegex.exec(html)) !== null) {
        var url = match[1].replace(/&amp;/g, "&");
        if (url.charAt(0) === "/") url = BASE_URL + url;
        if (url.indexOf("/assistir/") !== -1) continue;
        if (/\/assistir-[^/]+-\d+\/?$/.test(url)) {
          if (results.indexOf(url) === -1) results.push(url);
        }
      }
      console.log("[RedeCanais.ph] Found " + results.length + " results");
      return results;
    } catch (error) {
      console.error("[RedeCanais.ph] Search failed: " + error.message);
      return [];
    }
  });
}

function getEpisodeLinks(seriesPageUrl) {
  return __async(this, null, function* () {
    try {
      var response = yield makeRequest(seriesPageUrl);
      var html = yield response.text();
      var episodes = {};
      var linkRegex = /href=['"]([^'"]*\/assistir-[^'"]*-\d+x\d+-[^'"]+)['"]/gi;
      var match;
      while ((match = linkRegex.exec(html)) !== null) {
        var url = match[1].replace(/&amp;/g, "&");
        if (url.charAt(0) === "/") url = BASE_URL + url;
        var seMatch = url.match(/-(\d+)x(\d+)-/i);
        if (seMatch) {
          var key = parseInt(seMatch[1]) + "x" + parseInt(seMatch[2]);
          if (!episodes[key]) {
            episodes[key] = { season: parseInt(seMatch[1]), episode: parseInt(seMatch[2]), url: url };
          }
        }
      }
      console.log("[RedeCanais.ph] Found " + Object.keys(episodes).length + " episodes");
      return episodes;
    } catch (error) {
      return {};
    }
  });
}

function extractEmbedInfo(pageUrl) {
  return __async(this, null, function* () {
    var playerUrl = pageUrl.replace(/\/$/, "") + "/?area=online";
    try {
      var response = yield makeRequest(playerUrl);
      var html = yield response.text();
      var embeds = [];

      var redirectRegex = /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
      var match;
      while ((match = redirectRegex.exec(html)) !== null) {
        embeds.push({
          server: match[1], contentId: match[2], token: match[3],
          embedUrl: BASE_URL + "/e/getembed.php?sv=" + match[1] + "&id=" + match[2] + "&token=" + match[3],
        });
      }

      var embedRegex = /getembed\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
      while ((match = embedRegex.exec(html)) !== null) {
        var exists = false;
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].server === match[1] && embeds[i].contentId === match[2]) { exists = true; break; }
        }
        if (!exists) {
          embeds.push({
            server: match[1], contentId: match[2], token: match[3],
            embedUrl: BASE_URL + "/e/getembed.php?sv=" + match[1] + "&id=" + match[2] + "&token=" + match[3],
          });
        }
      }

      var cVideoRegex = /C_Video\s*\(\s*['"](\d+)['"],\s*['"]([^'"]+)['"]\)/gi;
      while ((match = cVideoRegex.exec(html)) !== null) {
        var tokenForId = "";
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].contentId === match[1]) { tokenForId = embeds[i].token; break; }
        }
        var exists = false;
        for (var i = 0; i < embeds.length; i++) {
          if (embeds[i].server === match[2] && embeds[i].contentId === match[1]) { exists = true; break; }
        }
        if (!exists && tokenForId) {
          embeds.push({
            server: match[2], contentId: match[1], token: tokenForId,
            embedUrl: BASE_URL + "/e/getembed.php?sv=" + match[2] + "&id=" + match[1] + "&token=" + tokenForId,
          });
        }
      }

      var isDubbed = html.indexOf("Dublado") !== -1 || html.indexOf("DUB") !== -1;
      var isLegendado = html.indexOf("Legendado") !== -1 || html.indexOf("LEG") !== -1;
      var isCAM = html.indexOf("CAM") !== -1;
      var isHD = html.indexOf("HD") !== -1;

      for (var i = 0; i < embeds.length; i++) {
        var redirectUrl = BASE_URL + "/e/redirect.php?sv=" + embeds[i].server + "&id=" + embeds[i].contentId + "&token=" + embeds[i].token;
        try {
          var redResp = yield fetch(redirectUrl, {
            method: "GET",
            redirect: "manual",
            headers: { "User-Agent": USER_AGENT, "Referer": playerUrl }
          });
          var loc = redResp.headers.get("location");
          if (loc) embeds[i].embedUrl = loc;
        } catch(e) {}
      }

      console.log("[RedeCanais.ph] Found " + embeds.length + " embeds");
      return { embeds: embeds, isDubbed: isDubbed, isLegendado: isLegendado, quality: isCAM ? "CAM" : isHD ? "HD" : "SD" };
    } catch (error) {
      return { embeds: [], quality: "Unknown" };
    }
  });
}

function findMoviePage(tmdbInfo) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) titles.push(tmdbInfo.titleEn);

    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchRedeCanais(titles[t]);
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
      for (var i = 0; i < movies.length; i++) {
        if (tmdbInfo.year && movies[i].toLowerCase().indexOf(tmdbInfo.year) !== -1) return movies[i];
      }
      if (movies.length > 0) return movies[0];
    }
    return null;
  });
}

function findEpisodePage(tmdbInfo, seasonNum, episodeNum) {
  return __async(this, null, function* () {
    var titles = [];
    if (tmdbInfo.titlePtBr) titles.push(tmdbInfo.titlePtBr);
    if (tmdbInfo.titleEn && tmdbInfo.titleEn !== tmdbInfo.titlePtBr) titles.push(tmdbInfo.titleEn);

    for (var t = 0; t < titles.length; t++) {
      var slug = generateSlug(titles[t]);
      var results = yield searchRedeCanais(titles[t]);
      if (results.length === 0) continue;

      var seriesPages = [];
      var episodePages = [];
      for (var i = 0; i < results.length; i++) {
        if (/\d+x\d+/.test(results[i].toLowerCase())) episodePages.push(results[i]);
        else seriesPages.push(results[i]);
      }

      for (var i = 0; i < episodePages.length; i++) {
        var seMatch = episodePages[i].toLowerCase().match(/-(\d+)x(\d+)-/);
        if (seMatch && parseInt(seMatch[1]) === parseInt(seasonNum) && parseInt(seMatch[2]) === parseInt(episodeNum)) {
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
      }
    }
    return null;
  });
}

function buildStreams(embedInfo, mediaInfo) {
  var streams = [];
  var audioLabel = embedInfo.isDubbed ? "Dublado" : embedInfo.isLegendado ? "Legendado" : "PT-BR";
  var qualityLabel = embedInfo.quality || "HD";
  var title = mediaInfo.mediaType === "tv" && mediaInfo.season && mediaInfo.episode
    ? mediaInfo.titlePtBr + " S" + String(mediaInfo.season).padStart(2, "0") + "E" + String(mediaInfo.episode).padStart(2, "0")
    : mediaInfo.titlePtBr + (mediaInfo.year ? " (" + mediaInfo.year + ")" : "");

  for (var i = 0; i < embedInfo.embeds.length; i++) {
    var embed = embedInfo.embeds[i];
    streams.push({
      name: "RedeCanais.ph - " + (SERVER_NAMES[embed.server] || embed.server),
      title: title + " [" + audioLabel + "] [" + qualityLabel + "]",
      url: embed.embedUrl, quality: qualityLabel, type: "url",
      headers: { Referer: BASE_URL + "/", "User-Agent": USER_AGENT, Origin: BASE_URL },
    });
  }
  return streams;
}

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  if (!mediaType) mediaType = "movie";
  return __async(this, null, function* () {
    console.log("[RedeCanais.ph] Fetching streams for TMDB: " + tmdbId + " Type: " + mediaType +
      (mediaType === "tv" ? " S:" + seasonNum + "E:" + episodeNum : ""));
    try {
      var tmdbInfo = yield getTmdbInfo(tmdbId, mediaType);
      if (!tmdbInfo.titlePtBr && !tmdbInfo.titleEn) return [];

      var contentUrl = null;
      if (mediaType === "movie") {
        contentUrl = yield findMoviePage(tmdbInfo);
      } else {
        contentUrl = yield findEpisodePage(tmdbInfo, seasonNum, episodeNum);
      }
      if (!contentUrl) return [];

      var embedInfo = yield extractEmbedInfo(contentUrl);
      if (embedInfo.embeds.length === 0) return [];

      var mediaInfo = {
        titlePtBr: tmdbInfo.titlePtBr || tmdbInfo.titleEn,
        titleEn: tmdbInfo.titleEn, year: tmdbInfo.year,
        mediaType: mediaType, season: seasonNum, episode: episodeNum,
      };
      var streams = buildStreams(embedInfo, mediaInfo);
      console.log("[RedeCanais.ph] Processed " + streams.length + " streams");
      return streams;
    } catch (error) {
      console.error("[RedeCanais.ph] Error: " + error.message);
      return [];
    }
  });
}

module.exports = { getStreams };
