// La connexion TikTok (Login Kit) : sans clés, rien ; un lien n'est bon qu'une fois et dix minutes ; le code devient un
// accès rangé au coffre ; l'accès se renouvelle seul ; l'état ne montre jamais un jeton.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const T = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-tiktok-'));
process.env.COFFRE_FICHIER = path.join(T, 'coffre.env');
const require = createRequire(import.meta.url);
const tiktok = require('../../jarvis/tiktok.cjs');
const lireCoffre = () => Object.fromEntries(fs.readFileSync(process.env.COFFRE_FICHIER, 'utf8').trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

test('sans les clés de l’application : aucune adresse de connexion', () => {
  assert.equal(tiktok.adresseConnexion({ coffre: {} }), null);
});

test('connexion : bonne adresse, état à usage unique, code échangé et rangé au coffre, jamais montré', async () => {
  fs.writeFileSync(process.env.COFFRE_FICHIER, 'TIKTOK_CLIENT_KEY=cle-app\nTIKTOK_CLIENT_SECRET=secret-app\n');
  const a = new URL(tiktok.adresseConnexion());
  assert.equal(a.origin + a.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.equal(a.searchParams.get('client_key'), 'cle-app');
  assert.equal(a.searchParams.get('redirect_uri'), 'https://cockpit.raime.fr/tiktok/retour');
  assert.match(a.searchParams.get('scope'), /video\.publish/);
  const state = a.searchParams.get('state');

  assert.equal((await tiktok.retour({ code: 'c', state: 'faux' })).ok, false, 'état inconnu : refusé');
  const appels = [];
  const fetch = async (url, o) => { appels.push({ url, corps: String(o.body) });
    return { ok: true, status: 200, json: async () => ({ access_token: 'acces-1', refresh_token: 'renouv-1', open_id: 'oid', expires_in: 86400, refresh_expires_in: 31536000, scope: 'user.info.basic,video.publish' }) }; };
  const r = await tiktok.retour({ code: 'code-tiktok', state }, { fetch });
  assert.equal(r.ok, true, r.message);
  assert.match(appels[0].corps, /grant_type=authorization_code/); assert.match(appels[0].corps, /client_secret=secret-app/);
  assert.equal(lireCoffre().TIKTOK_ACCESS_TOKEN, 'acces-1');
  assert.equal((await tiktok.retour({ code: 'code-tiktok', state }, { fetch })).ok, false, 'le même lien ne sert qu’une fois');

  const e = await tiktok.etat({ profil: false });
  assert.equal(e.connecte, true); assert.deepEqual(e.portees, ['user.info.basic', 'video.publish']);
  assert.ok(!JSON.stringify(e).includes('acces-1') && !JSON.stringify(e).includes('renouv-1') && !JSON.stringify(e).includes('secret-app'));
});

test('l’accès se renouvelle seul quand il expire dans l’heure', async () => {
  const fetch = async (url, o) => ({ ok: true, status: 200, json: async () => (assert.match(String(o.body), /grant_type=refresh_token&refresh_token=renouv-1/),
    { access_token: 'acces-2', refresh_token: 'renouv-2', open_id: 'oid', expires_in: 86400, scope: 'user.info.basic' }) });
  assert.equal(await tiktok.acces({ fetch }), 'acces-1', 'encore valable : pas d’appel');
  assert.equal(await tiktok.acces({ fetch, maintenant: Date.now() + 86400_000 }), 'acces-2');
  assert.equal(lireCoffre().TIKTOK_REFRESH_TOKEN, 'renouv-2');
});
