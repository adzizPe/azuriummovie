(() => {
  "use strict";

  const STORAGE_KEY = "ozancicakmovie:user-library:v1";
  const MAX_HISTORY = 60;
  const MAX_PROGRESS = 30;
  const TITLE_ALIASES = new Map([
    ["levitating", "Para Perasuk"],
    ["hantu dalam sel", "Ghost In The Cell"],
    ["wait for me to be successful later", "Tunggu Aku Sukses Nanti"],
  ]);
  const defaults = {
    favorites: [],
    history: [],
    progress: [],
    preferences: {
      quality: "",
      subtitle: "id",
      volume: 1,
      autoplay: true,
      lastEndpoint: "movies",
      serialEndpoint: "tv",
    },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || typeof saved !== "object") return clone(defaults);
      return {
        favorites: Array.isArray(saved.favorites) ? saved.favorites : [],
        history: Array.isArray(saved.history) ? saved.history : [],
        progress: Array.isArray(saved.progress) ? saved.progress : [],
        preferences: { ...defaults.preferences, ...(saved.preferences || {}) },
      };
    } catch (_) {
      return clone(defaults);
    }
  }

  let state = read();

  function displayTitle(value) {
    const original = String(value || "Tanpa judul").trim();
    return TITLE_ALIASES.get(original.toLocaleLowerCase("id-ID")) || original;
  }

  function reload() {
    state = read();
    return clone(state);
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) { /* Website tetap bisa digunakan jika penyimpanan browser diblokir. */ }
    window.dispatchEvent(new CustomEvent("ozan:librarychange"));
  }

  function normalizeItem(item = {}) {
    const subjectId = String(item.subjectId || item.id || "");
    return {
      subjectId,
      providerId: String(item.providerId || item.id || subjectId.replace(/^anime:/, "")),
      source: String(item.source || (subjectId.startsWith("anime:") ? "anime" : "moviebox")),
      name: displayTitle(item.name || item.title),
      type: Number(item.type || item.subjectType) || 1,
      poster: String(item.poster || item.cover?.url || ""),
      year: String(item.year || item.releaseDate || "").slice(0, 4),
      genre: String(item.genre || ""),
    };
  }

  function upsert(list, entry, key, limit) {
    const filtered = list.filter(item => key(item) !== key(entry));
    return [entry, ...filtered].slice(0, limit);
  }

  function isFavorite(subjectId) {
    return state.favorites.some(item => item.subjectId === String(subjectId));
  }

  function toggleFavorite(item) {
    const normalized = normalizeItem(item);
    if (!normalized.subjectId) return false;
    if (isFavorite(normalized.subjectId)) {
      state.favorites = state.favorites.filter(entry => entry.subjectId !== normalized.subjectId);
      persist();
      return false;
    }
    state.favorites = upsert(state.favorites, { ...normalized, savedAt: Date.now() }, entry => entry.subjectId, 80);
    persist();
    return true;
  }

  function getFavorites() {
    return clone(state.favorites);
  }

  function recordHistory(item, playback = {}) {
    const normalized = normalizeItem(item);
    if (!normalized.subjectId) return;
    const entry = {
      ...normalized,
      season: Number(playback.season) || 0,
      episode: Number(playback.episode) || 0,
      episodeId: String(playback.episodeId || ""),
      episodeLabel: String(playback.episodeLabel || ""),
      watchedAt: Date.now(),
    };
    state.history = upsert(state.history, entry, value => value.subjectId, MAX_HISTORY);
    persist();
  }

  function getHistory() {
    return clone(state.history);
  }

  function clearHistory() {
    state.history = [];
    persist();
  }

  function progressKey(item) {
    return `${item.subjectId}:${Number(item.season) || 0}:${Number(item.episode) || 0}`;
  }

  function saveProgress(item, playback = {}) {
    const normalized = normalizeItem(item);
    if (!normalized.subjectId) return;
    const currentTime = Math.max(0, Number(playback.currentTime) || 0);
    const duration = Math.max(0, Number(playback.duration) || 0);
    const entry = {
      ...normalized,
      season: Number(playback.season) || 0,
      episode: Number(playback.episode) || 0,
      episodeId: String(playback.episodeId || ""),
      episodeLabel: String(playback.episodeLabel || ""),
      currentTime,
      duration,
      updatedAt: Date.now(),
    };
    const completed = duration > 0 && (currentTime / duration >= 0.95 || (duration > 900 && duration - currentTime < 45));
    if (completed) {
      state.progress = state.progress.filter(value => progressKey(value) !== progressKey(entry));
    } else if (currentTime >= 1 || playback.started === true) {
      state.progress = upsert(state.progress, entry, progressKey, MAX_PROGRESS);
    }
    persist();
  }

  function getProgress(subjectId, season = 0, episode = 0) {
    const key = `${String(subjectId)}:${Number(season) || 0}:${Number(episode) || 0}`;
    const found = state.progress.find(item => progressKey(item) === key);
    return found ? clone(found) : null;
  }

  function getLatestProgress(subjectId) {
    const found = state.progress
      .filter(item => item.subjectId === String(subjectId))
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))[0];
    return found ? clone(found) : null;
  }

  function getContinue() {
    const latestByTitle = new Map();
    [...state.progress]
      .sort((a, b) => Number(b.updatedAt) - Number(a.updatedAt))
      .forEach(item => {
        if (!latestByTitle.has(item.subjectId)) latestByTitle.set(item.subjectId, item);
      });
    return clone([...latestByTitle.values()].slice(0, 18));
  }

  function removeProgress(subjectId, season = 0, episode = 0) {
    const key = `${String(subjectId)}:${Number(season) || 0}:${Number(episode) || 0}`;
    state.progress = state.progress.filter(item => progressKey(item) !== key);
    persist();
  }

  function getPreferences() {
    return clone(state.preferences);
  }

  function setPreference(name, value) {
    if (!(name in defaults.preferences)) return;
    state.preferences[name] = value;
    persist();
  }

  window.OzanStore = {
    displayTitle,
    reload,
    normalizeItem,
    isFavorite,
    toggleFavorite,
    getFavorites,
    recordHistory,
    getHistory,
    clearHistory,
    saveProgress,
    getProgress,
    getLatestProgress,
    getContinue,
    removeProgress,
    getPreferences,
    setPreference,
  };

  window.addEventListener("storage", event => {
    if (event.key !== STORAGE_KEY) return;
    reload();
    window.dispatchEvent(new CustomEvent("ozan:librarychange"));
  });
})();
