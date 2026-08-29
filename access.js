(() => {
  "use strict";

  const TOKEN_KEY = "azuriummovie:access-token:v1";
  const DEVICE_KEY = "azuriummovie:device-id:v1";
  const LEGACY_TOKEN_KEY = "ozancicakmovie:access-token:v1";
  const LEGACY_DEVICE_KEY = "ozancicakmovie:device-id:v1";
  const nativeFetch = window.fetch.bind(window);
  let token = localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "";
  let deviceId = localStorage.getItem(DEVICE_KEY) || localStorage.getItem(LEGACY_DEVICE_KEY) || "";
  if (token && !localStorage.getItem(TOKEN_KEY)) localStorage.setItem(TOKEN_KEY, token);
  if (deviceId && !localStorage.getItem(DEVICE_KEY)) localStorage.setItem(DEVICE_KEY, deviceId);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem(LEGACY_DEVICE_KEY);
  let deviceName = "Perangkat ini";
  let accessInfo = null;
  let gate = createGate();
  let modal;
  let form;
  let input;
  let message;
  let detail;
  let closeButton;
  let changeButton;

  function createGate() {
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    return { promise, resolve, resolved: false };
  }

  function resolveGate() {
    if (gate.resolved) return;
    gate.resolved = true;
    gate.resolve(accessInfo);
  }

  function resetGate() {
    if (!gate.resolved) return;
    gate = createGate();
  }

  function makeDeviceId() {
    if (deviceId) return deviceId;
    if (crypto.randomUUID) {
      deviceId = crypto.randomUUID();
    } else {
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      deviceId = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }
    localStorage.setItem(DEVICE_KEY, deviceId);
    return deviceId;
  }

  function normalizeToken(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 4);
  }

  function labelDevice(model, platform = "Android") {
    const value = String(model || "").trim();
    if (!value) return platform || "Perangkat ini";
    if (/^SM-|SAMSUNG/i.test(value)) return `Samsung ${value}`;
    if (/PIXEL/i.test(value)) return `Google ${value}`;
    if (/REDMI|XIAOMI|\bMI\b/i.test(value)) return `Xiaomi ${value}`;
    if (/POCO/i.test(value)) return `POCO ${value}`;
    if (/INFINIX/i.test(value)) return `Infinix ${value}`;
    if (/TECNO/i.test(value)) return `TECNO ${value}`;
    if (/ONEPLUS/i.test(value)) return `OnePlus ${value}`;
    return `${platform || "Android"} ${value}`.trim();
  }

  async function detectDeviceName() {
    try {
      if (navigator.userAgentData?.getHighEntropyValues) {
        const info = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]);
        const platform = navigator.userAgentData.platform || "Android";
        if (info.model) return labelDevice(info.model, platform);
        return platform;
      }
    } catch (_) { /* Browser dapat menolak data model demi privasi. */ }
    const match = navigator.userAgent.match(/Android\s[^;)]*;\s*([^;)]+?)(?:\sBuild\/|[;)])/i);
    if (match?.[1]) return labelDevice(match[1], "Android");
    if (/iPhone/i.test(navigator.userAgent)) return "Apple iPhone";
    if (/iPad/i.test(navigator.userAgent)) return "Apple iPad";
    return navigator.platform || "Perangkat ini";
  }

  function createUi() {
    if (modal) return;
    modal = document.createElement("div");
    modal.className = "access-gate";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="access-card" role="dialog" aria-modal="true" aria-labelledby="accessTitle">
        <button class="access-close" type="button" aria-label="Tutup" hidden>&times;</button>
        <img src="icons/launchericon-96x96.png" alt="" width="66" height="66">
        <span class="eyebrow muted">AKSES PERANGKAT</span>
        <h2 id="accessTitle">Masukkan token</h2>
        <p class="access-copy">Token cukup dimasukkan satu kali dan akan dikenali di perangkat ini.</p>
        <form class="access-form">
          <label for="accessTokenInput">Token akses</label>
          <input id="accessTokenInput" type="password" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4}" maxlength="4" aria-label="Token akses 4 angka" required>
          <button class="button button-primary" type="submit">Masuk</button>
        </form>
        <p class="access-message" aria-live="polite"></p>
        <div class="access-detail" hidden></div>
        <button class="access-change text-button" type="button" hidden>Ganti atau lepaskan token</button>
      </section>`;
    document.body.append(modal);
    form = modal.querySelector(".access-form");
    input = modal.querySelector("#accessTokenInput");
    message = modal.querySelector(".access-message");
    detail = modal.querySelector(".access-detail");
    closeButton = modal.querySelector(".access-close");
    changeButton = modal.querySelector(".access-change");

    form.addEventListener("submit", activate);
    closeButton.addEventListener("click", hideModal);
    changeButton.addEventListener("click", releaseToken);
  }

  function updateBadges() {
    document.querySelectorAll("[data-access-label]").forEach(label => {
      label.textContent = accessInfo ? token : "Token perangkat";
    });
    document.querySelectorAll("[data-access-device]").forEach(button => {
      button.classList.toggle("is-valid", Boolean(accessInfo));
      button.onclick = showDeviceInfo;
    });
  }

  function showLogin(error = "") {
    createUi();
    modal.hidden = false;
    document.documentElement.classList.add("access-locked");
    form.hidden = false;
    detail.hidden = true;
    closeButton.hidden = true;
    changeButton.hidden = true;
    message.textContent = error;
    message.dataset.tone = error ? "error" : "";
    if (window.matchMedia("(pointer: fine)").matches) {
      requestAnimationFrame(() => input.focus({ preventScroll: true }));
    }
  }

  async function showDeviceInfo() {
    if (!accessInfo) return showLogin();
    deviceName = await detectDeviceName();
    createUi();
    modal.hidden = false;
    document.documentElement.classList.remove("access-locked");
    form.hidden = true;
    message.textContent = "Token sudah tervalidasi pada perangkat ini.";
    message.dataset.tone = "ok";
    detail.hidden = false;
    detail.replaceChildren();
    const caption = document.createElement("span");
    caption.textContent = "Token perangkat";
    const tokenCode = document.createElement("code");
    tokenCode.textContent = token;
    const device = document.createElement("small");
    device.textContent = `Perangkat: ${deviceName}`;
    detail.append(caption, tokenCode, device);
    closeButton.hidden = false;
    changeButton.hidden = false;
  }

  function hideModal() {
    if (!accessInfo) return;
    modal.hidden = true;
  }

  async function callAccess(action, candidate = token) {
    const response = await nativeFetch("/api/access/", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ action, token: normalizeToken(candidate), deviceId: makeDeviceId() }),
    });
    let body = {};
    try { body = await response.json(); } catch (_) { /* Error jaringan/hosting dapat berupa HTML. */ }
    return { response, body };
  }

  async function activate(event) {
    event.preventDefault();
    const candidate = normalizeToken(input.value);
    if (!candidate) return;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Memeriksa...";
    message.textContent = "";
    try {
      const { response, body } = await callAccess("activate", candidate);
      if (!response.ok) throw new Error(body.error || "Token belum dapat divalidasi.");
      token = candidate;
      accessInfo = body;
      localStorage.setItem(TOKEN_KEY, token);
      document.documentElement.classList.remove("access-locked");
      modal.hidden = true;
      updateBadges();
      resolveGate();
    } catch (error) {
      message.textContent = error.message === "Failed to fetch"
        ? "Server validasi tidak dapat dijangkau. Periksa koneksi internet."
        : error.message;
      message.dataset.tone = "error";
    } finally {
      button.disabled = false;
      button.textContent = "Masuk";
    }
  }

  async function releaseToken() {
    changeButton.disabled = true;
    changeButton.textContent = "Melepaskan...";
    try {
      const { response, body } = await callAccess("release");
      if (!response.ok) throw new Error(body.error || "Token belum dapat dilepaskan.");
      token = "";
      accessInfo = null;
      localStorage.removeItem(TOKEN_KEY);
      resetGate();
      updateBadges();
      input.value = "";
      showLogin("Token lama telah dilepaskan dari perangkat ini.");
      message.dataset.tone = "ok";
    } catch (error) {
      message.textContent = error.message;
      message.dataset.tone = "error";
    } finally {
      changeButton.disabled = false;
      changeButton.textContent = "Ganti atau lepaskan token";
    }
  }

  async function validateSavedToken() {
    createUi();
    makeDeviceId();
    deviceName = await detectDeviceName();
    updateBadges();
    if (!token) {
      showLogin();
      return;
    }
    try {
      const { response, body } = await callAccess("status");
      if (!response.ok) {
        token = "";
        localStorage.removeItem(TOKEN_KEY);
        showLogin(body.error || "Token perangkat tidak lagi valid.");
        return;
      }
      accessInfo = body;
      updateBadges();
      resolveGate();
    } catch (_) {
      showLogin("Validasi perangkat memerlukan koneksi internet.");
    }
  }

  async function authorizedFetch(input, options = {}) {
    await gate.promise;
    const url = new URL(input instanceof Request ? input.url : input, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/access")) {
      return nativeFetch(input, options);
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(options.headers || {}).forEach((value, name) => headers.set(name, value));
    headers.set("X-Azurium-Token", token);
    headers.set("X-Azurium-Device", deviceId);
    const response = await nativeFetch(input, { ...options, headers });
    if ([401, 403].includes(response.status)) {
      accessInfo = null;
      token = "";
      localStorage.removeItem(TOKEN_KEY);
      resetGate();
      updateBadges();
      showLogin("Sesi token berakhir. Masukkan kembali token yang valid.");
    }
    return response;
  }

  window.AzuriumAccess = {
    ready: () => gate.promise,
    fetch: authorizedFetch,
    showDeviceInfo,
  };

  validateSavedToken();
})();
