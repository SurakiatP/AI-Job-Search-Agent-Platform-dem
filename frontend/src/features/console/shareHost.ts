/** The server may only know its loopback address (`http://127.0.0.1:8011`). When the page is opened through another host
 * (a domain or LAN IP), show that host so the snippets can be copied and used from the same place. A configured public
 * address (anything that is not loopback) is kept as is. */
export function shareForThisHost(origin: string | null, page: Pick<Location, 'hostname'>): string | null {
  if (!origin) return origin;
  try {
    const url = new URL(origin);
    const loopback = /^(127\.|localhost$|\[?::1\]?$|0\.0\.0\.0$)/.test(url.hostname);
    const pageLoopback = /^(127\.|localhost$|\[?::1\]?$)/.test(page.hostname);
    if (!loopback || pageLoopback) return origin;
    url.hostname = page.hostname;
    return url.origin;
  } catch { return origin; }
}

