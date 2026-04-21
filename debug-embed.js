async function test() {
    var url = "https://www.redecanaistv.autos/assistir-to-end-all-war-oppenheimer-the-atomic-bomb-legendado-2023-22054/?area=online";
    var resp1 = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    var html = await resp1.text();
    var cookie = resp1.headers.get("set-cookie") || "";
    
    var redirectRegex = /\/e\/redirect\.php\?sv=([^&"']+)&(?:amp;)?id=(\d+)&(?:amp;)?token=([^"'&\s]+)/gi;
    var match;
    while ((match = redirectRegex.exec(html)) !== null) {
        var server = match[1];
        var id = match[2];
        var token = match[3];
        
        var redirectUrl = "https://www.redecanaistv.autos/e/redirect.php?sv=" + server + "&id=" + id + "&token=" + token;
        
        var resp2 = await fetch(redirectUrl, {
            redirect: "manual",
            headers: { "User-Agent": "Mozilla/5.0", "Referer": url, "Cookie": cookie }
        });
        
        var loc = resp2.headers.get("location");
        if (loc) {
            var videoId = loc.split('/').pop();
            // remove query params if any
            videoId = videoId.split('?')[0];
            
            var canonical = loc;
            if (server === "filemoon" || server === "byse") canonical = "https://filemoon.sx/e/" + videoId;
            else if (server === "doodstream" || server === "dood") canonical = "https://dood.li/e/" + videoId;
            else if (server === "mixdrop") canonical = "https://mixdrop.co/e/" + videoId;
            else if (server === "streamtape") canonical = "https://streamtape.com/e/" + videoId;
            
            console.log(server, "=>", canonical);
        }
    }
}
test();
