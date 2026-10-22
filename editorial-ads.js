// Only the public, static editorial page is eligible. No ads on token/player screens.
(() => {
  if (!["/", "/panduan.html"].includes(location.pathname) || !navigator.onLine) return;
  const article = document.getElementById("editorial-content");
  if (!article || article.hidden || article.innerText.trim().length < 3000) return;
  if (document.querySelector('script[src*="pagead2.googlesyndication.com"]')) return;
  const script = document.createElement("script");
  script.async = true;
  script.crossOrigin = "anonymous";
  script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8957974802215246";
  document.head.append(script);
})();
