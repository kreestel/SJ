/** Compare exact origins; do not trust forwarded headers or wildcard domains. */
export function isAllowedOrigin(request: Request, configuredUrl?: string) {
  const origin = request.headers.get('origin');
  // Browser fetch metadata also protects requests that omit Origin.
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  if (!origin) return true;
  let incoming: URL;
  try { incoming = new URL(origin); } catch { return false; }
  if (!['http:', 'https:'].includes(incoming.protocol) || incoming.origin !== origin) return false;

  // The deployment serving this page is valid even if APP_URL still names
  // localhost, a previous deployment, or the production alias.
  const allowed = new Set([new URL(request.url).origin]);
  if (configuredUrl?.trim()) {
    try {
      const configured = new URL(configuredUrl.trim());
      if (['http:', 'https:'].includes(configured.protocol)) allowed.add(configured.origin);
    } catch { /* A bad display URL must not break same-origin app requests. */ }
  }
  return allowed.has(origin);
}
