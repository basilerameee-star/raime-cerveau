-- LA SENTINELLE (sentinelleMon01, nœud « Diagnostic »), réécrite le 14/10/2026. Elle n'écrit à Basile que ce qu'il peut
-- régler, et une seule fois. Avant : « Fureteur ne tourne plus » partait toutes les 6 h depuis le 10/10 alors que le Fureteur
-- passait chaque heure (le moteur de recherche est fermé : il ne trouve rien) ; une erreur partait 4 fois en 24 h, même
-- d'un flux retiré (le Portier, 14/10 à 17 h 08) ; « aucun e-mail envoyé » ne se déclenchait plus (objet de 2025 « x IA »).
-- Le reste (Fureteur, envois de la veille, livraison) est dans le rapport de 7 h 30 (jarvis/serveur.cjs, « Les envois »).
-- Posée par n8n/poser_envois.py ; la clause des clips (n8n/sentinelle_clips.sql) s'ajoute avant le « ) x » final.
-- Les lignes « -- » ne sont pas posées ; aucune ligne de code ne porte de commentaire.
SELECT probleme, (SELECT test_to FROM send_config WHERE id = 1) AS pour FROM (
-- ① un flux EN SERVICE en erreur depuis le dernier passage réussi de la Sentinelle : chaque erreur une seule fois.
--    Le Portier (portierLead0001) est retiré du service depuis le 14/10/2026 : il n'est plus surveillé.
SELECT w.name || ' : ' || count(*) || ' exécution(s) en erreur, la dernière à ' || to_char(max(e."startedAt") AT TIME ZONE 'Europe/Paris', 'HH24"h"MI') || ' (à ouvrir dans n8n)' AS probleme
FROM execution_entity e JOIN workflow_entity w ON w.id = e."workflowId"
WHERE e.status IN ('error', 'crashed') AND w."activeVersionId" IS NOT NULL AND w.id NOT IN ('portierLead0001', 'sentinelleMon01')
AND e."startedAt" > coalesce((SELECT max(s."startedAt") FROM execution_entity s WHERE s."workflowId" = 'sentinelleMon01' AND s.status = 'success'), now() - interval '6 hours')
GROUP BY w.name
UNION ALL
-- ② au passage de midi d'un jour ouvré, envoi en réel : aucun pré-audit parti alors que des e-mails validés attendent
SELECT 'Pré-audits : aucun e-mail parti aujourd''hui alors que ' || (SELECT count(*) FROM envoi_preaudits) || ' attendent' || coalesce(' ; dernier refus de Resend : ' || (SELECT left(erreur, 160) FROM outreach WHERE erreur IS NOT NULL ORDER BY id DESC LIMIT 1), '')
WHERE extract(isodow FROM now() AT TIME ZONE 'Europe/Paris') < 6 AND extract(hour FROM now() AT TIME ZONE 'Europe/Paris') BETWEEN 11 AND 16
AND (SELECT mode FROM send_config WHERE id = 1) = 'live' AND plafond_envoi('preaudits') > 0 AND EXISTS (SELECT 1 FROM envoi_preaudits)
AND NOT EXISTS (SELECT 1 FROM outreach WHERE status = 'envoye' AND sent_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')
UNION ALL
-- ③ la même chose pour les vitrines
SELECT 'Vitrines : aucun e-mail parti aujourd''hui alors que ' || (SELECT count(*) FROM envoi_vitrines) || ' attendent' || coalesce(' ; dernier refus de Resend : ' || (SELECT left(erreur, 160) FROM vitrines_envoi WHERE erreur IS NOT NULL ORDER BY maj_le DESC LIMIT 1), '')
WHERE extract(isodow FROM now() AT TIME ZONE 'Europe/Paris') < 6 AND extract(hour FROM now() AT TIME ZONE 'Europe/Paris') BETWEEN 11 AND 16
AND (SELECT mode FROM vitrines_envoi_config WHERE id = 1) = 'live' AND plafond_envoi('vitrines') > 0 AND EXISTS (SELECT 1 FROM envoi_vitrines)
AND NOT EXISTS (SELECT 1 FROM vitrines_envoi WHERE statut = 'envoye' AND envoye_le >= date_trunc('day', now() AT TIME ZONE 'Europe/Paris') AT TIME ZONE 'Europe/Paris')
UNION ALL
-- ④ au passage de midi : un flux planifié en service qui ne s'est pas exécuté (n8n arrêté, déclencheur perdu)
SELECT w.name || ' : aucune exécution depuis ' || f.h || ' h' FROM (VALUES ('sherlockSrc00001', 8), ('expediteurEnv001', 28), ('vitrinesEnvoi01', 28), ('heraut00000001', 28)) AS f(id, h)
JOIN workflow_entity w ON w.id = f.id AND w."activeVersionId" IS NOT NULL
WHERE extract(hour FROM now() AT TIME ZONE 'Europe/Paris') BETWEEN 11 AND 16
AND NOT EXISTS (SELECT 1 FROM execution_entity e WHERE e."workflowId" = f.id AND e."startedAt" > now() - make_interval(hours => f.h))
) x
