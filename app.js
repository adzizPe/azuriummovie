const API_BASE = "/api/moviebox";
const ANIME_API_BASE = "/api/anime";
const DONGHUA_API_BASE = "/api/donghua";
const IPTV_API_BASE = "/api/iptv";
const HERO_CACHE_KEY = "azuriummovie:hero-cache:v1";
const HERO_CACHE_TTL = 24 * 60 * 60 * 1000;

function apiFetch(input, options) {
  return window.AzuriumAccess ? window.AzuriumAccess.fetch(input, options) : window.fetch(input, options);
}

function keepCatalogPortrait() {
  screen.orientation?.lock?.("portrait-primary").catch(() => {});
}

const state = {
  endpoint: "movies",
  page: 1,
  query: "",
  loading: false,
  requestId: 0,
  pendingSections: [],
  libraryMode: "",
  animeSeenIds: new Set(),
  animeSeenTitles: new Set(),
  iptvGroup: "",
  iptvGroups: [],
};

let catalogController = null;
let suggestionController = null;
let suggestionTimer = 0;
let heroItems = [];
let heroSlideIndex = 0;
let heroSlideTimer = 0;
let heroDetailRequest = 0;
let heroPointerStart = 0;
let heroPointerId = null;
let heroIsVisible = true;
const heroImageCache = new Map();
const HERO_IMAGE_TIMEOUT = 4500;

const elements = {
  catalog: document.querySelector("#catalog"),
  status: document.querySelector("#status"),
  loadMore: document.querySelector("#loadMore"),
  title: document.querySelector("#catalogTitle"),
  count: document.querySelector("#resultCount"),
  searchForm: document.querySelector("#searchForm"),
  searchToggle: document.querySelector("#searchToggle"),
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  suggestions: document.querySelector("#searchSuggestions"),
  hero: document.querySelector("#hero"),
  heroArt: document.querySelector("#heroArt"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  heroDesc: document.querySelector("#heroDesc"),
  heroPlay: document.querySelector("#heroPlay"),
  heroInfo: document.querySelector("#heroInfo"),
  serialTabs: document.querySelector("#serialTabs"),
  iptvTabs: document.querySelector("#iptvTabs"),
  libraryPanel: document.querySelector("#libraryPanel"),
  libraryTitle: document.querySelector("#libraryTitle"),
  libraryGrid: document.querySelector("#libraryGrid"),
  libraryEmpty: document.querySelector("#libraryEmpty"),
  clearHistory: document.querySelector("#clearHistory"),
  closeLibrary: document.querySelector("#closeLibrary"),
  continueCount: document.querySelector("#continueCount"),
  favoriteCount: document.querySelector("#favoriteCount"),
  historyCount: document.querySelector("#historyCount"),
};

const labels = { movies: "Film untukmu", tv: "Serial TV pilihan", tvshows: "Drama pendek", animation: "Dunia anime", donghua: "Donghua pilihan", kids: "Pilihan keluarga", iptv: "TV Indonesia live" };

function syncSerialTabs() {
  const serialNavActive = document.querySelector(".nav-link.active")?.dataset.endpoint === "tv";
  elements.serialTabs.hidden = !serialNavActive || Boolean(state.query);
  elements.serialTabs.querySelectorAll(".catalog-tab").forEach(button => {
    const active = button.dataset.endpoint === state.endpoint;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  elements.iptvTabs.hidden = state.endpoint !== "iptv" || Boolean(state.query);
}

function apiUrl() {
  if (state.query) return `${API_BASE}/search?q=${encodeURIComponent(state.query)}&page=${state.page}`;
  return `${API_BASE}/${state.endpoint}?page=${state.page}`;
}

function watchUrl(item) {
  if (item.source === "iptv") {
    return `live.html?id=${encodeURIComponent(item.providerId || item.subjectId.replace(/^iptv:/, ""))}`;
  }
  const query = new URLSearchParams({
    id: item.providerId || item.subjectId,
    type: item.type || 1,
  });
  if (item.source && item.source !== "moviebox") query.set("source", item.source);
  if (Number(item.season)) query.set("se", Number(item.season));
  if (Number(item.episode)) query.set("ep", Number(item.episode));
  if (item.episodeId) query.set("episodeId", item.episodeId);
  return `watch.html?${query}`;
}

function text(value, fallback = "") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function createCard(item) {
  const liveChannel = item.source === "iptv";
  const displayName = AzuriumStore.displayTitle(item.name || item.title);
  const card = document.createElement("article");
  card.className = "movie-card";
  card.classList.toggle("live-card", liveChannel);
  const link = document.createElement("a");
  link.className = "card-link";
  link.href = watchUrl(item);
  link.setAttribute("aria-label", `Putar ${displayName}`);

  const poster = document.createElement("div");
  poster.className = "poster-wrap";
  const image = document.createElement("img");
  image.src = text(item.poster);
  image.alt = `Poster ${displayName}`;
  image.loading = "lazy";
  image.decoding = "async";
  image.fetchPriority = "low";
  image.addEventListener("error", () => { image.style.opacity = ".15"; });

  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.innerHTML = liveChannel ? '<b class="live-pulse"></b> LIVE' : `<b>★</b> ${text(item.rating, "—")}`;

  const play = document.createElement("span");
  play.className = "play-chip";
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>';
  const favorite = document.createElement("button");
  favorite.type = "button";
  favorite.className = "favorite-chip";
  favorite.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5S4 16 4 9.6A4.1 4.1 0 0 1 11.1 6.8L12 8l.9-1.2A4.1 4.1 0 0 1 20 9.6c0 6.4-8 10.9-8 10.9Z"/></svg>';
  const refreshFavorite = () => {
    const active = AzuriumStore.isFavorite(item.subjectId);
    favorite.classList.toggle("active", active);
    favorite.setAttribute("aria-label", active ? `Hapus ${displayName} dari favorit` : `Tambahkan ${displayName} ke favorit`);
    favorite.title = active ? "Hapus dari favorit" : "Tambahkan ke favorit";
  };
  refreshFavorite();
  favorite.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    AzuriumStore.toggleFavorite(item);
    refreshFavorite();
  });
  poster.append(image, rating, play);

  if (Number(item.currentTime) > 0 && Number(item.duration) > 0) {
    const progress = document.createElement("span");
    progress.className = "watch-progress";
    const progressFill = document.createElement("i");
    progressFill.style.width = `${Math.min(100, Math.max(2, (Number(item.currentTime) / Number(item.duration)) * 100))}%`;
    progress.append(progressFill);
    poster.append(progress);
  }

  const copy = document.createElement("div");
  copy.className = "card-copy";
  const heading = document.createElement("h4");
  heading.textContent = displayName;
  const meta = document.createElement("p");
  meta.textContent = [text(item.year), text(item.genre).split(",")[0]].filter(Boolean).join("  ·  ");
  if (item.episodeLabel) meta.textContent += `${meta.textContent ? "  ·  " : ""}${item.episodeLabel}`;
  else if (Number(item.episode)) meta.textContent += `${meta.textContent ? "  ·  " : ""}Episode ${Number(item.episode)}`;
  copy.append(heading, meta);
  link.append(poster, copy);
  card.append(link, favorite);
  return card;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => item?.subjectId && !seen.has(item.subjectId) && seen.add(item.subjectId));
}

function titleKey(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("id-ID")
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .replace(/\b(?:subtitle indonesia|sub indo|batch|bd|bluray|web[- ]?dl)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function animeAliases(item) {
  const aliases = [item.title, item.series];
  const description = String(item.description || "");
  const alternativeBlock = description.match(/Alternative Titles?\s*:?\s*([^\n]+)/i)?.[1] || "";
  alternativeBlock.split(/\s*(?:,|;|\||\/|English:|Japanese:|Synonyms:)\s*/i).forEach(value => aliases.push(value));
  return new Set(aliases.map(titleKey).filter(Boolean));
}

function normalizeMovieboxSections(sections) {
  return sections.map(section => ({
    ...section,
    items: (section.items || []).map(item => ({
      ...item,
      source: item.source || "moviebox",
      providerId: String(item.providerId || item.subjectId || item.id || ""),
    })),
  }));
}

function normalizeExternalItem(item, source) {
  const providerId = String(item.id || item.catId || "");
  return {
    subjectId: `${source}:${providerId}`,
    providerId,
    source,
    name: text(item.title || item.series, "Tanpa judul"),
    title: text(item.title || item.series, "Tanpa judul"),
    type: source === "donghua" ? 9 : 8,
    poster: text(item.thumbnail),
    year: text(item.year),
    genre: Array.isArray(item.genres) ? item.genres.join(", ") : text(item.genre),
    rating: item.rating,
    desc: text(item.description),
    status: text(item.status),
    aliases: [...animeAliases(item)],
  };
}

function normalizeAnimeItem(item) {
  return normalizeExternalItem(item, "anime");
}

function normalizeIptvChannel(channel) {
  const providerId = String(channel.id || "");
  const group = text(channel.group, "TV Indonesia");
  return {
    subjectId: `iptv:${providerId}`,
    providerId,
    source: "iptv",
    name: text(channel.name, "Channel TV"),
    title: text(channel.name, "Channel TV"),
    type: 10,
    poster: text(channel.logo),
    year: "LIVE",
    genre: group,
    rating: "LIVE",
    desc: `Siaran langsung ${group}. Tonton channel ini secara online.`,
  };
}

function iptvSections(data) {
  const channels = (data?.channels || []).map(normalizeIptvChannel).filter(item => item.providerId);
  if (state.query) return channels.length ? [{ title: `Channel untuk “${state.query}”`, items: channels }] : [];
  if (state.iptvGroup) return channels.length ? [{ title: state.iptvGroup, items: channels }] : [];
  const grouped = new Map();
  channels.forEach(channel => {
    const group = channel.genre || "Lainnya";
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(channel);
  });
  const preferredOrder = new Map(state.iptvGroups.map((group, index) => [group.name, index]));
  return [...grouped.entries()]
    .sort(([left], [right]) => (preferredOrder.get(left) ?? 999) - (preferredOrder.get(right) ?? 999) || left.localeCompare(right, "id"))
    .map(([title, items]) => ({ title, items }));
}

function renderIptvGroupTabs(groups) {
  if (Array.isArray(groups) && groups.length) state.iptvGroups = groups;
  const fragment = document.createDocumentFragment();
  const total = state.iptvGroups.reduce((sum, item) => sum + Number(item.count || 0), 0);
  const choices = [{ name: "", label: "Semua", count: total }, ...state.iptvGroups.map(item => ({ ...item, label: item.name }))];
  choices.forEach(group => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "iptv-tab";
    button.classList.toggle("active", state.iptvGroup === group.name);
    button.setAttribute("aria-pressed", String(state.iptvGroup === group.name));
    button.textContent = group.count ? `${group.label} ${group.count}` : group.label;
    button.addEventListener("click", () => {
      if (state.iptvGroup === group.name && !state.query) return;
      state.iptvGroup = group.name;
      state.query = "";
      state.page = 1;
      elements.searchInput.value = "";
      elements.searchForm.classList.remove("has-value", "is-open");
      elements.title.textContent = group.name ? `Live TV · ${group.name}` : labels.iptv;
      renderIptvGroupTabs();
      loadCatalog(false);
    });
    fragment.append(button);
  });
  elements.iptvTabs.replaceChildren(fragment);
}

function providerItems(data) {
  for (const key of ["items", "posts", "new_anime", "latest_anime"]) {
    if (Array.isArray(data?.[key]) && data[key].length) return data[key];
  }
  return [];
}

function donghuaSections(results) {
  const definitions = state.query
    ? [[0, `Hasil Donghua untuk “${state.query}”`]]
    : [
        [0, state.page > 1 ? `Donghua populer · halaman ${state.page}` : "Donghua populer"],
        [1, "Donghua paling disukai"],
        [2, "Rekomendasi Donghua"],
      ];
  const seen = new Set();
  return definitions.flatMap(([index, title]) => {
    if (results[index]?.status !== "fulfilled") return [];
    const items = providerItems(results[index].value)
      .map(item => normalizeExternalItem(item, "donghua"))
      .filter(item => item.providerId && !seen.has(item.providerId) && seen.add(item.providerId));
    return items.length ? [{ title, items }] : [];
  });
}

function mergeAnimeSections(movieboxSections, animeGroups) {
  const occupiedTitles = state.animeSeenTitles;
  movieboxSections.flatMap(section => section.items || []).forEach(item => {
    const key = titleKey(item.name || item.title);
    if (key) occupiedTitles.add(key);
  });

  const addedIds = state.animeSeenIds;
  const sections = [];
  animeGroups.forEach(group => {
    const items = (group.items || []).map(normalizeAnimeItem).filter(item => {
      if (!item.providerId || addedIds.has(item.providerId)) return false;
      const duplicate = item.aliases.some(alias => occupiedTitles.has(alias));
      if (duplicate) return false;
      addedIds.add(item.providerId);
      item.aliases.forEach(alias => occupiedTitles.add(alias));
      delete item.aliases;
      return true;
    });
    if (items.length) sections.push({ title: group.title, items });
  });
  return [...movieboxSections, ...sections];
}

async function fetchJsonResponse(url, signal) {
  const response = await apiFetch(url, { signal });
  if (!response.ok) throw new Error(`Server merespons ${response.status}`);
  return response.json();
}

const libraryLabels = {
  continue: { title: "Lanjut Nonton", empty: "Mulai putar film atau episode. Posisi terakhir akan muncul di sini." },
  favorites: { title: "Favorit", empty: "Tekan ikon hati pada poster untuk menyimpan tontonan favorit." },
  history: { title: "Riwayat Tontonan", empty: "Film dan serial yang pernah dibuka akan muncul di sini." },
};

function getLibraryItems(mode) {
  if (mode === "continue") return AzuriumStore.getContinue();
  if (mode === "favorites") return AzuriumStore.getFavorites();
  if (mode === "history") return AzuriumStore.getHistory();
  return [];
}

function updateLibraryCounts() {
  elements.continueCount.textContent = AzuriumStore.getContinue().length;
  elements.favoriteCount.textContent = AzuriumStore.getFavorites().length;
  elements.historyCount.textContent = AzuriumStore.getHistory().length;
}

function closeLibrary() {
  state.libraryMode = "";
  elements.libraryPanel.hidden = true;
  document.querySelectorAll(".library-tab").forEach(button => button.classList.remove("active"));
}

function renderLibrary(mode) {
  const config = libraryLabels[mode];
  if (!config) return;
  state.libraryMode = mode;
  const items = getLibraryItems(mode);
  elements.libraryTitle.textContent = config.title;
  elements.libraryGrid.replaceChildren();
  items.forEach(item => elements.libraryGrid.append(createCard(item)));
  elements.libraryEmpty.textContent = config.empty;
  elements.libraryEmpty.hidden = Boolean(items.length);
  elements.libraryGrid.hidden = !items.length;
  elements.clearHistory.hidden = mode !== "history" || !items.length;
  elements.libraryPanel.hidden = false;
  document.querySelectorAll(".library-tab").forEach(button => button.classList.toggle("active", button.dataset.library === mode));
}

function extractSections(data) {
  if (Array.isArray(data.items)) return [{ title: state.query ? `Hasil untuk “${state.query}”` : labels[state.endpoint], items: data.items }];
  return (data.sections || []).filter(section => Array.isArray(section.items) && section.items.length);
}

function renderSections(sections, append = false) {
  if (!append) elements.catalog.replaceChildren();
  elements.catalog.classList.toggle("search-results", Boolean(state.query));
  const compactMobile = matchMedia("(max-width: 700px)").matches && !state.query;
  let sectionsToRender = sections;
  if (!append && compactMobile && sections.length > 6) {
    sectionsToRender = sections.slice(0, 6);
    state.pendingSections = sections.slice(6);
  } else if (!append) {
    state.pendingSections = [];
  }
  let total = 0;
  sectionsToRender.forEach((section, index) => {
    const items = uniqueItems(section.items);
    if (!items.length) return;
    total += items.length;
    const group = document.createElement("section");
    group.className = "collection";
    const head = document.createElement("div");
    head.className = "collection-head";
    const title = document.createElement("h3");
    title.textContent = text(section.title, index === 0 ? labels[state.endpoint] : "Koleksi pilihan");
    head.append(title, document.createElement("span"));
    const grid = document.createElement("div");
    grid.className = "card-grid";
    items.forEach(item => grid.append(createCard(item)));
    group.append(head, grid);
    elements.catalog.append(group);
  });
  const renderedTotal = elements.catalog.querySelectorAll(".movie-card").length;
  elements.count.textContent = renderedTotal ? `${renderedTotal} judul dimuat` : "";
}

function prepareHeroImage(url, highPriority = false) {
  const source = text(url);
  if (!source) return Promise.resolve(null);
  if (heroImageCache.has(source)) return heroImageCache.get(source);
  const promise = new Promise(resolve => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = highPriority ? "high" : "auto";
    image.onload = async () => {
      try { await image.decode(); } catch (_) { /* onload sudah memastikan gambar dapat dipakai. */ }
      resolve(image);
    };
    image.onerror = () => resolve(null);
    image.src = source;
  });
  heroImageCache.set(source, promise);
  return promise;
}

function warmNextHeroImage() {
  const connection = navigator.connection;
  if (heroItems.length < 2 || connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || "")) return;
  const nextItem = heroItems[(heroSlideIndex + 1) % heroItems.length];
  window.setTimeout(() => prepareHeroImage(nextItem?.poster), 700);
}

async function updateHeroDescription(item, request) {
  if (item.desc || (item.source && item.source !== "moviebox")) return;
  try {
    const response = await apiFetch(`${API_BASE}/detail?id=${encodeURIComponent(item.subjectId)}`);
    const result = await response.json();
    if (request === heroDetailRequest && result?.data?.description) elements.heroDesc.textContent = result.data.description;
  } catch (_) { /* Ringkasan cadangan sudah tampil. */ }
}

async function commitHero(item, preparedImage, request) {
  if (request !== heroDetailRequest) return false;
  const wasReady = !elements.hero.classList.contains("hero-loading");
  if (wasReady && preparedImage) {
    elements.hero.classList.add("hero-changing");
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  if (request !== heroDetailRequest) return false;
  if (preparedImage) elements.heroArt.src = preparedImage.currentSrc || preparedImage.src;
  elements.heroTitle.textContent = AzuriumStore.displayTitle(item.name || item.title || "Pilihan hari ini");
  elements.heroMeta.textContent = item.source === "iptv"
    ? `● LIVE  ·  ${text(item.genre, "TV Indonesia")}`
    : [item.year, item.rating ? `★ ${item.rating}` : "", item.country].filter(Boolean).join("  ·  ");
  elements.heroDesc.textContent = text(item.desc, `${text(item.genre, "Film pilihan")} untuk menemani waktu santaimu.`);
  elements.heroPlay.href = watchUrl(item);
  elements.heroPlay.classList.remove("disabled");
  elements.heroInfo.disabled = false;
  elements.heroInfo.onclick = () => { location.href = watchUrl(item); };
  elements.hero.classList.remove("hero-loading");
  requestAnimationFrame(() => elements.hero.classList.remove("hero-changing"));
  warmNextHeroImage();
  startHeroSlider();
  updateHeroDescription(item, request);
  return true;
}

async function showHero(item) {
  if (!item) return;
  const request = ++heroDetailRequest;
  const imagePromise = prepareHeroImage(item.poster, elements.hero.classList.contains("hero-loading"));
  const timeout = new Promise(resolve => window.setTimeout(() => resolve("timeout"), HERO_IMAGE_TIMEOUT));
  const preparedImage = await Promise.race([imagePromise, timeout]);
  if (request !== heroDetailRequest) return;

  if (preparedImage !== "timeout") {
    if (preparedImage || elements.hero.classList.contains("hero-loading")) {
      await commitHero(item, preparedImage, request);
    } else {
      startHeroSlider();
    }
    return;
  }

  if (elements.hero.classList.contains("hero-loading")) await commitHero(item, null, request);
  else startHeroSlider();
  imagePromise.then(image => {
    if (image && request === heroDetailRequest) commitHero(item, image, request);
  });
}

function stopHeroSlider() {
  clearTimeout(heroSlideTimer);
  heroSlideTimer = 0;
}

function startHeroSlider() {
  stopHeroSlider();
  if (!heroIsVisible || heroItems.length < 2 || document.hidden) return;
  heroSlideTimer = window.setTimeout(() => {
    heroSlideTimer = 0;
    selectHeroSlide(heroSlideIndex + 1);
  }, 5000);
}

function setHeroVisibility(isVisible) {
  heroIsVisible = isVisible;
  elements.hero.classList.toggle("hero-paused", !isVisible);
  if (isVisible) startHeroSlider();
  else stopHeroSlider();
}

function selectHeroSlide(index, restart = false) {
  if (!heroItems.length) return;
  if (restart) stopHeroSlider();
  heroSlideIndex = (index + heroItems.length) % heroItems.length;
  showHero(heroItems[heroSlideIndex]);
}

function readHeroCache() {
  try {
    const cache = JSON.parse(localStorage.getItem(HERO_CACHE_KEY) || "{}");
    const entry = cache[state.endpoint];
    if (!entry || Date.now() - Number(entry.savedAt) > HERO_CACHE_TTL || !Array.isArray(entry.items)) return [];
    return entry.items;
  } catch (_) {
    return [];
  }
}

function writeHeroCache(items) {
  if (state.query || state.page !== 1 || !items.length) return;
  try {
    const cache = JSON.parse(localStorage.getItem(HERO_CACHE_KEY) || "{}");
    cache[state.endpoint] = { savedAt: Date.now(), items: items.slice(0, 6) };
    localStorage.setItem(HERO_CACHE_KEY, JSON.stringify(cache));
  } catch (_) { /* Hero tetap bekerja jika penyimpanan browser dibatasi. */ }
}

function setupHeroSlider(items, persistCache = true) {
  stopHeroSlider();
  heroItems = uniqueItems(items).filter(item => item?.subjectId && item?.poster).slice(0, 6);
  if (persistCache) writeHeroCache(heroItems);
  heroSlideIndex = 0;
  selectHeroSlide(0);
}

function setLoading(active, more = false) {
  state.loading = active;
  elements.loadMore.disabled = active;
  if (!more) elements.status.hidden = !active;
  elements.loadMore.textContent = active && more
    ? "Memuat..."
    : state.pendingSections.length
      ? "Lihat koleksi lainnya"
      : "Muat lebih banyak";
}

function showError(message) {
  elements.status.hidden = false;
  elements.status.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = "Koleksi belum berhasil dimuat";
  const copy = document.createElement("p");
  copy.textContent = message;
  const retry = document.createElement("button");
  retry.className = "button button-outline";
  retry.textContent = "Coba lagi";
  retry.onclick = () => loadCatalog(false);
  elements.status.append(title, copy, retry);
}

function hideSuggestions() {
  elements.suggestions.hidden = true;
  elements.suggestions.replaceChildren();
  elements.searchInput.setAttribute("aria-expanded", "false");
}

function renderSuggestions(words) {
  elements.suggestions.replaceChildren();
  words.slice(0, 7).forEach(word => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.setAttribute("role", "option");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"/></svg>';
    const label = document.createElement("span");
    label.textContent = word;
    button.append(label);
    button.addEventListener("click", () => {
      elements.searchInput.value = word;
      elements.searchForm.classList.add("has-value");
      hideSuggestions();
      elements.searchForm.requestSubmit();
    });
    elements.suggestions.append(button);
  });
  elements.suggestions.hidden = !words.length;
  elements.searchInput.setAttribute("aria-expanded", String(Boolean(words.length)));
}

async function fetchSuggestions(query) {
  suggestionController?.abort();
  suggestionController = new AbortController();
  try {
    const suggestionUrl = state.endpoint === "donghua"
      ? `${DONGHUA_API_BASE}/search?q=${encodeURIComponent(query)}&count=7`
      : state.endpoint === "iptv"
        ? `${IPTV_API_BASE}/search?q=${encodeURIComponent(query)}`
        : `${API_BASE}/suggest?q=${encodeURIComponent(query)}`;
    const response = await apiFetch(suggestionUrl, {
      signal: suggestionController.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Saran tidak tersedia");
    const result = await response.json();
    if (elements.searchInput.value.trim() !== query) return;
    const suggestionItems = state.endpoint === "iptv" ? (result.channels || []) : (result.data?.items || providerItems(result));
    const words = suggestionItems.map(item => text(item.word || item.name || item.title)).filter(Boolean);
    renderSuggestions([...new Set(words)]);
  } catch (error) {
    if (error.name !== "AbortError") hideSuggestions();
  }
}

function scheduleSuggestions(query) {
  clearTimeout(suggestionTimer);
  if (query.length < 2) {
    suggestionController?.abort();
    hideSuggestions();
    return;
  }
  suggestionTimer = window.setTimeout(() => fetchSuggestions(query), 280);
}

async function loadCatalog(append = false) {
  if (state.loading && append) return;
  catalogController?.abort();
  catalogController = new AbortController();
  const currentRequest = ++state.requestId;
  setLoading(true, append);
  if (!append) {
    elements.catalog.replaceChildren();
    elements.count.textContent = "";
    state.animeSeenIds.clear();
    state.animeSeenTitles.clear();
  }
  try {
    const animeMode = state.endpoint === "animation";
    const donghuaMode = state.endpoint === "donghua";
    const iptvMode = state.endpoint === "iptv";
    const requests = iptvMode
      ? [fetchJsonResponse(
          state.query
            ? `${IPTV_API_BASE}/search?q=${encodeURIComponent(state.query)}`
            : state.iptvGroup
              ? `${IPTV_API_BASE}/group?g=${encodeURIComponent(state.iptvGroup)}`
              : `${IPTV_API_BASE}/channels`,
          catalogController.signal,
        )]
      : donghuaMode
      ? [fetchJsonResponse(
          state.query
            ? `${DONGHUA_API_BASE}/search?q=${encodeURIComponent(state.query)}&page=${state.page}&count=50`
            : `${DONGHUA_API_BASE}/trending?page=${state.page}&count=50`,
          catalogController.signal,
        )]
      : [fetchJsonResponse(apiUrl(), catalogController.signal)];
    if (iptvMode && !append) requests.push(fetchJsonResponse(`${IPTV_API_BASE}/groups`, catalogController.signal));
    if (donghuaMode && !state.query && !append && state.page === 1) {
      requests.push(fetchJsonResponse(`${DONGHUA_API_BASE}/favorite?page=1&count=50`, catalogController.signal));
      requests.push(fetchJsonResponse(`${DONGHUA_API_BASE}/slide?type=latest`, catalogController.signal));
    }
    if (animeMode) {
      if (state.query) {
        requests.push(fetchJsonResponse(`${ANIME_API_BASE}/search?q=${encodeURIComponent(state.query)}&page=${state.page}`, catalogController.signal));
      } else {
        requests.push(fetchJsonResponse(`${ANIME_API_BASE}/latest?page=${state.page}`, catalogController.signal));
        if (!append && state.page === 1) requests.push(fetchJsonResponse(`${ANIME_API_BASE}/trending?page=1`, catalogController.signal));
      }
    }
    const results = await Promise.allSettled(requests);
    if (results.every(result => result.status === "rejected")) throw results[0].reason;
    if (currentRequest !== state.requestId) return;
    const movieboxData = results[0].status === "fulfilled" ? results[0].value : { items: [] };
    const movieboxSections = donghuaMode || iptvMode ? [] : normalizeMovieboxSections(extractSections(movieboxData));
    let sections = iptvMode ? iptvSections(movieboxData) : donghuaMode ? donghuaSections(results) : movieboxSections;
    if (iptvMode && results[1]?.status === "fulfilled") {
      renderIptvGroupTabs(results[1].value.groups || []);
      sections = iptvSections(movieboxData);
    }
    if (animeMode) {
      const animeGroups = [];
      if (state.query && results[1]?.status === "fulfilled") {
        animeGroups.push({ title: `Hasil Anime untuk “${state.query}”`, items: results[1].value.items || [] });
      } else {
        if (results[1]?.status === "fulfilled") animeGroups.push({ title: "Anime terbaru dari sumber tambahan", items: results[1].value.items || [] });
        if (results[2]?.status === "fulfilled") animeGroups.push({ title: "Anime yang sedang populer", items: results[2].value.items || [] });
      }
      sections = mergeAnimeSections(movieboxSections, animeGroups);
    }
    const allItems = sections.flatMap(section => section.items || []);
    if (!sections.length) throw new Error("Tidak ada judul yang ditemukan.");
    elements.hero.classList.toggle("hero-live", iptvMode);
    renderSections(sections, append);
    if (!append) setupHeroSlider(allItems);
    elements.status.hidden = true;
    elements.loadMore.hidden = Boolean(state.query) || (iptvMode ? state.pendingSections.length === 0 : (allItems.length === 0 && state.pendingSections.length === 0));
  } catch (error) {
    if (error.name === "AbortError") return;
    if (currentRequest === state.requestId && !append) showError(`${error.message} Periksa koneksi lalu coba kembali.`);
  } finally {
    if (currentRequest === state.requestId) setLoading(false, append);
  }
}

document.querySelectorAll(".nav-link").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelector(".nav-link.active")?.classList.remove("active");
    button.classList.add("active");
    state.endpoint = button.dataset.endpoint;
    AzuriumStore.setPreference("lastEndpoint", state.endpoint);
    if (state.endpoint === "tv") AzuriumStore.setPreference("serialEndpoint", "tv");
    if (state.endpoint === "iptv") state.iptvGroup = "";
    elements.searchInput.placeholder = state.endpoint === "iptv" ? "Cari channel TV..." : "Cari film atau serial...";
    closeLibrary();
    state.page = 1;
    state.query = "";
    elements.searchInput.value = "";
    elements.searchForm.classList.remove("has-value", "is-open");
    elements.searchToggle.setAttribute("aria-expanded", "false");
    elements.title.textContent = labels[state.endpoint];
    syncSerialTabs();
    loadCatalog(false);
  });
});

elements.hero.addEventListener("pointerdown", event => {
  if (event.target.closest("a, button")) return;
  heroPointerStart = event.clientX;
  heroPointerId = event.pointerId;
  elements.hero.setPointerCapture?.(event.pointerId);
  elements.hero.classList.add("hero-dragging");
});
elements.hero.addEventListener("pointerup", event => {
  if (heroPointerId !== event.pointerId) return;
  const distance = event.clientX - heroPointerStart;
  heroPointerStart = 0;
  heroPointerId = null;
  elements.hero.classList.remove("hero-dragging");
  if (Math.abs(distance) < 45) return;
  selectHeroSlide(heroSlideIndex + (distance < 0 ? 1 : -1), true);
});
elements.hero.addEventListener("pointercancel", () => {
  heroPointerStart = 0;
  heroPointerId = null;
  elements.hero.classList.remove("hero-dragging");
});
elements.hero.addEventListener("keydown", event => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  selectHeroSlide(heroSlideIndex + (event.key === "ArrowRight" ? 1 : -1), true);
});

elements.serialTabs.querySelectorAll(".catalog-tab").forEach(button => {
  button.addEventListener("click", () => {
    if (state.endpoint === button.dataset.endpoint && !state.query) return;
    state.endpoint = button.dataset.endpoint;
    AzuriumStore.setPreference("lastEndpoint", state.endpoint);
    AzuriumStore.setPreference("serialEndpoint", state.endpoint);
    closeLibrary();
    state.page = 1;
    state.query = "";
    elements.searchInput.value = "";
    elements.searchForm.classList.remove("has-value", "is-open");
    elements.searchToggle.setAttribute("aria-expanded", "false");
    elements.title.textContent = labels[state.endpoint];
    syncSerialTabs();
    loadCatalog(false);
  });
});

elements.searchForm.addEventListener("submit", event => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (!query) return;
  state.query = query;
  state.page = 1;
  closeLibrary();
  hideSuggestions();
  elements.title.textContent = `Hasil pencarian “${query}”`;
  syncSerialTabs();
  loadCatalog(false).then(() => {
    if (matchMedia("(max-width: 700px)").matches) {
      document.querySelector(".catalog-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

elements.searchInput.addEventListener("input", () => {
  const query = elements.searchInput.value.trim();
  elements.searchForm.classList.toggle("has-value", Boolean(query));
  scheduleSuggestions(query);
});
elements.searchInput.addEventListener("focus", () => {
  elements.searchForm.classList.add("is-open");
  elements.searchToggle.setAttribute("aria-expanded", "true");
  scheduleSuggestions(elements.searchInput.value.trim());
});
elements.searchInput.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.searchInput.value) {
    elements.searchForm.classList.remove("is-open");
    elements.searchToggle.setAttribute("aria-expanded", "false");
    elements.searchInput.blur();
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
});
elements.searchToggle.addEventListener("click", () => {
  const isOpen = elements.searchForm.classList.contains("is-open");
  if (!isOpen) {
    elements.searchForm.classList.add("is-open");
    elements.searchToggle.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => elements.searchInput.focus());
    return;
  }
  if (elements.searchInput.value.trim()) {
    elements.searchForm.requestSubmit();
  } else {
    elements.searchInput.focus();
  }
});
elements.clearSearch.addEventListener("click", () => {
  elements.searchInput.value = "";
  hideSuggestions();
  elements.searchForm.classList.remove("has-value");
  if (state.query) {
    state.query = "";
    state.page = 1;
    elements.title.textContent = labels[state.endpoint];
    syncSerialTabs();
    loadCatalog(false);
  }
  elements.searchInput.focus();
});

document.querySelectorAll(".library-tab").forEach(button => {
  button.addEventListener("click", () => {
    if (state.libraryMode === button.dataset.library && !elements.libraryPanel.hidden) {
      closeLibrary();
      return;
    }
    renderLibrary(button.dataset.library);
  });
});

elements.closeLibrary.addEventListener("click", closeLibrary);
elements.clearHistory.addEventListener("click", () => {
  if (!window.confirm("Hapus seluruh riwayat tontonan di perangkat ini?")) return;
  AzuriumStore.clearHistory();
});

window.addEventListener("azurium:librarychange", () => {
  updateLibraryCounts();
  if (state.libraryMode && !elements.libraryPanel.hidden) renderLibrary(state.libraryMode);
});

function refreshLibraryFromStorage() {
  AzuriumStore.reload();
  updateLibraryCounts();
  if (state.libraryMode && !elements.libraryPanel.hidden) renderLibrary(state.libraryMode);
  document.querySelectorAll(".movie-card").forEach(card => {
    const favorite = card.querySelector(".favorite-chip");
    const link = card.querySelector(".card-link");
    if (!favorite || !link) return;
    const linkUrl = new URL(link.href, location.href);
    const id = linkUrl.searchParams.get("id");
    const source = linkUrl.pathname.endsWith("/live.html") ? "iptv" : (linkUrl.searchParams.get("source") || "moviebox");
    const favoriteId = source === "moviebox" ? id : `${source}:${id}`;
    favorite.classList.toggle("active", AzuriumStore.isFavorite(favoriteId));
  });
}

window.addEventListener("pageshow", refreshLibraryFromStorage);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    refreshLibraryFromStorage();
    if (heroIsVisible) startHeroSlider();
  } else stopHeroSlider();
});

if ("IntersectionObserver" in window) {
  const heroObserver = new IntersectionObserver(entries => {
    setHeroVisibility(Boolean(entries[0]?.isIntersecting));
  }, { threshold: 0.08 });
  heroObserver.observe(elements.hero);
}

document.addEventListener("pointerdown", event => {
  if (!elements.searchForm.contains(event.target)) hideSuggestions();
});

elements.loadMore.addEventListener("click", () => {
  if (state.pendingSections.length) {
    const remaining = state.pendingSections;
    state.pendingSections = [];
    renderSections(remaining, true);
    elements.loadMore.textContent = "Muat halaman berikutnya";
    if (state.endpoint === "iptv") elements.loadMore.hidden = true;
    return;
  }
  state.page += 1;
  loadCatalog(true);
});

function restoreNavigation() {
  const preferences = AzuriumStore.getPreferences();
  const requestedEndpoint = new URLSearchParams(location.search).get("category");
  const savedEndpoint = labels[requestedEndpoint] ? requestedEndpoint : labels[preferences.lastEndpoint] ? preferences.lastEndpoint : "movies";
  state.endpoint = savedEndpoint === "tv" && preferences.serialEndpoint === "tvshows" ? "tvshows" : savedEndpoint;
  const mainEndpoint = ["tv", "tvshows"].includes(state.endpoint) ? "tv" : state.endpoint;
  document.querySelectorAll(".nav-link").forEach(button => button.classList.toggle("active", button.dataset.endpoint === mainEndpoint));
  elements.title.textContent = labels[state.endpoint];
  elements.searchInput.placeholder = state.endpoint === "iptv" ? "Cari channel TV..." : "Cari film atau serial...";
}

async function startApp() {
  keepCatalogPortrait();
  restoreNavigation();
  updateLibraryCounts();
  syncSerialTabs();
  const cachedHero = readHeroCache();
  if (cachedHero.length) setupHeroSlider(cachedHero, false);
  await window.AzuriumAccess?.ready();
  loadCatalog();
}

startApp();
window.addEventListener("pageshow", keepCatalogPortrait);
