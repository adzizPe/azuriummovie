const API_BASE = "/api/moviebox";
const params = new URLSearchParams(location.search);
const subjectId = params.get("id");
let subjectType = Number(params.get("type")) || 1;
let currentSeason = 0;
let currentEpisode = 0;
let currentSources = [];
let currentSourceIndex = 0;
let subtitleBlobUrls = [];

const el = {
  video: document.querySelector("#video"),
  placeholder: document.querySelector("#playerPlaceholder"),
  error: document.querySelector("#playerError"),
  errorText: document.querySelector("#playerErrorText"),
  retry: document.querySelector("#retryStream"),
  quality: document.querySelector("#qualitySelect"),
  episodeNow: document.querySelector("#episodeNow"),
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
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== null && value !== undefined && value !== "") url.searchParams.set(key, value);
  });
  return url;
}

async function getJson(path, query) {
  const response = await fetch(endpoint(path, query));
  if (!response.ok) throw new Error(`Server merespons ${response.status}`);
  return response.json();
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours ? `${hours}j ${minutes}m` : `${minutes}m`;
}

function renderDetail(detail) {
  subjectType = Number(detail.subjectType) || subjectType;
  document.title = `${detail.title || "Menonton"} — OzancicakMovie`;
  el.title.textContent = detail.title || "Tanpa judul";
  el.type.textContent = subjectType === 2 ? "SERIAL" : "FILM";
  el.rating.textContent = `★ ${detail.imdbRatingValue || "—"}`;
  el.meta.textContent = [detail.releaseDate?.slice(0, 4), formatDuration(detail.duration), detail.countryName].filter(Boolean).join("  ·  ");
  el.description.textContent = detail.description || "Deskripsi belum tersedia untuk judul ini.";
  el.poster.src = detail.cover?.url || "";
  el.poster.alt = `Poster ${detail.title || ""}`;
  el.cast.textContent = (detail.staffList || []).slice(0, 5).map(person => person.name).join(", ") || "Belum tersedia";
  el.genres.replaceChildren();
  String(detail.genre || "").split(",").filter(Boolean).forEach(genre => {
    const chip = document.createElement("span");
    chip.textContent = genre.trim();
    el.genres.append(chip);
  });
}

function showPlayerError(message) {
  el.placeholder.hidden = true;
  el.error.hidden = false;
  el.errorText.textContent = message;
}

function srtToVtt(content) {
  return `WEBVTT\n\n${content.replace(/^\uFEFF/, "").replace(/(\d{2}:\d{2}:\d{2}),([0-9]{3})/g, "$1.$2")}`;
}

async function attachSubtitles(subtitles) {
  el.video.querySelectorAll("track").forEach(track => track.remove());
  subtitleBlobUrls.forEach(URL.revokeObjectURL);
  subtitleBlobUrls = [];
  const preferred = [...(subtitles || [])].sort((a, b) => Number(b.indonesian) - Number(a.indonesian)).slice(0, 6);
  await Promise.all(preferred.map(async (subtitle, index) => {
    try {
      const response = await fetch(subtitle.url);
      if (!response.ok) return;
      const srt = await response.text();
      const blobUrl = URL.createObjectURL(new Blob([srtToVtt(srt)], { type: "text/vtt" }));
      subtitleBlobUrls.push(blobUrl);
      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = subtitle.indonesian ? "Indonesia" : (subtitle.name || subtitle.lang || `Subtitle ${index + 1}`);
      track.srclang = subtitle.indonesian ? "id" : (subtitle.lang || "en").split("_")[0];
      track.src = blobUrl;
      track.default = Boolean(subtitle.indonesian);
      el.video.append(track);
    } catch (_) { /* CDN subtitle mungkin menolak CORS; video tetap dapat diputar. */ }
  }));
}

function setSource(index, preserve = false) {
  const source = currentSources[index];
  if (!source) return;
  currentSourceIndex = index;
  el.quality.value = String(index);
  el.placeholder.hidden = false;
  el.error.hidden = true;
  const time = preserve ? el.video.currentTime : 0;
  const wasPlaying = preserve && !el.video.paused;
  el.video.src = source.url;
  el.video.load();
  el.video.addEventListener("loadedmetadata", () => {
    if (time && Number.isFinite(time)) el.video.currentTime = Math.min(time, el.video.duration || time);
    if (wasPlaying) el.video.play().catch(() => {});
  }, { once: true });
}

async function loadStream(se = 0, ep = 0) {
  currentSeason = se;
  currentEpisode = ep;
  currentSources = [];
  currentSourceIndex = 0;
  el.quality.disabled = true;
  el.error.hidden = true;
  el.placeholder.hidden = false;
  el.video.removeAttribute("src");
  el.video.load();
  try {
    const data = await getJson("stream", { id: subjectId, se: se || undefined, ep: ep || undefined });
    currentSources = (data.resources || []).filter(item => item.url).sort((a, b) => parseInt(b.resolution) - parseInt(a.resolution));
    if (!currentSources.length) throw new Error("Sumber MP4 belum tersedia untuk judul ini.");
    el.quality.replaceChildren();
    currentSources.forEach((source, index) => {
      const option = document.createElement("option");
      option.value = index;
      option.textContent = source.resolution || `Sumber ${index + 1}`;
      el.quality.append(option);
    });
    el.quality.disabled = false;
    setSource(0);
    await attachSubtitles(data.subtitles);
    el.episodeNow.textContent = subjectType === 2 ? `Musim ${se} · Episode ${ep}` : "Film";
    document.querySelectorAll(".episode-button").forEach(button => {
      button.classList.toggle("active", Number(button.dataset.se) === se && Number(button.dataset.ep) === ep);
    });
  } catch (error) {
    showPlayerError(`${error.message} Tautan dari penyedia mungkin sedang kedaluwarsa.`);
  }
}

function renderEpisodes(seasons) {
  if (!seasons.length) return;
  el.episodeSection.hidden = false;
  el.seasonSelect.replaceChildren();
  seasons.forEach(season => {
    const option = document.createElement("option");
    option.value = season.se;
    option.textContent = `Musim ${season.se}`;
    el.seasonSelect.append(option);
  });
  const paint = seasonNumber => {
    const season = seasons.find(item => Number(item.se) === Number(seasonNumber));
    el.episodeList.replaceChildren();
    for (let ep = 1; ep <= (season?.maxEp || 0); ep += 1) {
      const button = document.createElement("button");
      button.className = "episode-button";
      button.type = "button";
      button.dataset.se = season.se;
      button.dataset.ep = ep;
      button.textContent = `E${String(ep).padStart(2, "0")}`;
      button.addEventListener("click", () => {
        loadStream(Number(season.se), ep);
        document.querySelector(".player-shell").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      el.episodeList.append(button);
    }
  };
  paint(seasons[0].se);
  el.seasonSelect.addEventListener("change", () => paint(Number(el.seasonSelect.value)));
}

function createRecommendation(item) {
  const link = document.createElement("a");
  link.className = "movie-card";
  link.href = `watch.html?id=${encodeURIComponent(item.subjectId)}&type=${encodeURIComponent(item.type || 1)}`;
  const wrap = document.createElement("div");
  wrap.className = "poster-wrap";
  const img = document.createElement("img");
  img.src = item.poster || item.cover?.url || "";
  img.alt = `Poster ${item.name || item.title || "film"}`;
  img.loading = "lazy";
  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.innerHTML = `<b>★</b> ${item.rating || item.imdbRatingValue || "—"}`;
  wrap.append(img, rating);
  const copy = document.createElement("div");
  copy.className = "card-copy";
  const title = document.createElement("h4");
  title.textContent = item.name || item.title || "Tanpa judul";
  const meta = document.createElement("p");
  meta.textContent = item.year || "Lihat detail";
  copy.append(title, meta);
  link.append(wrap, copy);
  return link;
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

async function init() {
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
    if (subjectType === 2) {
      const seasonResult = await getJson("season", { id: subjectId });
      const seasons = seasonResult.data?.seasons || seasonResult.seasons || [];
      renderEpisodes(seasons);
      const first = seasons[0];
      await loadStream(Number(first?.se || 1), 1);
    } else {
      await loadStream();
    }
    loadRecommendations();
  } catch (error) {
    el.title.textContent = "Detail tidak dapat dimuat";
    el.description.textContent = `${error.message}. Silakan kembali dan coba judul lain.`;
    showPlayerError("Informasi dari penyedia API tidak berhasil diambil.");
  }
}

el.quality.addEventListener("change", () => setSource(Number(el.quality.value), true));
el.retry.addEventListener("click", () => loadStream(currentSeason, currentEpisode));
el.video.addEventListener("loadedmetadata", () => {
  el.placeholder.hidden = true;
  el.error.hidden = true;
});
el.video.addEventListener("canplay", () => { el.placeholder.hidden = true; });
el.video.addEventListener("error", () => {
  if (!currentSources.length) return;
  const nextIndex = currentSourceIndex + 1;
  if (nextIndex < currentSources.length) {
    setSource(nextIndex);
    return;
  }
  const mediaMessage = el.video.error?.message || "Format atau sumber video ditolak oleh browser.";
  showPlayerError(`${mediaMessage} Semua kualitas yang tersedia sudah dicoba.`);
});
window.addEventListener("beforeunload", () => subtitleBlobUrls.forEach(URL.revokeObjectURL));

init();
