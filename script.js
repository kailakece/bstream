const WORKER_BASE_URL = "https://bstream.kailapirdaaulia.workers.dev/";
const TEXT_PLAYLIST_URL = "./playlist.txt"; 

let databaseVideo = {}; 
let currentActiveCategory = "live";
let activeVideoId = null, activeVideoCategory = null; 
let isPlayerActiveOnScreen = false; 
let pipWindow = null; 
let currentSearchQuery = "";

function getRandomRating() {
    return (Math.random() * (5.0 - 4.0) + 4.0).toFixed(1);
}

function parseTextDatabase(text) {
    const db = { live: [], film: [], semi: [], series: [], anime: [] };
    const lines = text.split('\n');
    let currentCategory = null;
    let currentParentObj = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue; 

        if (line.startsWith('[') && line.endsWith(']')) {
            currentCategory = line.slice(1, -1).toLowerCase();
            currentParentObj = null;
            continue;
        }

        if (!currentCategory || !db[currentCategory]) continue;

        const parts = line.split('|').map(p => p.trim());

        if (currentCategory === 'live' || currentCategory === 'film' || currentCategory === 'semi') {
            const item = {
                id_kv: parts[0],
                title: parts[1],
                image: parts[2],
                badge: parts[3],
                rating: getRandomRating(),
                total_episodes: []
            };
            db[currentCategory].push(item);
        } 
        else if (currentCategory === 'series' || currentCategory === 'anime') {
            if (parts.length >= 4) {
                currentParentObj = {
                    id_kv: parts[0],
                    title: parts[1],
                    image: parts[2],
                    badge: parts[3],
                    rating: getRandomRating(),
                    total_episodes: []
                };
                db[currentCategory].push(currentParentObj);
            } 
            else if (parts.length >= 2 && currentParentObj) {
                currentParentObj.total_episodes.push(parts[0]);
            }
        }
    }
    return db;
}

async function loadDatabaseFromKV() {
    const container = document.getElementById("video-display-container");
    container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;font-size:13px;"><i class="fa-solid fa-spinner fa-spin"></i> Memuat playlist teks dari GitHub...</div>`;
    
    try {
        const response = await fetch(TEXT_PLAYLIST_URL);
        if (!response.ok) throw new Error("Gagal mengambil data teks");
        
        const textData = await response.text();
        databaseVideo = parseTextDatabase(textData);
        
        renderVideos("live");
    } catch (error) {
        console.error(error);
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:#ff4a4a;padding:40px 0;font-size:13px;"><i class="fa-solid fa-circle-exclamation"></i> Gagal memuat playlist teks dari GitHub.</div>`;
    }
}

function toggleQrisPopup(show) {
    const popup = document.getElementById("qrisPopup");
    if (show) popup.classList.add("show");
    else popup.classList.remove("show");
}

function toggleMobileSearch(show) {
    const overlay = document.getElementById("mobileSearchOverlay");
    overlay.style.display = show ? "flex" : "none";
    if(show) document.getElementById("mobileSearchInput").focus();
    else clearMobileSearch();
}

function clearMobileSearch() {
    document.getElementById("mobileSearchInput").value = "";
    filterVideos("");
}

function filterVideos(query) {
    currentSearchQuery = query.toLowerCase().trim();
    renderVideos(currentActiveCategory);
}

function renderVideos(category) {
    currentActiveCategory = category;
    const container = document.getElementById("video-display-container");
    
    if (!databaseVideo[category]) return;
    container.innerHTML = "";

    const layout = document.getElementById("main-app-layout");
    const playerContainer = document.getElementById("player-container");
    const isPipActive = playerContainer.classList.contains("pip-mode");

    if (isPlayerActiveOnScreen) {
        layout.className = isPipActive ? "app-layout playing import-pip-grid" : "app-layout playing";
    } else {
        layout.className = "app-layout";
    }

    const items = databaseVideo[category] || [];
    
    const filteredItems = items.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(currentSearchQuery);
        const isNotPlaying = item.id_kv !== activeVideoId;
        return matchesSearch && isNotPlaying;
    });

    if (filteredItems.length === 0) {
        container.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px 0;font-size:13px;">Tidak ada saluran yang cocok.</div>`;
        return;
    }

    filteredItems.forEach(item => {
        const card = document.createElement("div");
        card.className = "video-card";
        card.innerHTML = `
            <div class="thumb-wrap">
                <span class="badge-tag">${item.badge}</span>
                <img src="${item.image}" onerror="this.src='https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=500'">
            </div>
            <div class="card-info">
                <div class="video-title">${item.title}</div>
                <div class="video-meta">
                    <span style="color:var(--brand-color); font-weight:600;"><i class="fa-solid fa-play"></i> Tonton</span>
                    <span class="video-rating"><i class="fa-solid fa-star"></i> ${item.rating}</span>
                </div>
            </div>`;

        card.onclick = () => {
            closeNativePip();
            document.getElementById("player-container").classList.remove("pip-mode");
            if (category === "series" || category === "anime") {
                buildEpisodeList(item, category, item.total_episodes);
                playVideo(item.id_kv, category, item.total_episodes[0]);
            } else {
                document.getElementById("episode-wrapper").style.display = "none";
                playVideo(item.id_kv, category, null);
            }
        };
        container.appendChild(card);
    });
}

function buildEpisodeList(item, category, parsedEpisodes) {
    const wrapper = document.getElementById("episode-wrapper");
    const oldList = document.getElementById("episode-container-list");
    if (oldList) oldList.remove();

    const containerList = document.createElement("div");
    containerList.id = "episode-container-list";
    containerList.className = "episode-list";

    document.getElementById("episode-group-title").innerText = `Daftar Playlist: ${item.title}`;
    wrapper.style.display = "block";

    parsedEpisodes.forEach((eps, index) => {
        const btn = document.createElement("div");
        btn.className = `episode-btn ${index === 0 ? 'active' : ''}`;
        
        const formatMatch = eps.toString().match(/^s(\d+)e(\d+)$/i);
        if (formatMatch) {
            btn.innerText = `S${formatMatch[1]} Eps ${formatMatch[2]}`;
        } else {
            btn.innerText = `Eps ${eps}`;
        }

        btn.onclick = () => {
            document.querySelectorAll(".episode-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            playVideo(item.id_kv, category, eps);
        };
        containerList.appendChild(btn);
    });
    wrapper.appendChild(containerList);
}

function playVideo(idKv, category, eps = null) {
    activeVideoId = idKv; activeVideoCategory = category; isPlayerActiveOnScreen = true; 

    const layout = document.getElementById("main-app-layout");
    const playerContainer = document.getElementById("player-container");
    const iframe = document.getElementById("stream-frame");

    let finalUrl = `${WORKER_BASE_URL}?v=${idKv}`;
    if (category !== "live") finalUrl += `&type=${category}`;
    if (eps) finalUrl += `&eps=${eps}`;

    iframe.src = finalUrl;
    
    if (pipWindow) {
        pipWindow.document.body.appendChild(iframe);
    } else {
        playerContainer.classList.remove("pip-mode"); 
        playerContainer.style.display = "block";
        layout.className = "app-layout playing";
    }

    renderVideos(currentActiveCategory);
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function enterNativePip() {
    const iframe = document.getElementById("stream-frame");
    if (!iframe || iframe.src === "about:blank") return;

    try {
        if ('documentPictureInPicture' in window) {
            if (pipWindow) pipWindow.close();

            pipWindow = await window.documentPictureInPicture.requestWindow({ width: 340, height: 190 });

            const pipStyle = pipWindow.document.createElement('style');
            pipStyle.textContent = `
                body { margin: 0; background: #000; overflow: hidden; }
                iframe { width: 100vw; height: 100vh; border: none; }
            `;
            pipWindow.document.head.appendChild(pipStyle);
            pipWindow.document.body.appendChild(iframe);

            pipWindow.addEventListener("pagehide", () => {
                const playerContainer = document.getElementById("player-container");
                playerContainer.appendChild(iframe);
                pipWindow = null;
                
                if (currentActiveCategory === activeVideoCategory) {
                    playerContainer.classList.remove("pip-mode");
                } else {
                    playerContainer.classList.add("pip-mode");
                }
                renderVideos(currentActiveCategory);
            });
        } else {
            document.getElementById("player-container").classList.add("pip-mode");
            makeElementDraggable(document.getElementById("player-container"));
        }
    } catch (error) {
        console.error("Fallback ke PiP CSS internal:", error);
        document.getElementById("player-container").classList.add("pip-mode");
        makeElementDraggable(document.getElementById("player-container"));
    }
}

function closeNativePip() {
    if (pipWindow) {
        pipWindow.close();
        pipWindow = null;
    }
}

function switchCategory(category, element) {
    document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(el => el.classList.remove("active"));
    document.querySelectorAll(".nav-item, .bottom-nav-item").forEach(el => {
        if(el.innerText.toLowerCase().includes(category) || el.querySelector('span')?.innerText.toLowerCase().includes(category)) {
            el.classList.add("active");
        }
    });

    const playerContainer = document.getElementById("player-container");

    if (isPlayerActiveOnScreen) {
        if (category !== activeVideoCategory) {
            document.getElementById("episode-wrapper").style.display = "none"; 
            resetDraggablePosition(playerContainer);
            enterNativePip();
        } else {
            closeNativePip();
            playerContainer.classList.remove("pip-mode"); 
            resetDraggablePosition(playerContainer);
            if (category === "series" || category === "anime") {
                const targetItem = databaseVideo[category].find(item => item.id_kv === activeVideoId);
                if(targetItem) buildEpisodeList(targetItem, category, targetItem.total_episodes);
            }
        }
    }
    renderVideos(category);
}

function stopVideoTotal(event) {
    if (event) event.stopPropagation();
    closeNativePip();
    stopVideoTotalWithoutResetGrid();
    renderVideos(currentActiveCategory);
}

function stopVideoTotalWithoutResetGrid() {
    isPlayerActiveOnScreen = false; activeVideoId = null; activeVideoCategory = null;
    document.getElementById("episode-wrapper").style.display = "none";
    const playerContainer = document.getElementById("player-container");
    playerContainer.classList.remove("pip-mode");
    resetDraggablePosition(playerContainer);
    playerContainer.style.display = "none";
    
    const iframe = document.getElementById("stream-frame");
    playerContainer.appendChild(iframe);
    iframe.src = "about:blank";
    
    document.getElementById("main-app-layout").classList.remove("playing");
}

function makeElementDraggable(elmnt) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    
    elmnt.addEventListener('mousedown', dragMouseDown);
    elmnt.addEventListener('touchstart', dragMouseDown, { passive: true });

    function dragMouseDown(e) {
        e = e || window.event;
        
        if (e.target.closest('.close-btn') || e.target.closest('.stop-btn')) return;

        const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
        
        pos3 = clientX;
        pos4 = clientY;

        if (e.type === 'touchstart') {
            document.addEventListener('touchend', closeDragElement);
            document.addEventListener('touchmove', elementDrag, { passive: true });
        } else {
            document.addEventListener('mouseup', closeDragElement);
            document.addEventListener('mousemove', elementDrag);
        }
    }

    function elementDrag(e) {
        e = e || window.event;

        const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
        const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

        pos1 = pos3 - clientX;
        pos2 = pos4 - clientY;
        pos3 = clientX;
        pos4 = clientY;
        
        let targetTop = elmnt.offsetTop - pos2;
        let targetLeft = elmnt.offsetLeft - pos1;
        
        const maxTop = window.innerHeight - elmnt.clientHeight;
        const maxLeft = window.innerWidth - elmnt.clientWidth;

        if (targetTop < 0) targetTop = 0;
        if (targetLeft < 0) targetLeft = 0;
        if (targetTop > maxTop) targetTop = maxTop;
        if (targetLeft > maxLeft) targetLeft = maxLeft;

        elmnt.style.top = targetTop + "px";
        elmnt.style.left = targetLeft + "px";
        elmnt.style.bottom = "auto";
        elmnt.style.right = "auto";
    }

    function closeDragElement() {
        document.removeEventListener('mouseup', closeDragElement);
        document.removeEventListener('mousemove', elementDrag);
        document.removeEventListener('touchend', closeDragElement);
        document.removeEventListener('touchmove', elementDrag);
    }
}

function resetDraggablePosition(elmnt) {
    elmnt.style.top = ""; elmnt.style.left = "";
    elmnt.style.bottom = ""; elmnt.style.right = "";
}

window.onload = () => {
    loadDatabaseFromKV();
    document.addEventListener('contextmenu', e => e.preventDefault());
};