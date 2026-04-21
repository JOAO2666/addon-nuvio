/**
 * Teste amplo — só RedeCanais .autos, só séries.
 * Objetivo: achar padrões de falha pra consertar.
 */
var rc = require("./providers/redecanais.js");

// Mistura: clássicas, lançamentos, animes, nacionais, k-dramas, multi-temporada
var tests = [
  // Hits populares testados (baseline)
  { name: "Breaking Bad",                tmdbId: "1396",   s: 1, e: 1 },
  { name: "Game of Thrones",             tmdbId: "1399",   s: 1, e: 1 },
  { name: "Stranger Things",             tmdbId: "66732",  s: 1, e: 1 },
  { name: "The Boys",                    tmdbId: "76479",  s: 1, e: 1 },
  { name: "The Last of Us",              tmdbId: "100088", s: 1, e: 1 },
  { name: "House of the Dragon",         tmdbId: "94997",  s: 1, e: 1 },
  { name: "Wednesday",                   tmdbId: "119051", s: 1, e: 1 },
  { name: "Euphoria",                    tmdbId: "85552",  s: 1, e: 1 },
  { name: "The Walking Dead",            tmdbId: "1402",   s: 1, e: 1 },
  { name: "Dexter",                      tmdbId: "1405",   s: 1, e: 1 },

  // Sitcoms / comédia
  { name: "Friends",                     tmdbId: "1668",   s: 1, e: 1 },
  { name: "The Office (US)",             tmdbId: "2316",   s: 1, e: 1 },
  { name: "How I Met Your Mother",       tmdbId: "1100",   s: 1, e: 1 },
  { name: "Brooklyn Nine-Nine",          tmdbId: "48891",  s: 1, e: 1 },
  { name: "Modern Family",               tmdbId: "1421",   s: 1, e: 1 },

  // Streaming plat hits
  { name: "Ozark",                       tmdbId: "69740",  s: 1, e: 1 },
  { name: "Peaky Blinders",              tmdbId: "60574",  s: 1, e: 1 },
  { name: "Narcos",                      tmdbId: "63351",  s: 1, e: 1 },
  { name: "Squid Game",                  tmdbId: "93405",  s: 1, e: 1 },
  { name: "Money Heist (La Casa)",       tmdbId: "71446",  s: 1, e: 1 },
  { name: "Dark",                        tmdbId: "70523",  s: 1, e: 1 },
  { name: "Mindhunter",                  tmdbId: "67744",  s: 1, e: 1 },

  // Marvel/DC/Star Wars
  { name: "Loki",                        tmdbId: "84958",  s: 1, e: 1 },
  { name: "WandaVision",                 tmdbId: "85271",  s: 1, e: 1 },
  { name: "The Mandalorian",             tmdbId: "82856",  s: 1, e: 1 },
  { name: "The Witcher",                 tmdbId: "71912",  s: 1, e: 1 },

  // Long-running
  { name: "Grey's Anatomy",              tmdbId: "1416",   s: 1, e: 1 },
  { name: "Supernatural",                tmdbId: "1622",   s: 1, e: 1 },
  { name: "Lost",                        tmdbId: "4607",   s: 1, e: 1 },

  // Animações
  { name: "Rick and Morty",              tmdbId: "60625",  s: 1, e: 1 },
  { name: "The Simpsons",                tmdbId: "456",    s: 1, e: 1 },
  { name: "South Park",                  tmdbId: "2190",   s: 1, e: 1 },
  { name: "Arcane",                      tmdbId: "94605",  s: 1, e: 1 },
  { name: "Invincible",                  tmdbId: "95557",  s: 1, e: 1 },

  // Nacionais BR
  { name: "3% (nacional BR)",            tmdbId: "66190",  s: 1, e: 1 },
  { name: "Cidade Invisível",            tmdbId: "110529", s: 1, e: 1 },

  // Animes populares (título em japonês ou EN)
  { name: "Attack on Titan",             tmdbId: "1429",   s: 1, e: 1 },
  { name: "Demon Slayer",                tmdbId: "85937",  s: 1, e: 1 },
  { name: "Jujutsu Kaisen",              tmdbId: "95479",  s: 1, e: 1 },
  { name: "My Hero Academia",            tmdbId: "65930",  s: 1, e: 1 },
  { name: "Death Note",                  tmdbId: "13916",  s: 1, e: 1 },
  { name: "Naruto",                      tmdbId: "46260",  s: 1, e: 1 },
  { name: "One Piece (live-action)",     tmdbId: "111110", s: 1, e: 1 },
  { name: "Hunter x Hunter (2011)",      tmdbId: "46298",  s: 1, e: 1 },

  // Episódios mais avançados (não S1E1)
  { name: "Breaking Bad S3E5",           tmdbId: "1396",   s: 3, e: 5 },
  { name: "Stranger Things S4E1",        tmdbId: "66732",  s: 4, e: 1 },
  { name: "The Boys S3E8",               tmdbId: "76479",  s: 3, e: 8 },
  { name: "Game of Thrones S8E6",        tmdbId: "1399",   s: 8, e: 6 },
  { name: "The Walking Dead S5E10",      tmdbId: "1402",   s: 5, e: 10 },
];

function rowLabel(name) {
  var s = name;
  if (s.length < 40) {
    while (s.length < 40) s += " ";
  }
  return s.substring(0, 40);
}

(async function () {
  console.log("\n=============================================================");
  console.log("  RedeCanais (.autos) - TESTE AMPLO (" + tests.length + " séries)");
  console.log("=============================================================\n");

  var okCount = 0, failCount = 0;
  var failures = [];

  for (var i = 0; i < tests.length; i++) {
    var t = tests[i];
    var t0 = Date.now();
    var status = "FAIL", info = "";
    try {
      var streams = await rc.getStreams(t.tmdbId, "tv", t.s, t.e);
      var dt = Date.now() - t0;
      if (streams && streams.length > 0) {
        status = "OK  ";
        info = streams.length + " stream(s) in " + dt + "ms";
        okCount++;
      } else {
        status = "MISS";
        info = "no streams in " + dt + "ms";
        failures.push({ t: t, reason: "no-streams" });
        failCount++;
      }
    } catch (e) {
      info = "ERR: " + (e && e.message);
      failures.push({ t: t, reason: "error", msg: e && e.message });
      failCount++;
    }
    console.log(status + "  " + rowLabel(t.name) + " S" + t.s + "E" + t.e + "  ->  " + info);
  }

  console.log("\n-------------------------------------------------------------");
  console.log("  TOTAL: OK=" + okCount + "/" + tests.length + "   FAIL=" + failCount + "/" + tests.length +
    "   (" + Math.round(okCount / tests.length * 100) + "% sucesso)");
  console.log("-------------------------------------------------------------\n");

  if (failures.length) {
    console.log("Falhas detalhadas:");
    failures.forEach(function (f) {
      console.log("  - " + f.t.name + " S" + f.t.s + "E" + f.t.e + " (tmdb=" + f.t.tmdbId + ") :: " + f.reason + (f.msg ? "  " + f.msg : ""));
    });
  }
})().catch(e => { console.error(e); process.exit(1); });
