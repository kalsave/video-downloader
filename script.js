// =======================
// Ambil elemen-elemen dari HTML
// =======================
const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("statusBox");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

// =======================
// Helper untuk status
// =======================
function setStatus(type, message) {
  statusBox.classList.remove("hidden", "info", "error", "success");
  statusBox.classList.add(type);
  statusBox.textContent = message;
}

function clearStatus() {
  statusBox.classList.add("hidden");
}

function clearResult() {
  resultBox.classList.add("hidden");
  resultList.innerHTML = "";
}

// =======================
// PANGGIL API TIKWM
// =======================
async function fetchDownloadInfo(videoUrl) {
  const apiUrl =
    "https://snaptik.app/ID2" +
    encodeURIComponent(videoUrl) +
    "&hd=1";

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error("API error, status: " + res.status);
  }

  const json = await res.json();

  // TikWM: code = 0 berarti sukses
  if (json.code !== 0) {
    throw new Error(json.msg || "Gagal ambil data dari TikWM");
  }

  const data = json.data || {};
  const downloads = [];

  if (data.hdplay) {
    downloads.push({
      label: "MP4 HD (tanpa watermark)",
      size: data.size || "",
      url: data.hdplay,
    });
  }

  if (data.play) {
    downloads.push({
      label: "MP4 (tanpa watermark)",
      size: data.size || "",
      url: data.play,
    });
  }

  if (data.wmplay) {
    downloads.push({
      label: "MP4 (pakai watermark)",
      size: data.size || "",
      url: data.wmplay,
    });
  }

  if (data.music && data.music.play) {
    downloads.push({
      label: "Audio (MP3)",
      size: data.music.duration ? data.music.duration + "s" : "",
      url: data.music.play,
    });
  }

  return {
    title: data.title || "Video TikTok",
    downloads,
  };
}

// =======================
// Render hasil ke UI
// =======================
function renderResult(data) {
  resultList.innerHTML = "";

  data.downloads.forEach((item) => {
    const row = document.createElement("div");
    row.className = "result-item";

    const meta = document.createElement("div");
    meta.className = "result-meta";

    const main = document.createElement("span");
    main.textContent = item.label;

    const sub = document.createElement("span");
    sub.textContent = item.size || "";

    meta.appendChild(main);
    meta.appendChild(sub);

    const btn = document.createElement("button");
    btn.textContent = "Download";
    btn.addEventListener("click", () => {
      window.open(item.url, "_blank");
    });

    row.appendChild(meta);
    row.appendChild(btn);
    resultList.appendChild(row);
  });

  resultBox.classList.remove("hidden");
}

// =======================
// Event tombol GAS
// =======================
gasBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  clearStatus();
  clearResult();

  if (!url) {
    setStatus("error", "Masukin dulu link videonya.");
    return;
  }

  // cek format URL
  try {
    new URL(url);
  } catch {
    setStatus("error", "Format URL tidak valid.");
    return;
  }

  setStatus("info", "Lagi manggil server TikWM…");
  gasBtn.disabled = true;
  gasBtn.textContent = "Proses…";

  try {
    const data = await fetchDownloadInfo(url);
    if (!data || !Array.isArray(data.downloads) || data.downloads.length === 0) {
      setStatus("error", "Server tidak mengembalikan link download.");
    } else {
      setStatus("success", "Berhasil! Pilih kualitas yang kamu mau.");
      renderResult(data);
    }
  } catch (err) {
    console.error(err);
    setStatus("error", "Gagal menghubungi API / server.");
  } finally {
    gasBtn.disabled = false;
    gasBtn.textContent = "Gas";
  }
});

// =======================
// Event tombol HAPUS
// =======================
clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearStatus();
  clearResult();
  urlInput.focus();
});
