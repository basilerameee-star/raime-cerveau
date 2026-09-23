// Pourquoi le Héraut rend-il parfois un message vide ? On regarde la réponse brute
// du fournisseur, pas notre interprétation : motif d'arrêt, jetons, champs remplis.
const cle = process.env.OPENROUTER_API_KEY;
const modele = process.argv[2] || 'deepseek/deepseek-v4-flash-0731';
const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: modele,
    messages: [
      { role: 'system', content: 'Tu rédiges un courriel de premier contact professionnel, en français, signé Basile Ramé, rAIme, raime.fr. Le message fait entre 250 et 1300 caractères et pose une question.' },
      { role: 'user', content: 'Destinataire : Cabinet Berthier & Associés, expertise comptable, Annecy. Rédige le courriel.' },
    ],
    max_tokens: 1500, temperature: 0.4,
  }),
});
const d = await r.json();
const m = d.choices?.[0]?.message || {};
console.log('statut HTTP       :', r.status);
console.log('modèle rendu      :', d.model);
console.log('motif d’arrêt     :', d.choices?.[0]?.finish_reason, '/', d.choices?.[0]?.native_finish_reason);
console.log('champs du message :', Object.keys(m).join(', '));
console.log('content           :', (m.content || '').length, 'caractères');
console.log('reasoning         :', (m.reasoning || '').length, 'caractères');
console.log('jetons            :', JSON.stringify(d.usage || {}));
if (d.error) console.log('erreur            :', JSON.stringify(d.error).slice(0, 300));
console.log('\n--- début du contenu ---\n', (m.content || m.reasoning || '(rien)').slice(0, 400));
