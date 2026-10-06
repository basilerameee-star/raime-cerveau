// Les pages de Jarvis (06/10/2026) : un élément retiré de la page mais encore visé par le script (« $('bloc-courriels') »)
// arrête tout le script, barre de saisie et voix comprises. Chaque page : scripts lisibles, chaque $('id') existe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dossier = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../../jarvis/interface');

for (const nom of fs.readdirSync(dossier).filter((f) => f.endsWith('.html'))) {
  test('page ' + nom + ' : scripts lisibles, aucun identifiant manquant', () => {
    const page = fs.readFileSync(path.join(dossier, nom), 'utf8');
    const scripts = [...page.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const s of scripts) assert.doesNotThrow(() => new Function(s), nom);
    const ids = new Set([...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
    const tout = scripts.join(';');
    const proteges = new Set([...tout.matchAll(/if \(\$\('([\w-]+)'\)\)/g)].map((m) => m[1]));   // « if ($('x')) … » : absence prévue
    const manquants = [...tout.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1]).filter((id) => !ids.has(id) && !proteges.has(id));
    assert.deepEqual([...new Set(manquants)], [], nom + ' vise des éléments absents de la page');
  });
}
