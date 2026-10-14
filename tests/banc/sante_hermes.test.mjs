// Un relais disponible doit pouvoir s'authentifier auprès d'Hermes.
// Le 27/09, /sante annonçait « libre » alors que sept ordres échouaient en 401.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { creerServeur, VERSION } from '../../hermes/executant.js';

async function scenario(t, fetchHermes) {
  const serveur = creerServeur({ sansCle: true, fetch: fetchHermes });
  serveur.listen(0, '127.0.0.1');
  await once(serveur, 'listening');
  t.after(() => new Promise(resolve => serveur.close(resolve)));
  return `http://127.0.0.1:${serveur.address().port}`;
}

test('santé : « libre » exige une vérification authentifiée, sans appel de modèle', async t => {
  const appels = [];
  const url = await scenario(t, async (url, options) => {
    appels.push({ url, options });
    return new Response('{}', { status: 200 });
  });
  const r = await fetch(url + '/sante');
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { etat: 'libre', moteur: 'hermes', version: VERSION });
  assert.equal(appels.length, 1);
  assert.match(appels[0].url, /\/v1\/models$/);
  assert.ok(appels[0].options.headers.Authorization.startsWith('Bearer '));
  assert.ok(appels[0].options.signal instanceof AbortSignal);
  assert.equal(appels[0].options.body, undefined);
});

for (const status of [401, 403, 502]) {
  test(`santé : Hermes refuse (${status}), le relais se déclare indisponible`, async t => {
    const url = await scenario(t, async () => new Response('secret-à-ne-pas-transmettre', { status }));
    const r = await fetch(url + '/sante');
    assert.equal(r.status, 503);
    const d = await r.json();
    assert.equal(d.etat, 'indisponible');
    assert.equal(d.statut, status);
    assert.match(d.raison, /Hermes/);
    assert.doesNotMatch(JSON.stringify(d), /secret-à-ne-pas-transmettre/);
  });
}

test('santé : panne réseau puis rétablissement, sans redémarrer le relais', async t => {
  let disponible = false;
  const url = await scenario(t, async () => {
    if (!disponible) throw new Error('secret-dans-erreur-réseau');
    return new Response('{}');
  });
  let r = await fetch(url + '/sante');
  assert.equal(r.status, 503);
  const d = await r.json();
  assert.equal(d.etat, 'indisponible');
  assert.doesNotMatch(JSON.stringify(d), /secret-dans-erreur/);
  disponible = true;
  r = await fetch(url + '/sante');
  assert.equal(r.status, 200);
  assert.equal((await r.json()).etat, 'libre');
});

