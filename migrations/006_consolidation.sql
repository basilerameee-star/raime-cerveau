-- CONSOLIDATION — cinq surveillants redondants et trois vestiges de l'offre SAI.
-- On conserve les deux seuls workflows qui alertent Basile par courriel : ce sont ses yeux.
UPDATE workflow_entity SET active = false WHERE name IN (
  'Athéna · Réflexion & auto-amélioration',
  'Auditeur · Audit système (6h)',
  'Diagnosticien · Cause racine',
  'Sentinelle · Santé exécutions',
  'Model Radar · Benchmark',
  'Léonard · Fiche d''audit (SAI)',
  'Léonard · Devis (SAI phase 2)',
  'Commercial Engine · Orchestrateur (sandbox)'
);
