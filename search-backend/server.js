import http from "node:http";
import { URL } from "node:url";

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const UA = "NaraWebSearch/1.0 (+https://github.com/hernandesslr-svg/NARA-IA)";

function send(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": ALLOWED_ORIGIN,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(data));
}
function stripHtml(s = "") {
  return String(s).replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ").trim();
}
function safeUrl(href, base) {
  try { const u = new URL(href, base); return /^https?:$/.test(u.protocol) ? u.href : ""; } catch { return ""; }
}
function extractDuck(html) {
  const results = [];
  const blocks = html.match(/<div class="result[^"]*"[\\s\\S]*?(?=<div class="result[^"]*"|$)/gi) || [];
  for (const block of blocks) {
    const rawLink = block.match(/class="result__a"[^>]*href="([^"]+)"/i)?.[1];
    const title = stripHtml(block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || "");
    const snippet = stripHtml(block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i)?.[1] || block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    let url = rawLink ? safeUrl(rawLink, "https://html.duckduckgo.com") : "";
    try { const u = new URL(url); if (u.hostname.includes("duckduckgo.com") && u.searchParams.has("uddg")) url = decodeURIComponent(u.searchParams.get("uddg")); } catch {}
    if (title && url && !/duckduckgo\.com/.test(url)) results.push({ title, snippet, url, source: "DuckDuckGo" });
  }
  return results;
}
async function timedFetch(url, ms = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { signal: controller.signal, headers: { "user-agent": UA, "accept": "text/html,application/json,text/plain;q=0.9,*/*;q=0.8" } }); }
  finally { clearTimeout(timer); }
}
async function searchDuck(q) {
  const r = await timedFetch("https://html.duckduckgo.com/html/?q=" + encodeURIComponent(q));
  if (!r.ok) throw new Error("DuckDuckGo HTTP " + r.status);
  const html = await r.text();
  if (/unusual traffic|captcha|anomaly detected/i.test(html)) throw new Error("DuckDuckGo bloqueou a consulta");
  const results = extractDuck(html);
  if (!results.length) throw new Error("DuckDuckGo não retornou resultados legíveis");
  return results.slice(0, 8);
}
async function searchWiki(q) {
  const endpoint = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" + encodeURIComponent(q) + "&format=json&origin=*&srlimit=6";
  const r = await timedFetch(endpoint);
  if (!r.ok) throw new Error("Wikipedia API HTTP " + r.status);
  const data = await r.json();
  return (data?.query?.search || []).map(x => ({
    title: x.title,
    snippet: stripHtml(x.snippet || ""),
    url: "https://en.wikipedia.org/wiki/" + encodeURIComponent(x.title.replace(/ /g, "_")),
    source: "Wikipedia"
  }));
}
async function fetchPage(url) {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Protocolo não permitido");
  if (["localhost", "127.0.0.1", "::1", "0.0.0.0"].includes(parsed.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(parsed.hostname)) throw new Error("Endereço privado não permitido");
  const r = await timedFetch(parsed.href, 10000);
  if (!r.ok) throw new Error("Página HTTP " + r.status);
  const type = r.headers.get("content-type") || "";
  if (!/text\/html|text\/plain|application\/xhtml\+xml/i.test(type)) throw new Error("Tipo de conteúdo não suportado");
  const html = (await r.text()).slice(0, 800000);
  const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || parsed.hostname);
  const text = stripHtml(html).slice(0, 14000);
  return { title, url: parsed.href, content: text };
}
const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, { "access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }); return res.end(); }
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/health") return send(res, 200, { ok: true, service: "nara-web-search", capabilities: ["web-search", "page-reading", "multi-source-fallback"] });
  if (u.pathname === "/search" && req.method === "GET") {
    const q = (u.searchParams.get("q") || "").trim().slice(0, 400);
    if (!q) return send(res, 400, { error: "Informe uma pergunta ou consulta." });
    const errors = [];
    for (const provider of [searchDuck, searchWiki]) {
      try {
        const results = await provider(q);
        if (results.length) return send(res, 200, { ok: true, query: q, provider: results[0].source, results, searchedAt: new Date().toISOString() });
      } catch (e) { errors.push(String(e?.message || e)); }
    }
    return send(res, 502, { ok: false, query: q, error: "As fontes públicas falharam nesta tentativa.", details: errors });
  }
  if (u.pathname === "/read" && req.method === "GET") {
    const target = u.searchParams.get("url") || "";
    try { const page = await fetchPage(target); return send(res, 200, { ok: true, page }); }
    catch (e) { return send(res, 400, { ok: false, error: String(e?.message || e) }); }
  }
  return send(res, 404, { error: "Rota não encontrada." });
});
server.listen(PORT, "0.0.0.0", () => console.log("Nara web search listening on " + PORT));
