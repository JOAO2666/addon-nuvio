// Minimal Dean Edwards Unpacker
function unpack(packed) {
    var pRegex = /\}?\('([^]*?)', *(\d+), *(\d+), *'([^]*?)'\.split\('\|'\), *(\d+), *(.*?)\)\)/;
    var match = packed.match(pRegex);
    if (!match) return packed;
    
    var p = match[1];
    var a = parseInt(match[2]);
    var c = parseInt(match[3]);
    var k = match[4].split('|');
    var e = function (c) {
        return (c < a ? '' : e(parseInt(c / a))) + ((c = c % a) > 35 ? String.fromCharCode(c + 29) : c.toString(36));
    };

    while (c--) {
        if (k[c]) {
            p = p.replace(new RegExp('\\b' + e(c) + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

async function extractMixDrop(url) {
    try {
        var res = await fetch(url);
        var html = await res.text();
        var evalMatch = html.match(/eval\(function\(p,a,c,k,e,d\).+?split\('\|'\).*?\)\)\)/);
        if (evalMatch) {
            var unpacked = unpack(evalMatch[0]);
            var wurlMatch = unpacked.match(/wurl="([^"]+)"/);
            if (wurlMatch) {
                var finalUrl = wurlMatch[1];
                if (finalUrl.startsWith("//")) finalUrl = "https:" + finalUrl;
                return finalUrl;
            }
        }
    } catch(e) { console.error(e) }
    return null;
}

async function extractStreamTape(url) {
    try {
        var res = await fetch(url);
        var html = await res.text();
        var regex = /document\.getElementById\('robotlink'\)\.innerHTML\s*=\s*(.*?);/s;
        var match = html.match(regex);
        if (match) {
            // Evaluates something like: '//streamtape.com/get_video?id=XJdd6392kRUD7j0&expires=1713636733&ip=2QnFT9G7e7o&token=3b...' + '&token=' + '...';
            // Actually streamtape changes their code a lot. Let's just use string search.
            var concatMatches = match[1].match(/'([^']+)'/g);
            if (concatMatches && concatMatches.length >= 2) {
                var finalUrl = concatMatches[0].replace(/'/g, "") + concatMatches[1].replace(/'/g, "");
                // wait, the token might be split across multiple parts
                finalUrl = "";
                for(var i=0; i<concatMatches.length; i++){
                    // Streamtape usually does 'prefix' + ('substring').substring(x)
                    // It's obfuscated. 
                }
            }
            
            // Actually, we can just extract from the HTML `id="norobotlink"` ?
            var tokensMatch = html.match(/robotlink'\)\.innerHTML\s*=\s*'([^']+)'\s*\+\s*\('xcd([^']+)'\)/);
            if(tokensMatch) {
                 return "https:" + tokensMatch[1] + tokensMatch[2].substring(2); // this is a known streamtape algorithm
            }
        }
    } catch(e) {}
    return null;
}

async function test() {
    var md = await extractMixDrop("https://md3b0j6hj.com/f/4dm99eqraoo8n6");
    console.log("MixDrop Final:", md);
    
    var st = await extractStreamTape("https://streamtape.com/v/XJdd6392kRUD7j0");
    console.log("StreamTape Final:", st);
}
test();
