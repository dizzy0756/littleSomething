// Cloudflare Pages Function (catch-all).
//
// Proxies API-backed routes to the Render backend so the public surprise links
// work on the Cloudflare (branded) origin, not just the API domain. See
// CODE_AUDIT.md C3.
//
//   /s/*        -> server-rendered surprise pages (the core deliverable)
//   /api/*      -> REST API
//   /uploads/*  -> locally-stored media fallback
//   /templates/*-> template CSS
//
// Stock media (/assets/*) is served from this build's static output, so it is
// intentionally NOT proxied.
//
// API_BASE_URL is set as a Pages environment variable (dashboard).

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const API_BASE = (env.API_BASE_URL || "https://api.littlesomething.app").replace(/\/$/, "");
  const PROXIED_PREFIXES = ["/s/", "/api/", "/uploads/", "/templates/"];

  const isProxied = PROXIED_PREFIXES.some((p) => url.pathname.startsWith(p));

  if (isProxied) {
    const target = new URL(url.pathname + url.search, API_BASE);

    // Forward method, body and headers (minus host, which fetch sets itself).
    const headers = new Headers();
    for (const [key, value] of request.headers.entries()) {
      if (key.toLowerCase() === "host") continue;
      headers.set(key, value);
    }

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstream = await fetch(target.toString(), init);
    return new Response(upstream.body, upstream);
  }

  // Everything else (static assets, marketing pages) is served from the build.
  return env.ASSETS.fetch(request);
}
