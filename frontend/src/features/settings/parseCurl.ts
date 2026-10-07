export type CurlResult = { baseUrl?: string; credential?: string; model?: string };

// Shell-ish tokenizer: quotes, backslash escapes and backslash-newline continuations.
function tokenize(src: string): string[] {
  const out: string[] = [];
  const s = src.replace(/\\\r?\n/g, ' ');
  let cur = '', has = false, quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote === "'") { if (c === "'") quote = null; else cur += c; continue; }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < s.length && '"\\$`'.includes(s[i + 1])) cur += s[++i];
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; has = true; continue; }
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; has = true; continue; }
    if (/\s/.test(c)) { if (has) { out.push(cur); cur = ''; has = false; } continue; }
    cur += c; has = true;
  }
  if (has) out.push(cur);
  return out;
}

function cleanUrl(raw: string): string | undefined {
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|completions|responses|messages)$/, '');
    return u.origin + path;
  } catch { return undefined; }
}

// Pure and client-only: extracts base URL, API key and model from a pasted curl command.
export function parseCurl(text: string): CurlResult {
  const tokens = tokenize(text);
  const r: CurlResult = {};
  for (let i = 0; i < tokens.length; i++) {
    const a = tokens[i], next = tokens[i + 1];
    if (!r.baseUrl && /^https?:\/\//i.test(a)) r.baseUrl = cleanUrl(a);
    else if ((a === '-H' || a === '--header') && next !== undefined) {
      const m = /^\s*([^:]+):\s*([\s\S]*)$/.exec(next);
      const name = m?.[1].trim().toLowerCase(), value = m?.[2].trim() ?? '';
      if (name === 'authorization') { const b = /^bearer\s+(.+)$/i.exec(value); if (b) r.credential = b[1].trim(); }
      else if ((name === 'x-api-key' || name === 'api-key') && value) r.credential = value;
      i++;
    } else if (/^(-d|--data|--data-raw|--data-binary|--data-ascii|--json)$/.test(a) && next !== undefined) {
      try { const body: unknown = JSON.parse(next); const model = (body as { model?: unknown } | null)?.model; if (typeof model === 'string' && model) r.model = model; } catch { /* not JSON */ }
      i++;
    }
  }
  return r;
}
