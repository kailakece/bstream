const GITHUB_PLAYLIST_URL = "https://username.github.io/repo-name/playlist.txt"; // <-- UBAH KE URL RAW PLAYLIST.TXT ANDA

const FALLBACK_LINKS = [
  "https://donasi.showcdnx.com/stopjudi/2.mp4",
  "https://donasi.showcdnx.com/stopjudi/3.mp4",
  "https://donasi.showcdnx.com/stopjudi/4.mp4",
  "https://donasi.showcdnx.com/stopjudi/5.mp4"
];

function getRandomFallbackLink() {
  const randomIndex = Math.floor(Math.random() * FALLBACK_LINKS.length);
  return FALLBACK_LINKS[randomIndex];
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
          "Access-Control-Allow-Headers": "*",
        },
      });
    }

    const urlObj = new URL(request.url);
    const isProxyMode = urlObj.searchParams.get("proxy") === "true";

    // ===========================================
    // PROXY STREAMING (.m3u8 / .ts / .mp4 murni)
    // ===========================================
    if (isProxyMode) {
      const targetUrl = urlObj.searchParams.get("url");
      if (!targetUrl) return new Response("Parameter URL diperlukan.", { status: 400 });

      let referer = urlObj.searchParams.get("referer") || "";
      let userAgent = urlObj.searchParams.get("ua") || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

      if (!referer.trim()) {
        const parsedTarget = new URL(targetUrl);
        referer = parsedTarget.origin + "/";
      }

      const parsedUrl = new URL(targetUrl);
      const baseUrl = parsedUrl.origin + parsedUrl.pathname.substring(0, parsedUrl.pathname.lastIndexOf('/')) + '/';

      const requestHeaders = new Headers();
      requestHeaders.set("Referer", referer);
      requestHeaders.set("User-Agent", userAgent);

      try {
        const response = await fetch(targetUrl, { method: "GET", headers: requestHeaders });
        const httpCode = response.status;
        const contentType = response.headers.get("Content-Type") || "";
        
        if (httpCode === 200 && (targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("apple"))) {
          let text = await response.text();
          const lines = text.split("\n");
          
          const modifiedLines = lines.map(line => {
            let trimmed = line.trim();
            if (trimmed.length > 0 && !trimmed.startsWith("#")) {
              let absoluteChunkUrl = trimmed;
              if (!trimmed.startsWith("http")) {
                absoluteChunkUrl = baseUrl + trimmed;
              }
              return `${urlObj.origin}${urlObj.pathname}?proxy=true&url=${encodeURIComponent(absoluteChunkUrl)}&referer=${encodeURIComponent(referer)}&ua=${encodeURIComponent(userAgent)}`;
            }
            return line;
          });

          return new Response(modifiedLines.join("\n"), {
            status: 200,
            headers: {
              "Content-Type": "application/vnd.apple.mpegurl",
              "Access-Control-Allow-Origin": "*",
            }
          });
        }

        return new Response(response.body, {
          status: httpCode,
          headers: {
            "Content-Type": contentType || "application/octet-stream",
            "Access-Control-Allow-Origin": "*",
          }
        });

      } catch (err) {
        return new Response("Proxy Error: " + err.message, { status: 500 });
      }
    }

    // =======================================================
    // WEB PLAYER INTERNAL (MENGURAI DATA PLAYLIST.TXT VERTIKAL)
    // =======================================================
    let videoId = urlObj.searchParams.get("v");
    if (!videoId) {
      const pathParts = urlObj.pathname.split("/");
      videoId = pathParts[pathParts.length - 1].replace(".html", "");
    }

    if (!videoId || videoId === "embed" || videoId === "") {
      return new Response("Masukkan ID Video. Contoh: ?v=video123", { status: 400 });
    }

    try {
      const typeParam = (urlObj.searchParams.get("type") || "live").toLowerCase();
      const requestedEps = (urlObj.searchParams.get("eps") || "1").toLowerCase();
      
      // Ambil file playlist database dari GitHub Pages
      const githubResponse = await fetch(GITHUB_PLAYLIST_URL);
      if (!githubResponse.ok) throw new Error("Gagal mengambil database teks.");
      
      const fullText = await githubResponse.text();
      const lines = fullText.split("\n");
      
      let currentCategory = null;
      let targetUrl = "";
      let referer = "";
      let userAgent = "";
      let parentFound = false;

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Cek Perpindahan Tag Kategori
        if (line.startsWith('[') && line.endsWith(']')) {
          currentCategory = line.slice(1, -1).toLowerCase();
          parentFound = false; 
          continue;
        }

        if (currentCategory !== typeParam) continue;

        const parts = line.split('|').map(p => p.trim());

        // Penguraian Kategori Tunggal (LIVE, FILM, SEMI)
        if (typeParam === "live" || typeParam === "film" || typeParam === "semi") {
          if (parts[0] === videoId) {
            targetUrl = parts[4] || "";
            referer = parts[5] || "";
            userAgent = parts[6] || "";
            break; 
          }
        } 
        // Penguraian Kategori Bertingkat Kebawah (SERIES, ANIME)
        else {
          if (parts.length >= 4 && parts[0] === videoId) {
            parentFound = true;
            continue; 
          }

          if (parentFound) {
            // Jika menabrak judul film lain sebelum episode ditemukan, stop scan
            if (parts.length >= 4 && parts[0] !== videoId) {
                break;
            }

            // Cari kecocokan nomor episode
            if (parts[0].toLowerCase() === requestedEps) {
              targetUrl = parts[1] || "";
              referer = parts[2] || "";
              userAgent = parts[3] || "";
              break; 
            }
          }
        }
      }

      if (!targetUrl) targetUrl = getRandomFallbackLink();

      const isRawMode = urlObj.searchParams.get("raw") === "true";
      if (isRawMode) {
        const lowUrl = targetUrl.toLowerCase();
        if (lowUrl.includes(".html") || lowUrl.includes(".php") || lowUrl.includes("embed") || lowUrl.includes("googleapis.com") || lowUrl.includes("drive.google") || lowUrl.includes(".mp4")) {
          return Response.redirect(targetUrl, 302);
        }
        if (targetUrl.includes(".m3u8") || !targetUrl.includes(".")) {
          const proxyStreamUrl = `${urlObj.origin}${urlObj.pathname}?proxy=true&url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&ua=${encodeURIComponent(userAgent)}`;
          return Response.redirect(proxyStreamUrl, 302);
        }
        return Response.redirect(targetUrl, 302);
      }

      const playerHtml = generatePlayerHtml(targetUrl, referer, userAgent, urlObj);
      return new Response(playerHtml, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "X-Frame-Options": "ALLOWALL"
        }
      });

    } catch (err) {
      return new Response("Worker Error: " + err.message, { status: 500 });
    }
  },
};

function generatePlayerHtml(targetUrl, referer, userAgent, urlObj) {
  function getYouTubeId(url) {
    if (!url) return null;
    if (url.length === 11 && !url.includes("/") && !url.includes(".")) return url;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  const fallbackArrayJson = JSON.stringify(FALLBACK_LINKS);
  const ytId = getYouTubeId(targetUrl);

  if (ytId) {
    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>YT Player</title>
        <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; } #yt-player-container { width: 100%; height: 100%; position: relative; } #yt-player { width: 100%; height: 100%; border: none; position: absolute; top: 0; left: 0; }</style>
    </head>
    <body>
        <div id="yt-player-container"><div id="yt-player"></div></div>
        <script>
            var tag = document.createElement('script'); tag.src = "https://www.youtube.com/iframe_api";
            var firstScriptTag = document.getElementsByTagName('script')[0]; firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            var player;
            function onYouTubeIframeAPIReady() {
                player = new YT.Player('yt-player', {
                    videoId: '${ytId}',
                    playerVars: { 'autoplay': 1, 'mute': 0, 'controls': 1, 'rel': 0, 'showinfo': 0, 'ecver': 2 },
                    events: { 
                        'onReady': function(e) { e.target.playVideo(); setTimeout(() => { if (player.getPlayerState() !== 1) { player.mute(); player.playVideo(); } }, 1000); },
                        'onError': function(e) { window.location.href = window.location.origin + window.location.pathname + "?proxy=true&url=" + encodeURIComponent(${fallbackArrayJson}[0]); }
                    }
                });
            }
            document.addEventListener('contextmenu', e => e.preventDefault());
        </script>
    </body>
    </html>`;
  } 

  const lowUrl = targetUrl.toLowerCase();
  const isVideoFile = lowUrl.includes(".m3u8") || lowUrl.includes(".mp4") || lowUrl.includes(".mpd") || lowUrl.includes(".webm") || lowUrl.includes("googleapis") || lowUrl.includes("drive.google") || lowUrl.includes("mime=video");

  if (lowUrl.includes(".html") || lowUrl.includes(".php") || lowUrl.includes("embed") || !isVideoFile) {
    return `
    <!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>External Embed Player</title>
        <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; } iframe { width: 100%; height: 100%; border: none; }</style>
    </head>
    <body>
        <iframe src="${targetUrl}" allowfullscreen webkitallowfullscreen mozallowfullscreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock"></iframe>
        <script>document.addEventListener('contextmenu', e => e.preventDefault());</script>
    </body>
    </html>`;
  }

  let finalStreamUrl = `${urlObj.origin}${urlObj.pathname}?proxy=true&url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&ua=${encodeURIComponent(userAgent)}`;
  let playerType = lowUrl.includes(".m3u8") ? "hls" : (lowUrl.includes(".mpd") ? "dash" : "native");

  if (playerType !== "hls") finalStreamUrl = targetUrl;

  return `
  <!DOCTYPE html>
  <html lang="id">
  <head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Core Player</title>
      ${playerType === 'hls' ? '<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>' : ''}
      ${playerType === 'dash' ? '<script src="https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js"></script>' : ''}
      <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; } video { width: 100%; height: 100%; object-fit: contain; background: #000; }</style>
  </head>
  <body>
      <video id="video-player" controls playsinline autoplay></video>
      <script>
          const video = document.getElementById('video-player');
          let attemptCount = 0;
          function handleVideoError() {
              attemptCount++; if (attemptCount > 3) return;
              const fallbacks = ${fallbackArrayJson};
              setTimeout(() => { video.src = fallbacks[Math.floor(Math.random() * fallbacks.length)]; video.load(); video.play().catch(e => { video.muted = true; video.play(); }); }, 1000);
          }
          video.addEventListener('error', handleVideoError);
          if ("${playerType}" === "hls" && Hls.isSupported()) {
              const hls = new Hls({ maxMaxBufferLength: 30 }); hls.loadSource("${finalStreamUrl}"); hls.attachMedia(video);
              hls.on(Hls.Events.ERROR, function(e, d) { if (d.fatal) handleVideoError(); });
          } else if ("${playerType}" === "dash") {
              dashjs.MediaPlayer().create().initialize(video, "${finalStreamUrl}", true);
          } else {
              video.src = "${finalStreamUrl}"; video.load();
          }
          video.play().catch(e => { video.muted = true; video.play(); });
          video.addEventListener('webkitbeginfullscreen', function() { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(e => {}); });
          document.addEventListener('contextmenu', e => e.preventDefault());
      </script>
  </body>
  </html>`;
}