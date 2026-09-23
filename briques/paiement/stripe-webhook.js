// Cloudflare Pages Function — livraison automatique du livre après paiement Stripe.
// Endpoint : https://raime.fr/stripe-webhook
// Variables d'environnement requises (à définir dans Cloudflare Pages → Settings → Environment variables) :
//   STRIPE_WEBHOOK_SECRET  (le "signing secret" du webhook Stripe, commence par whsec_)
//   RESEND_API_KEY         (clé API Resend, commence par re_)

const PDF_URL = "https://raime.fr/d/ia-pour-tous-9f27ab5c.pdf";
const FROM = "rAIme <livre@raime.fr>";

export async function onRequestPost({ request, env }) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature") || "";

  const ok = await verifyStripe(body, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("invalid signature", { status: 400 });

  let event;
  try { event = JSON.parse(body); } catch { return new Response("bad json", { status: 400 }); }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object || {};
    const email = (s.customer_details && s.customer_details.email) || s.customer_email;
    const name = (s.customer_details && s.customer_details.name) || "";
    if (email) {
      try { await sendBook(email, name, env.RESEND_API_KEY); }
      catch (e) { return new Response("send failed: " + e.message, { status: 500 }); }
    }
  }
  return new Response("ok", { status: 200 });
}

// Vérifie la signature Stripe (HMAC-SHA256) via Web Crypto.
async function verifyStripe(payload, header, secret) {
  if (!secret || !header) return false;
  const parts = {};
  for (const kv of header.split(",")) { const [k, v] = kv.split("="); parts[k] = v; }
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

// Envoie l'email avec le PDF en pièce jointe via Resend.
async function sendBook(email, name, apiKey) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM,
      to: [email],
      reply_to: "contact@raime.fr",
      subject: "Votre livre : L'IA pour tous",
      html: `<div style="background:#1d3f78;padding:32px 20px;font-family:Inter,system-ui,Arial,sans-serif">
        <div style="max-width:520px;margin:0 auto;color:#eef2f8;font-size:15px;line-height:1.6">
          <p style="margin:0 0 20px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#c3ccda">rAIme · Le livre</p>
          <h1 style="margin:0 0 20px;font-size:26px;line-height:1.15;color:#fff">Merci${name ? " " + escapeHtml(name) : ""}.</h1>
          <p style="margin:0 0 14px">Votre exemplaire de <b style="color:#fff">L'IA pour tous</b> est en pièce jointe, au format PDF.</p>
          <p style="margin:0 0 14px">Le conseil qui fait la différence : à la fin de chaque chapitre, prenez cinq minutes pour l'encadré <b style="color:#fff">« À vous de jouer »</b>. C'est en pratiquant qu'on passe de « j'ai lu » à « je m'en sers ».</p>
          <p style="margin:0 0 14px">Une question ? Répondez simplement à cet e-mail.</p>
          <p style="margin:28px 0 0;padding-top:14px;border-top:1px solid rgba(255,255,255,.25);font-size:13px;color:#c3ccda">Basile Ramé · <a href="https://raime.fr" style="color:#fff;text-decoration:none">raime.fr</a></p>
        </div>
      </div>`,
      attachments: [{ filename: "L-IA-pour-tous.pdf", path: PDF_URL }],
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  return true;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
