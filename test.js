/**
 * Nuvio BR Streams - Teste completo dos providers
 *   - RedeCanais      (.autos)
 *   - RedeCanais PH
 *   - VideasyBR       (SuperFlix / OverFlix / VisionCine)
 *   - AnimeFire       (animefire.io)
 *   - AnimesDigital   (animesdigital.org)
 */
var providers = [
  { label: "RedeCanais (.autos)", mod: require("./providers/redecanais.js")    },
  { label: "RedeCanais PH",       mod: require("./providers/redecanais-ph.js") },
  { label: "VideasyBR",           mod: require("./providers/videasy-br.js")    },
  { label: "AnimeFire",           mod: require("./providers/animefire.js")     },
  { label: "AnimesDigital",       mod: require("./providers/animesdigital.js") },
];

var tests = [
  { name: "Filme - Oppenheimer",                 tmdbId: "872585", type: "movie" },
  { name: "Filme - Interestelar",                tmdbId: "157336", type: "movie" },
  { name: "Anime Filme - A Viagem de Chihiro",   tmdbId: "129",    type: "movie" },
  { name: "Série - Breaking Bad S01E01",         tmdbId: "1396",   type: "tv", season: 1, episode: 1 },
  { name: "Anime - Naruto Shippuden S01E01",     tmdbId: "31911",  type: "tv", season: 1, episode: 1 },
  { name: "Anime - One Piece S01E01",            tmdbId: "37854",  type: "tv", season: 1, episode: 1 },
];

function showStreams(streams) {
  if (!streams || streams.length === 0) {
    console.log("  -> Nenhum stream");
    return;
  }
  streams.slice(0, 6).forEach(function (s, i) {
    console.log(
      "  " + (i + 1) + ". " +
      (s.name || "") + " [" + (s.quality || "?") + "] type=" + (s.type || "?")
    );
    if (s.title) console.log("     " + s.title);
    if (s.url)   console.log("     URL: " + s.url.substring(0, 120));
  });
  if (streams.length > 6) console.log("     ... (+" + (streams.length - 6) + " mais)");
}

async function runOn(label, mod) {
  console.log("\n================ " + label + " ================");
  var passed = 0, failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    console.log("\n--- " + t.name + " ---");
    try {
      var streams = await mod.getStreams(t.tmdbId, t.type, t.season || null, t.episode || null);
      showStreams(streams);
      if (streams && streams.length > 0) passed++; else failed++;
    } catch (e) {
      console.log("  ERRO: " + (e && e.message));
      failed++;
    }
  }
  console.log("\n[SUMÁRIO " + label + "] passed=" + passed + " / failed=" + failed);
  return { label: label, passed: passed, failed: failed };
}

(async function () {
  var totals = [];
  for (var i = 0; i < providers.length; i++) {
    var t = await runOn(providers[i].label, providers[i].mod);
    totals.push(t);
  }
  console.log("\n================ RESULTADO GERAL ================");
  totals.forEach(function (t) {
    console.log(
      "  " + t.label.padEnd(26) + "  OK=" + t.passed + "  FAIL=" + t.failed
    );
  });
})().catch(function (e) { console.error(e); process.exit(1); });
