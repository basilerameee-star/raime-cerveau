// LES PORTES D'ENTRÉE — CCI et organismes de formation (chantier 4 bis).
//
// Tant que Qualiopi manque, la formation se vend par eux : être référencé partout est le
// premier levier. Le cerveau le fait en capitaine (Constitution, « Le capitaine et l'armateur ») :
//
//   ① cartographier  chaque CCI et chaque organisme de la base, et sa procédure réelle de
//                    référencement : formulaire, adresse, plateforme, appel d'offres ;
//   ② peser          la balance écrite : bénéfice / risque, et la zone ;
//   ③ préparer       le dossier, rempli des SEULES informations qui existent (briques, offre,
//                    identité légale de rAIme) ; ce qui manque est nommé, jamais inventé ;
//   ④ présenter      un lot à Basile : un seul « ok » vaut pour tout le lot (zone 2).
//
// CE FICHIER N'ENVOIE RIEN et ne remplit aucun formulaire : l'exécution d'un lot viendra
// après le « ok » de ce lot précis. Une porte gardée par une vérification humaine (captcha)
// va dans la liste « à faire par Basile » (zone 3 : jamais contournée).
//
// La cartographie lit des pages publiques, une par une, en se présentant honnêtement et en
// respectant robots.txt.
import fs from 'node:fs';
import path from 'node:path';

const UA = 'rAIme-portes/1.0 (+https://raime.fr ; contact@raime.fr)';
const PAGES = ['', '/contact', '/devenir-formateur', '/formateurs', '/partenaires', '/recrutement', '/nous-rejoindre'];
const PAUSE_MS = Number(process.env.PORTES_PAUSE_MS ?? 1500);
const SORTIE = process.env.PORTES_SORTIE || '/app/out/portes';

// ── L'identité et l'offre : lues dans les briques, jamais retapées ──────────
export function identiteRaime() {
  const ml = fs.readFileSync(new URL('../briques/legal/mentions-legales.html', import.meta.url), 'utf8');
  const bloc = (ml.match(/<h2>1\. Éditeur du site<\/h2><p>([\s\S]*?)<\/p>/) || [])[1] || '';
  const lignes = bloc.split(/<br\s*\/?>/).map((l) => l.replace(/<[^>]+>/g, '').trim());
  const champ = (re) => (lignes.find((l) => re.test(l)) || '').replace(re, '').trim() || null;
  return {
    nom_commercial: 'rAIme',
    exploitant: lignes[0] || null,
    forme: lignes[1] || null,
    siret: champ(/^SIRET\s*:\s*/i),
    naf: champ(/^Code APE\/NAF\s*:\s*/i),
    tva: lignes.find((l) => /TVA/.test(l)) || null,
    email: champ(/^Email\s*:\s*/i),
    site: 'https://raime.fr',
    // « adresse communiquée sur demande » : l'adresse postale n'est pas publique.
    adresse: /communiquée sur demande/.test(bloc) ? null : champ(/^Adresse\s*:\s*/i),
    ville: (lignes.find((l) => /\(\d{2}\)/.test(l)) || '').replace(/\s*—.*$/, '') || null,
  };
}

function offreFormation() {
  const o = JSON.parse(fs.readFileSync(new URL('../publicite/offres.json', import.meta.url), 'utf8')).offres;
  return o.filter((x) => x.cle.startsWith('pro/formation/')).map((x) => ({ titre: x.titre, phrase: x.phrase, faits: x.faits }));
}

// ── ① Cartographier : lire les pages publiques et reconnaître la procédure ──
async function lire(url) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), 10000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: c.signal, redirect: 'follow' });
    if (!r.ok) return null;
    return (await r.text()).slice(0, 400_000);
  } catch { return null; } finally { clearTimeout(t); }
}

// robots.txt : on n'ouvre pas ce que le site demande de laisser.
export function autorise(robots, chemin) {
  if (!robots) return true;
  let actif = false; const interdits = [];
  for (const l of robots.split(/\r?\n/)) {
    const [k, ...v] = l.split(':'); const val = v.join(':').trim();
    if (/^user-agent$/i.test(k.trim())) actif = val === '*' || /raime/i.test(val);
    else if (actif && /^disallow$/i.test(k.trim()) && val) interdits.push(val);
  }
  return !interdits.some((d) => (chemin || '/').startsWith(d));
}

// Ce que dit une page, reconnu par le code.
export function analyserPage(html, base) {
  const h = String(html || '');
  const t = h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const captcha = /g-recaptcha|recaptcha\/api|hcaptcha|cf-turnstile|captcha/i.test(h);
  const emails = [...new Set((h.match(/mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi) || []).map((m) => m.slice(7).toLowerCase()))];
  const formulaires = (h.match(/<form\b[\s\S]*?<\/form>/gi) || [])
    .filter((f) => !/type=["']?search|role=["']?search|newsletter/i.test(f) && (f.match(/<(input|textarea|select)\b/gi) || []).length >= 3);
  const liens = [...h.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(([, href, txt]) => ({ href, txt: txt.replace(/<[^>]+>/g, ' ').trim().toLowerCase() }));
  const lienVers = (re) => {
    const l = liens.find((x) => re.test(x.txt) || re.test(x.href));
    if (!l) return null;
    try { return new URL(l.href, base).href; } catch { return null; }
  };
  const plateforme = lienVers(/marches?-publics|achatpublic|place ?des ?march|boamp|maximilien|megalis|e-marchespublics|profil[- ]acheteur/i);
  const formateur = lienVers(/devenir (formateur|intervenant|partenaire)|formateurs? (ind[ée]pendant|externe)|r[ée]f[ée]rencement|vivier|intervenants?/i);
  const signes = {
    formateur: /devenir (formateur|intervenant)|formateurs? (ind[ée]pendants?|externes?|vacataires?)|intervenants? externes?|vivier de formateurs|r[ée]f[ée]rencement/.test(t),
    appel_offres: /appels? d'offres|march[ée]s publics|consultation/.test(t),
  };
  return { captcha, emails, formulaires: formulaires.length, plateforme, formateur, signes };
}

// Les pages lues d'une porte donnent sa procédure, la plus directe d'abord.
export function procedure(analyses) {
  const a = analyses.filter(Boolean);
  const pages = (p) => a.filter(p).map((x) => x.url);
  const formPage = a.find((x) => x.formulaires && x.signes.formateur) || null;
  const plateforme = a.map((x) => x.plateforme).find(Boolean) || null;
  const emails = [...new Set(a.flatMap((x) => x.emails))];
  const captcha = a.some((x) => x.captcha && x.formulaires);
  if (formPage) return { type: 'formulaire', adresse: formPage.url, captcha: formPage.captcha, emails };
  if (plateforme) return { type: 'plateforme', adresse: plateforme, captcha, emails };
  if (a.some((x) => x.signes.appel_offres)) return { type: 'appel_offres', adresse: pages((x) => x.signes.appel_offres)[0], captcha, emails };
  if (emails.length) return { type: 'email', adresse: emails[0], captcha: false, emails };
  const form = a.find((x) => x.formulaires);
  if (form) return { type: 'formulaire', adresse: form.url, captcha: form.captcha, emails };
  return { type: 'inconnue', adresse: null, captcha, emails };
}

// ── ② Peser : la balance écrite, et la zone (Constitution) ──────────────────
export function peser(porte) {
  const benefice = [], risque = [];
  let points = 0;
  if (porte.type === 'cci') { benefice.push('une CCI achète des formations pour tout un territoire'); points += 3; }
  else { benefice.push('un organisme certifié peut sous-traiter une formation tant que Qualiopi manque'); points += 2; }
  if ((porte.effectif || 0) >= 50) { benefice.push(`structure de ${porte.effectif} personnes : volume de sessions possible`); points += 1; }
  if (porte.signes_formateur) { benefice.push('la structure recrute explicitement des formateurs externes'); points += 2; }
  const temps = { formulaire: 20, email: 15, plateforme: 60, appel_offres: 180, inconnue: 30 }[porte.procedure] ?? 30;
  risque.push(`temps estimé : ${temps} minutes`);
  risque.push('données transmises : identité légale publique de rAIme et description de l’offre, rien d’autre');
  risque.push(porte.procedure === 'appel_offres' ? 'engagement : une réponse à un appel d’offres engage sur un prix' : 'réversible : un retrait se demande par e-mail');
  if (porte.procedure === 'appel_offres') points -= 2;
  if (porte.procedure === 'inconnue') { risque.push('procédure inconnue : à cartographier à la main'); points -= 2; }
  const zone = porte.captcha ? 'basile' : porte.procedure === 'inconnue' ? 'aucune' : porte.procedure === 'appel_offres' ? 'basile' : 2;
  return { benefice, risque, points, zone, temps_minutes: temps };
}

// ── ③ Préparer : seulement ce qui existe ────────────────────────────────────
export function preparerDossier(porte, identite = identiteRaime()) {
  const champs = {
    nom_commercial: identite.nom_commercial, exploitant: identite.exploitant, forme_juridique: identite.forme,
    siret: identite.siret, code_naf: identite.naf, tva: identite.tva, email: identite.email, site: identite.site,
    ville: identite.ville, adresse_postale: identite.adresse,
    domaine: 'Intelligence artificielle : formation des dirigeants, des comités de direction et des employés',
    offres: offreFormation(),
    qualiopi: 'non certifié : intervention en sous-traitance d’un organisme certifié',
  };
  // Ce qu'un formulaire de référencement demande souvent et qu'aucune brique ne fournit.
  const manquants = ['adresse_postale', 'telephone', 'cv_formateur', 'tarif_journalier', 'attestation_assurance_rc_pro']
    .filter((k) => !champs[k]);
  return { porte: porte.nom, procedure: porte.procedure, adresse: porte.adresse, champs, manquants };
}

// ── La base ────────────────────────────────────────────────────────────────
async function schema(brain) {
  await brain.query(`
    CREATE TABLE IF NOT EXISTS portes (
      id            bigserial PRIMARY KEY,
      siren         text UNIQUE,
      nom           text NOT NULL,
      type          text NOT NULL CHECK (type IN ('cci','organisme')),
      site          text,
      effectif      int,
      procedure     text CHECK (procedure IN ('formulaire','email','plateforme','appel_offres','inconnue')),
      adresse       text,
      captcha       boolean,
      balance       jsonb,
      dossier       jsonb,
      etat          text NOT NULL DEFAULT 'a_cartographier' CHECK (etat IN ('a_cartographier','cartographiee','preparee',
                      'presentee','confirmee','envoyee','repondue','referencee','a_faire_par_basile','ecartee')),
      lot           int,
      maj_le        timestamptz NOT NULL DEFAULT now()
    )`);
}

// Les portes connues de la base n8n entrent dans la table (sans doublon).
export async function importer({ brain, n8n }) {
  await schema(brain);
  const { rows } = await n8n.query(`SELECT siren, name, website, effectif_est, sector FROM prospects
    WHERE sector IN ('CCI', 'Organismes de formation')`);
  let n = 0;
  for (const p of rows) {
    const r = await brain.query(`INSERT INTO portes(siren, nom, type, site, effectif) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT (siren) DO NOTHING`, [p.siren, p.name, p.sector === 'CCI' ? 'cci' : 'organisme', p.website || null, p.effectif_est || null]);
    n += r.rowCount;
  }
  return { connues: rows.length, nouvelles: n };
}

export async function cartographier({ brain, limite = 40 }) {
  await schema(brain);
  const { rows } = await brain.query(`SELECT * FROM portes WHERE etat = 'a_cartographier' AND site IS NOT NULL
    ORDER BY (type = 'cci') DESC, effectif DESC NULLS LAST LIMIT $1`, [limite]);
  const bilan = { lues: 0, reconnues: 0, inconnues: 0 };
  for (const p of rows) {
    let base;
    try { base = new URL(/^https?:/.test(p.site) ? p.site : `https://${p.site}`); } catch { continue; }
    const robots = await lire(`${base.origin}/robots.txt`);
    const analyses = [];
    for (const chemin of PAGES) {
      if (!autorise(robots, chemin || '/')) continue;
      const url = `${base.origin}${chemin}`;
      const html = await lire(url);
      if (html) analyses.push({ url, ...analyserPage(html, url) });
      if (PAUSE_MS) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    const proc = procedure(analyses);
    const porte = { ...p, procedure: proc.type, adresse: proc.adresse, captcha: proc.captcha,
      signes_formateur: analyses.some((a) => a.signes.formateur) };
    const balance = peser(porte);
    const etat = balance.zone === 'basile' ? 'a_faire_par_basile' : proc.type === 'inconnue' ? 'cartographiee' : 'preparee';
    await brain.query(`UPDATE portes SET procedure = $2, adresse = $3, captcha = $4, balance = $5, dossier = $6, etat = $7, maj_le = now()
      WHERE id = $1`, [p.id, proc.type, proc.adresse, proc.captcha, JSON.stringify(balance),
      proc.type === 'inconnue' ? null : JSON.stringify(preparerDossier(porte)), etat]);
    bilan.lues++; if (proc.type === 'inconnue') bilan.inconnues++; else bilan.reconnues++;
  }
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['portes', `${bilan.lues} porte(s) cartographiée(s), ${bilan.reconnues} procédure(s) reconnue(s)`,
     `${bilan.inconnues} inconnue(s) ; lecture de pages publiques, robots.txt respecté`]);
  return bilan;
}

// ── ④ Présenter un lot à Basile : la balance de chaque porte, un seul « ok » ──
export async function presenterLot({ brain, taille = 30 }) {
  await schema(brain);
  const { rows: [m] } = await brain.query(`SELECT coalesce(max(lot), 0) + 1 AS n FROM portes`);
  const { rows } = await brain.query(`SELECT * FROM portes WHERE etat = 'preparee'
    ORDER BY (balance->>'points')::int DESC, effectif DESC NULLS LAST LIMIT $1`, [taille]);
  const { rows: basile } = await brain.query(`SELECT nom, procedure, adresse FROM portes WHERE etat = 'a_faire_par_basile' ORDER BY nom`);
  if (!rows.length) return { lot: null, portes: 0, basile: basile.length };
  await brain.query(`UPDATE portes SET etat = 'presentee', lot = $2, maj_le = now() WHERE id = ANY($1::bigint[])`, [rows.map((r) => r.id), m.n]);

  const manquants = [...new Set(rows.flatMap((r) => r.dossier?.manquants || []))];
  const md = `# Lot n° ${m.n} — ${rows.length} portes d'entrée à ouvrir\n\n`
    + `Un seul « ok » vaut pour tout ce lot (zone 2 de la Constitution). Après l'« ok », le cerveau remplit et envoie\n`
    + `chaque dossier avec les seules informations ci-dessous ; rien n'est parti à ce jour.\n\n`
    + (manquants.length ? `**Informations qui manquent pour compléter les dossiers :** ${manquants.join(', ')}. `
      + `Les formulaires qui les exigent attendront votre réponse.\n\n` : '')
    + rows.map((r, i) => `## ${i + 1}. ${r.nom} (${r.type === 'cci' ? 'CCI' : 'organisme de formation'})\n`
      + `- Procédure : ${r.procedure} — ${r.adresse || '—'}\n`
      + `- Bénéfice : ${r.balance.benefice.join(' ; ')}\n- Risque : ${r.balance.risque.join(' ; ')}\n`).join('\n')
    + (basile.length ? `\n## À faire par Basile (vérification humaine ou engagement sur un prix)\n\n`
      + basile.map((b) => `- ${b.nom} — ${b.procedure} : ${b.adresse || '—'}`).join('\n') + '\n' : '');
  fs.mkdirSync(SORTIE, { recursive: true });
  const fichier = path.join(SORTIE, `LOT-${m.n}.md`);
  fs.writeFileSync(fichier, md);
  await brain.query(`INSERT INTO journal(acteur, changement, motif) VALUES($1,$2,$3)`,
    ['portes', `Lot n° ${m.n} présenté : ${rows.length} portes`, `en attente du « ok » de Basile ; ${fichier}`]);
  return { lot: m.n, portes: rows.length, basile: basile.length, manquants, fichier };
}

// La boucle : importer ce qui est nouveau, cartographier un morceau, présenter un lot quand il est prêt.
export async function portes({ brain, n8n }) {
  const i = await importer({ brain, n8n });
  const c = await cartographier({ brain });
  const { rows: [p] } = await brain.query(`SELECT count(*)::int n FROM portes WHERE etat = 'preparee'`);
  const { rows: [enAttente] } = await brain.query(`SELECT count(*)::int n FROM portes WHERE etat = 'presentee'`);
  // Un seul lot en attente à la fois : Basile signe un lot, pas une pile.
  const lot = p.n >= 30 && !enAttente.n ? await presenterLot({ brain }) : null;
  return { importees: i, cartographie: c, lot };
}
