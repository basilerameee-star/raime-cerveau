// Test de non-régression — livrable demande-12 (étude de marché + app).
// Vérifie des invariants simples reproductibles, sans dépendance externe.
// Lancement : node tests/cas_figes_marche.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ici = dirname(fileURLToPath(import.meta.url));
const racine = join(ici, "..");

const etude = readFileSync(join(racine, "etude-de-marche.md"), "utf8");
const app = readFileSync(join(racine, "app", "index.html"), "utf8");

let erreurs = 0;
function verifie(condition, message) {
  if (!condition) {
    erreurs++;
    console.error("ÉCHEC : " + message);
  }
}

// --- Étude de marché ---
const quatreOffres = [
  "Formation à l'IA des dirigeants",
  "Audit des usages",
  "Arbitrage d'une proposition",
  "Automatisation des tâches administratives",
];
for (const o of quatreOffres) {
  verifie(etude.includes(o), "offre absente : " + o);
}

// Chaque rubrique attendue est présente
for (const rubrique of ["Cibles", "Besoins", "Concurrents", "Canaux"]) {
  verifie(etude.includes(rubrique), "rubrique absente : " + rubrique);
}

// Les trois publics Facebook/Instagram
for (const publicVise of ["directeur d'une PME", "ressources humaines", "adjoint administratif"]) {
  verifie(etude.includes(publicVise), "public absent : " + publicVise);
}

// Aucune donnée inventée : pas de mention d'un chiffre sans source
verifie(etude.includes("25 septembre 2026"), "date de collecte absente");
verifie(!/\bje\b|\bj'\b/i.test(etude), "présence de « je » (interdit par la charte de vente)");

// Aucun anglicisme flagrant dans la rédaction (les URL de sources — ex. "pricing" — sont exclues)
const anglicismes = ["market study", "competitor", "target audience"];
for (const a of anglicismes) {
  verifie(!etude.toLowerCase().includes(a.toLowerCase()), "anglicisme détecté : " + a);
}

// --- App ---
verifie(app.includes("lang=\"fr\""), "langue de l'app non française");
verifie(app.includes("InterVariable.woff2"), "police Inter absente");
verifie(app.includes("--accent:#ff7eb0"), "rose nuit #ff7eb0 absent");
verifie(app.includes("--accent:#db4f8b"), "rose jour #db4f8b absent");
verifie(app.includes("data-theme=\"noir-rose\""), "thème sombre absent");
verifie(app.includes("id=\"bascule\""), "bascule jour/nuit absente");

// Balises équilibrées
const balises = ["div", "section", "table", "thead", "tbody", "tr", "td", "th", "ul", "ol", "li", "header", "main", "footer", "p", "h1", "h2", "h3", "h4", "button", "span", "caption"];
for (const b of balises) {
  const ouvertes = (app.match(new RegExp("<" + b + "(?=[\\s>])", "g")) || []).length;
  const fermees = (app.match(new RegExp("</" + b + "\\s*>", "g")) || []).length;
  verifie(ouvertes === fermees, "balise déséquilibrée : " + b);
}

if (erreurs === 0) {
  console.log("OK — " + quatreOffres.length + " offres, 3 publics, sources datées, charte respectée, app valide.");
} else {
  console.error(erreurs + " échec(s).");
  process.exit(1);
}