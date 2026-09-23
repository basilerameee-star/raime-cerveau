-- PAUSE DEMANDÉE PAR BASILE — il finit le RS6776 avant de prospecter.
-- Une réponse qui arrive alors qu'il ne peut pas la traiter coûte plus qu'un message non envoyé.
UPDATE send_config SET mode = 'pause' WHERE id = 1;
