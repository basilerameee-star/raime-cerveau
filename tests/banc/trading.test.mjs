// LES AGENTS DE TRADING (08/10/2026) : sept échelles, des règles écrites, les frais comptés, en simulation ; sans réseau.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decision, executer, trimestres, lireBougie, ECHELLES, FRAIS } from '../../agents/trading.js';

test('cinq agents, un par échelle : de l’heure au trimestre (la seconde et la minute supprimées le 22/10/2026)', () => {
  assert.deepEqual(Object.keys(ECHELLES), ['heure', 'jour', 'semaine', 'mois', 'trimestre']);
});

test('retour à la moyenne : achat sur deux bougies de baisse dans une tendance haussière ; revente au rebond', () => {
  const hausse = Array.from({ length: 220 }, (_, i) => 100 + i * 0.5);
  const baisse = [...hausse, hausse.at(-1) - 2, hausse.at(-1) - 4];        // toujours au-dessus de la moyenne 200
  assert.equal(decision('retour', baisse, false), 'acheter');
  assert.equal(decision('retour', hausse, false), null, 'pas de baisse : rien');
  // 08/10/2026 (audit) : le seuil compte. Une baisse puis un petit rebond (RSI 2 ≈ 33) n'est pas une baisse forte (< 10)
  assert.equal(decision('retour', [...hausse, hausse.at(-1) - 1, hausse.at(-1) - 0.5], false), null, 'RSI moyen : pas d’achat');
  const chute = Array.from({ length: 220 }, (_, i) => 300 - i);            // tendance baissière : jamais acheté
  assert.equal(decision('retour', chute, false), null);
  assert.equal(decision('retour', [...baisse, hausse.at(-1) + 5], true), 'vendre', 'au-dessus de la moyenne des 5 : revendu');
});

test('suivi de tendance : investi au-dessus de la moyenne, en liquidités en dessous', () => {
  const monte = Array.from({ length: 30 }, (_, i) => 100 + i);
  assert.equal(decision('tendance', monte, false, 20), 'acheter');
  assert.equal(decision('tendance', monte, true, 20), null, 'déjà investi');
  assert.equal(decision('tendance', [...monte, 80], true, 20), 'vendre');
  assert.equal(decision('tendance', monte.slice(0, 10), false, 20), null, 'pas assez de bougies');
});

test('une opération : tout acheter puis tout revendre coûte deux fois les frais ; rien à vendre, rien ne bouge', () => {
  const a = executer({ liquidites: 500, quantite: 0 }, 'acheter', 100);
  assert.ok(Math.abs(a.p.quantite - 500 / (1 + FRAIS) / 100) < 1e-9);
  const v = executer(a.p, 'vendre', 100);
  assert.ok(v.p.liquidites < 500 && v.p.liquidites > 500 * (1 - 3 * FRAIS));
  assert.equal(executer({ liquidites: 0, quantite: 0 }, 'vendre', 100).op, null);
});

test('les trimestres sont les clôtures de mars, juin, septembre et décembre ; une bougie du flux Binance se lit', () => {
  const mois = Array.from({ length: 12 }, (_, m) => ({ debut: new Date(Date.UTC(2025, m, 1)).toISOString(), c: m }));
  assert.deepEqual(trimestres(mois).map((b) => b.c), [2, 5, 8, 11]);
  const b = lireBougie({ data: { k: { i: '1h', s: 'BTCEUR', t: 1791452280000, o: '1', h: '2', l: '0.5', c: '1.5', v: '3', x: true } } });
  assert.deepEqual([b.echelle, b.symbole, b.c, b.fermee], ['heure', 'BTCEUR', 1.5, true]);
  assert.equal(lireBougie({ data: { k: { i: '1m', s: 'BTCEUR', t: 1, o: '1', h: '1', l: '1', c: '1', v: '1', x: true } } }), null, 'plus de minute');
  assert.equal(lireBougie({ data: {} }), null);
});

// 08/10/2026 (audit) : le Cockpit ne voit que jarvis/ ; le rapport importait ../agents/trading.js, échouait en production
// et disait « pas encore de données ». Deux gardes : aucun fichier de jarvis/ ne sort de son dossier, et le résumé
// rangé dans jarvis/ lit vraiment la base.
test('le Cockpit ne voit que jarvis/ : aucun de ses fichiers n’importe hors de son dossier', async () => {
  const fs = await import('node:fs');
  const dossier = new URL('../../jarvis/', import.meta.url);
  const sorties = [];
  for (const f of fs.readdirSync(dossier).filter((x) => /\.(c|m)?js$/.test(x))) {
    const lignes = fs.readFileSync(new URL(f, dossier), 'utf8').split('\n');
    lignes.forEach((l, i) => {
      if (/^\s*\/\//.test(l)) return;
      if (/(require|import)\(\s*['"`]\.\.\/|from\s+['"`]\.\.\/|path\.join\(__dirname,\s*['"`]\.\.['"`]/.test(l)) sorties.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(sorties, []);
});

test('le résumé du trading (jarvis/simulations.mjs) lit les portefeuilles et le dernier cours', async () => {
  const { bases } = await import('./outils.mjs');
  const { preparer } = await import('../../agents/trading.js');
  const { resumeTrading } = await import('../../jarvis/simulations.mjs');
  const db = await bases();
  try {
    await preparer(db.brain);
    await db.brain.query(`UPDATE trading_portefeuilles SET liquidites = 0, quantite = 0.01 WHERE agent = 'jour' AND symbole = 'BTCEUR'`);
    await db.brain.query(`INSERT INTO trading_bougies (symbole, echelle, debut, o, h, l, c, v) VALUES ('BTCEUR', 'jour', '2099-01-01', 60000, 60000, 60000, 60000, 1)
      ON CONFLICT DO NOTHING`);
    const jour = (await resumeTrading(db.brain)).find((x) => x.agent === 'jour');
    assert.equal(jour.valeur, 500 + 600, 'moitié en liquidités (ether), 0,01 bitcoin à 60 000 €');
    assert.equal(jour.perf, 10);
  } finally {
    await db.brain.query(`DELETE FROM trading_bougies WHERE debut = '2099-01-01'`).catch(() => {});
    await db.brain.query(`DELETE FROM trading_portefeuilles`).catch(() => {});
    await db.fermer();
  }
});
