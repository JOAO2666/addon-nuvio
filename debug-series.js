// Debug: understand series/anime page structure on RedeCanais
async function debugSeries() {
  var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
  
  // Test 1: Breaking Bad main page (series)
  var seriesUrl = "https://www.redecanaistv.autos/assistir-breaking-bad-a-quimica-do-mal-dublado-2008-3416/";
  console.log("=== Breaking Bad - Main Page ===");
  var resp = await fetch(seriesUrl, { headers: { "User-Agent": UA } });
  var html = await resp.text();
  console.log("Status:", resp.status, "Length:", html.length);
  
  // Check for episode links
  var epRegex = /href=['"]([^'"]*(?:1x1|s01e01|1x01|episodio|temporada)[^'"]*)['"]/gi;
  var eps = [];
  var m;
  while ((m = epRegex.exec(html)) !== null) {
    if (eps.indexOf(m[1]) === -1) eps.push(m[1]);
  }
  console.log("Episode links found:", eps.length);
  eps.slice(0, 10).forEach(function(e, i) { console.log("  " + (i+1) + ". " + e); });
  
  // Check for season/episode structure
  console.log("\nHas 'temporada':", html.indexOf("temporada") !== -1);
  console.log("Has 'Temporada':", html.indexOf("Temporada") !== -1);
  console.log("Has 'episodio':", html.indexOf("episodio") !== -1);
  console.log("Has 'Episódio':", html.indexOf("Episódio") !== -1);
  console.log("Has '1x1':", html.indexOf("1x1") !== -1);
  console.log("Has getembed:", html.indexOf("getembed") !== -1);
  console.log("Has redirect.php:", html.indexOf("redirect.php") !== -1);
  
  // Look for ALL links on the page
  var allLinks = /href=['"]([^'"]*assistir[^'"]*)['"]/gi;
  var links = [];
  while ((m = allLinks.exec(html)) !== null) {
    if (links.indexOf(m[1]) === -1) links.push(m[1]);
  }
  console.log("\nAll 'assistir' links (" + links.length + "):");
  links.slice(0, 20).forEach(function(l, i) { console.log("  " + (i+1) + ". " + l); });
  
  // Look for navigational elements with episode info
  var navRegex = /(?:1x\d+|s0?\d+e\d+|temporada\s*\d+|episod)/gi;
  var navMatches = [];
  while ((m = navRegex.exec(html)) !== null) {
    var context = html.substring(Math.max(0, m.index - 50), m.index + m[0].length + 50);
    navMatches.push(context.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim());
  }
  console.log("\nSeason/Episode references (" + navMatches.length + "):");
  navMatches.slice(0, 10).forEach(function(n, i) { console.log("  " + (i+1) + ". " + n); });
  
  // Test 2: Search for specific episode
  console.log("\n\n=== Search: Breaking Bad 1x1 ===");
  var searchUrl = "https://www.redecanaistv.autos/pesquisar/?p=" + encodeURIComponent("Breaking Bad 1x1");
  var resp2 = await fetch(searchUrl, { headers: { "User-Agent": UA } });
  var html2 = await resp2.text();
  var linkRegex2 = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
  var results2 = [];
  while ((m = linkRegex2.exec(html2)) !== null) {
    var u = m[1].replace(/&amp;/g, "&");
    if (u.charAt(0) === "/") u = "https://www.redecanaistv.autos" + u;
    if (/\/assistir-[^/]+-\d+\/?$/.test(u) && u.indexOf("/assistir/") === -1 && results2.indexOf(u) === -1) {
      results2.push(u);
    }
  }
  console.log("Results:", results2.length);
  results2.forEach(function(l, i) { console.log("  " + (i+1) + ". " + l); });
  
  // Test 3: Search for anime
  console.log("\n\n=== Search: Naruto ===");
  var searchUrl3 = "https://www.redecanaistv.autos/pesquisar/?p=" + encodeURIComponent("Naruto");
  var resp3 = await fetch(searchUrl3, { headers: { "User-Agent": UA } });
  var html3 = await resp3.text();
  var results3 = [];
  while ((m = linkRegex2.exec(html3)) !== null) {
    var u = m[1].replace(/&amp;/g, "&");
    if (u.charAt(0) === "/") u = "https://www.redecanaistv.autos" + u;
    if (/\/assistir-[^/]+-\d+\/?$/.test(u) && u.indexOf("/assistir/") === -1 && results3.indexOf(u) === -1) {
      results3.push(u);
    }
  }
  // Reset regex
  linkRegex2.lastIndex = 0;
  var linkRegex3 = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
  while ((m = linkRegex3.exec(html3)) !== null) {
    var u = m[1].replace(/&amp;/g, "&");
    if (u.charAt(0) === "/") u = "https://www.redecanaistv.autos" + u;
    if (/\/assistir-[^/]+-\d+\/?$/.test(u) && u.indexOf("/assistir/") === -1 && results3.indexOf(u) === -1) {
      results3.push(u);
    }
  }
  console.log("Results:", results3.length);
  results3.forEach(function(l, i) { console.log("  " + (i+1) + ". " + l); });
  
  // Test 4: Search for specific BB episode format
  console.log("\n\n=== Search: Breaking Bad S01E01 / 1x01 ===");
  var formats = [
    "Breaking Bad 1x01",
    "breaking bad a quimica do mal 1x1",
    "breaking bad a quimica do mal 1x01"
  ];
  for (var f = 0; f < formats.length; f++) {
    var sUrl = "https://www.redecanaistv.autos/pesquisar/?p=" + encodeURIComponent(formats[f]);
    console.log("\nQuery: " + formats[f]);
    var r = await fetch(sUrl, { headers: { "User-Agent": UA } });
    var h = await r.text();
    var lr = /href=['"]([^'"]*\/assistir-[^'"]+)['"]/gi;
    var res = [];
    while ((m = lr.exec(h)) !== null) {
      var u = m[1].replace(/&amp;/g, "&");
      if (u.charAt(0) === "/") u = "https://www.redecanaistv.autos" + u;
      if (/\/assistir-[^/]+-\d+\/?$/.test(u) && u.indexOf("/assistir/") === -1 && res.indexOf(u) === -1) res.push(u);
    }
    console.log("  Results:", res.length);
    res.slice(0, 5).forEach(function(l, i) { console.log("    " + (i+1) + ". " + l); });
  }
  
  // Test 5: Navigate BB page to find episode links (?area=online)
  console.log("\n\n=== Breaking Bad - ?area=online ===");
  var resp5 = await fetch(seriesUrl + "?area=online", { headers: { "User-Agent": UA } });
  var html5 = await resp5.text();
  console.log("Status:", resp5.status, "Length:", html5.length);
  console.log("Has getembed:", html5.indexOf("getembed") !== -1);
  console.log("Has C_Video:", html5.indexOf("C_Video") !== -1);
  
  // Check for episode selector
  var selRegex = /<option[^>]*value=['"]([^'"]+)['"][^>]*>([^<]+)/gi;
  var opts = [];
  while ((m = selRegex.exec(html5)) !== null) {
    opts.push({ value: m[1], text: m[2].trim() });
  }
  console.log("Select options:", opts.length);
  opts.slice(0, 10).forEach(function(o, i) { console.log("  " + (i+1) + ". value=" + o.value + " text=" + o.text); });
  
  // Look for episode navigation tabs/links  
  var tabRegex = /(?:data-episodio|data-ep|episodeTab|episode-\d+|ep-\d+)/gi;
  while ((m = tabRegex.exec(html5)) !== null) {
    console.log("Tab found:", html5.substring(m.index - 50, m.index + 50));
  }
}

debugSeries().catch(console.error);
