# Installer Hermes maison — pour la session locale de Basile

**Le choix** : pas de copie d'Hermes réécrite à la main (300 Mo, des centaines d'outils, des mois de travail
en double). On fait tourner **le vrai Hermes Agent** (NousResearch, licence MIT) **chez rAIme** : sur notre
serveur, dans un conteneur fermé, avec la Constitution pour consigne et **le cerveau branché par MCP**
(`agents/raime_mcp.js`). Hermes apporte ses outils ; rAIme apporte sa mémoire, ses règles et son journal.

Free Claude Code (FCC) vient en phase 2 : il donne accès à des modèles gratuits. Licence **AGPL-3.0** : il
tourne **tel quel, dans son propre conteneur**, et aucune ligne de son code n'entre dans ce dépôt privé.

Versions vérifiées par la session cloud le 26/09/2026 :
Hermes `NousResearch/hermes-agent@d0288be5`, FCC `Alishahryar1/free-claude-code@ba4b934`.

## 1. Le jeton qui ouvre le cerveau à Hermes

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '
  J=$(openssl rand -hex 32); P=$(docker exec raime-postgres-1 printenv POSTGRES_PASSWORD)
  umask 077
  { echo "RAIME_MCP_JETON=$J"
    echo "DATABASE_URL=postgres://n8n:$P@raime-postgres-1:5432/raime_brain"
    echo "DATABASE_URL_N8N=postgres://n8n:$P@raime-postgres-1:5432/n8n"
    grep -E "^GITHUB_CHANTIER_TOKEN=" /opt/raime/raime-brain/.env || true; } > /opt/raime/mcp.env
  { echo "RAIME_MCP_JETON=$J"; grep -E "^OPENROUTER_API_KEY=" /opt/raime/raime-brain/.env; } > /opt/raime/hermes.env'
```

Aucun de ces fichiers n'entre dans le dépôt ; les deux sont lisibles par root seul.

## 2. Construire Hermes depuis le commit vérifié

Jamais par `curl … | sh` : le dépôt se lit d'abord (l'essayeur de la maison, `agents/essayeur.js`, peut le
passer à ses 11 critères), puis l'image se construit depuis ce commit précis.

```bash
ssh -i ~/.ssh/raime_vps root@2.29.6.94 '
  cd /opt/raime && git clone https://github.com/NousResearch/hermes-agent hermes-src
  cd hermes-src && git checkout d0288be5 && docker build -t raime-hermes:d0288be5 .'
```

## 3. Sa configuration et son âme

```bash
K="-i ~/.ssh/raime_vps"
ssh $K root@2.29.6.94 'mkdir -p /opt/raime/hermes-data/atelier && chown -R 10000:10000 /opt/raime/hermes-data'
scp $K hermes/config.yaml hermes/SOUL.md root@2.29.6.94:/opt/raime/hermes-data/
scp $K hermes/docker-compose.hermes.yml root@2.29.6.94:/opt/raime/
ssh $K root@2.29.6.94 'cd /opt/raime && docker compose -f docker-compose.hermes.yml up -d && sleep 5 \
  && docker logs --tail 5 raime-mcp'
```

Attendu dans le journal de `raime-mcp` : `à l'écoute sur 0.0.0.0:8766/mcp — 5 outils`.

**Ne jamais lancer `docker compose … --remove-orphans`** ici : ce fichier vit dans `/opt/raime` à côté du
compose principal ; Docker prendrait la base, Caddy, n8n et le Cockpit pour des restes et les supprimerait.

## 4. L'essai

```bash
ssh -t -i ~/.ssh/raime_vps root@2.29.6.94 'docker exec -it raime-hermes hermes'
```

Lui demander : « Quelles questions le cerveau attend-il de Basile ? ». Il doit appeler l'outil
`questions_pour_basile` du serveur `raime` et les lister ; l'appel apparaît au journal du cerveau (acteur `hermes`).

**Après chaque livraison du cerveau** : `docker restart raime-mcp` (le code est lu au démarrage).

## 5. Phase 2 — les modèles gratuits (Free Claude Code)

**Ce que Basile fait lui-même** (la maison ne crée aucun compte) : ouvrir les comptes des fournisseurs voulus
(NVIDIA NIM, Groq, Cerebras, Mistral…) et en donner les clés à la session locale, qui les pose dans
`/opt/raime/fcc.env`.

**La règle des données** : un palier gratuit peut garder ou réutiliser ce qu'on lui envoie. Aucun document de
client, aucune donnée personnelle n'y passe ; seulement la veille, le savoir public, le code du cerveau.

**La règle de la mesure** : un modèle gratuit remplace un modèle payant seulement après le sas
(`agents/sas.js`, trois passages de la batterie, qualité au moins égale). « Gratuit » ne suffit pas.

Puis : un conteneur `raime-fcc` depuis `Alishahryar1/free-claude-code@ba4b934` (Python 3.14.7, `fcc-server`,
port 8082, réseau `raime_default`, aucun port publié, authentification du proxy activée), et dans
`hermes-data/config.yaml` un fournisseur de plus :

```yaml
providers:
  fcc:
    name: "Free Claude Code"
    api: "http://raime-fcc:8082/v1"
    key_env: "FCC_JETON"
    transport: "codex_responses"
```

## Ce qui reste fermé, et pourquoi

- **Pas de port public, pas de tableau de bord ouvert** : le tableau de bord d'Hermes garde des clés.
- **Messageries (Telegram, Discord, WhatsApp) et navigateur au nom de rAIme** : zone 2, un « ok » de Basile,
  et des jetons qu'il crée lui-même.
- **Argent, captcha, identité** : zone 3, jamais — rappelé dans `SOUL.md`.
