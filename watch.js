const MOVIEBOX_API_BASE = "/api/moviebox";
const ANIME_API_BASE = "/api/anime";
const DONGHUA_API_BASE = "/api/donghua";
const params = new URLSearchParams(location.search);
const subjectId = params.get("id");
const requestedSource = params.get("source");
const contentSource = ["anime", "donghua"].includes(requestedSource) ? requestedSource : "moviebox";
const storageSubjectId = contentSource === "moviebox" ? subjectId : `${contentSource}:${subjectId}`;
const requestedSeason = Number(params.get("se")) || 0;
const requestedEpisode = Number(params.get("ep")) || 0;
const requestedEpisodeId = params.get("episodeId") || "";

let subjectType = Number(params.get("type")) || 1;
let currentSeason = 0;
let currentEpisode = 0;
let currentSources = [];
let currentSourceIndex = 0;
let currentSeasons = [];
let currentAnimeEpisodes = [];
let currentAnimeEpisodeIndex = -1;
let currentDetail = null;
let subtitleBlobUrls = [];
let lastProgressSavedAt = 0;
let playAfterLoad = false;
let changingStream = false;
let attachingSubtitles = false;
let originalDescription = "";
let descriptionTranslated = false;
let translationRequest = 0;

const savedPreferences = AzuriumStore.getPreferences();
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
  descriptionToggle: document.querySelector("#descriptionToggle"),
  translateDescription: document.querySelector("#translateDescription"),
  translationStatus: document.querySelector("#translationStatus"),
  genres: document.querySelector("#genreList"),
  poster: document.querySelector("#detailPoster"),
  cast: document.querySelector("#castList"),
  episodeSection: document.querySelector("#episodeSection"),
  seasonControl: document.querySelector("#seasonControl"),
  animeEpisodeControl: document.querySelector("#animeEpisodeControl"),
  seasonSelect: document.querySelector("#seasonSelect"),
  animeEpisodeSelect: document.querySelector("#animeEpisodeSelect"),
  episodeList: document.querySelector("#episodeList"),
  recommendations: document.querySelector("#recommendations"),
};

function endpoint(path, query = {}) {
  const base = contentSource === "anime"
    ? ANIME_API_BASE
    : contentSource === "donghua"
      ? DONGHUA_API_BASE
      : MOVIEBOX_API_BASE;
  const url = new URL(`${base}/${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function getJson(path, query) {
  const response = await (window.AzuriumAccess ? window.AzuriumAccess.fetch(endpoint(path, query), {
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
  return contentSource !== "moviebox" ? currentAnimeEpisodes.length > 1 : subjectType === 2 || subjectType === 7;
}

function lockScreenOrientation(mode) {
  screen.orientation?.lock?.(mode).catch(() => {});
}

function videoMayUseLandscape() {
  return subjectType !== 7 && (!el.video.videoWidth || el.video.videoWidth >= el.video.videoHeight);
}

function syncVideoOrientation() {
  const fullscreenVideo = document.fullscreenElement === el.video || document.webkitFullscreenElement === el.video;
  lockScreenOrientation(fullscreenVideo && videoMayUseLandscape() ? "landscape" : "portrait-primary");
}

function setSourceStatus(message, tone = "") {
  el.sourceStatus.textContent = message;
  el.sourceStatus.dataset.tone = tone;
}

function refreshWatchFavorite() {
  if (!currentDetail) return;
  const active = AzuriumStore.isFavorite(currentDetail.subjectId);
  el.favorite.classList.toggle("active", active);
  el.favorite.setAttribute("aria-label", active ? "Hapus dari favorit" : "Tambahkan ke favorit");
  el.favorite.querySelector("span").textContent = active ? "Tersimpan" : "Favorit";
}

function descriptionIsLong(value) {
  return matchMedia("(max-width: 700px)").matches && String(value).trim().length > 220;
}

function renderDescription(value) {
  originalDescription = String(value || "Deskripsi belum tersedia untuk judul ini.").trim();
  descriptionTranslated = false;
  el.description.textContent = originalDescription;
  el.description.classList.toggle("is-collapsed", descriptionIsLong(originalDescription));
  el.descriptionToggle.hidden = !descriptionIsLong(originalDescription);
  el.descriptionToggle.textContent = "Selengkapnya";
  el.translateDescription.hidden = originalDescription.length < 24;
  el.translateDescription.textContent = "Terjemahkan ke Indonesia";
  el.translationStatus.textContent = "";
}

function looksEnglish(value) {
  const words = String(value).toLowerCase().match(/[a-z]+/g) || [];
  const markers = new Set(["the", "and", "with", "from", "this", "that", "his", "her", "their", "when", "into", "for", "while"]);
  return words.filter(word => markers.has(word)).length >= 2;
}

function translationChunks(value) {
  const chunks = [];
  let remaining = String(value).trim();
  while (remaining) {
    let end = Math.min(430, remaining.length);
    if (end < remaining.length) {
      const boundary = Math.max(remaining.lastIndexOf(". ", end), remaining.lastIndexOf(" ", end));
      if (boundary > 180) end = boundary + 1;
    }
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }
  return chunks.filter(Boolean);
}

async function translateCurrentDescription(automatic = false) {
  if (descriptionTranslated) {
    renderDescription(originalDescription);
    return;
  }
  const request = ++translationRequest;
  el.translateDescription.disabled = true;
  el.translationStatus.textContent = automatic ? "Menerjemahkan otomatis..." : "Menerjemahkan...";
  try {
    const translatedParts = [];
    for (const part of translationChunks(originalDescription)) {
      const response = await window.AzuriumAccess.fetch("/api/translate/", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ text: part }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.translatedText) throw new Error(body.error || "Terjemahan belum tersedia.");
      translatedParts.push(body.translatedText);
    }
    if (request !== translationRequest) return;
    el.description.textContent = translatedParts.join(" ");
    descriptionTranslated = true;
    el.description.classList.toggle("is-collapsed", descriptionIsLong(el.description.textContent));
    el.descriptionToggle.hidden = !descriptionIsLong(el.description.textContent);
    el.descriptionToggle.textContent = "Selengkapnya";
    el.translateDescription.textContent = "Tampilkan bahasa asli";
    el.translationStatus.textContent = "Terjemahan Indonesia";
  } catch (error) {
    el.translationStatus.textContent = error.message;
  } finally {
    el.translateDescription.disabled = false;
  }
}

function renderDetail(detail) {
  const displayTitle = AzuriumStore.displayTitle(detail.title || detail.name);
  subjectType = Number(detail.subjectType) || subjectType;
  currentDetail = AzuriumStore.normalizeItem({
    ...detail,
    subjectId: storageSubjectId,
    providerId: subjectId,
    source: contentSource,
    title: displayTitle,
    name: displayTitle,
  });
  document.title = `${displayTitle} — azuriummovie`;
  el.title.textContent = displayTitle;
  el.type.textContent = contentSource === "anime" ? "ANIME" : contentSource === "donghua" ? "DONGHUA" : subjectType === 7 ? "DRAMA PENDEK" : subjectType === 2 ? "SERIAL" : "FILM";
  el.rating.textContent = `★ ${detail.imdbRatingValue || "—"}`;
  el.meta.textContent = [detail.releaseDate?.slice(0, 4), formatDuration(detail.duration), detail.countryName].filter(Boolean).join("  ·  ");
  renderDescription(detail.description);
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
  AzuriumStore.recordHistory(currentDetail);
  refreshWatchFavorite();
  if (looksEnglish(originalDescription)) window.setTimeout(() => translateCurrentDescription(true), 250);
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
  const preferredLanguage = AzuriumStore.getPreferences().subtitle;
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
  const quality = String(AzuriumStore.getPreferences().quality || "").toLowerCase();
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
  if (contentSource !== "moviebox") {
    return currentAnimeEpisodes.map((_, index) => ({ se: 0, ep: index + 1 }));
  }
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
  if (contentSource !== "moviebox") {
    paintAnimeEpisodes();
    return;
  }
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
  if (contentSource !== "moviebox") {
    el.animeEpisodeSelect.value = String(episode);
    paintAnimeEpisodes();
    return;
  }
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

function animeEpisodeLabel(episode, index) {
  const title = String(episode?.title || "").trim();
  const match = title.match(/\b(?:eps?|episode)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (match) return `Episode ${match[1]}`;
  if (currentAnimeEpisodes.length === 1) return episode?.duration === "Movie" ? "Film" : "Episode 1";
  return title || `Episode ${index + 1}`;
}

function animeEpisodeNumber(episode) {
  const match = String(episode?.title || "").match(/\b(?:eps?|episode)\s*([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function paintAnimeEpisodes() {
  el.episodeList.replaceChildren();
  if (!currentAnimeEpisodes.length) return;
  const activeIndex = Math.max(0, currentAnimeEpisodeIndex);
  const start = Math.max(0, Math.min(currentAnimeEpisodes.length - 24, activeIndex - 12));
  const end = Math.min(currentAnimeEpisodes.length, start + 24);
  const fragment = document.createDocumentFragment();
  for (let index = start; index < end; index += 1) {
    const episode = currentAnimeEpisodes[index];
    const button = document.createElement("button");
    button.className = "episode-button";
    button.type = "button";
    button.textContent = animeEpisodeLabel(episode, index).replace(/^Episode\s+/i, "E");
    button.title = episode.title || animeEpisodeLabel(episode, index);
    button.classList.toggle("active", index === currentAnimeEpisodeIndex);
    button.addEventListener("click", () => {
      loadAnimeStream(index, true);
      document.querySelector(".player-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    fragment.append(button);
  }
  el.episodeList.append(fragment);
}

function renderAnimeEpisodes(episodes) {
  currentAnimeEpisodes = [...episodes].sort((a, b) => {
    const numberDifference = animeEpisodeNumber(a) - animeEpisodeNumber(b);
    if (numberDifference !== 0) return numberDifference;
    return Number(a.id) - Number(b.id);
  });
  if (!currentAnimeEpisodes.length) return;
  el.episodeSection.hidden = false;
  el.seasonControl.hidden = true;
  el.animeEpisodeControl.hidden = false;
  el.animeEpisodeSelect.replaceChildren();
  currentAnimeEpisodes.forEach((episode, index) => {
    const option = document.createElement("option");
    option.value = String(index + 1);
    option.textContent = animeEpisodeLabel(episode, index);
    el.animeEpisodeSelect.append(option);
  });
  el.animeEpisodeSelect.onchange = () => loadAnimeStream(Number(el.animeEpisodeSelect.value) - 1, true);
  paintAnimeEpisodes();
  updateEpisodeActions();
}

function saveCurrentProgress(force = false, started = false) {
  if (changingStream || !currentDetail || !Number.isFinite(el.video.currentTime) || (!started && el.video.currentTime <= 0)) return;
  const now = Date.now();
  if (!force && now - lastProgressSavedAt < 5000) return;
  lastProgressSavedAt = now;
  AzuriumStore.saveProgress(currentDetail, {
    season: currentSeason,
    episode: currentEpisode,
    episodeId: contentSource !== "moviebox" ? currentAnimeEpisodes[currentAnimeEpisodeIndex]?.id : "",
    episodeLabel: contentSource !== "moviebox" ? animeEpisodeLabel(currentAnimeEpisodes[currentAnimeEpisodeIndex], currentAnimeEpisodeIndex) : "",
    currentTime: el.video.currentTime,
    duration: Number.isFinite(el.video.duration) ? el.video.duration : 0,
    started,
  });
}

function updateAddress() {
  const url = new URL(location.href);
  url.searchParams.set("id", subjectId);
  url.searchParams.set("type", subjectType);
  if (contentSource !== "moviebox") url.searchParams.set("source", contentSource);
  if (isEpisodic()) {
    url.searchParams.set("se", currentSeason);
    url.searchParams.set("ep", currentEpisode);
    if (contentSource !== "moviebox" && currentAnimeEpisodes[currentAnimeEpisodeIndex]?.id) {
      url.searchParams.set("episodeId", currentAnimeEpisodes[currentAnimeEpisodeIndex].id);
    }
  } else {
    url.searchParams.delete("se");
    url.searchParams.delete("ep");
    url.searchParams.delete("episodeId");
  }
  window.history.replaceState(null, "", url);
}

async function loadStream(se = 0, ep = 0, shouldPlay = false) {
  if (contentSource !== "moviebox") return loadAnimeStream(Math.max(0, Number(ep) - 1), shouldPlay);
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
  if (currentDetail) AzuriumStore.recordHistory(currentDetail, { season: se, episode: ep });

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

    const resume = AzuriumStore.getProgress(storageSubjectId, se, ep);
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

async function loadAnimeStream(index = 0, shouldPlay = false) {
  const episode = currentAnimeEpisodes[index];
  if (!episode) {
    showPlayerError(`Episode ${contentSource === "donghua" ? "Donghua" : "Anime"} yang dipilih tidak ditemukan.`);
    return;
  }
  if (currentSources.length && index !== currentAnimeEpisodeIndex) saveCurrentProgress(true);
  changingStream = true;
  currentAnimeEpisodeIndex = index;
  currentSeason = 0;
  currentEpisode = index + 1;
  currentSources = [];
  currentSourceIndex = 0;
  playAfterLoad = shouldPlay;
  el.quality.disabled = true;
  el.error.hidden = true;
  el.placeholder.hidden = false;
  el.video.removeAttribute("src");
  el.video.load();
  setSourceStatus(`Menyiapkan episode ${contentSource === "donghua" ? "Donghua" : "Anime"}...`);
  selectEpisode(0, currentEpisode);
  updateAddress();
  updateEpisodeActions();
  AzuriumStore.recordHistory(currentDetail, {
    season: 0,
    episode: currentEpisode,
    episodeId: episode.id,
    episodeLabel: animeEpisodeLabel(episode, index),
  });

  try {
    currentSources = (episode.streams || [])
      .filter(item => item.url && !/-eng$/i.test(String(item.quality || "")))
      .map(item => ({ resolution: item.quality || "Otomatis", url: item.url }))
      .sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution));
    if (!currentSources.length) {
      currentSources = (episode.streams || [])
        .filter(item => item.url)
        .map(item => ({ resolution: item.quality || "Otomatis", url: item.url }))
        .sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution));
    }
    if (!currentSources.length) throw new Error("Link video untuk episode ini belum tersedia.");

    el.quality.replaceChildren();
    currentSources.forEach((source, sourceIndex) => {
      const option = document.createElement("option");
      option.value = sourceIndex;
      option.textContent = source.resolution;
      el.quality.append(option);
    });
    el.quality.disabled = false;
    const resume = AzuriumStore.getProgress(storageSubjectId, 0, currentEpisode);
    setSource(findPreferredSource(), false, resume?.currentTime || 0);
    el.video.querySelectorAll("track").forEach(track => track.remove());
    setSourceStatus(`${currentSources.length} kualitas · subtitle mengikuti sumber video`, "ok");
    el.episodeNow.textContent = animeEpisodeLabel(episode, index);
  } catch (error) {
    changingStream = false;
    playAfterLoad = false;
    showPlayerError(`${error.message} Gunakan tombol Coba lagi atau pilih episode lain.`);
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
  const displayTitle = AzuriumStore.displayTitle(item.name || item.title);
  const card = document.createElement("article");
  card.className = "movie-card";
  const link = document.createElement("a");
  link.className = "card-link";
  const recommendationId = item.providerId || item.subjectId;
  const recommendationQuery = new URLSearchParams({
    id: recommendationId,
    type: item.type || item.subjectType || 1,
  });
  if (item.source && item.source !== "moviebox") recommendationQuery.set("source", item.source);
  link.href = `watch.html?${recommendationQuery}`;
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
    const active = AzuriumStore.isFavorite(item.subjectId);
    favorite.classList.toggle("active", active);
    favorite.setAttribute("aria-label", active ? "Hapus dari favorit" : "Tambahkan ke favorit");
  };
  updateFavorite();
  favorite.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    AzuriumStore.toggleFavorite(item);
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
    const data = contentSource !== "moviebox"
      ? await getJson("trending", { page: 1 })
      : await getJson("recommend", { id: subjectId, page: 1 });
    let items = data.items || data.data?.items || data.sections?.flatMap(section => section.items || []) || [];
    if (contentSource !== "moviebox") {
      items = items
        .filter(item => String(item.id) !== String(subjectId))
        .map(item => ({
          subjectId: `${contentSource}:${item.id}`,
          providerId: String(item.id),
          source: contentSource,
          name: item.title,
          type: contentSource === "donghua" ? 9 : 8,
          poster: item.thumbnail,
          year: item.year,
          genre: Array.isArray(item.genres) ? item.genres.join(", ") : "",
          rating: item.rating,
        }));
    }
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

function htmlToText(value) {
  const documentFragment = new DOMParser().parseFromString(String(value || ""), "text/html");
  return (documentFragment.body.textContent || "").replace(/\s+/g, " ").trim();
}

function animeDetailFromResponse(result) {
  const category = result.category || {};
  const firstEpisode = (result.items || [])[0] || {};
  return {
    subjectId: storageSubjectId,
    providerId: subjectId,
    source: contentSource,
    title: category.category_name || firstEpisode.series || firstEpisode.title || (contentSource === "donghua" ? "Donghua" : "Anime"),
    subjectType: contentSource === "donghua" ? 9 : 8,
    imdbRatingValue: category.rating || firstEpisode.rating,
    releaseDate: String(category.year || firstEpisode.year || ""),
    countryName: contentSource === "donghua" ? "Tiongkok" : "Jepang",
    description: htmlToText(category.desc_anime) || firstEpisode.description || `Deskripsi ${contentSource === "donghua" ? "Donghua" : "Anime"} belum tersedia.`,
    cover: { url: firstEpisode.thumbnail || "" },
    genre: category.genre || (Array.isArray(firstEpisode.genres) ? firstEpisode.genres.join(", ") : ""),
    staffList: [],
  };
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
    if (contentSource !== "moviebox") {
      const result = await getJson("detail", { id: subjectId });
      subjectType = contentSource === "donghua" ? 9 : 8;
      renderDetail(animeDetailFromResponse(result));
      renderAnimeEpisodes(result.items || []);
      if (!currentAnimeEpisodes.length) throw new Error(`Episode ${contentSource === "donghua" ? "Donghua" : "Anime"} belum tersedia.`);
      const saved = AzuriumStore.getLatestProgress(storageSubjectId);
      let initialIndex = 0;
      if (requestedEpisodeId) {
        const found = currentAnimeEpisodes.findIndex(item => String(item.id) === requestedEpisodeId);
        if (found >= 0) initialIndex = found;
      } else if (requestedEpisode > 0 && requestedEpisode <= currentAnimeEpisodes.length) {
        initialIndex = requestedEpisode - 1;
      } else if (saved?.episodeId) {
        const found = currentAnimeEpisodes.findIndex(item => String(item.id) === String(saved.episodeId));
        if (found >= 0) initialIndex = found;
      } else if (Number(saved?.episode) > 0 && Number(saved.episode) <= currentAnimeEpisodes.length) {
        initialIndex = Number(saved.episode) - 1;
      }
      await loadAnimeStream(initialIndex);
      loadRecommendations();
      return;
    }
    const result = await getJson("detail", { id: subjectId });
    const detail = result.data || result;
    renderDetail(detail);
    if (isEpisodic()) {
      const seasonResult = await getJson("season", { id: subjectId });
      const seasons = seasonResult.data?.seasons || seasonResult.seasons || [];
      renderEpisodes(seasons);
      const first = episodeSequence()[0] || { se: 1, ep: 1 };
      const requested = { season: requestedSeason, episode: requestedEpisode };
      const saved = AzuriumStore.getLatestProgress(storageSubjectId);
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
  if (selected?.resolution) AzuriumStore.setPreference("quality", selected.resolution);
  setSource(Number(el.quality.value), true);
});
el.retry.addEventListener("click", () => loadStream(currentSeason, currentEpisode, true));
el.previousEpisode.addEventListener("click", () => navigateEpisode(-1));
el.nextEpisode.addEventListener("click", () => navigateEpisode(1));
el.autoplay.addEventListener("click", () => {
  autoplayEnabled = !autoplayEnabled;
  AzuriumStore.setPreference("autoplay", autoplayEnabled);
  updateEpisodeActions();
});
el.favorite.addEventListener("click", () => {
  if (!currentDetail) return;
  AzuriumStore.toggleFavorite(currentDetail);
  refreshWatchFavorite();
});
el.descriptionToggle.addEventListener("click", () => {
  const collapsed = el.description.classList.toggle("is-collapsed");
  el.descriptionToggle.textContent = collapsed ? "Selengkapnya" : "Lebih sedikit";
});
el.translateDescription.addEventListener("click", () => translateCurrentDescription(false));
el.video.addEventListener("loadedmetadata", () => {
  el.placeholder.hidden = true;
  el.error.hidden = true;
});
el.video.addEventListener("canplay", () => { el.placeholder.hidden = true; });
el.video.addEventListener("play", () => saveCurrentProgress(true, true));
el.video.addEventListener("timeupdate", () => saveCurrentProgress());
el.video.addEventListener("pause", () => saveCurrentProgress(true));
el.video.addEventListener("volumechange", () => AzuriumStore.setPreference("volume", el.video.volume));
el.video.addEventListener("ended", () => {
  saveCurrentProgress(true);
  if (isEpisodic() && autoplayEnabled && navigateEpisode(1, true)) return;
  setSourceStatus("Pemutaran selesai", "ok");
});
document.addEventListener("fullscreenchange", syncVideoOrientation);
document.addEventListener("webkitfullscreenchange", syncVideoOrientation);
el.video.addEventListener("webkitbeginfullscreen", () => {
  lockScreenOrientation(videoMayUseLandscape() ? "landscape" : "portrait-primary");
});
el.video.addEventListener("webkitendfullscreen", () => lockScreenOrientation("portrait-primary"));
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
  AzuriumStore.setPreference("subtitle", showing?.language || "off");
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
  await window.AzuriumAccess?.ready();
  lockScreenOrientation("portrait-primary");
  init();
}

startWatch();
window.addEventListener("pageshow", () => {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) lockScreenOrientation("portrait-primary");
});
