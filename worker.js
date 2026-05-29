const GITHUB_PLAYLIST_URL = "https://raw.githubusercontent.com/kailakece/bstream/refs/heads/main/playlist.txt";

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

        if (line.startsWith('[') && line.endsWith(']')) {
          currentCategory = line.slice(1, -1).toLowerCase();
          parentFound = false; 
          continue;
        }

        if (currentCategory !== typeParam) continue;

        const parts = line.split('|').map(p => p.trim());

        if (typeParam === "live" || typeParam === "film" || typeParam === "semi") {
          if (parts[0] === videoId) {
            targetUrl = parts[4] || "";
            referer = parts[5] || "";
            userAgent = parts[6] || "";
            break; 
          }
        } 
        else {
          if (parts.length >= 4 && parts[0] === videoId) {
            parentFound = true;
            continue; 
          }

          if (parentFound) {
            if (parts.length >= 4 && parts[0] !== videoId) {
                break;
            }

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
    return `<!DOCTYPE html>
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
                    playerVars: { 
                        'autoplay': 1, 
                        'mute': 1, 
                        'controls': 1, 
                        'rel': 0, 
                        'showinfo': 0, 
                        'ecver': 2, 
                        'playsinline': 1 
                    },
                    events: { 
                        'onReady': function(e) { 
                            e.target.playVideo();
                            setTimeout(function() {
                                try {
                                    player.unMute();
                                    player.setVolume(100);
                                } catch(err) {}
                            }, 100);
                        },
                        'onStateChange': function(e) {
                            if (e.data === 1) {
                                try {
                                    player.unMute();
                                    player.setVolume(100);
                                } catch(err) {}
                            }
                        },
                        'onError': function(e) { window.location.href = window.location.origin + window.location.pathname + "?proxy=true&url=" + encodeURIComponent(${fallbackArrayJson}[0]); }
                    }
                });
            }

            function forceUnmute() {
                if (player && typeof player.unMute === 'function') {
                    try { player.unMute(); player.setVolume(100); player.playVideo(); } catch(e) {}
                }
            }
            window.addEventListener('click', forceUnmute, { once: true });
            window.addEventListener('touchstart', forceUnmute, { once: true });
            document.addEventListener('pointerdown', forceUnmute, { once: true });

            document.addEventListener("fullscreenchange", function() {
                if (document.fullscreenElement && screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(e => {});
                }
            });
            document.addEventListener('contextmenu', e => e.preventDefault());
        </script>
    </body>
    </html>`;
  } 

  const lowUrl = targetUrl.toLowerCase();
  const isVideoFile = lowUrl.includes(".m3u8") || lowUrl.includes(".mp4") || lowUrl.includes(".mpd") || lowUrl.includes(".webm") || lowUrl.includes("googleapis") || lowUrl.includes("drive.google") || lowUrl.includes("mime=video");

  if (lowUrl.includes(".html") || lowUrl.includes(".php") || lowUrl.includes("embed") || !isVideoFile) {
    let modifiedTargetUrl = targetUrl;
    try {
      let embedUrl = new URL(targetUrl);
      embedUrl.searchParams.set("autoplay", "1");
      embedUrl.searchParams.set("mute", "0");
      modifiedTargetUrl = embedUrl.toString();
    } catch(e) {}

    return `<!DOCTYPE html>
    <html lang="id">
    <head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>External Embed Player</title>
        <style>html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; } iframe { width: 100%; height: 100%; border: none; }</style>
    </head>
    <body>
        <iframe id="embed-frame" src="${modifiedTargetUrl}" allowfullscreen webkitallowfullscreen mozallowfullscreen allow="autoplay *; encrypted-media *; fullscreen *; picture-in-picture *" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-pointer-lock"></iframe>
        <script>
            document.addEventListener("fullscreenchange", function() {
                if (document.fullscreenElement && screen.orientation && screen.orientation.lock) {
                    screen.orientation.lock('landscape').catch(e => {});
                }
            });
            document.addEventListener('contextmenu', e => e.preventDefault());
        </script>
    </body>
    </html>`;
  }

  let finalStreamUrl = `${urlObj.origin}${urlObj.pathname}?proxy=true&url=${encodeURIComponent(targetUrl)}&referer=${encodeURIComponent(referer)}&ua=${encodeURIComponent(userAgent)}`;
  let playerType = lowUrl.includes(".m3u8") ? "hls" : (lowUrl.includes(".mpd") ? "dash" : "native");

  if (playerType !== "hls") finalStreamUrl = targetUrl;

  let hlsScript = playerType === 'hls' ? '<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.7/dist/hls.min.js"></script>' : '';
  let dashScript = playerType === 'dash' ? '<script src="https://cdn.jsdelivr.net/npm/dashjs@4.7.4/dist/dash.all.min.js"></script>' : '';

  return `<!DOCTYPE html>
  <html lang="id">
  <head>
      <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Core Player</title>
      ${hlsScript}
      ${dashScript}
      <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; } 
          video { width: 100%; height: 100%; object-fit: contain; background: #000; display: block; }
      </style>
  </head>
  <body>
      <video id="video-player" controls playsinline></video>
      <script>
          const video = document.getElementById('video-player');
          const fallbacks = ${fallbackArrayJson};
          let isFallbackMode = false;

          function playRandomFallback() {
              isFallbackMode = true;
              const randomUrl = fallbacks[Math.floor(Math.random() * fallbacks.length)];
              video.src = randomUrl;
              video.load();
              triggerUnmutedAutoplay();
          }

          function handleVideoError() {
              if (isFallbackMode) {
                  playRandomFallback();
              } else {
                  playRandomFallback();
              }
          }

          function triggerUnmutedAutoplay() {
              video.muted = false;
              let playPromise = video.play();
              if (playPromise !== undefined) {
                  playPromise.catch(error => { video.muted = true; video.play(); });
              }
          }

          video.addEventListener('error', handleVideoError);

          video.addEventListener('ended', function() {
              playRandomFallback();
          });

          if ("${playerType}" === "hls" && typeof Hls !== 'undefined' && Hls.isSupported()) {
              const hls = new Hls({ maxMaxBufferLength: 30 }); hls.loadSource("${finalStreamUrl}"); hls.attachMedia(video);
              hls.on(Hls.Events.MANIFEST_PARSED, function() { triggerUnmutedAutoplay(); });
              hls.on(Hls.Events.ERROR, function(e, d) { if (d.fatal) handleVideoError(); });
          } else if ("${playerType}" === "dash" && typeof dashjs !== 'undefined') {
              const dashPlayer = dashjs.MediaPlayer().create();
              dashPlayer.initialize(video, "${finalStreamUrl}", false);
              dashPlayer.on(dashjs.MediaPlayer.events.CAN_PLAY, function() { triggerUnmutedAutoplay(); });
          } else {
              video.src = "${finalStreamUrl}"; video.load();
              video.addEventListener('canplay', function() { triggerUnmutedAutoplay(); });
          }
          video.addEventListener('webkitbeginfullscreen', function() { if (screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(e => {}); } });
          document.addEventListener("fullscreenchange", function() { if (document.fullscreenElement && screen.orientation && screen.orientation.lock) { screen.orientation.lock('landscape').catch(e => {}); } });
          document.addEventListener('contextmenu', e => e.preventDefault());
      </script>
  </body>
  </html>`;
}
