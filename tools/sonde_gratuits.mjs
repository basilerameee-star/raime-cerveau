// Pourquoi les modèles gratuits rendent-ils zéro mesure ? On le demande au fournisseur.
// Un appel minuscule par modèle, et on lit la réponse telle qu'elle vient.
const MODELES = [
  'minimax/minimax-m3:free',
  'deepseek/deepseek-v4-flash-0731:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3.5-lightning:free',
  'z-ai/glm-5.2:free',
];
const cle = process.env.OPENROUTER_API_KEY;
for (const m of MODELES) {
  const t0 = Date.now();
  try {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: m, messages: [{ role: 'user', content: 'Réponds par le seul mot : oui' }], max_tokens: 10 }),
    });
    const d = await r.json();
    const texte = d.choices?.[0]?.message?.content?.trim();
    console.log(`${m.padEnd(40)} ${r.status} ${texte ? `« ${texte} »` : JSON.stringify(d.error || d).slice(0, 160)} · ${Date.now() - t0} ms`);
  } catch (e) {
    console.log(`${m.padEnd(40)} injoignable : ${e.message}`);
  }
}
