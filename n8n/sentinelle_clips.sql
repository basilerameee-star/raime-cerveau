-- Ajouté au nœud « Diagnostic » de la Sentinelle (sentinelleMon01) par n8n/poser_veilleurs.py, juste avant le « ) x » final.
-- Le vérificateur des publications (clippeur/verificateur.py) écrit au journal du Gardien un clip qui disparaît, ou une
-- plateforme illisible. La Sentinelle le reprend UNE fois : seulement ce qui est arrivé depuis son dernier passage réussi
-- (un passage en échec, Resend en panne par exemple, laisse l'alerte au suivant). Les lignes « -- » ne sont pas posées.
 UNION ALL SELECT g.rule || ' : ' || left(g.detail, 1800) FROM gardien_log g WHERE g.rule IN ('Clips disparus', 'Clips non vérifiés', 'Vérificateur des clips en échec') AND g.created_at > coalesce((SELECT max(e."startedAt") FROM execution_entity e WHERE e."workflowId" = 'sentinelleMon01' AND e.status = 'success'), now() - interval '6 hours')
