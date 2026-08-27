const ALLOWED_ENDPOINTS = new Set([
  "home",
  "movies",
  "tv",
  "animation",
  "kids",
  "tvshows",
  "search",
  "suggest",
  "detail",
  "recommend",
  "season",
  "stream",
  "captions",
]);

const ALLOWED_QUERY_PARAMS = new Set([
  "page",
  "q",
  "id",
  "se",
  "ep",
  "streamId",
]);

const SHORT_CACHE_ENDPOINTS = new Set(["stream", "captions"]);

function jsonResponse(payload, status) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizePath(path) {
  if (Array.isArray(path)) return path.join("/");
  return typeof path === "string" ? path : "";
}

function copySafeQueryParams(source, target) {
  for (const [key, rawValue] of source.searchParams) {
    if (!ALLOWED_QUERY_PARAMS.has(key)) continue;

    const value = rawValue.trim();
    if (!value || value.length > 160) continue;
    if (["page", "se", "ep"].includes(key) && !/^\d{1,4}$/.test(value)) continue;
    if (["id", "streamId"].includes(key) && !/^\d{1,30}$/.test(value)) continue;

    target.searchParams.append(key, value);
  }
}

export async function onRequest(context) {
  if (context.request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const endpoint = normalizePath(context.params.path);
  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return jsonResponse({ error: "Endpoint not found" }, 404);
  }

  const upstreamBase = context.env.MOVIEBOX_API_BASE;
  if (!upstreamBase) {
    return jsonResponse({ error: "Server configuration is incomplete" }, 500);
  }

  let upstreamUrl;
  try {
    const base = new URL(upstreamBase);
    if (base.protocol !== "https:") throw new Error("HTTPS is required");
    upstreamUrl = new URL(`${base.href.replace(/\/$/, "")}/${endpoint}`);
  } catch {
    return jsonResponse({ error: "Server configuration is invalid" }, 500);
  }

  copySafeQueryParams(new URL(context.request.url), upstreamUrl);
  const cacheSeconds = SHORT_CACHE_ENDPOINTS.has(endpoint) ? 30 : 180;

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cf: {
        cacheEverything: true,
        cacheTtl: cacheSeconds,
      },
    });

    if (!upstreamResponse.ok) {
      return jsonResponse(
        { error: "Movie provider is temporarily unavailable" },
        upstreamResponse.status,
      );
    }

    const headers = new Headers({
      "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${cacheSeconds}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers,
    });
  } catch {
    return jsonResponse({ error: "Movie provider could not be reached" }, 502);
  }
}
