UPDATE outreach SET status = 'annule'
WHERE sent_at IS NULL AND status = 'brouillon'
  AND (body ILIKE '%automatis%' OR body ILIKE '%perdre un temps fou%');
SELECT count(*) AS file_restante,
       count(*) FILTER (WHERE body ILIKE '%automatis%') AS residus_automatisation
FROM outreach WHERE sent_at IS NULL AND status = 'brouillon';
