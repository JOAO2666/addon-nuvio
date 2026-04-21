/**
 * RedeCanais Nuvio Provider - Teste Completo
 * Testa: Filmes, Séries, e Anime
 */
var provider = require("./providers/redecanais.js");

async function runTests() {
  console.log("🇧🇷 RedeCanais Provider - Teste Completo");
  console.log("================================================\n");

  var tests = [
    { name: "🎬 Filme - Oppenheimer", tmdbId: "872585", type: "movie" },
    { name: "📺 Série - Breaking Bad S01E01", tmdbId: "1396", type: "tv", season: 1, episode: 1 },
    { name: "📺 Série - Breaking Bad S01E05", tmdbId: "1396", type: "tv", season: 1, episode: 5 },
    { name: "🎌 Anime - Naruto Shippuden S01E01", tmdbId: "31911", type: "tv", season: 1, episode: 1 },
    { name: "🎬 Anime Filme - A Viagem de Chihiro", tmdbId: "129", type: "movie" },
    { name: "🎬 Filme - Interestelar", tmdbId: "157336", type: "movie" },
  ];

  var passed = 0;
  var failed = 0;

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    console.log("═".repeat(60));
    console.log(t.name + " (TMDB: " + t.tmdbId + ")");
    console.log("═".repeat(60));

    try {
      var streams = await provider.getStreams(
        t.tmdbId, t.type, t.season || null, t.episode || null
      );

      if (streams.length > 0) {
        console.log("\n✅ Encontrados " + streams.length + " streams:");
        streams.slice(0, 4).forEach(function (s, idx) {
          console.log("  " + (idx + 1) + ". " + s.name);
          console.log("     " + s.title);
          console.log("     URL: " + s.url.substring(0, 80) + "...");
        });
        if (streams.length > 4) {
          console.log("  ... e mais " + (streams.length - 4) + " streams");
        }
        passed++;
      } else {
        console.log("\n⚠️ Nenhum stream encontrado");
        failed++;
      }
    } catch (e) {
      console.log("\n❌ Erro: " + e.message);
      failed++;
    }
    console.log("");
  }

  console.log("═".repeat(60));
  console.log("📊 Resultado: " + passed + "/" + tests.length + " passaram, " + failed + " falharam");
  console.log("═".repeat(60));
}

runTests().catch(console.error);
