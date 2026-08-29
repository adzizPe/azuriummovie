(() => {
  "use strict";

  const API_BASE = "/api/iptv";
  const channelId = new URLSearchParams(location.search).get("id") || "";
  let channel = null;
  let libraryItem = null;
  let hls = null;
  let recoveryAttempts = 0;

  const el = {
    video: document.querySelector("#liveVideo"),
    placeholder: document.querySelector("#livePlaceholder"),
    error: document.querySelector("#liveError"),
    errorText: document.querySelector("#liveErrorText"),
    retry: document.querySelector("#retryLive"),
    status: document.querySelector("#liveStatus"),
    now: document.querySelector("#channelNow"),
    title: document.querySelector("#channelTitle"),
    group: document.querySelector("#channelGroup"),
    groupChip: document.querySelector("#channelGroupChip"),
    meta: document.querySelector("#channelMeta"),
    logo: document.querySelector("#channelLogo"),
    availability: document.querySelector("#channelAvailability"),
    favorite: document.querySelector("#liveFavorite"),
    related: document.querySelector("#relatedChannels"),
    relatedSection: document.querySelector("#relatedSection"),
    download: document.querySelector("#downloadM3u"),
  };

  function apiFetch(path, options = {}) {
    const url = path instanceof URL ? path : new URL(path, location.origin);
    return window.AzuriumAccess ? window.AzuriumAccess.fetch(url, options) : fetch(url, options);
  }

  async function getJson(path, query = {}) {
    const url = new URL(`${API_BASE}/${path}`, location.origin);
    Object.entries(query).forEach(([key, value]) => {
      if (value !== "" && value !== null && value !== undefined) url.searchParams.set(key, value);
    });
    const response = await apiFetch(url, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Server merespons ${response.status}.`);
    return body;
  }

  function normalizedChannel(value) {
    return AzuriumStore.normalizeItem({
      subjectId: `iptv:${value.id}`,
      providerId: value.id,
      source: "iptv",
      type: 10,
      name: value.name,
      poster: value.logo,
      year: "LIVE",
      genre: value.group || "TV Indonesia",
    });
  }

  function updateFavorite() {
    if (!libraryItem) return;
    const active = AzuriumStore.isFavorite(libraryItem.subjectId);
    el.favorite.classList.toggle("active", active);
    el.favorite.setAttribute("aria-label", active ? "Hapus channel dari favorit" : "Tambahkan channel ke favorit");
    el.favorite.querySelector("span").textContent = active ? "Tersimpan" : "Favorit";
  }

  function renderChannel() {
    const name = AzuriumStore.displayTitle(channel.name || "Live TV Indonesia");
    libraryItem = normalizedChannel(channel);
    document.title = `${name} — Live TV azuriummovie`;
    el.title.textContent = name;
    el.now.textContent = name;
    el.group.textContent = channel.group || "TV Indonesia";
    el.groupChip.textContent = channel.group || "Televisi";
    el.meta.textContent = [channel.group, "Siaran langsung", channel.userAgent ? "Sumber teroptimasi" : "Kualitas otomatis"].filter(Boolean).join("  ·  ");
    el.logo.src = channel.logo || "icons/launchericon-192x192.png";
    el.logo.alt = `Logo ${name}`;
    AzuriumStore.recordHistory(libraryItem);
    updateFavorite();
  }

  function clearPlayer() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    el.video.pause();
    el.video.removeAttribute("src");
    el.video.load();
  }

  function showError(message) {
    el.placeholder.hidden = true;
    el.error.hidden = false;
    el.errorText.textContent = message;
    el.status.textContent = "Siaran terputus";
    el.status.dataset.tone = "error";
    el.availability.textContent = "Tidak terhubung";
  }

  function markReady(message = "Siaran langsung terhubung") {
    el.placeholder.hidden = true;
    el.error.hidden = true;
    el.status.textContent = message;
    el.status.dataset.tone = "ok";
    el.availability.textContent = "Sedang live";
  }

  function requestHeaders(xhr) {
    const headers = window.AzuriumAccess?.requestHeaders?.() || {};
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
  }

  function startWithHls() {
    const relayUrl = `${API_BASE}/stream?id=${encodeURIComponent(channel.id)}`;
    hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 30,
      maxBufferLength: 35,
      xhrSetup: requestHeaders,
    });
    hls.attachMedia(el.video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(relayUrl));
    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      const qualityCount = data.levels?.length || 1;
      markReady(`${qualityCount > 1 ? `${qualityCount} kualitas adaptif` : "Kualitas otomatis"} · LIVE`);
      el.video.play().catch(() => { el.status.textContent = "Tekan tombol putar untuk memulai"; });
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, (_, data) => {
      const level = hls.levels[data.level];
      if (level?.height) el.status.textContent = `${level.height}p · LIVE`;
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR && recoveryAttempts < 2) {
        recoveryAttempts += 1;
        el.status.textContent = "Menghubungkan ulang siaran...";
        window.setTimeout(() => hls?.startLoad(), 900 * recoveryAttempts);
        return;
      }
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && recoveryAttempts < 3) {
        recoveryAttempts += 1;
        hls.recoverMediaError();
        return;
      }
      showError("Sumber channel sedang offline atau menolak koneksi. Coba hubungkan kembali beberapa saat lagi.");
    });
  }

  function startNative() {
    el.video.src = channel.url;
    el.video.load();
    el.video.play().catch(() => {});
    el.status.textContent = "Menghubungkan pemutar bawaan...";
  }

  function startLive() {
    clearPlayer();
    recoveryAttempts = 0;
    el.error.hidden = true;
    el.placeholder.hidden = false;
    el.status.textContent = "Menghubungkan ke siaran...";
    el.status.dataset.tone = "";
    el.availability.textContent = "Menghubungkan...";
    if (window.Hls?.isSupported()) {
      startWithHls();
      return;
    }
    if (el.video.canPlayType("application/vnd.apple.mpegurl")) {
      startNative();
      return;
    }
    showError("Perangkat ini belum mendukung pemutaran HLS.");
  }

  function channelCard(item) {
    const card = document.createElement("article");
    card.className = "movie-card live-card";
    const link = document.createElement("a");
    link.className = "card-link";
    link.href = `live.html?id=${encodeURIComponent(item.id)}`;
    const wrap = document.createElement("div");
    wrap.className = "poster-wrap";
    const image = document.createElement("img");
    image.src = item.logo || "icons/launchericon-192x192.png";
    image.alt = `Logo ${item.name}`;
    image.loading = "lazy";
    const badge = document.createElement("span");
    badge.className = "card-rating";
    badge.innerHTML = '<b class="live-pulse"></b> LIVE';
    wrap.append(image, badge);
    const copy = document.createElement("div");
    copy.className = "card-copy";
    const title = document.createElement("h4");
    title.textContent = item.name;
    const meta = document.createElement("p");
    meta.textContent = item.group || "TV Indonesia";
    copy.append(title, meta);
    link.append(wrap, copy);
    card.append(link);
    return card;
  }

  async function loadRelated() {
    try {
      const result = await getJson("group", { g: channel.group });
      const items = (result.channels || []).filter(item => item.id !== channel.id).slice(0, 12);
      el.related.replaceChildren();
      items.forEach(item => el.related.append(channelCard(item)));
      el.relatedSection.hidden = !items.length;
    } catch (_) {
      el.relatedSection.hidden = true;
    }
  }

  async function downloadPlaylist() {
    el.download.disabled = true;
    el.download.textContent = "Menyiapkan...";
    try {
      const response = await apiFetch(`${API_BASE}/m3u`, { cache: "no-store" });
      if (!response.ok) throw new Error("Playlist belum tersedia.");
      const blobUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = "azuriummovie-tv-indonesia.m3u";
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    } catch (error) {
      el.status.textContent = error.message;
      el.status.dataset.tone = "error";
    } finally {
      el.download.disabled = false;
      el.download.textContent = "Unduh M3U";
    }
  }

  async function init() {
    screen.orientation?.lock?.("portrait-primary").catch(() => {});
    await window.AzuriumAccess?.ready();
    if (!channelId) {
      showError("ID channel tidak ditemukan. Kembali dan pilih channel dari katalog Live TV.");
      return;
    }
    try {
      channel = await getJson("channel", { id: channelId });
      renderChannel();
      startLive();
      loadRelated();
    } catch (error) {
      showError(`${error.message} Kembali dan pilih channel lain.`);
    }
  }

  el.favorite.addEventListener("click", () => {
    if (!libraryItem) return;
    AzuriumStore.toggleFavorite(libraryItem);
    updateFavorite();
  });
  el.retry.addEventListener("click", startLive);
  el.download.addEventListener("click", downloadPlaylist);
  el.video.addEventListener("playing", () => markReady(el.status.textContent || "Siaran langsung terhubung"));
  el.video.addEventListener("waiting", () => { el.status.textContent = "Menstabilkan siaran..."; });
  el.video.addEventListener("error", () => {
    if (!hls) showError("Pemutar bawaan gagal membuka sumber channel ini.");
  });
  document.addEventListener("fullscreenchange", () => {
    const landscape = document.fullscreenElement === el.video;
    screen.orientation?.lock?.(landscape ? "landscape" : "portrait-primary").catch(() => {});
  });
  window.addEventListener("pagehide", clearPlayer);

  init();
})();

