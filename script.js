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
const CORS_PROXY = "https://www.tikwm.com/api/?url="; // contoh public proxy (rate limit & tidak disarankan)

// ------------------------------------------------------
// DOM elements (sesuaikan id di index.html mu)
// ------------------------------------------------------
const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("statusBox");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

// optional: player container (if kamu punya <div id="playerBox"><video id="previewVideo">)
const playerBox = document.getElementById("playerBox");
const previewVideo = document.getElementById("previewVideo");
const thumbBox = document.getElementById("thumbBox");
const thumbImg = document.getElementById("thumbImg");

// ------------------------------------------------------
// UI helpers
// ------------------------------------------------------
function showStatus(msg, kind = "info") {
  if (!statusBox) return;
  statusBox.classList.remove("hidden");
  statusBox.textContent = msg;
  statusBox.dataset.type = kind;
}
function hideStatus() {
  if (!statusBox) return;
  statusBox.classList.add("hidden");
  statusBox.textContent = "";
}
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
// - API_BASE expected to accept ?url=VIDEO_URL or similar pattern
// - If API requires Authorization, set API_KEY to "Bearer ...." or "APIKEY ..." accordingly
// ------------------------------------------------------
async function callApi(videoUrl) {
  // build endpoint (simple concat). If API expects POST or other param, modify di sini.
  let endpoint = API_BASE + encodeURIComponent(videoUrl);

  if (USE_CORS_PROXY) {
    endpoint = CORS_PROXY + encodeURIComponent(endpoint);
  }

  const headers = { Accept: "application/json" };
  if (API_KEY && API_KEY.length) {
    // if API_KEY already includes "Bearer " prefix, pass as-is
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
    // try parse text->json
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

  // If API already returns downloads array
  if (Array.isArray(payload.downloads) && payload.downloads.length) {
    payload.downloads.forEach(d => {
      downloads.push({
        label: d.label || d.quality || d.name || "Video",
        url: d.url || d.link || d.src || d,
        size: d.size || d.filesize || ""
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
    // prefer mp4/play-like urls
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /play/i.test(u) || /video/i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u, i) => downloads.push({ label: `Detected ${i+1}`, url: u, size: "" }));
  }

  // UI: show thumbnail / video preview if available
  resultList.innerHTML = "";

  if (thumbnail) {
    if (thumbBox && thumbImg) {
      thumbImg.src = thumbnail;
      thumbBox.classList.remove("hidden");
    } else {
      const img = document.createElement("img");
      img.src = thumbnail;
      img.alt = title || "thumbnail";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "10px";
      resultList.appendChild(img);
    }
  }

  if (title) {
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  // Optional: show player using first download (if it's a playable mp4)
  if (downloads.length && previewVideo && playerBox) {
    const first = downloads[0].url;
    // only set if seems like mp4 or playable
    if (/\.mp4(\?|$)/i.test(first) || /play/i.test(first) || first.includes("http")) {
      previewVideo.src = first;
      previewVideo.load();
      playerBox.classList.remove("hidden");
    }
  }

  // Render download rows
  downloads.forEach(d => {
    const node = document.createElement("div");
    node.className = "result-item";
    node.innerHTML = `
  <div style="display:flex;flex-direction:column;margin-bottom:8px;">
    <div style="font-weight:600">${d.label}</div>
    <div style="opacity:.75;font-size:13px">${d.size || ""}</div>
  </div>

  <div>
    <a href="${d.url}" target="_blank" class="open-btn">Open</a>
    <a href="${d.url}" download class="download-btn">Download</a>
  </div>
`;
    resultList.appendChild(node);
  });

  resultBox.classList.remove("hidden");
}

// ------------------------------------------------------
// Main flow: called when user clicks Gas
// ------------------------------------------------------
async function processUrl(videoUrl) {
  clearResults();
  showStatus("Menghubungi API...", "info");
  gasBtn.disabled = true;
  gasBtn.textContent = "Proses...";

  try {
    const json = await callApi(videoUrl);

    showStatus("Sukses menerima respons. Rendering...", "success");
    renderResult(json);
  } catch (err) {
    console.error("API error:", err);
    let msg = err.message || "Gagal memanggil API";
    if ((err.raw && String(err.raw).toLowerCase().includes("cors")) || msg.toLowerCase().includes("cors")) {
      msg = "Request diblokir (CORS). Solusi: gunakan server-proxy atau aktifkan CORS proxy untuk testing.";
    } else if (err.raw) {
      console.log("Upstream raw:", err.raw);
    }
    showStatus("Error: " + msg, "error");
  } finally {
    gasBtn.disabled = false;
    gasBtn.textContent = "Gas";
  }
}

// ------------------------------------------------------
// Event listeners
// ------------------------------------------------------
gasBtn.addEventListener("click", () => {
  const u = (urlInput.value || "").trim();
  if (!u) {
    showStatus("Masukkan URL video dulu.", "error");
    return;
  }
  try { new URL(u); } catch { showStatus("Format URL tidak valid.", "error"); return; }
  processUrl(u);
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearResults();
});

// init
clearResults();
hideStatus();

/* NOTES:
 - Ganti API_BASE ke endpoint yang sesuai. Jika endpoint butuh POST / body JSON, ubah callApi() agar melakukan POST.
 - Jangan taruh API_KEY di client untuk production; buat server proxy dan simpan key di ENV.
 - Jika ingin aku siapin server-proxy (server.js + package.json) untuk TikHub yang otomatis pakai API key di ENV, bilang aja. */
