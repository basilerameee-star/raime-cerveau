// Modèle de substitution (compatible OpenAI) pour la répétition : il remplace OpenRouter, sans réseau
// ni frais. Il demande l'outil MCP « questions_pour_basile » s'il est proposé, puis rend son résultat.
import http from 'node:http';
import fs from 'node:fs';
const JOURNAL = process.env.JOURNAL || '/dev/null';
const log = (o) => fs.appendFileSync(JOURNAL, JSON.stringify(o) + '\n');
http.createServer(async (req, res) => {
  let b = ''; for await (const c of req) b += c;
  if (req.url.endsWith('/models')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ data: [{ id: 'substitut', context_length: 200000 }] })); }
  let d = {}; try { d = JSON.parse(b || '{}'); } catch {}
  // Le format natif d'Ollama (/api/chat), celui du modèle local du serveur.
  if (req.url === '/api/chat' && !process.env.PANNE) {
    log({ url: req.url, ollama: true, think: d.think, dernier: String(d.messages?.at(-1)?.content || '').slice(-160) });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ model: d.model, message: { role: 'assistant', content: `[${process.env.SIGNE || 'local'}] Réponse du modèle local` }, done: true }));
  }
  // Panne voulue : PANNE=402 imite OpenRouter à crédit épuisé, PANNE=429 un quota gratuit du jour épuisé.
  if (process.env.PANNE && !req.url.endsWith('/models')) {
    log({ url: req.url, panne: Number(process.env.PANNE) });
    res.writeHead(Number(process.env.PANNE), { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: { message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits', code: Number(process.env.PANNE) } }));
  }
  const outils = (d.tools || []).map((t) => t.function?.name || t.name).filter(Boolean);
  const msgs = d.messages || [];
  const systeme = msgs.filter((m) => m.role === 'system').map((m) => typeof m.content === 'string' ? m.content : JSON.stringify(m.content)).join('\n');
  const dernierUser = msgs.map((m) => m.role).lastIndexOf('user');
  const outilRendu = msgs.slice(dernierUser + 1).filter((m) => m.role === 'tool').pop();
  const cible = outils.find((n) => /questions_pour_basile/.test(n));
  log({ noms: outils.join(","), url: req.url, stream: !!d.stream, n_outils: outils.length, cible: cible || null, outil_rendu: !!outilRendu,
    skill_video_vue: /video-wangp/.test(systeme), dernier: String((msgs[dernierUser]?.content) || '').slice(-160) });
  let message;
  const signe = process.env.SIGNE ? `[${process.env.SIGNE}] ` : '';
  if (outilRendu) message = { role: 'assistant', content: signe + 'PREUVE-HERMES ' + String(typeof outilRendu.content === 'string' ? outilRendu.content : JSON.stringify(outilRendu.content)).slice(0, 400) };
  else if (process.env.SANS_OUTIL) message = { role: 'assistant', content: `${signe}Réponse simple` };
  else if (cible) message = { role: 'assistant', content: null, tool_calls: [{ id: 'appel_1', type: 'function', function: { name: cible, arguments: '{}' } }] };
  else if (outils.includes('tool_call')) message = { role: 'assistant', content: null, tool_calls: [{ id: 'appel_1', type: 'function',
    function: { name: 'tool_call', arguments: JSON.stringify({ name: 'mcp__raime__questions_pour_basile', arguments: {} }) } }] };
  else message = { role: 'assistant', content: `${signe}SANS-OUTIL-RAIME (outils proposés : ${outils.length})` };
  const fin = message.tool_calls ? 'tool_calls' : 'stop';
  const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
  if (!d.stream) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: 'x', object: 'chat.completion', created: 0, model: 'substitut', choices: [{ index: 0, message, finish_reason: fin }], usage }));
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const envoyer = (delta, f = null, u) => res.write(`data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', created: 0, model: 'substitut', choices: [{ index: 0, delta, finish_reason: f }], ...(u ? { usage: u } : {}) })}\n\n`);
  envoyer({ role: 'assistant' });
  if (message.tool_calls) envoyer({ tool_calls: [{ index: 0, ...message.tool_calls[0] }] });
  else envoyer({ content: message.content });
  envoyer({}, fin, usage);
  res.end('data: [DONE]\n\n');
}).listen(Number(process.env.PORT || 9999), '127.0.0.1', () => console.log(`substitut prêt :${process.env.PORT || 9999}${process.env.PANNE ? ' (panne ' + process.env.PANNE + ')' : ''}`));
