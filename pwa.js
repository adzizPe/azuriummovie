(() => {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  const installCard = document.querySelector("#installApp");
  const installButton = document.querySelector("#installAppButton");
  const dismissButton = document.querySelector("#dismissInstall");
  let installPrompt = null;

  const hideInstall = () => {
    if (installCard) installCard.hidden = true;
  };

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    installPrompt = event;
    if (installCard && sessionStorage.getItem("ozan-install-dismissed") !== "1") installCard.hidden = false;
  });

  installButton?.addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    hideInstall();
  });

  dismissButton?.addEventListener("click", () => {
    sessionStorage.setItem("ozan-install-dismissed", "1");
    hideInstall();
  });

  window.addEventListener("appinstalled", hideInstall);
  if (matchMedia("(display-mode: standalone)").matches) document.documentElement.classList.add("app-installed");
})();
