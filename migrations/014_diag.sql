SELECT status, count(*) AS n, count(*) FILTER (WHERE sent_at IS NULL) AS non_envoyes
FROM outreach GROUP BY status ORDER BY 2 DESC;
