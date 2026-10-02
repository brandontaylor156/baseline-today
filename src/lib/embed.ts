// HTML shell for embeddable widgets: tiny, self-contained, light/dark, frameable anywhere.
import { SITE_URL } from "@/lib/site";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#fff;--fg:#141a17;--muted:#5d6b64;--border:#e2e7e4;--accent:#1f7a4d;--bar:#e9eeeb}
@media (prefers-color-scheme:dark){:root{--bg:#121816;--fg:#e8eeeb;--muted:#9aa8a1;--border:#26302c;--accent:#5fd08f;--bar:#1f2925}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.w{padding:12px 14px;border:1px solid var(--border);border-radius:12px}h1{font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
ol{list-style:none;margin:0;padding:0}li{display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid var(--border)}li:first-child{border-top:0}
.n{width:22px;text-align:right;color:var(--muted);font-variant-numeric:tabular-nums}.name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.v{font-weight:600;font-variant-numeric:tabular-nums}.bar{width:60px;height:6px;border-radius:3px;background:var(--bar);overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}
a{color:inherit;text-decoration:none}a:hover{text-decoration:underline}.f{margin-top:8px;font-size:11px;color:var(--muted)}.f a{color:var(--accent)}`;

export function embedPage(title: string, body: string, link: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="w">${body}<p class="f">From <a href="${esc(link)}" target="_blank" rel="noopener">Baseline Today</a> · estimates, not betting advice</p></div></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors *",
      "Cache-Control": "public, max-age=0, s-maxage=900, stale-while-revalidate=86400",
    },
  });
}

export const siteLink = (path: string) => `${SITE_URL}${path}`;
