(() => {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  if (matchMedia("(display-mode: standalone)").matches) document.documentElement.classList.add("app-installed");
})();
