-- Basile, 30/09/2026 (soir) : « concernant les publicités payantes, je pensais attribuer un petit budget pour
-- la promotion ». Le but 13 redevient une chaîne avec promotion payante, dans un budget qu'il fixe ; chaque
-- campagne part avec son accord (Constitution : l'argent reste à Basile).
UPDATE buts SET enonce = replace(enonce, 'publications organiques Meta ciblées par questions (aucun budget publicitaire)',
                                 'publications Meta ciblées par questions, promues par un petit budget publicitaire fixé par Basile (chaque campagne avec son accord)')
WHERE enonce LIKE 'Chaîne publicitaire autonome%' AND enonce LIKE '%(aucun budget publicitaire)%';
