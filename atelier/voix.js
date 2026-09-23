// LA VOIX DE LA MAISON, jugée par le code.
//
// Règle 5 : français courant, aucun « je », aucune tournure négative, peu de jargon,
// le client d'abord. Aucune mention du CPF. Le modèle rédige ; ce fichier refuse.

const REGLES = [
  [/(^|[\s«(])(je|j['’])(?=[\s\w])/i, '« je » : la maison parle au client, pas d’elle-même'],
  [/\b(ne|n['’])\s*(?:\S+\s+){0,3}?(pas|plus|jamais|rien|guère|personne)\b/i, 'tournure négative (ne… pas, ne… plus, ne… jamais…)'],
  [/\b(aucun|aucune|jamais|nullement)\b/i, 'tournure négative (aucun, jamais…)'],
  [/\bCPF\b|compte personnel de formation/i, 'mention du CPF'],
  [/\b(synergie|disruptif|disruptive|scalable|best[- ]in[- ]class|game[- ]changer|leverage)\b/i, 'jargon'],
];

// Les pages légales citent des textes de loi : elles échappent aux règles de style,
// jamais à celle du CPF.
export function controlerVoix(texte, { legal = false } = {}) {
  const fautes = [];
  const t = String(texte || '');
  for (const [motif, raison] of REGLES) {
    if (legal && raison !== 'mention du CPF') continue;
    const m = t.match(motif);
    if (m) fautes.push(`${raison} : « ${t.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20).trim()} »`);
  }
  return fautes;
}

// Le texte visible d'une page HTML : ce que lit le client, sans balises ni scripts.
export function texteVisible(html) {
  return String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
