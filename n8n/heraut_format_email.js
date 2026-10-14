// L'e-mail de 7 h 30 (refait le 08/10/2026) : d'abord le rapport du Cockpit (relances du jour, direction, trading,
// bourse, pensée), puis seulement ce qui est vivant : les alertes du Gardien (24 h) et l'inventaire du mois. Retirés :
// Vigie et Auditeur (éteints), Athena, radar, les compteurs de l'ancien envoi (en pause depuis le 04/09) et le lien Metabase.
// 08/10/2026 : une partie marquée « rouge » par le Cockpit (les ordres en retard, jarvis/ordres_retard.cjs) s'écrit en rouge.
// Ce code est versionné dans le dépôt (n8n/heraut_format_email.js) et posé dans n8n par n8n/poser_veilleurs.py.
let c = null; try { c = await this.helpers.httpRequest({ url: 'http://cockpit:8090/api/rapport', json: true, timeout: 15000 }); } catch (e) {}
const raw = ($('Digest').first()||{json:{}}).json.digest;
const d = (typeof raw==='string')?JSON.parse(raw):(raw||{});
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const titre=(t,couleur)=>'<h3 style="color:'+(couleur||'#0a5a3e')+';font-size:14px;margin:16px 0 4px">'+esc(t)+'</h3>';
const ROUGE='#b91c1c';
const liste=(arr,couleur)=>'<ul style="margin:2px 0;padding-left:18px;font-size:13px'+(couleur?';color:'+couleur:'')+'">'+arr.map(l=>'<li style="margin:3px 0">'+esc(l)+'</li>').join('')+'</ul>';
const sections = c && c.sections ? c.sections.map(s => s.rouge ? titre(s.titre,ROUGE)+liste(s.lignes||[],ROUGE) : titre(s.titre)+liste(s.lignes||[])).join('')
  : '<p style="color:#b45309;font-size:13px">Le Cockpit n’a pas répondu ce matin : ouvre-le pour tes relances du jour.</p>'
  + '<p style="color:'+ROUGE+';font-size:13px">Tes ordres en retard n’ont pas pu être lus non plus : regarde le bandeau rouge du cockpit.</p>';
const gardien = (d.gardien||[]).map(o=>o.x).filter(Boolean);
const inv = d.inventaire;
const html =
'<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:auto;color:#1f2937">'
+'<h2 style="color:#0a7a54;margin:0 0 2px">rAIme - rapport du '+esc(d.date)+'</h2>'
+'<p style="color:#6b7280;margin:0 0 6px;font-size:13px">Ce que le système a fait seul ces dernières 24 h, et ce qui t’attend aujourd’hui.</p>'
+sections
+(gardien.length ? titre('Gardien : limites franchies (24 h)','#b45309')+liste(gardien) : '')
+(inv ? (titre('Inventaire des services - '+inv.mois)+'<table style="width:100%;border-collapse:collapse;font-size:12px">'+(inv.lignes||[]).map(l=>'<tr><td style="padding:4px 6px;border-bottom:1px solid #e5e7eb"><b>'+esc(l.service)+'</b></td><td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;color:'+(l.etat==='en service'?'#0a7a54':'#b45309')+'">'+esc(l.etat)+'</td><td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">'+esc(l.detail)+'</td><td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;white-space:nowrap">'+esc(l.cout)+'</td></tr>').join('')+'</table>'+'<p style="margin:6px 0 2px;font-size:12px;color:#4b5563">Coût connu : '+esc(inv.cout_connu)+'</p>'+((inv.signaux||[]).length?liste(inv.signaux):'')) : '')
+'<p style="color:#9ca3af;font-size:11px;margin-top:18px">rAIme - rapport automatique quotidien. Cockpit : https://cockpit.raime.fr</p>'
+'</div>';
const email_body = { from:'rAIme <contact@raime.fr>', to:['BASILERAMEEE@gmail.com'], subject:'rAIme - rapport du '+d.date+(inv?' + inventaire des services':''), html:html };
return [{ json:{ email_body } }];
