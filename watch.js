const API_BASE = "/api/moviebox";
const params = new URLSearchParams(location.search);
const subjectId = params.get("id");
const requestedSeason = Number(params.get("se")) || 0;
const requestedEpisode = Number(params.get("ep")) || 0;

let subjectType = Number(params.get("type")) || 1;
let currentSeason = 0;
let currentEpisode = 0;
let currentSources = [];
let currentSourceIndex = 0;
let currentSeasons = [];
let currentDetail = null;
let subtitleBlobUrls = [];
let lastProgressSavedAt = 0;
let playAfterLoad = false;
let changingStream = false;
let attachingSubtitles = false;

const savedPreferences = OzanStore.getPreferences();
let autoplayEnabled = savedPreferences.autoplay !== false;

const el = {
  video: document.querySelector("#video"),
  placeholder: document.querySelector("#playerPlaceholder"),
  error: document.querySelector("#playerError"),
  errorText: document.querySelector("#playerErrorText"),
  retry: document.querySelector("#retryStream"),
  quality: document.querySelector("#qualitySelect"),
  episodeNow: document.querySelector("#episodeNow"),
  sourceStatus: document.querySelector("#sourceStatus"),
  episodeActions: document.querySelector("#episodeActions"),
  previousEpisode: document.querySelector("#previousEpisode"),
  nextEpisode: document.querySelector("#nextEpisode"),
  autoplay: document.querySelector("#autoplayToggle"),
  favorite: document.querySelector("#watchFavorite"),
  title: document.querySelector("#detailTitle"),
  type: document.querySelector("#detailType"),
  rating: document.querySelector("#detailRating"),
  meta: document.querySelector("#detailMeta"),
  description: document.querySelector("#detailDescription"),
  genres: document.querySelector("#genreList"),
  poster: document.querySelector("#detailPoster"),
  cast: document.querySelector("#castList"),
  episodeSection: document.querySelector("#episodeSection"),
  seasonSelect: document.querySelector("#seasonSelect"),
  episodeList: document.querySelector("#episodeList"),
  recommendations: document.querySelector("#recommendations"),
};

function endpoint(path, query = {}) {
  const url = new URL(`${API_BASE}/${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function getJson(path, query) {
  const response = await (window.OzanAccess ? window.OzanAccess.fetch(endpoint(path, query), {
    cache: path === "stream" ? "no-store" : "default",
  }) : fetch(endpoint(path, query), {
    cache: path === "stream" ? "no-store" : "default",
  }));
  if (!response.ok) {
    let providerMessage = "";
    try {
      const errorBody = await response.json();
      providerMessage = errorBody.error || errorBody.message || "";
    } catch (_) { /* Respons error tidak selalu berbentuk JSON. */ }
    const messages = {
      404: "Data tontonan tidak ditemukan.",
      429: "Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.",
      500: "Konfigurasi server belum lengkap.",
      502: "Penyedia video sedang tidak dapat dijangkau.",
      503: "Penyedia video sedang sibuk.",
    };
    const error = new Error(messages[response.status] || providerMessage || `Server merespons ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}j ${minutes}m` : `${minutes}m`;
}

function isEpisodic() {
  return subjectType === 2 || subjectType === 7;
}

function setSourceStatus(message, tone = "") {
  el.sourceStatus.textContent = message;
  el.sourceStatus.dataset.tone = tone;
}

function refreshWatchFavorite() {
  if (!currentDetail) return;
  const active = OzanStore.isFavorite(currentDetail.subjectId);
  el.favorite.classList.toggle("active", active);
  el.favorite.setAttribute("aria-label", active ? "Hapus dari favorit" : "Tambahkan ke favorit");
  el.favorite.querySelector("span").textContent = active ? "Tersimpan" : "Favorit";
}

function renderDetail(detail) {
  const displayTitle = OzanStore.displayTitle(detail.title || detail.name);
  subjectType = Number(detail.subjectType) || subjectType;
  currentDetail = OzanStore.normalizeItem({ ...detail, title: displayTitle, name: displayTitle });
  document.title = `${displayTitle} — OzancicakMovie`;
  el.title.textContent = displayTitle;
  el.type.textContent = subjectType === 7 ? "DRAMA PENDEK" : subjectType === 2 ? "SERIAL" : "FILM";
  el.rating.textContent = `★ ${detail.imdbRatingValue || "—"}`;
  el.meta.textContent = [detail.releaseDate?.slice(0, 4), formatDuration(detail.duration), detail.countryName].filter(Boolean).join("  ·  ");
  el.description.textContent = detail.description || "Deskripsi belum tersedia untuk judul ini.";
  el.poster.src = detail.cover?.url || "";
  el.poster.alt = `Poster ${displayTitle}`;
  el.poster.loading = "lazy";
  el.cast.textContent = (detail.staffList || []).slice(0, 5).map(person => person.name).join(", ") || "Belum tersedia";
  el.genres.replaceChildren();
  String(detail.genre || "").split(",").filter(Boolean).forEach(genre => {
    const chip = document.createElement("span");
    chip.textContent = genre.trim();
    el.genres.append(chip);
  });
  OzanStore.recordHistory(currentDetail);
  refreshWatchFavorite();
}

function showPlayerError(message) {
  el.placeholder.hidden = true;
  el.error.hidden = false;
  el.errorText.textContent = message;
  setSourceStatus("Sumber belum berhasil dimuat", "error");
}

function srtToVtt(content) {
  return `WEBVTT\n\n${content.replace(/^\uFEFF/, "").replace(/(\d{2}:\d{2}:\d{2}),([0-9]{3})/g, "$1.$2")}`;
}

function subtitleLanguage(subtitle) {
  if (subtitle.indonesian) return "id";
  return String(subtitle.lang || subtitle.language || "en").toLowerCase().split(/[_-]/)[0];
}

async function attachSubtitles(subtitles) {
  attachingSubtitles = true;
  el.video.querySelectorAll("track").forEach(track => track.remove());
  subtitleBlobUrls.forEach(URL.revokeObjectURL);
  subtitleBlobUrls = [];
  const preferredLanguage = OzanStore.getPreferences().subtitle;
  const candidates = [...(subtitles || [])]
    .sort((a, b) => Number(b.indonesian) - Number(a.indonesian))
    .slice(0, 5);

  const loaded = await Promise.all(candidates.map(async (subtitle, index) => {
    try {
      const response = await fetch(subtitle.url, { cache: "force-cache" });
      if (!response.ok) return null;
      const content = await response.text();
      const language = subtitleLanguage(subtitle);
      const indonesian = language === "id" || Boolean(subtitle.indonesian);
      const blobUrl = URL.createObjectURL(new Blob([srtToVtt(content)], { type: "text/vtt" }));
      subtitleBlobUrls.push(blobUrl);
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = indonesian ? "Indonesia" : (subtitle.name || subtitle.lang || `Subtitle ${index + 1}`);
      track.srclang = language;
      track.src = blobUrl;
      track.default = preferredLanguage !== "off" && preferredLanguage === language;
      el.video.append(track);
      return { language, indonesian };
    } catch (_) {
      return null;
    }
  }));

  const available = loaded.filter(Boolean);
  Array.from(el.video.textTracks).forEach(track => {
    track.mode = preferredLanguage !== "off" && track.language === preferredLanguage ? "showing" : "disabled";
  });
  attachingSubtitles = false;
  return {
    count: available.length,
    hasIndonesian: available.some(item => item.indonesian),
  };
}

function findPreferredSource() {
  const quality = String(OzanStore.getPreferences().quality || "").toLowerCase();
  if (!quality) return 0;
  const found = currentSources.findIndex(source => String(source.resolution || "").toLowerCase() === quality);
  return found >= 0 ? found : 0;
}

function setSource(index, preserve = false, resumeAt = 0) {
  const source = currentSources[index];
  if (!source) return;
  currentSourceIndex = index;
  el.quality.value = String(index);
  el.placeholder.hidden = false;
  el.error.hidden = true;
  const preservedTime = preserve ? el.video.currentTime : Number(resumeAt) || 0;
  const wasPlaying = preserve && !el.video.paused;
  setSourceStatus(`Mencoba kualitas ${source.resolution || index + 1}...`);
  el.video.src = source.url;
  el.video.load();
  el.video.addEventListener("loadedmetadata", () => {
    changingStream = false;
    if (preservedTime && Number.isFinite(preservedTime)) {
      el.video.currentTime = Math.min(preservedTime, Math.max(0, (el.video.duration || preservedTime) - 2));
    }
    if (wasPlaying || playAfterLoad) {
      el.video.play().catch(() => {});
      playAfterLoad = false;
    }
  }, { once: true });
}

function episodeSequence() {
  return currentSeasons.flatMap(season => Array.from(
    { length: Number(season.maxEp) || 0 },
    (_, index) => ({ se: Number(season.se), ep: index + 1 }),
  ));
}

function currentEpisodeIndex() {
  return episodeSequence().findIndex(item => item.se === currentSeason && item.ep === currentEpisode);
}

function updateEpisodeActions() {
  el.episodeActions.hidden = !isEpisodic();
  if (!isEpisodic()) return;
  const sequence = episodeSequence();
  const index = currentEpisodeIndex();
  el.previousEpisode.disabled = index <= 0;
  el.nextEpisode.disabled = index < 0 || index >= sequence.length - 1;
  el.autoplay.setAttribute("aria-pressed", String(autoplayEnabled));
  el.autoplay.textContent = `Putar otomatis: ${autoplayEnabled ? "Aktif" : "Mati"}`;
}

function paintEpisodes(seasonNumber) {
  const season = currentSeasons.find(item => Number(item.se) === Number(seasonNumber));
  el.episodeList.replaceChildren();
  if (!season) return;
  const fragment = document.createDocumentFragment();
  for (let ep = 1; ep <= (Number(season.maxEp) || 0); ep += 1) {
    const button = document.createElement("button");
    button.className = "episode-button";
    button.type = "button";
    button.dataset.se = season.se;
    button.dataset.ep = ep;
    button.textContent = `E${String(ep).padStart(2, "0")}`;
    button.classList.toggle("active", Number(season.se) === currentSeason && ep === currentEpisode);
    button.addEventListener("click", () => {
      loadStream(Number(season.se), ep, true);
      document.querySelector(".player-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    fragment.append(button);
  }
  el.episodeList.append(fragment);
}

function selectEpisode(season, episode) {
  el.seasonSelect.value = String(season);
  paintEpisodes(season);
  document.querySelectorAll(".episode-button").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.se) === season && Number(button.dataset.ep) === episode);
  });
  requestAnimationFrame(() => document.querySelector(".episode-button.active")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" }));
}

function renderEpisodes(seasons) {
  currentSeasons = seasons;
  if (!seasons.length) return;
  el.episodeSection.hidden = false;
  el.seasonSelect.replaceChildren();
  seasons.forEach(season => {
    const option = document.createElement("option");
    option.value = season.se;
    option.textContent = `Musim ${season.se}`;
    el.seasonSelect.append(option);
  });
  el.seasonSelect.onchange = () => paintEpisodes(Number(el.seasonSelect.value));
  updateEpisodeActions();
}

function saveCurrentProgress(force = false, started = false) {
  if (changingStream || !currentDetail || !Number.isFinite(el.video.currentTime) || (!started && el.video.currentTime <= 0)) return;
  const now = Date.now();
  if (!force && now - lastProgressSavedAt < 5000) return;
  lastProgressSavedAt = now;
  OzanStore.saveProgress(currentDetail, {
    season: currentSeason,
    episode: currentEpisode,
    currentTime: el.video.currentTime,
    duration: Number.isFinite(el.video.duration) ? el.video.duration : 0,
    started,
  });
}

function updateAddress() {
  const url = new URL(location.href);
  url.searchParams.set("id", subjectId);
  url.searchParams.set("type", subjectType);
  if (isEpisodic()) {
    url.searchParams.set("se", currentSeason);
    url.searchParams.set("ep", currentEpisode);
  } else {
    url.searchParams.delete("se");
    url.searchParams.delete("ep");
  }
  window.history.replaceState(null, "", url);
}

async function loadStream(se = 0, ep = 0, shouldPlay = false) {
  if (currentSources.length && (se !== currentSeason || ep !== currentEpisode)) saveCurrentProgress(true);
  changingStream = true;
  currentSeason = se;
  currentEpisode = ep;
  currentSources = [];
  currentSourceIndex = 0;
  playAfterLoad = shouldPlay;
  el.quality.disabled = true;
  el.error.hidden = true;
  el.placeholder.hidden = false;
  el.video.removeAttribute("src");
  el.video.load();
  setSourceStatus("Mengambil tautan terbaru...");
  updateAddress();
  updateEpisodeActions();
  if (isEpisodic()) selectEpisode(se, ep);
  if (currentDetail) OzanStore.recordHistory(currentDetail, { season: se, episode: ep });

  try {
    const data = await getJson("stream", { id: subjectId, se: se || undefined, ep: ep || undefined });
    currentSources = (data.resources || [])
      .filter(item => item.url)
      .sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution));
    if (!currentSources.length) throw new Error("Video untuk judul atau episode ini belum tersedia.");

    el.quality.replaceChildren();
    currentSources.forEach((source, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = source.resolution || `Sumber ${index + 1}`;
      el.quality.append(option);
    });
    el.quality.disabled = false;

    const resume = OzanStore.getProgress(subjectId, se, ep);
    setSource(findPreferredSource(), false, resume?.currentTime || 0);
    const subtitleInfo = await attachSubtitles(data.subtitles || []);
    const subtitleStatus = subtitleInfo.hasIndonesian
      ? "subtitle Indonesia tersedia"
      : subtitleInfo.count
        ? "subtitle Indonesia tidak tersedia"
        : "tanpa subtitle";
    setSourceStatus(`${currentSources.length} kualitas · ${subtitleStatus}`, subtitleInfo.hasIndonesian ? "ok" : "warn");
    el.episodeNow.textContent = subjectType === 7 ? `Episode ${ep}` : subjectType === 2 ? `Musim ${se} · Episode ${ep}` : "Film";
  } catch (error) {
    changingStream = false;
    playAfterLoad = false;
    showPlayerError(`${error.message} Gunakan tombol Coba lagi atau pilih judul lain.`);
  }
}

function navigateEpisode(offset, shouldPlay = true) {
  const sequence = episodeSequence();
  const target = sequence[currentEpisodeIndex() + offset];
  if (!target) return false;
  loadStream(target.se, target.ep, shouldPlay);
  document.querySelector(".player-shell").scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function createRecommendation(item) {
  const displayTitle = OzanStore.displayTitle(item.name || item.title);
  const card = document.createElement("article");
  card.className = "movie-card";
  const link = document.createElement("a");
  link.className = "card-link";
  link.href = `watch.html?id=${encodeURIComponent(item.subjectId)}&type=${encodeURIComponent(item.type || item.subjectType || 1)}`;
  const wrap = document.createElement("div");
  wrap.className = "poster-wrap";
  const img = document.createElement("img");
  img.src = item.poster || item.cover?.url || "";
  img.alt = `Poster ${displayTitle}`;
  img.loading = "lazy";
  img.decoding = "async";
  img.fetchPriority = "low";
  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.innerHTML = `<b>★</b> ${item.rating || item.imdbRatingValue || "—"}`;
  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "favorite-chip";
  favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4 16 4 9.6A4.1 4.1 0 0 1 11.1 6.8L12 8l.9-1.2A4.1 4.1 0 0 1 20 9.6c0 6.4-8 10.9-8 10.9Z"/></svg>';
  const updateFavorite = () => {
    const active = OzanStore.isFavorite(item.subjectId);
    favorite.classList.toggle("active", active);
    favorite.setAttribute("aria-label", active ? "Hapus dari favorit" : "Tambahkan ke favorit");
  };
  updateFavorite();
  favorite.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    OzanStore.toggleFavorite(item);
    updateFavorite();
  });
  wrap.append(img, rating);
  const copy = document.createElement("div");
  copy.className = "card-copy";
  const title = document.createElement("h4");
  title.textContent = displayTitle;
  const meta = document.createElement("p");
  meta.textContent = item.year || "Lihat detail";
  copy.append(title, meta);
  link.append(wrap, copy);
  card.append(link, favorite);
  return card;
}

async function loadRecommendations() {
  try {
    const data = await getJson("recommend", { id: subjectId, page: 1 });
    const items = data.items || data.data?.items || data.sections?.flatMap(section => section.items || []) || [];
    el.recommendations.replaceChildren();
    items.slice(0, 6).forEach(item => el.recommendations.append(createRecommendation(item)));
    document.querySelector(".recommend-section").hidden = !items.length;
  } catch (_) {
    document.querySelector(".recommend-section").hidden = true;
  }
}

function validEpisode(candidate) {
  return episodeSequence().some(item => item.se === Number(candidate?.season || candidate?.se) && item.ep === Number(candidate?.episode || candidate?.ep));
}

async function init() {
  el.video.volume = Math.min(1, Math.max(0, Number(savedPreferences.volume)));
  updateEpisodeActions();
  if (!subjectId) {
    el.title.textContent = "Film tidak ditemukan";
    el.description.textContent = "Kembali ke katalog dan pilih salah satu poster untuk mulai menonton.";
    showPlayerError("ID film tidak ada pada alamat halaman.");
    return;
  }

  try {
    const result = await getJson("detail", { id: subjectId });
    const detail = result.data || result;
    renderDetail(detail);
    if (isEpisodic()) {
      const seasonResult = await getJson("season", { id: subjectId });
      const seasons = seasonResult.data?.seasons || seasonResult.seasons || [];
      renderEpisodes(seasons);
      const first = episodeSequence()[0] || { se: 1, ep: 1 };
      const requested = { season: requestedSeason, episode: requestedEpisode };
      const saved = OzanStore.getLatestProgress(subjectId);
      const initial = validEpisode(requested) ? requested : validEpisode(saved) ? saved : { season: first.se, episode: first.ep };
      await loadStream(Number(initial.season), Number(initial.episode));
    } else {
      await loadStream();
    }
    loadRecommendations();
  } catch (error) {
    el.title.textContent = "Detail tidak dapat dimuat";
    el.description.textContent = `${error.message} Silakan kembali dan coba judul lain.`;
    showPlayerError(`Informasi tontonan gagal diambil. ${error.message}`);
  }
}

el.quality.addEventListener("change", () => {
  const selected = currentSources[Number(el.quality.value)];
  if (selected?.resolution) OzanStore.setPreference("quality", selected.resolution);
  setSource(Number(el.quality.value), true);
});
el.retry.addEventListener("click", () => loadStream(currentSeason, currentEpisode, true));
el.previousEpisode.addEventListener("click", () => navigateEpisode(-1));
el.nextEpisode.addEventListener("click", () => navigateEpisode(1));
el.autoplay.addEventListener("click", () => {
  autoplayEnabled = !autoplayEnabled;
  OzanStore.setPreference("autoplay", autoplayEnabled);
  updateEpisodeActions();
});
el.favorite.addEventListener("click", () => {
  if (!currentDetail) return;
  OzanStore.toggleFavorite(currentDetail);
  refreshWatchFavorite();
});
el.video.addEventListener("loadedmetadata", () => {
  el.placeholder.hidden = true;
  el.error.hidden = true;
});
el.video.addEventListener("canplay", () => { el.placeholder.hidden = true; });
el.video.addEventListener("play", () => saveCurrentProgress(true, true));
el.video.addEventListener("timeupdate", () => saveCurrentProgress());
el.video.addEventListener("pause", () => saveCurrentProgress(true));
el.video.addEventListener("volumechange", () => OzanStore.setPreference("volume", el.video.volume));
el.video.addEventListener("ended", () => {
  saveCurrentProgress(true);
  if (isEpisodic() && autoplayEnabled && navigateEpisode(1, true)) return;
  setSourceStatus("Pemutaran selesai", "ok");
});
el.video.addEventListener("error", () => {
  if (!currentSources.length) return;
  const nextIndex = currentSourceIndex + 1;
  if (nextIndex < currentSources.length) {
    playAfterLoad = true;
    setSource(nextIndex, true);
    return;
  }
  changingStream = false;
  showPlayerError("Semua kualitas yang tersedia gagal dimuat. Tautan mungkin kedaluwarsa atau CDN sedang membatasi akses.");
});
el.video.textTracks?.addEventListener("change", () => {
  if (attachingSubtitles) return;
  const showing = Array.from(el.video.textTracks).find(track => track.mode === "showing");
  OzanStore.setPreference("subtitle", showing?.language || "off");
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) saveCurrentProgress(true);
});
window.addEventListener("beforeunload", () => {
  saveCurrentProgress(true);
  subtitleBlobUrls.forEach(URL.revokeObjectURL);
});

window.addEventListener("pagehide", () => saveCurrentProgress(true));

async function startWatch() {
  await window.OzanAccess?.ready();
  init();
}

startWatch();
