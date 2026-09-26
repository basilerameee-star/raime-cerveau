// La compétence vidéo d'Hermes : sa forme, ses interdits de licence, son lanceur Windows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const DOSSIER = new URL('../../hermes/competences/video-wangp/', import.meta.url).pathname;
const skill = fs.readFileSync(path.join(DOSSIER, 'SKILL.md'), 'utf8');

test('la compétence porte un en-tête Hermes : nom et description', () => {
  const entete = skill.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(entete, 'en-tête YAML absent');
  assert.match(entete[1], /^name: video-wangp$/m);
  assert.match(entete[1], /^description: .{40,}/m);
});

test('MiniMax H3 est interdit, Wan est le premier choix, la licence se lit avant tout autre modèle', () => {
  const interdits = skill.split(/^Interdits :/m)[1] || '';
  assert.match(interdits, /MiniMax H3/);
  assert.match(interdits, /Union européenne/);
  const autorises = skill.split(/^Autorisés/m)[1].split(/^Interdits/m)[0];
  assert.doesNotMatch(autorises, /H3|Hailuo/);
  assert.match(autorises, /Wan 2\.1 \/ 2\.2\*\* \(Apache 2\.0\)/);
  assert.match(skill, /lis sa licence .* AVANT le premier usage/);
});

test('rien ne se publie sans le « ok » de Basile, et le serveur MCP reste sur le PC', () => {
  assert.match(skill, /Rien ne se publie/);
  const bat = fs.readFileSync(path.join(DOSSIER, 'lancer_wangp_hermes.bat'), 'utf8');
  assert.match(bat, /--mcp-host 127\.0\.0\.1/);
  assert.doesNotMatch(bat, /0\.0\.0\.0/);
  assert.ok(bat.includes('\r\n') && !/[^\r]\n/.test(bat), 'le .bat doit être en fins de ligne Windows');
  assert.ok(!/[^\x00-\x7F]/.test(bat), 'le .bat reste en ASCII (cmd.exe)');
});

const SCRIPT = path.join(DOSSIER, 'ajouter_wangp.py');
const py = (code) => execFileSync('python3', ['-c', `import sys; sys.path.insert(0, ${JSON.stringify(DOSSIER)}); import ajouter_wangp as a; ${code}`]).toString().trim();

test('le dossier d’Hermes est celui qu’Hermes calcule : %LOCALAPPDATA%\\hermes sous Windows, ~/.hermes ailleurs', { skip: !aPython() }, () => {
  assert.equal(py(`print(a.dossier_hermes('win32', {'LOCALAPPDATA': 'C:/Users/L/AppData/Local'}, '/h'))`), path.join('C:/Users/L/AppData/Local', 'hermes'));
  assert.equal(py(`print(a.dossier_hermes('win32', {}, '/h'))`), '/h/AppData/Local/hermes');
  assert.equal(py(`print(a.dossier_hermes('linux', {}, '/h'))`), '/h/.hermes');
  assert.equal(py(`print(a.dossier_hermes('win32', {'HERMES_HOME': '/ailleurs', 'LOCALAPPDATA': 'C:/x'}, '/h'))`), '/ailleurs');
});

test('ajouter_wangp.py installe la compétence et ajoute le serveur une seule fois, sans toucher au reste', { skip: !aPython() }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-hermes-'));
  const conf = path.join(home, 'config.yaml');
  fs.writeFileSync(conf, 'model:\n  default: x\nmcp_servers:\n  raime:\n    url: "http://raime-mcp:8766/mcp"\n');
  const lancer = () => execFileSync('python3', [SCRIPT], { env: { ...process.env, HERMES_HOME: home } }).toString();
  assert.match(lancer(), /serveur WanGP : ajoute/);
  assert.match(lancer(), /serveur WanGP : deja present/);
  const t = fs.readFileSync(conf, 'utf8');
  assert.equal(t.match(/wangp:/g).length, 1);
  assert.match(t, /raime:\n    url: "http:\/\/raime-mcp:8766\/mcp"/);
  assert.match(t, /^model:\n  default: x$/m);
  assert.ok(fs.existsSync(conf + '.avant-wangp'), 'copie de secours absente');
  assert.ok(fs.existsSync(path.join(home, 'skills/video-wangp/SKILL.md')), 'compétence non copiée');
});

function aPython() {
  try { execFileSync('python3', ['--version']); return true; } catch { return false; }
}
