// script.js - frontend client untuk memanggil "public API" (konfigurable)
// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------
const API_BASE = "https://www.tikwm.com/api/?url=";
// - Ganti API_BASE sesuai API yang hendak dipakai.
// - Jika pakai TikHub langsung, lihat docs.tikhub.io untuk path endpoint yang benar.
// - Jika API tidak butuh key, kosongkan API_KEY.
const API_KEY = ""; // jika perlu: "Bearer xxxxx" atau "API_KEY_HERE"

// CORS proxy (testing only) - jangan pakai untuk produksi
const USE_CORS_PROXY = false;
const CORS_PROXY = "https://www.tikwm.com/api/?url="; // contoh public proxy (rate-limit & tidak disarankan)

// ------------------------------------------------------
// DOM elements (sesuaikan id di index.html mu)
// ------------------------------------------------------
const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("statusBox"); // may be null in your HTML
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

// optional: player / thumbnail containers (jika ada di HTML)
const playerBox = document.getElementById("playerBox");
const previewVideo = document.getElementById("previewVideo");
const thumbBox = document.getElementById("thumbBox");
const thumbImg = document.getElementById("thumbImg");

// ------------------------------------------------------
// UI helpers
// ------------------------------------------------------
// --- Start: replacement for status-box helpers ---
// Pastikan status box ditempatkan tepat setelah bar tombol (.button-row)
function _ensureStatusBox() {
  // jika sudah ada di DOM, kembalikan
  let box = document.getElementById("statusBox");
  if (box) return box;

  // cari bar tombol (button-row) sebagai anchor
  const anchor = document.querySelector(".button-row") || document.querySelector(".input-row") || null;

  // buat elemen status
  box = document.createElement("div");
  box.id = "statusBox";
  box.dataset.type = "info";
  box.style.display = "none";
  box.style.marginTop = "12px";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "8px";
  box.style.fontWeight = "600";
  box.style.maxWidth = "100%";
  box.style.boxSizing = "border-box";
  // default warna (CSS kamu bisa override jika nanti tambahkan selector #statusBox)
  box.style.background = "rgba(30,60,90,0.9)";
  box.style.color = "#eaf2ff";
  box.style.textAlign = "center";

  if (anchor && anchor.parentNode) {
    // sisipkan setelah anchor (di bawah tombol)
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  } else {
    // fallback: tempatkan di dalam body sebelum resultBox
    if (typeof resultBox !== "undefined" && resultBox && resultBox.parentNode) {
      resultBox.parentNode.insertBefore(box, resultBox);
    } else {
      document.body.appendChild(box);
    }
  }
  return box;
}

function showStatus(msg, kind = "info") {
  let box = document.getElementById("statusBox") || _ensureStatusBox();
  if (!box) {
    try { alert(msg); } catch (e) {}
    return;
  }
  box.dataset.type = kind;
  box.textContent = msg;
  box.style.display = "block";

  // warna sederhana berdasarkan jenis
  if (kind === "error") {
    box.style.background = "rgba(180,40,60,0.95)";
    box.style.color = "#fff";
  } else if (kind === "success") {
    box.style.background = "rgba(30,120,60,0.95)";
    box.style.color = "#fff";
  } else {
    box.style.background = "rgba(30,60,90,0.95)";
    box.style.color = "#eaf2ff";
  }

  // auto-hide untuk pesan non-info
  clearTimeout(box._hideTimeout);
  if (kind !== "info") {
    box._hideTimeout = setTimeout(() => { hideStatus(); }, 6000);
  }
}

function hideStatus() {
  const box = document.getElementById("statusBox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
  box.dataset.type = "";
  if (box._hideTimeout) { clearTimeout(box._hideTimeout); box._hideTimeout = null; }
}
// --- End: replacement for status-box helpers ---

function clearResults() {
  if (resultList) resultList.innerHTML = "";
  if (resultBox) resultBox.classList.add("hidden");
  if (playerBox) playerBox.classList.add("hidden");
  if (thumbBox) thumbBox.classList.add("hidden");
  hideStatus();
}

// ------------------------------------------------------
// Utility: collect possible URLs from JSON
// ------------------------------------------------------
function collectUrls(obj, out = new Set()) {
  if (!obj) return out;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (/^https?:\/\//i.test(s)) out.add(s);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) collectUrls(it, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) collectUrls(obj[k], out);
  }
  return out;
}

function pickThumbnail(json) {
  if (!json) return null;
  if (json.thumbnail) return json.thumbnail;
  if (json.cover) return json.cover;
  if (json.data && (json.data.cover || json.data.thumbnail)) return json.data.cover || json.data.thumbnail;

  const urls = Array.from(collectUrls(json));
  for (const u of urls) {
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return u;
  }
  return null;
}

// ------------------------------------------------------
// Build request & call API
// ------------------------------------------------------
async function callApi(videoUrl) {
  // build endpoint (simple concat). If API expects POST or other param, modify di sini.
  let endpoint = API_BASE + encodeURIComponent(videoUrl);

  if (USE_CORS_PROXY) {
    endpoint = CORS_PROXY + endpoint;
  }

  const headers = { Accept: "application/json" };
  if (API_KEY && API_KEY.length) {
    headers["Authorization"] = API_KEY;
  }

  const res = await fetch(endpoint, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}`);
    err.raw = text;
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json") || ct.includes("text/json")) {
    return res.json();
  } else {
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch (e) {
      const err = new Error("Upstream returned non-JSON response");
      err.raw = txt;
      throw err;
    }
  }
}

// ------------------------------------------------------
// Download utility: fetch -> blob -> save
// - note: akan gagal jika file server memblok CORS (browser)
// ------------------------------------------------------
async function downloadBlob(url, filename = "video.mp4") {
  try {
    showStatus("Mengunduh file...", "info");

    // if you want to route file download through proxy for CORS testing:
    let fetchUrl = url;
    if (USE_CORS_PROXY) fetchUrl = CORS_PROXY + url;

    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error("Fetch failed: " + res.status);

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);

    hideStatus();
  } catch (err) {
    console.error("Download error", err);
    let msg = err.message || "Gagal mendownload";
    if (String(msg).toLowerCase().includes("cors")) {
      msg = "Gagal mendownload — kemungkinan diblokir CORS. Gunakan server-proxy untuk mengatasi.";
    }
    showStatus("Error: " + msg, "error");
    throw err;
  }
}

// ------------------------------------------------------
// Render result: map various possible response shapes into UI
// ------------------------------------------------------
function renderResult(payload) {
  // normalize payload if wrapper { ok: true, result: {...} }
  if (payload && payload.ok && payload.result) payload = payload.result;

  // Try detect title/thumbnail/downloads
  const title = payload.title || payload.name || payload.desc || (payload.data && payload.data.title) || "";
  const thumbnail = pickThumbnail(payload);

  // Gather download links
  const downloads = [];

  if (Array.isArray(payload.downloads) && payload.downloads.length) {
    payload.downloads.forEach(d => {
      downloads.push({
        label: d.label || d.quality || d.name || "Video",
        url: d.url || d.link || d.src || d,
        size: d.size || d.filesize || "",
        filename: d.filename || ""
      });
    });
  }

  // common fields (tikwm-like)
  if (!downloads.length) {
    if (payload.play) downloads.push({ label: "Tanpa Watermark", url: payload.play, size: payload.size || "" });
    if (payload.wmplay) downloads.push({ label: "Dengan Watermark", url: payload.wmplay, size: payload.size || "" });
    if (payload.video && payload.video.play_addr) downloads.push({ label: "Play", url: payload.video.play_addr });
  }

  // fallback: extract URLs from object
  if (!downloads.length) {
    const urls = Array.from(collectUrls(payload));
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /\/play\/|\/video\//i.test(u) || /play/i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u, i) => downloads.push({ label: `Detected ${i+1}`, url: u, size: "" }));
  }

  // ALSO collect image/audio URLs from payload for separate foto/audio buttons
  const allUrls = Array.from(collectUrls(payload));
  const imageUrls = allUrls.filter(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u));
  const audioUrls = allUrls.filter(u => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u) || /audio/i.test(u));

  const audioUrl = audioUrls.length ? audioUrls[0] : null;
  // prefer explicit thumbnail if exists
  const photoUrl = thumbnail || (imageUrls.length ? imageUrls[0] : null);

  // UI: clear previous
  resultList.innerHTML = "";

  // --- try to find a playable URL (mp4 / play-like) first ---
  let playableUrl = null;
  for (const d of downloads) {
    if (d.url && ( /\.mp4(\?|$)/i.test(d.url) || /\/play\/|\/video\//i.test(d.url) )) {
      playableUrl = d.url;
      break;
    }
  }
  if (!playableUrl && downloads.length) {
    const firstCandidate = downloads.find(d => typeof d.url === "string" && /^https?:\/\//i.test(d.url));
    if (firstCandidate) playableUrl = firstCandidate.url;
  }

  // If we have a playable url and video player present -> show it
  if (playableUrl && previewVideo && playerBox) {
    try { previewVideo.crossOrigin = "anonymous"; } catch (e) {}
    previewVideo.src = playableUrl;
    if (photoUrl) previewVideo.poster = photoUrl;
    previewVideo.load();
    playerBox.classList.remove("hidden");
    if (thumbBox) thumbBox.classList.add("hidden");
  } else {
    // show thumbnail if present (fallback)
    if (photoUrl) {
      if (thumbBox && thumbImg) {
        thumbImg.src = photoUrl;
        thumbBox.classList.remove("hidden");
      } else {
        const img = document.createElement("img");
        img.src = photoUrl;
        img.alt = title || "thumbnail";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "10px";
        resultList.appendChild(img);
      }
    }
    if (playerBox) playerBox.classList.add("hidden");
  }

  // Title
  if (title) {
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  // KEEP ONLY 1 DOWNLOAD (hapus detected lain kecuali index 0)
  if (downloads.length > 1) downloads.splice(1);

  // If there's at least one download, render a single row with direct download button
  if (downloads.length) {
    const d = downloads[0];
    const node = document.createElement("div");
    node.className = "result-item";
    node.innerHTML = `
      <div style="display:flex;flex-direction:column;margin-bottom:8px;">
        <div style="font-weight:600">${d.label}</div>
        <div style="opacity:.75;font-size:13px">${d.size || ""}</div>
      </div>

      <div class="download-actions">
        <!-- Direct-download button: uses href + download attribute and data for JS fallback -->
        <a href="${d.url}" class="btn-download download-btn" data-url="${d.url}"
           data-fn="${(d.filename || "video").replace(/"/g,'')}.mp4" download>
          Download Video
        </a>
      </div>
    `;
    resultList.appendChild(node);
  } else {
    // no downloads found
    const hint = document.createElement("div");
    hint.style.opacity = "0.85";
    hint.style.marginTop = "8px";
    hint.textContent = "Tidak ada link video yang terdeteksi.";
    resultList.appendChild(hint);
  }

  // ===== new: row with Download Foto + Download Audio (single buttons) =====
  if (photoUrl || audioUrl) {
    const box = document.createElement("div");
    box.className = "result-item";
    box.style.display = "flex";
    box.style.justifyContent = "flex-start";
    box.style.gap = "12px";
    box.style.marginTop = "12px";
    box.style.alignItems = "center";

    if (photoUrl) {
  const aPhoto = document.createElement("button");
  aPhoto.className = "download-btn btn-download";
  aPhoto.dataset.url = photoUrl;
  aPhoto.dataset.fn = "photo.jpg";
  aPhoto.textContent = "Download Foto";
  box.appendChild(aPhoto);
}

if (audioUrl) {
  const aAudio = document.createElement("button");
  aAudio.className = "download-btn btn-download";
  aAudio.dataset.url = audioUrl;
  aAudio.dataset.fn = "audio.mp3";
  aAudio.textContent = "Download Audio";
  box.appendChild(aAudio);
}

    resultList.appendChild(box);
  }

  resultBox.classList.remove("hidden");
}
// ------------------------------------------------------
// Main flow: called when user clicks Gas
// ------------------------------------------------------
async function processUrl(videoUrl) {
  clearResults();
  showStatus("Loading...", "info");
  gasBtn.disabled = true;
  gasBtn.textContent = "Proses...";

  try {
    const json = await callApi(videoUrl);

    showStatus("Sukses menerima permintaan...", "success");
    renderResult(json);
  } catch (err) {
    console.error("API error:", err);
    let msg = err.message || "Gagal";
    if ((err.raw && String(err.raw).toLowerCase().includes("cors")) || msg.toLowerCase().includes("cors")) {
      msg = "Request diblokir (CORS). Solusi: gunakan server-proxy atau aktifkan CORS proxy untuk testing.";
    } else if (err.raw) {
      console.log("Upstream raw:", err.raw);
    }
    showStatus("Error: " + msg, "error");
  } finally {
    gasBtn.disabled = false;
    gasBtn.textContent = "Download";
  }
}

// ------------------------------------------------------
// Event listeners
// ------------------------------------------------------
gasBtn.addEventListener("click", () => {
  const u = (urlInput.value || "").trim();
  if (!u) {
    showStatus("Masukkan URL video dulu!", "error");
    return;
  }
  try { new URL(u); } catch { showStatus("Format URL tidak valid.", "error"); return; }
  processUrl(u);
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearResults();
});

// pastikan resultList sudah ada (element di DOM)
// Event delegation untuk tombol download (gantikan blok listener lama dengan ini)
if (resultList) {
  // pastikan listener hanya dipasang sekali
  if (!window.__downloadHandlerInstalled) {
    window.__downloadHandlerInstalled = true;

    resultList.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-download");
      if (!btn) return; // bukan tombol kita
      e.preventDefault();

      // Validasi: pastikan user sudah input URL di input atas
      if (!urlInput || !urlInput.value.trim()) {
        showStatus("Masukkan URL video dulu.", "error");
        return;
      }

      const url = btn.dataset.url || btn.getAttribute("href");
      const filename = (btn.dataset.fn || "video.mp4").replace(/"/g, "");
      if (!url) {
        showStatus("URL download tidak tersedia.", "error");
        return;
      }

      // Coba fetch -> blob (force download). Jika upstream blokir CORS, fallback ke buka tab.
      showStatus("Mengambil file untuk diunduh...", "info");
      try {
        const fetchUrl = (USE_CORS_PROXY && CORS_PROXY) ? (CORS_PROXY + url) : url;
        const res = await fetch(fetchUrl, { mode: "cors" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);

        showStatus("Download dimulai.", "success");
        return;
      } catch (err) {
        console.warn("fetch->blob failed:", err);
        // fallback: coba paksa klik anchor (mungkin browser akan membuka/men-download)
        try {
          const a2 = document.createElement("a");
          a2.href = url;
          a2.download = filename;
          a2.target = "_blank";
          document.body.appendChild(a2);
          a2.click();
          a2.remove();
          showStatus("Mengambil gagal via fetch — membuka link di tab baru.", "info");
          return;
        } catch (e2) {
          console.error("anchor fallback failed:", e2);
          showStatus("Gagal memulai download. Coba buka link manual.", "error");
          return;
        }
      }
    });
  }
}
// init
clearResults();
hideStatus();

//INI TAMBAHAN BUAT DIRECT DOWNLOAD//
async function forceDownloadVideo(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "video.mp4";
    document.body.appendChild(a);
    a.click();

    a.remove();
    window.URL.revokeObjectURL(blobUrl);

  } catch(err) {
    alert("Gagal download video: " + err.message);
  }
}
/* ----------------------------
   Lightning overlay (JS)
   - paste this near the end of script.js, BEFORE `clearResults(); hideStatus();`
   ---------------------------- */
(function attachLightningOverlay() {
  // create canvas overlay
  const canvas = document.createElement("canvas");
  canvas.id = "lightningOverlay";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "0"; // .page has z-index:1 so UI stays above overlay
  canvas.style.mixBlendMode = "screen";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let w = canvas.width = innerWidth;
  let h = canvas.height = innerHeight;
  const DPR = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  ctx.scale(DPR, DPR);

  // small particle/lightning params
  const flashes = []; // active flashes

  function resize() {
    w = canvas.width = innerWidth;
    h = canvas.height = innerHeight;
    canvas.width = w * DPR;
    canvas.height = h * DPR;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  addEventListener("resize", resize);

  // helper: random range
  function rnd(min, max) { return Math.random() * (max - min) + min; }

  // create flash object
  function spawnFlash() {
    const cx = rnd(w * 0.1, w * 0.9);
    const segments = Math.floor(rnd(3, 7));
    const color = `rgba(180,220,255,${rnd(0.18,0.35)})`;
    const life = rnd(420, 900); // ms
    const width = rnd(1.2, 3.6);
    const paths = [];

    // build jagged path segments
    let x = rnd(0, w);
    let y = rnd(0, h * 0.2);
    for (let i=0;i<segments;i++){
      const nx = x + rnd(-w*0.15, w*0.15);
      const ny = y + rnd(h*0.12, h*0.3);
      paths.push({x, y, nx, ny});
      x = nx; y = ny;
    }

    flashes.push({
      paths, color, start: performance.now(), life, width,
      glow: rnd(6, 26), flicker: Math.random() < 0.6
    });
  }

  // occasional spawn
  let lastSpawn = 0;
  function maybeSpawn(ts) {
    if (ts - lastSpawn > rnd(600, 3000)) {
      if (Math.random() < 0.55) spawnFlash();
      lastSpawn = ts;
    }
  }

  // draw single flash with glow and slight flicker
  function drawFlash(f, t) {
    const elapsed = t - f.start;
    const p = Math.min(1, elapsed / f.life);
    const alphaFade = (1 - Math.pow(p, 2)); // fade out

    // base glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    // glow layers
    for (let g = 4; g >= 0; g--) {
      ctx.lineWidth = f.width + (f.glow * g * 0.06);
      ctx.strokeStyle = f.color.replace(/[\d.]+\)$/,'') + `${Math.max(0.02, 0.12*alphaFade/(g+1))})`;
      ctx.beginPath();
      for (const seg of f.paths) {
        ctx.moveTo(seg.x, seg.y);
        ctx.lineTo(seg.nx, seg.ny);
      }
      ctx.stroke();
    }

    // sharp core
    ctx.lineWidth = f.width;
    ctx.strokeStyle = f.color.replace(/[\d.]+\)$/,'') + `${0.95 * alphaFade})`;
    ctx.beginPath();
    for (const seg of f.paths) {
      ctx.moveTo(seg.x, seg.y);
      ctx.lineTo(seg.nx, seg.ny);
    }
    ctx.stroke();

    // tiny flicker sparks
    if (f.flicker && Math.random() < 0.12) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const seg = f.paths[Math.floor(Math.random() * f.paths.length)];
      ctx.beginPath();
      ctx.arc((seg.x+seg.nx)/2 + rnd(-10,10), (seg.y+seg.ny)/2 + rnd(-10,10), rnd(1,3), 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  // main animation loop
  let lastTs = performance.now();
  function frame(ts) {
    const dt = ts - lastTs;
    lastTs = ts;

    // fade background of overlay slightly (so trails)
    ctx.clearRect(0,0,w,h);
    // subtle dim to keep overlay transient
    // ctx.fillStyle = "rgba(0,0,0,0.02)"; ctx.fillRect(0,0,w,h);

    maybeSpawn(ts);

    // draw each flash; remove expired
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = ts - f.start;
      if (age > f.life) {
        flashes.splice(i,1);
        continue;
      }
      drawFlash(f, ts);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // initial few flashes for atmosphere
  for (let i=0;i<2;i++) setTimeout(spawnFlash, i*300 + 80);

  // allow manual trigger via window for dev/testing
  window.__triggerLightning = spawnFlash;
})();

/* ===== Lightning effect concentrated on Killua body =====
   Paste this into script.js BEFORE the "// init" section
*/
(function attachLightning() {
  const canvas = document.getElementById("lightningCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });

  let DPR = Math.max(1, window.devicePixelRatio || 1);
  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // config
  const flashes = [];
  function rand(a,b){ return a + Math.random()*(b-a); }

  // read body-area from CSS vars (percent -> px)
  function getBodyArea() {
    const cs = getComputedStyle(document.documentElement);
    const toPx = (v, total) => {
      if (!v) return 0;
      if (v.trim().endsWith("%")) return total * (parseFloat(v) / 100);
      return parseFloat(v);
    };
    const w = window.innerWidth, h = window.innerHeight;
    const bx = cs.getPropertyValue('--body-x') || '35%';
    const by = cs.getPropertyValue('--body-y') || '20%';
    const bw = cs.getPropertyValue('--body-w') || '30%';
    const bh = cs.getPropertyValue('--body-h') || '45%';
    return {
      x: toPx(bx, w),
      y: toPx(by, h),
      w: toPx(bw, w),
      h: toPx(bh, h)
    };
  }

  // spawn one flash (a short-lived branching bolt)
  function spawnFlash() {
    const a = getBodyArea();
    const cx = rand(a.x, a.x + a.w);
    const cy = rand(a.y, a.y + a.h);
    const scale = rand(0.6, 1.6);
    const life = rand(160, 380); // ms
    flashes.push({ x: cx, y: cy, created: performance.now(), life, scale });
  }

  // draw single flash with branching lines & glow
  function drawFlash(f, t) {
    const age = t - f.created;
    const p = Math.min(1, age / f.life);
    const alpha = 1 - p;
    // glow
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    // radial glow
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 140 * f.scale);
    g.addColorStop(0, `rgba(150,200,255,${0.35 * alpha})`);
    g.addColorStop(0.5, `rgba(60,140,255,${0.08 * alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(f.x, f.y, 140 * f.scale, 0, Math.PI*2);
    ctx.fill();

    // small bright core
    ctx.beginPath();
    ctx.fillStyle = `rgba(220,245,255,${0.45 * alpha})`;
    ctx.arc(f.x, f.y, 6 * f.scale, 0, Math.PI*2);
    ctx.fill();

    // branching bolts
    const branches = Math.round(3 + Math.random()*4);
    for (let b=0; b<branches; b++) {
      let sx = f.x;
      let sy = f.y;
      const length = rand(60, 220) * f.scale;
      const steps = Math.round(6 + Math.random()*8);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      for (let i=0;i<steps;i++) {
        const ang = rand(-Math.PI/2, Math.PI/2) + (i/steps - 0.5) * 0.6;
        sx += Math.cos(ang) * (length/steps) * (0.9 + Math.random()*0.3);
        sy += Math.sin(ang) * (length/steps) * (0.9 + Math.random()*0.3) + rand(-6,6);
        if (Math.random() < 0.15) {
          // small fork
          ctx.moveTo(sx, sy);
        } else {
          ctx.lineTo(sx, sy);
        }
      }
      ctx.lineWidth = Math.max(1.0, 3.2 * (1 - p) * f.scale);
      ctx.strokeStyle = `rgba(200,230,255,${0.9 * alpha})`;
      ctx.stroke();

      // thin bright overlay
      ctx.beginPath();
      ctx.moveTo(f.x, f.y);
      sx = f.x; sy = f.y;
      for (let i=0;i<Math.round(steps/1.6);i++) {
        const ang = rand(-Math.PI/2, Math.PI/2) + (i/steps - 0.5) * 0.4;
        sx += Math.cos(ang) * (length/steps) * (0.9 + Math.random()*0.2);
        sy += Math.sin(ang) * (length/steps) * (0.9 + Math.random()*0.2) + rand(-4,4);
        ctx.lineTo(sx, sy);
      }
      ctx.lineWidth = Math.max(0.6, 1.6 * (1 - p) * f.scale);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * alpha})`;
      ctx.stroke();
    }
    ctx.restore();
  }

  // animation loop
  let last = performance.now();
  function frame(ts) {
    const dt = ts - last; last = ts;
    // fade canvas a bit to keep trails
    ctx.clearRect(0,0,canvas.width/DPR, canvas.height/DPR);
    // randomly spawn ambient flashes
    if (Math.random() < 0.02) spawnFlash(); // background ambient
    // occasional bigger flash
    if (Math.random() < 0.006) {
      // spawn 1-2 bigger focused flashes
      spawnFlash();
      if (Math.random() < 0.6) spawnFlash();
    }

    // draw each flash
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const age = ts - f.created;
      if (age > f.life) {
        flashes.splice(i, 1);
        continue;
      }
      drawFlash(f, ts);
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // expose trigger for debugging
  window.__triggerLightning = spawnFlash;
})();
// init
clearResults();
hideStatus();

/* ---- Lightning canvas (tembus & di bawah konten) ---- */
#lightningCanvas {
  position: fixed;
  left: 0;
  top: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none; /* jangan ganggu klik */
  z-index: 0;           /* pastikan .page punya z-index > 0 (sudah ada) */
  mix-blend-mode: screen; /* bikin glow lebih 'neon' di atas background */
}

/* area badan Killua (sesuaikan jika perlu) - persentase viewport */
:root {
  --body-x: 35%;   /* jarak dari kiri */
  --body-y: 20%;   /* jarak dari atas */
  --body-w: 30%;   /* lebar area */
  --body-h: 45%;   /* tinggi area */
}

/* optional: lebih terang bila mau (bisa disable) */
.bg-flash { /* kalau kamu pakai elemen ini untuk efek tambahan */ 
  pointer-events: none;
}

body {
  animation: bgMove 10s ease-in-out infinite alternate;
}

@keyframes bgMove {
  0% {
    background-position: center top;
  }
  100% {
    background-position: center 20px;
  }
}
.bg-flash {
  position: fixed;
  inset: 0;
  background-image: url("lightning-overlay.png"); /* bikin file overlay */
  opacity: 0.15;
  mix-blend-mode: screen;
  animation: flashMove 2s infinite linear;
  pointer-events: none;
  z-index: 0;
}

@keyframes flashMove {
  0% { transform: translateY(0); opacity: 0.1; }
  50% { transform: translateY(-20px); opacity: 0.2; }
  100% { transform: translateY(0); opacity: 0.1; }
}
/* NOTES:
 - Ganti API_BASE ke endpoint yang sesuai. Jika endpoint butuh POST / body JSON, ubah callApi() agar melakukan POST.
 - Jangan taruh API_KEY di client untuk production; buat server proxy dan simpan key di ENV.
 - Jika butuh, gue bisa siapkan contoh server-proxy (server.js + package.json) yang memanggil TikHub/TikWM dan meneruskan respons ke client tanpa CORS.
*/

