// Deux remèdes possibles au message vide, mesurés côte à côte :
//   ① couper le raisonnement (reasoning: {enabled:false}) — le modèle écrit tout de suite
//   ② élargir le budget (max_tokens 4000) — le modèle raisonne puis écrit
// On compare longueur du texte, jetons payés et durée.
const cle = process.env.OPENROUTER_API_KEY;
const modele = 'deepseek/deepseek-v4-flash-0731';
const messages = [
  { role: 'system', content: 'Tu rédiges un courriel de premier contact professionnel, en français, signé Basile Ramé, rAIme, raime.fr. Le message fait entre 250 et 1300 caractères et pose une question.' },
  { role: 'user', content: 'Destinataire : Cabinet Berthier & Associés, expertise comptable, Annecy. Rédige le courriel.' },
];

async function essai(nom, corpsSupplementaire) {
  const t0 = Date.now();
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: modele, messages, temperature: 0.4, ...corpsSupplementaire }),
  });
  const d = await r.json();
  const m = d.choices?.[0]?.message || {};
  console.log(`${nom.padEnd(28)} ${String((m.content || '').length).padStart(5)} car. · ` +
    `arrêt ${d.choices?.[0]?.finish_reason} · ${d.usage?.completion_tokens || 0} jetons · ` +
    `${(d.usage?.cost ?? 0).toFixed(6)} $ · ${Date.now() - t0} ms`);
  return m.content || '';
}

const a = await essai('raisonnement coupé', { max_tokens: 1500, reasoning: { enabled: false } });
const b = await essai('budget élargi (4000)', { max_tokens: 4000 });
const c = await essai('tel quel (1500)', { max_tokens: 1500 });

console.log('\n--- texte du remède ① ---\n' + (a || '(vide)').slice(0, 500));
