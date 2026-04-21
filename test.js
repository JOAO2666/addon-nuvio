/**
 * Nuvio RedeCanais Provider - Teste Completo
 * Testa: Filmes, Séries e Animes + extração de URL direta
 */
var p1 = require("./providers/redecanais.js");
var p2 = require("./providers/redecanais-ph.js");

var tests = [
  { name: "Filme - Oppenheimer",                 tmdbId: "872585", type: "movie" },
  { name: "Filme - Interestelar",                tmdbId: "157336", type: "movie" },
  { name: "Anime Filme - A Viagem de Chihiro",   tmdbId: "129",    type: "movie" },
  { name: "Serie - Breaking Bad S01E01",         tmdbId: "1396",   type: "tv", season: 1, episode: 1 },
  { name: "Anime - Naruto Shippuden S01E01",     tmdbId: "31911",  type: "tv", season: 1, episode: 1 },
];

function showStreams(streams) {
  if (streams.length === 0) { console.log("  -> Nenhum stream"); return; }
  streams.slice(0, 6).forEach(function (s, i) {
    console.log("  " + (i + 1) + ". " + s.name + " [" + s.quality + "] type=" + s.type);
    console.log("     " + s.title);
    console.log("     URL: " + s.url.substring(0, 110));
  });
}

async function runOn(label, mod) {
  console.log("\n============ " + label + " ============");
  var passed = 0, failed = 0;
  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    console.log("\n--- " + t.name + " ---");
    try {
      var streams = await mod.getStreams(t.tmdbId, t.type, t.season || null, t.episode || null);
      showStreams(streams);
      if (streams.length > 0) passed++; else failed++;
    } catch (e) {
      console.log("  ERRO: " + e.message);
      failed++;
    }
  }
  console.log("\n" + label + " => passed=" + passed + " failed=" + failed);
}

(async function () {
  await runOn("RedeCanais (.autos)", p1);
  await runOn("RedeCanais PH", p2);
})().catch(console.error);
