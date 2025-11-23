// Minimal, robust frontend script (gunakan API_BASE sesuai)
const API_BASE = "https://www.tikwm.com/api/?url="; // contoh
const API_KEY = "";
const USE_CORS_PROXY = false;
const CORS_PROXY = "https://www.tikwm.com/api/?url=";

const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");
const playerBox = document.getElementById("playerBox");
const previewVideo = document.getElementById("previewVideo");
const thumbBox = document.getElementById("thumbBox");
const thumbImg = document.getElementById("thumbImg");

// ensure statusBox helper
function _ensureStatusBox(){
  let box = document.getElementById("statusBox");
  if (box) return box;
  const anchor = document.querySelector(".button-row") || document.querySelector(".input-row");
  box = document.createElement("div");
  box.id = "statusBox";
  box.dataset.type = "info";
  box.style.display = "none";
  box.style.marginTop = "12px";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "8px";
  box.style.fontWeight = "600";
  box.style.boxSizing = "border-box";
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
  else document.body.insertBefore(box, document.body.firstChild);
  return box;
}

function showStatus(msg, kind = "info"){
  const box = document.getElementById("statusBox") || _ensureStatusBox();
  box.textContent = msg;
  box.dataset.type = kind;
  box.style.display = "block";
  clearTimeout(box._t);
  if (kind !== "info") box._t = setTimeout(()=> box.style.display = "none", 5000);
}

function hideStatus(){
  const box = document.getElementById("statusBox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
}

function clearResults(){
  if (resultList) resultList.innerHTML = "";
  if (resultBox) resultBox.classList.add("hidden");
  if (playerBox) playerBox.classList.add("hidden");
  if (thumbBox) thumbBox.classList.add("hidden");
  hideStatus();
}

function collectUrls(obj, out = new Set()){
  if (!obj) return out;
  if (typeof obj === "string"){
    const s = obj.trim();
    if (/^https?:\/\//i.test(s)) out.add(s);
    return out;
  }
  if (Array.isArray(obj)) { for (const it of obj) collectUrls(it, out); return out; }
  if (typeof obj === "object"){ for (const k of Object.keys(obj)) collectUrls(obj[k], out); }
  return out;
}

function pickThumbnail(json){
  if (!json) return null;
  if (json.thumbnail) return json.thumbnail;
  if (json.cover) return json.cover;
  const urls = Array.from(collectUrls(json));
  for (const u of urls) if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return u;
  return null;
}

async function callApi(videoUrl){
  let endpoint = API_BASE + encodeURIComponent(videoUrl);
  if (USE_CORS_PROXY && CORS_PROXY) endpoint = CORS_PROXY + endpoint;
  const headers = { Accept: "application/json" };
  if (API_KEY) headers["Authorization"] = API_KEY;
  const res = await fetch(endpoint, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(()=>"");
    const err = new Error("HTTP " + res.status);
    err.raw = text;
    throw err;
  }
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("json")) return res.json();
  const txt = await res.text();
  try { return JSON.parse(txt); } catch (e) { const err = new Error("Non-JSON upstream"); err.raw = txt; throw err; }
}

async function processUrl(videoUrl){
  clearResults();
  showStatus("Loading...", "info");
  if (gasBtn) { gasBtn.disabled = true; gasBtn.textContent = "Proses..."; }
  try {
    const json = await callApi(videoUrl);
    showStatus("Sukses menerima permintaan...", "success");
    renderResult(json);
  } catch (err) {
    console.error(err);
    let msg = err.message || "Gagal";
    if (err.raw && String(err.raw).toLowerCase().includes("cors")) msg = "Request diblokir (CORS).";
    showStatus("Error: " + msg, "error");
  } finally {
    if (gasBtn) { gasBtn.disabled = false; gasBtn.textContent = "Download"; }
  }
}

function renderResult(payload){
  if (payload && payload.ok && payload.result) payload = payload.result;
  const title = payload.title || payload.name || payload.desc || (payload.data && payload.data.title) || "";
  const thumbnail = pickThumbnail(payload);

  // build downloads
  const downloads = [];
  if (Array.isArray(payload.downloads) && payload.downloads.length){
    payload.downloads.forEach(d => downloads.push({ label: d.label || d.quality || "Video", url: d.url || d.link || d.src || d, size: d.size || "" }));
  }
  if (!downloads.length){
    if (payload.play) downloads.push({ label: "Tanpa Watermark", url: payload.play });
    if (payload.wmplay) downloads.push({ label: "Dengan Watermark", url: payload.wmplay });
  }
  if (!downloads.length){
    const urls = Array.from(collectUrls(payload));
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /\/play\/|\/video\//i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u,i) => downloads.push({ label: `Detected ${i+1}`, url: u }));
  }

  const allUrls = Array.from(collectUrls(payload));
  const imageUrls = allUrls.filter(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u));
  const audioUrls = allUrls.filter(u => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u));
  const audioUrl = audioUrls.length ? audioUrls[0] : null;
  const photoUrl = thumbnail || (imageUrls.length ? imageUrls[0] : null);

  if (resultList) resultList.innerHTML = "";

  // playable preference
  let playableUrl = null;
  for (const d of downloads) {
    if (d.url && ( /\.mp4(\?|$)/i.test(d.url) || /\/play\/|\/video\//i.test(d.url) )) { playableUrl = d.url; break; }
  }
  if (!playableUrl && downloads.length) playableUrl = downloads[0].url;

  if (playableUrl && previewVideo && playerBox){
    try { previewVideo.crossOrigin = "anonymous"; } catch(e){}
    previewVideo.src = playableUrl;
    if (photoUrl) previewVideo.poster = photoUrl;
    previewVideo.load();
    playerBox.classList.remove("hidden");
    if (thumbBox) thumbBox.classList.add("hidden");
  } else {
    if (photoUrl && thumbImg && thumbBox){
      thumbImg.src = photoUrl;
      thumbBox.classList.remove("hidden");
    }
    if (playerBox) playerBox.classList.add("hidden");
  }

  if (title && resultList){
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  // keep one download item (first)
  if (downloads.length > 1) downloads.splice(1);

  if (downloads.length && resultList){
    const d = downloads[0];
    const node = document.createElement("div");
    node.className = "result-item";
    node.innerHTML = `
      <div style="display:flex;flex-direction:column;margin-bottom:8px;">
        <div style="font-weight:600">${d.label}</div>
        <div style="opacity:.75;font-size:13px">${d.size || ""}</div>
      </div>
      <div class="download-actions">
        <a href="${d.url}" class="btn-download download-btn" data-url="${d.url}" data-fn="video.mp4" download>Download Video</a>
      </div>
    `;
    resultList.appendChild(node);
  } else if (resultList){
    const hint = document.createElement("div");
    hint.style.opacity = "0.85";
    hint.style.marginTop = "8px";
    hint.textContent = "Tidak ada link video yang terdeteksi.";
    resultList.appendChild(hint);
  }

  if ((photoUrl || audioUrl) && resultList){
    const box = document.createElement("div");
    box.className = "result-item";
    box.style.display = "flex";
    box.style.gap = "12px";
    box.style.marginTop = "12px";
    if (photoUrl){
      const aPhoto = document.createElement("button");
      aPhoto.className = "download-btn btn-download";
      aPhoto.dataset.url = photoUrl;
      aPhoto.dataset.fn = "photo.jpg";
      aPhoto.textContent = "Download Foto";
      box.appendChild(aPhoto);
    }
    if (audioUrl){
      const aAudio = document.createElement("button");
      aAudio.className = "download-btn btn-download";
      aAudio.dataset.url = audioUrl;
      aAudio.dataset.fn = "audio.mp3";
      aAudio.textContent = "Download Audio";
      box.appendChild(aAudio);
    }
    resultList.appendChild(box);
  }

  if (resultBox) resultBox.classList.remove("hidden");
}

// download handler (delegation)
if (resultList) {
  if (!window.__dlHandler) {
    window.__dlHandler = true;
    resultList.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-download");
      if (!btn) return;
      e.preventDefault();

      const url = btn.dataset.url || btn.getAttribute("href");
      const filename = (btn.dataset.fn || "file").replace(/"/g, "");
      if (!url) { showStatus("URL download tidak tersedia.", "error"); return; }

      showStatus("Mengambil file untuk diunduh...", "info");
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(blobUrl);
        showStatus("Download dimulai.", "success");
      } catch (err) {
        console.warn("fetch failed:", err);
        // fallback: open in new tab
        const a2 = document.createElement("a");
        a2.href = url; a2.target = "_blank"; document.body.appendChild(a2); a2.click(); a2.remove();
        showStatus("Gagal via fetch — membuka link di tab baru.", "info");
      }
    });
  }
}

// main events
if (gasBtn) gasBtn.addEventListener("click", () => {
  const u = (urlInput && urlInput.value || "").trim();
  if (!u) { showStatus("Masukkan URL video dulu!", "error"); return; }
  try { new URL(u); } catch { showStatus("Format URL tidak valid.", "error"); return; }
  processUrl(u);
});
if (clearBtn) clearBtn.addEventListener("click", () => { if (urlInput) urlInput.value = ""; clearResults(); });

// init
clearResults();
hideStatus();

/* --- simple lightweight lightning effect below (keph* style, you can replace with original) --- */
(function lightning() {
  const canvas = document.getElementById("lightningCanvas");
  const flash = document.querySelector(".bg-flash");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  function resize(){ canvas.width = innerWidth; canvas.height = innerHeight; }
  addEventListener("resize", resize); resize();

  const flashes = [];
  function spawn() {
    const x = Math.random()*canvas.width;
    const y = Math.random()*canvas.height*0.6;
    const life = 500 + Math.random()*800;
    const w = 8 + Math.random()*40;
    flashes.push({x,y,life,created:performance.now(),w});
    // white flash overlay occasionally
    if (Math.random() > 0.85) {
      flash.style.background = "rgba(255,255,255,0.12)";
      setTimeout(()=> flash.style.background = "rgba(255,255,255,0)", 90);
    }
  }

  function drawFlash(f, t) {
    const age = t - f.created;
    const progress = age / f.life;
    if (progress >= 1) return;
    const alpha = 1 - progress;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 + f.w * (1-progress);
    ctx.strokeStyle = `rgba(180,220,255,${0.6*alpha})`;
    ctx.beginPath();
    // simple jagged line
    let sx = f.x, sy = f.y;
    ctx.moveTo(sx, sy);
    for (let i=0;i<12;i++){
      sx += (Math.random()-0.5) * 120 * (1-progress);
      sy += 20 + Math.random()*60;
      ctx.lineTo(sx, sy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function frame(ts){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // spawn sometimes
    if (Math.random() > 0.93) spawn();
    for (let i = flashes.length-1; i >= 0; i--) {
      const f = flashes[i];
      if (ts - f.created > f.life) { flashes.splice(i,1); continue; }
      drawFlash(f, ts);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
