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

Lui demander : « Quelles questions le cerveau attend-il de Basile ? ».
Sans entrer dans la conversation, depuis PowerShell (apostrophes doublées : PowerShell retire les guillemets) :
`ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'docker exec raime-hermes hermes -z ''Ta question ici'''` Il doit appeler l'outil
`questions_pour_basile` du serveur `raime` et les lister ; l'appel apparaît au journal du cerveau (acteur `hermes`).

**Après chaque livraison du cerveau** : `docker restart raime-mcp` (le code est lu au démarrage).

## 4 bis. Lui écrire de partout : Telegram

1. Sur Telegram, écrire à `@BotFather` → `/newbot` → garder le **jeton** du bot (Basile crée ce compte lui-même).
2. Écrire à `@userinfobot` → garder son **identifiant** (un nombre) : seul ce compte pourra parler à Hermes.
3. Depuis PowerShell (le jeton est tapé, jamais écrit dans le dépôt ni dans une conversation) :

```powershell
$T = Read-Host "Jeton du bot"; $U = Read-Host "Identifiant Telegram"
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 "echo TELEGRAM_BOT_TOKEN=$T >> /opt/raime/hermes.env && echo TELEGRAM_ALLOWED_USERS=$U >> /opt/raime/hermes.env && cd /opt/raime && docker compose -f docker-compose.hermes.yml up -d --force-recreate hermes"
```

Puis écrire au bot depuis le téléphone. Un message d'un autre compte est ignoré (`TELEGRAM_ALLOWED_USERS`).

## 4 ter. Hermes devient l'exécutant du Cockpit (même apparence)

Le Cockpit confie chaque demande d'action à un « exécutant » (nom réseau `harness`). Le relais
`hermes/executant.js` prend ce nom et transmet à Hermes : le Cockpit ne change pas d'une ligne, et Hermes
écrit une compétence après chaque tâche nouvelle (moins de jetons la fois suivante).

Après la fusion et la Livraison, une seule commande, dans PowerShell :

```powershell
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'bash /opt/raime/raime-brain/hermes/brancher.sh'
```

La dernière ligne doit montrer `"moteur":"hermes"`. Pour revenir à l'ancien exécutant :

```powershell
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'bash /opt/raime/raime-brain/hermes/revenir.sh'
```

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

## 6. La compétence vidéo (sur le PC, avec WanGP)

Hermes du PC (`fcc-hermes`) pilote WanGP par son serveur MCP : « fais-moi une vidéo de… », et il rend
le fichier. Modèle d'abord : Wan 2.2 (Apache 2.0). **MiniMax H3 est exclu** (sa licence exclut l'Union européenne).

Une fois, dans PowerShell :

```powershell
cd C:\Users\Lenovo\Projets\rAIme\cerveau; git pull
python hermes\competences\video-wangp\ajouter_wangp.py
```

Le script trouve le dossier d'Hermes comme Hermes lui-même (sous Windows : `%LOCALAPPDATA%\hermes`,
pas `~\.hermes`), y copie la compétence et ajoute WanGP à sa configuration (copie de secours gardée).
Il affiche les deux chemins : c'est la preuve que tout est au bon endroit.

Puis copier `lancer_wangp_hermes.bat` dans le dossier `scripts` de Wan2GP (à côté de `run.bat`).

**Chaque fois** qu'Hermes doit faire des vidéos : double-cliquer `lancer_wangp_hermes.bat` (WanGP sans
interface, joignable depuis ce PC seulement), puis relancer `fcc-hermes`. Pour retrouver l'interface
habituelle : fermer cette fenêtre, puis `run.bat` comme avant. Une seule des deux à la fois : la carte
graphique n'en porte pas deux.

## 7. Tout en une commande : Hermes aux commandes, jamais à court de crédit

Fait, dans l'ordre : la clé Gemini du coffre donnée à Hermes (jamais affichée) ; la bascule (étape 4 ter) ;
le modèle local (Ollama : Qwen3 4B en service, Gemma 4 E4B essayé à côté, avec sa vitesse et sa licence
affichées) ; le Cockpit reconstruit avec la parole sans frais (retour arrière automatique s'il ne répond pas).
Le premier passage télécharge les modèles : une dizaine de minutes.

```powershell
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'bash /opt/raime/raime-brain/hermes/installer.sh'
```

La dernière ligne doit être `INSTALLE : ...`. Retour : `revenir.sh` (étape 4 ter).

## 8. WhatsApp, avec le numéro personnel de Basile

Hermes se branche comme un appareil lié (comme WhatsApp Web), en mode « self-chat » : on lui écrit dans la
conversation avec soi-même (« Vous »). Rien à créer chez Meta. Trois gestes, dans PowerShell :

```powershell
# 1. le numéro autorisé (indicatif sans +, ex. 336...), tapé ici, jamais écrit dans un fichier du dépôt
$N = Read-Host "Numero WhatsApp (ex. 33612345678)"
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 "printf 'WHATSAPP_ENABLED=true\nWHATSAPP_MODE=self-chat\nWHATSAPP_ALLOWED_USERS=$N\n' >> /opt/raime/hermes.env"
# 2. l'appairage : choisir « self-chat », puis sur le téléphone : Réglages > Appareils connectés > Connecter un appareil, et scanner le QR code
ssh -t -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'docker exec -it raime-hermes hermes whatsapp'
# 3. Hermes relancé avec WhatsApp
ssh -i "$HOME\.ssh\raime_vps" root@2.29.6.94 'cd /opt/raime && docker compose --env-file hermes-compose.env -f docker-compose.hermes.yml up -d --force-recreate hermes'
```

Limites connues (documentation d'Hermes) : ce pont n'est pas l'accès officiel de WhatsApp ; un petit risque
de restriction du compte existe (pas d'envois en masse, pas de messages à des inconnus). Le dossier de session
(`/opt/raime/hermes-data/platforms/whatsapp/session`) donne accès au compte : il ne quitte jamais le serveur.
Les messages qu'Hermes écrit dans « Vous » peuvent arriver sans sonnerie ; pour de vraies alertes, un numéro
dédié (mode « bot ») ou Telegram.

## Ce qui reste fermé, et pourquoi

- **Pas de port public, pas de tableau de bord ouvert** : le tableau de bord d'Hermes garde des clés.
- **Messageries (Telegram, Discord, WhatsApp) et navigateur au nom de rAIme** : zone 2, un « ok » de Basile,
  et des jetons qu'il crée lui-même.
- **Argent, captcha, identité** : zone 3, jamais — rappelé dans `SOUL.md`.
