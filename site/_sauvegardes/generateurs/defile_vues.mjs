// Vues successives en defilant (fond fixe compris) + releve des textes visibles
// pour mesurer le contraste sur les vrais pixels.
// usage : node defile_vues.mjs <url> <prefixe>   (env : L, H, DSF, PAS)
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, prefixe = "dv"] = process.argv.slice(2);
const L = Number(process.env.L || 1340), H = Number(process.env.H || 760), DSF = Number(process.env.DSF || 1), PAS = Number(process.env.PAS || 640);
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=9343", "--hide-scrollbars",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, `--window-size=${L},${H}`, "--no-first-run", "about:blank"], { stdio: "ignore" });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
let cible; for (let i = 0; i < 40 && !cible; i++) { await pause(250); try { cible = (await (await fetch("http://127.0.0.1:9343/json/list")).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(cible.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const att = new Map(); ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id && att.has(d.id)) { att.get(d.id)(d); att.delete(d.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const n = ++id; att.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const ev = async (x) => (await cdp("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;
await cdp("Page.enable"); await cdp("Emulation.setDeviceMetricsOverride", { width: L, height: H, deviceScaleFactor: DSF, mobile: L < 700 });
await cdp("Page.navigate", { url }); await pause(3500);
await ev(readFileSync(new URL("./tout_voir.js", import.meta.url), "utf-8"));
const total = await ev("document.documentElement.scrollHeight");
const vues = [];
for (let y = 0, i = 0; y < total; y += PAS, i++) {
  await ev(`scrollTo({top:${y},behavior:'instant'})`); await pause(450);
  const s = await cdp("Page.captureScreenshot", { format: "png" });
  const nom = `${prefixe}_${String(i).padStart(2, "0")}.png`; writeFileSync(nom, Buffer.from(s.result.data, "base64"));
  // textes entierement visibles : feuilles de texte, avec leur couleur et leur taille
  const textes = await ev(`(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const e = n.parentElement;
      const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || +cs.opacity === 0 || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || e.closest('.shimmer')) continue;
      const rg = document.createRange(); rg.selectNodeContents(n); const r = rg.getBoundingClientRect();
      if (r.width < 4 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
      out.push({ t: n.textContent.trim().slice(0, 40), c: cs.color, fs: parseFloat(cs.fontSize), fw: +cs.fontWeight, x: r.left, y: r.top, w: r.width, h: r.height }); }
    return out; })()`);
  vues.push({ nom, y, textes });
}
writeFileSync(`${prefixe}_textes.json`, JSON.stringify({ DSF, vues }));
console.log(vues.length, "vues");
ws.close(); chrome.kill();
