SELECT sent_at::date AS jour, count(*) AS envoyes,
       count(*) FILTER (WHERE body LIKE '%premier regard sous 48 heures%') AS avec_offre,
       count(*) FILTER (WHERE body ILIKE '%une intelligence artificielle qui%') AS message_amy,
       left(min(subject), 48) AS objet
FROM outreach WHERE sent_at > now() - interval '3 days'
GROUP BY 1 ORDER BY 1 DESC;
