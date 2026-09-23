// Synchronise le catalogue de modèles depuis OpenRouter (prix + contexte) et
// journalise les changements de prix dans radar_events (Pilier 2).
//   DATABASE_URL=... OPENROUTER_API_KEY=... node sync/openrouter_sync.js
import pg from 'pg';

const key = process.env.OPENROUTER_API_KEY;
if (!key) { console.error('OPENROUTER_API_KEY manquante'); process.exit(1); }

const res = await fetch('https://openrouter.ai/api/v1/models', {
  headers: { Authorization: `Bearer ${key}` },
});
if (!res.ok) { console.error('OpenRouter HTTP', res.status); process.exit(1); }
const { data } = await res.json();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
let priceChanges = 0;
try {
  for (const m of data) {
    const provider = (m.id.split('/')[0] || 'unknown').trim();
    const name = m.name || m.id;
    const ctx  = m.context_length || null;
    const pin  = m.pricing?.prompt ? Number(m.pricing.prompt) * 1e6 : null;      // $/1M entrée
    const pout = m.pricing?.completion ? Number(m.pricing.completion) * 1e6 : null; // $/1M sortie

    const prev = await db.query('SELECT price_in, price_out FROM models WHERE openrouter_id=$1', [m.id]);
    if (prev.rows[0]) {
      const a = prev.rows[0];
      if (Number(a.price_in) !== pin || Number(a.price_out) !== pout) {
        await db.query(
          `INSERT INTO radar_events(kind,source,title,payload)
           VALUES('price_change','openrouter',$1,$2)`,
          [name, JSON.stringify({ id: m.id, from: a, to: { price_in: pin, price_out: pout } })]);
        priceChanges++;
      }
    }
    // Releve quotidien : la table models donne l'etat present, celle-ci donne la COURBE.
    // Sans elle, impossible de dire a un client ce que sa tache coutait il y a trois mois.
    await db.query(
      `INSERT INTO model_prices_history(openrouter_id, price_in, price_out, context_tokens, releve_le)
       VALUES($1,$2,$3,$4,current_date)
       ON CONFLICT (openrouter_id, releve_le) DO UPDATE
         SET price_in = EXCLUDED.price_in, price_out = EXCLUDED.price_out,
             context_tokens = EXCLUDED.context_tokens`,
      [m.id, pin, pout, ctx]);

    await db.query(
      `INSERT INTO models(provider,name,openrouter_id,context_tokens,price_in,price_out,source,verify,as_of)
       VALUES($1,$2,$3,$4,$5,$6,'openrouter',false,current_date)
       ON CONFLICT(provider,name) DO UPDATE SET
         openrouter_id=$3, context_tokens=$4, price_in=$5, price_out=$6,
         source='openrouter', verify=false, as_of=current_date, updated_at=now()`,
      [provider, name, m.id, ctx, pin, pout]);
  }
  console.log(`Sync OK — ${data.length} modèles, ${priceChanges} changement(s) de prix journalisé(s).`);
} finally {
  await db.end();
}
