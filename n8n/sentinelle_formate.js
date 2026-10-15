// La Sentinelle (14/10/2026), nœud « Formate alerte » ; posé par n8n/poser_envois.py. Chaque ligne est un problème que
// Basile peut régler, et chacune ne part qu'une fois (n8n/sentinelle_diagnostic.sql). Le destinataire vient de la base
// (send_config.test_to) : aucune adresse personnelle dans le dépôt.
const rows = $input.all().map((i) => i.json).filter((r) => r && r.probleme);
if (!rows.length) return [];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pour = (rows.find((r) => r.pour) || {}).pour || 'contact@raime.fr';
const liste = rows.map((r) => '- ' + esc(r.probleme)).join('<br>');
const html = '<div style="font-family:sans-serif;font-size:14px;line-height:1.5;color:#111"><b>Sentinelle rAIme : à régler</b><br><br>' + liste
  + '<br><br><span style="color:#888;font-size:12px">Chaque alerte ne part qu’une fois. Ce qui ne demande rien de toi est dans le rapport de 7 h 30.</span></div>';
return [{ json: { email_body: { from: 'Sentinelle rAIme <contact@raime.fr>', to: [pour], subject: '⚠️ rAIme - à régler (' + rows.length + ')', html } } }];
