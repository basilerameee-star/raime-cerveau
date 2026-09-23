-- ============================================================================
-- RAPPORT QUOTIDIEN rAIme — requête du nœud « Digest »
-- Workflow n8n : « Héraut · Rapport quotidien », déclenché à 7 h 30.
--
-- POUR L'APPLIQUER : ouvrir le workflow dans n8n, nœud « Digest », remplacer la
-- requête par celle-ci, sauvegarder. Rien d'autre à toucher.
--
-- CE QUI CHANGE PAR RAPPORT À LA VERSION DU 2026-09-05, ET POURQUOI
--
-- ① Le chiffre d'envoi disait faux. L'ancienne version comptait les lignes
--    `outreach` marquées `envoye`. Or l'Expéditeur marquait « envoyé » même
--    quand l'envoi échouait ET même en mode pause. Le rapport annonçait donc
--    « 8 emails envoyés · total 167 » alors que personne n'avait rien reçu.
--    On distingue maintenant CE QUI EST PARTI de CE QUI EST MARQUÉ PARTI, et
--    on affiche le mode d'envoi à côté du chiffre. Un compteur qui ne peut pas
--    être faux vaut mieux qu'un compteur flatteur.
--
-- ② Les phrases étaient coupées au milieu d'un mot. `left(content,140)`
--    produisait « ...et le n », « ...Risq », « ...ton prof ». On coupe
--    désormais au dernier espace et on ajoute un vrai signe de troncature.
--
-- ③ Les alertes apparaissaient en double. Le même incident Fureteur sortait
--    deux fois faute de DISTINCT.
--
-- ④ La veille sortait des noms de dépôts GitHub bruts (« pngwn/sft-out »),
--    illisibles et sans intérêt. On ne retient que les entrées qui ont un vrai
--    titre en langage naturel.
--
-- ⑤ Les idées produit remontaient sur 8 jours dans un rapport qui annonce
--    « ces dernières 24 h ». Elles portent maintenant leur âge.
-- ============================================================================

SELECT json_build_object(
  'date', to_char(now(), 'YYYY-MM-DD'),

  -- ── ① LA VÉRITÉ SUR L'ENVOI ───────────────────────────────────────────────
  -- `mode` est affiché avec les chiffres : un total d'envois n'a aucun sens
  -- si le lecteur ignore que la machine est en pause.
  'envoi_mode', (SELECT mode FROM send_config WHERE id = 1),
  'envoi_plafond', (SELECT daily_cap FROM send_config WHERE id = 1),

  -- Ce qui est PARTI pour de vrai : uniquement quand le mode était 'live'.
  -- En pause ou en test, rien n'atteint un prospect, donc on affiche 0 — pas
  -- le nombre de lignes que la base a marquées.
  'remis_24h', (
    SELECT CASE WHEN (SELECT mode FROM send_config WHERE id = 1) = 'live'
                THEN count(*) ELSE 0 END
    FROM outreach WHERE sent_at > now() - interval '24 hours'),

  -- Ce qui est MARQUÉ envoyé, tous modes confondus. L'écart entre les deux
  -- lignes est en soi l'information : il mesure les brouillons consommés
  -- pour rien.
  'marques_envoyes_24h', (
    SELECT count(*) FROM outreach WHERE sent_at > now() - interval '24 hours'),
  'marques_envoyes_total', (
    SELECT count(*) FROM outreach WHERE status = 'envoye'),

  -- ── LE TUNNEL ─────────────────────────────────────────────────────────────
  'enrichis_24h', (
    SELECT count(*) FROM prospects
     WHERE contact_email IS NOT NULL AND last_touch > now() - interval '24 hours'),
  'emails_total', (
    SELECT count(*) FROM prospects WHERE contact_email IS NOT NULL),
  'enrichissables', (
    SELECT count(*) FROM prospects WHERE website IS NOT NULL AND contact_email IS NULL),
  'eligibles', (
    SELECT count(*) FROM outreach o JOIN prospects p ON o.siren = p.siren
     WHERE o.status IN ('valide','brouillon')
       AND o.to_email IS NOT NULL AND p.website IS NOT NULL
       AND position(lower(split_part(o.to_email,'@',2)) in lower(p.website)) > 0
       AND o.to_email NOT IN (SELECT email FROM suppression)
       AND split_part(o.to_email,'@',1) NOT IN
           ('dpo','rgpd','privacy','postmaster','abuse','noreply','no-reply')
       AND o.sent_at IS NULL),

  -- ── ② TRONCATURE PROPRE ───────────────────────────────────────────────────
  -- On coupe au dernier espace avant la limite, et on marque la coupure.
  -- Une phrase tronquée au milieu d'un mot fait douter de tout le rapport.
  'auditeur', (
    SELECT coalesce(json_agg(c), '[]') FROM (
      SELECT CASE WHEN length(content) <= 190 THEN content
                  ELSE regexp_replace(left(content, 190), '\s+\S*$', '') || ' […]' END AS c
        FROM strategy_notes
       WHERE agent = 'Auditeur' AND created_at > now() - interval '24 hours'
       ORDER BY created_at DESC LIMIT 5) t),

  'athena', (
    SELECT coalesce(json_agg(c), '[]') FROM (
      SELECT CASE WHEN length(content) <= 190 THEN content
                  ELSE regexp_replace(left(content, 190), '\s+\S*$', '') || ' […]' END AS c
        FROM strategy_notes
       WHERE agent = 'Athena' AND created_at > now() - interval '24 hours'
       ORDER BY created_at DESC LIMIT 4) t),

  -- ── ③ PLUS DE DOUBLONS ────────────────────────────────────────────────────
  -- Le même incident répété donne l'impression de deux problèmes distincts.
  'incidents', (
    SELECT coalesce(json_agg(x), '[]') FROM (
      SELECT DISTINCT agent || ' → ' || action_type || ' (' || status || ')' AS x
        FROM incidents WHERE status IN ('needs_human','failed') LIMIT 5) t),

  -- ── ④ VEILLE LISIBLE SEULEMENT ────────────────────────────────────────────
  -- Un identifiant de dépôt (« pngwn/sft-out ») n'apprend rien. On exige un
  -- titre qui contienne au moins un espace et pas de barre oblique : ce qui
  -- reste est une vraie phrase.
  'news', (
    SELECT coalesce(json_agg(titre), '[]') FROM (
      SELECT CASE WHEN length(coalesce(title, summary)) <= 130
                  THEN coalesce(title, summary)
                  ELSE regexp_replace(left(coalesce(title, summary), 130), '\s+\S*$', '') || ' […]'
             END AS titre
        FROM veille_ia
       WHERE captured_at > now() - interval '24 hours'
         AND coalesce(title, summary) LIKE '% %'
         AND coalesce(title, summary) NOT LIKE '%/%'
         AND length(coalesce(title, summary)) > 25
       ORDER BY captured_at DESC LIMIT 5) t),

  -- ── ⑤ LES IDÉES PRODUIT PORTENT LEUR ÂGE ──────────────────────────────────
  -- Une idée d'il y a six jours affichée dans un rapport « des dernières 24 h »
  -- se lit comme une nouveauté. On date.
  'radar', (
    SELECT coalesce(json_agg(x), '[]') FROM (
      SELECT offer_type || ' — ' || left(title, 60)
             || ' (' || extract(day FROM now() - created_at)::int || ' j)' AS x
        FROM product_ideas
       WHERE created_at > now() - interval '8 days'
       ORDER BY id DESC LIMIT 4) t),

  'gardien', (
    SELECT coalesce(json_agg(x), '[]') FROM (
      SELECT DISTINCT '[' || severity || '] ' || rule AS x
        FROM gardien_log WHERE created_at > now() - interval '24 hours' LIMIT 5) t)

) AS digest
