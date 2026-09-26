// Les compétences d'Hermes (hermes/competences/) : chacune se charge, dit d'où elle vient, et leur liste
// reste légère (Hermes la joint à chaque demande ; le modèle local n'a que 16 384 jetons de contexte).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const RACINE = new URL('../../hermes/competences/', import.meta.url).pathname;
const tous = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tous(path.join(d, e.name)) : [path.join(d, e.name)]));
const skills = tous(RACINE).filter((f) => path.basename(f) === 'SKILL.md');

test('chaque compétence a un nom et une description courte', () => {
  assert.ok(skills.length >= 80, `${skills.length} compétences`);
  for (const f of skills) {
    const tete = fs.readFileSync(f, 'utf8').match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(tete, `${f} : pas d'en-tête`);
    assert.match(tete[1], /^name:\s*\S/m, f);
    const d = tete[1].match(/^description:\s*"?(.*?)"?\s*$/m);
    assert.ok(d && d[1].length > 10 && d[1].length <= 400, `${f} : description absente ou trop longue`);
  }
});

test('la liste des compétences tient dans 4 000 jetons', () => {
  const total = skills.reduce((s, f) => s + (fs.readFileSync(f, 'utf8').match(/^description:(.*)$/m) || ['', ''])[1].length, 0);
  assert.ok(total / 4 < 4000, `${Math.round(total / 4)} jetons`);
});

test('les compétences importées disent leur dépôt et leur licence ; aucun chemin propre à Claude Code', () => {
  for (const p of ['marketing', 'stop-slop', 'ui-ux-pro-max', 'remotion', 'context-engineering']) {
    const s = fs.readFileSync(path.join(RACINE, p, 'SOURCE.md'), 'utf8');
    assert.match(s, /Dépôt : https:\/\/github\.com\//, p);
    assert.match(s, /Licence : \S/, p);
  }
  for (const f of skills) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /\$\{CLAUDE_PLUGIN_ROOT\}/, f);
});

test('aucune clé ni aucun secret dans les compétences', () => {
  const motif = /(sk-or-v1-|sk-ant-|AIza[0-9A-Za-z_-]{30}|ghp_[0-9A-Za-z]{30}|-----BEGIN [A-Z ]*PRIVATE KEY)/;
  for (const f of tous(RACINE).filter((x) => /\.(md|py|ts|tsx|js|json|csv|txt|ya?ml)$/.test(x)))
    assert.doesNotMatch(fs.readFileSync(f, 'utf8'), motif, f);
});
