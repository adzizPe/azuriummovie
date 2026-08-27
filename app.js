const API_BASE = "/api/moviebox";

const state = {
  endpoint: "movies",
  page: 1,
  query: "",
  loading: false,
  requestId: 0,
  pendingSections: [],
};

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
  hero: document.querySelector("#hero"),
  heroArt: document.querySelector("#heroArt"),
  heroTitle: document.querySelector("#heroTitle"),
  heroMeta: document.querySelector("#heroMeta"),
  heroDesc: document.querySelector("#heroDesc"),
  heroPlay: document.querySelector("#heroPlay"),
  heroInfo: document.querySelector("#heroInfo"),
};

const labels = { movies: "Film untukmu", tv: "Serial pilihan", animation: "Dunia animasi", kids: "Pilihan keluarga" };

function apiUrl() {
  if (state.query) return `${API_BASE}/search?q=${encodeURIComponent(state.query)}&page=${state.page}`;
  return `${API_BASE}/${state.endpoint}?page=${state.page}`;
}

function watchUrl(item) {
  return `watch.html?id=${encodeURIComponent(item.subjectId)}&type=${encodeURIComponent(item.type || 1)}`;
}

function text(value, fallback = "") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function createCard(item) {
  const link = document.createElement("a");
  link.className = "movie-card";
  link.href = watchUrl(item);
  link.setAttribute("aria-label", `Putar ${text(item.name, "film")}`);

  const poster = document.createElement("div");
  poster.className = "poster-wrap";
  const image = document.createElement("img");
  image.src = text(item.poster);
  image.alt = `Poster ${text(item.name, "film")}`;
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => { image.style.opacity = ".15"; });

  const rating = document.createElement("span");
  rating.className = "card-rating";
  rating.innerHTML = `<b>★</b> ${text(item.rating, "—")}`;

  const play = document.createElement("span");
  play.className = "play-chip";
  play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>';
  poster.append(image, rating, play);

  const copy = document.createElement("div");
  copy.className = "card-copy";
  const heading = document.createElement("h4");
  heading.textContent = text(item.name, "Tanpa judul");
  const meta = document.createElement("p");
  meta.textContent = [text(item.year), text(item.genre).split(",")[0]].filter(Boolean).join("  ·  ");
  copy.append(heading, meta);
  link.append(poster, copy);
  return link;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => item?.subjectId && !seen.has(item.subjectId) && seen.add(item.subjectId));
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

async function showHero(item) {
  if (!item) return;
  elements.heroArt.style.backgroundImage = `url("${text(item.poster).replaceAll('"', '%22')}")`;
  elements.heroTitle.textContent = text(item.name, "Pilihan hari ini");
  elements.heroMeta.textContent = [item.year, item.rating ? `★ ${item.rating}` : "", item.country].filter(Boolean).join("  ·  ");
  elements.heroDesc.textContent = text(item.desc, `${text(item.genre, "Film pilihan")} untuk menemani waktu santaimu.`);
  elements.heroPlay.href = watchUrl(item);
  elements.heroPlay.classList.remove("disabled");
  elements.heroInfo.disabled = false;
  elements.heroInfo.onclick = () => { location.href = watchUrl(item); };
  elements.hero.classList.remove("hero-loading");

  if (!item.desc) {
    try {
      const response = await fetch(`${API_BASE}/detail?id=${encodeURIComponent(item.subjectId)}`);
      const result = await response.json();
      if (result?.data?.description) elements.heroDesc.textContent = result.data.description;
    } catch (_) { /* Ringkasan cadangan sudah tampil. */ }
  }
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

async function loadCatalog(append = false) {
  if (state.loading) return;
  const currentRequest = ++state.requestId;
  setLoading(true, append);
  if (!append) {
    elements.catalog.replaceChildren();
    elements.count.textContent = "";
  }
  try {
    const response = await fetch(apiUrl());
    if (!response.ok) throw new Error(`Server merespons ${response.status}`);
    const data = await response.json();
    if (currentRequest !== state.requestId) return;
    const sections = extractSections(data);
    const allItems = sections.flatMap(section => section.items || []);
    if (!sections.length) throw new Error("Tidak ada judul yang ditemukan.");
    renderSections(sections, append);
    if (!append) showHero(allItems[0]);
    elements.status.hidden = true;
    elements.loadMore.hidden = Boolean(state.query) || (allItems.length === 0 && state.pendingSections.length === 0);
  } catch (error) {
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
    state.page = 1;
    state.query = "";
    elements.searchInput.value = "";
    elements.searchForm.classList.remove("has-value", "is-open");
    elements.searchToggle.setAttribute("aria-expanded", "false");
    elements.title.textContent = labels[state.endpoint];
    loadCatalog(false);
  });
});

elements.searchForm.addEventListener("submit", event => {
  event.preventDefault();
  const query = elements.searchInput.value.trim();
  if (!query) return;
  state.query = query;
  state.page = 1;
  elements.title.textContent = `Hasil pencarian “${query}”`;
  loadCatalog(false).then(() => {
    if (matchMedia("(max-width: 700px)").matches) {
      document.querySelector(".catalog-shell").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});

elements.searchInput.addEventListener("input", () => elements.searchForm.classList.toggle("has-value", Boolean(elements.searchInput.value)));
elements.searchInput.addEventListener("focus", () => {
  elements.searchForm.classList.add("is-open");
  elements.searchToggle.setAttribute("aria-expanded", "true");
});
elements.searchInput.addEventListener("keydown", event => {
  if (event.key === "Escape" && !elements.searchInput.value) {
    elements.searchForm.classList.remove("is-open");
    elements.searchToggle.setAttribute("aria-expanded", "false");
    elements.searchInput.blur();
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
  elements.searchForm.classList.remove("has-value");
  if (state.query) {
    state.query = "";
    state.page = 1;
    elements.title.textContent = labels[state.endpoint];
    loadCatalog(false);
  }
  elements.searchInput.focus();
});
elements.loadMore.addEventListener("click", () => {
  if (state.pendingSections.length) {
    const remaining = state.pendingSections;
    state.pendingSections = [];
    renderSections(remaining, true);
    elements.loadMore.textContent = "Muat halaman berikutnya";
    return;
  }
  state.page += 1;
  loadCatalog(true);
});

loadCatalog();
