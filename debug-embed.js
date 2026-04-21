async function test() {
    var url = "https://www.redecanaistv.autos/assistir-to-end-all-war-oppenheimer-the-atomic-bomb-legendado-2023-22054/?area=online";
    var resp1 = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    var html = await resp1.text();
    var cookie = resp1.headers.get("set-cookie") || "";
    
    var redirectRegex = /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    var match;
    while ((match = redirectRegex.exec(html)) !== null) {
        var sv = match[1];
        if (sv !== "filemoon") continue;
        var id = match[2];
        var token = match[3];
        
        var redirectUrl = "https://www.redecanaistv.autos/e/redirect.php?sv=" + sv + "&id=" + id + "&token=" + token;
        console.log("Checking redirect for", sv, redirectUrl);
        
        var resp2 = await fetch(redirectUrl, {
            redirect: "manual",
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Referer": url,
                "Cookie": cookie
            }
        });
        console.log("Status:", resp2.status, resp2.headers.get("location"));
    }
}
test();
