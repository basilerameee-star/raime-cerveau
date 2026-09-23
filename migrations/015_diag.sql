SELECT id, created_at, sent_at, left(subject, 44) AS objet
FROM outreach WHERE sent_at::date = '2026-09-04' ORDER BY created_at;
