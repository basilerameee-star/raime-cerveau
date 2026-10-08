// L'AGENT BOURSE (08/10/2026) : trois portefeuilles simulés et un indice, 1 000 € fictifs chacun, des règles écrites,
// les frais et le change comptés ; aucun ordre réel. Tout se vérifie sur des cours fabriqués, sans réseau.
import './outils.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moyenne, hausse, rsi, cibles, simuler, frais, pireBaisse, aligner, UNIVERS, REFERENCE, CAPITAL } from '../../agents/bourse.js';

// Des jours de bourse (du lundi au vendredi) à partir du 1er septembre 2025.
function joursOuvres(n, debut = '2025-09-01') {
  const out = []; let d = Date.parse(debut + 'T12:00:00Z');
  while (out.length < n) { const j = new Date(d); if (j.getUTCDay() % 6) out.push(j.toISOString().slice(0, 10)); d += 86400e3; }
  return out;
}
// Des cours : une droite de pente donnée (en % par jour) pour chaque titre de l'univers.
function donnees(n, pentes = {}) {
  const jours = joursOuvres(n);
  const prix = {};
  for (const s of Object.keys(UNIVERS)) prix[s] = jours.map((_, i) => 100 * (1 + (pentes[s] ?? 0) / 100) ** i);
  return { jours, prix };
}

test('les calculs : moyenne glissante, hausse sur n jours, plus forte baisse, frais selon la classe et la devise', () => {
  const serie = [1, 2, 3, 4, 5];
  assert.equal(moyenne(serie, 4, 5), 3);
  assert.equal(moyenne(serie, 2, 5), null, 'pas assez de jours');
  assert.ok(Math.abs(hausse([100, 110, 121], 2, 2) - 0.21) < 1e-9);
  assert.equal(pireBaisse([{ valeur: 100 }, { valeur: 120 }, { valeur: 90 }, { valeur: 130 }]), 90 / 120 - 1);
  assert.equal(frais('EUNL.DE'), 0.001);
  assert.equal(frais('AAPL'), 0.0035, 'action en dollars : 0,1 % + 0,25 % de change');
  assert.equal(frais('BTC'), 0.002);
});

test('les règles : long terme aux poids écrits ; tendance au-dessus de la moyenne 200 jours ; momentum les 5 meilleures en hausse', () => {
  const d = donnees(260, { 'EUNL.DE': 0.05, BTC: 0.2, 'SXR8.DE': -0.1, AAPL: 0.3, MSFT: 0.25, NVDA: 0.2, 'ASML.AS': 0.15, 'NESN.SW': 0.1, META: 0.05, JPM: -0.2 });
  const lt = cibles('long_terme', { ...d, i: 0, poidsActuels: {}, premier: true });
  assert.equal(Object.values(lt).reduce((a, b) => a + b, 0).toFixed(6), '1.000000');
  assert.equal(lt['EUNL.DE'], 0.40);
  const i = 259;
  const t = cibles('tendance', { ...d, i, poidsActuels: {}, premier: true });
  assert.ok(t['EUNL.DE'] && t.BTC, 'en hausse : au-dessus de leur moyenne');
  assert.ok(!t['SXR8.DE'], 'en baisse : en liquidités');
  const m = cibles('momentum', { ...d, i, poidsActuels: {}, premier: true });
  assert.deepEqual(Object.keys(m).sort(), ['AAPL', 'ASML.AS', 'MSFT', 'NESN.SW', 'NVDA']);
  assert.ok(!('JPM' in m), 'une action en baisse n’est jamais prise');
  assert.equal(cibles('indice', { ...d, i, poidsActuels: {}, premier: false }), null, 'l’indice ne bouge plus après le premier jour');
});

test('une simulation : l’indice suit son titre moins les frais ; le long terme reste investi ; rien n’est perdu en route', () => {
  const d = donnees(60, Object.fromEntries(Object.keys(UNIVERS).map((s) => [s, 0.1])));
  const idx = simuler('indice', d, d.jours[0]);
  const attendu = CAPITAL / (1 + 0.001) * (d.prix[REFERENCE][59] / d.prix[REFERENCE][0]);   // l'achat paie 0,1 % de frais
  assert.ok(Math.abs(idx.valeurs.at(-1).valeur - attendu) < 1, `${idx.valeurs.at(-1).valeur} ≈ ${attendu.toFixed(2)}`);
  assert.equal(idx.operations.length, 1, 'un seul achat');
  const lt = simuler('long_terme', d, d.jours[0]);
  assert.ok(lt.valeurs.at(-1).liquidites < 20, 'investi, pas en liquidités');
  assert.ok(lt.valeurs.at(-1).valeur > CAPITAL, 'tout monte de 0,1 % par jour : la valeur aussi');
  assert.ok(lt.operations.every((o) => o.frais > 0 && o.montant > 0));
  const plat = simuler('long_terme', donnees(30), joursOuvres(30)[0]);
  assert.ok(plat.valeurs.at(-1).valeur < CAPITAL && plat.valeurs.at(-1).valeur > CAPITAL * 0.99, 'cours plats : seuls les frais coûtent');
});

test('le calendrier : les jours de la référence ; un cours manquant reprend le dernier connu (jour férié d’une autre place)', () => {
  const a = aligner({ [REFERENCE]: [{ jour: '2026-01-05', eur: 10 }, { jour: '2026-01-06', eur: 11 }, { jour: '2026-01-07', eur: 12 }],
    BTC: [{ jour: '2026-01-04', eur: 50 }, { jour: '2026-01-06', eur: 55 }], AAPL: [] });
  assert.deepEqual(a.jours, ['2026-01-05', '2026-01-06', '2026-01-07']);
  assert.deepEqual(a.prix.BTC, [50, 55, 55]);
  assert.deepEqual(a.prix.AAPL, [null, null, null]);
});

test('le court terme (trading simulé) : entre sur une forte baisse dans une tendance haussière, ressort au rebond', () => {
  assert.equal(rsi([10, 9, 8], 2, 2), 0, 'deux baisses : RSI 0');
  assert.equal(rsi([8, 9, 10], 2, 2), 100);
  const d = donnees(230, { BTC: 0.3, 'SXR8.DE': 0.3, ETH: -0.2, 'EUNL.DE': 0.3 });
  const i = 229;
  d.prix.BTC[i - 1] = d.prix.BTC[i - 2] * 0.97; d.prix.BTC[i] = d.prix.BTC[i - 1] * 0.97;   // deux jours de baisse, toujours au-dessus de la moyenne 200
  d.prix.ETH[i - 1] = d.prix.ETH[i - 2] * 0.97; d.prix.ETH[i] = d.prix.ETH[i - 1] * 0.97;   // en baisse de fond : jamais acheté
  const c = cibles('court_terme', { ...d, i, poidsActuels: {}, premier: false });
  assert.deepEqual(Object.keys(c), ['BTC']);
  const sortie = cibles('court_terme', { ...d, i: 228, poidsActuels: { 'SXR8.DE': 0.5 }, premier: false });
  assert.ok(!('SXR8.DE' in sortie), 'au-dessus de sa moyenne des 5 jours : revendu');
});
