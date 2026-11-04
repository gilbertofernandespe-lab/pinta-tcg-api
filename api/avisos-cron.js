// api/avisos-cron.js — roda os avisos automáticos uma vez por dia (Vercel Cron,
// ver vercel.json). Se CRON_SECRET estiver configurado na Vercel, só aceita a
// chamada com esse segredo (a Vercel manda sozinha). A rotina não repete
// avisos (tabela avisos_enviados), então chamar de novo não manda e-mail dobrado.
import { rodarAvisos } from './_avisos.js';

const env = (k) => String(process.env[k] || '').trim();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const segredo = env('CRON_SECRET');
  const auth = String(req.headers.authorization || '');
  const ehCron = segredo ? auth === `Bearer ${segredo}` : /vercel-cron/i.test(String(req.headers['user-agent'] || ''));
  if (!ehCron) { res.status(401).json({ error: 'Só o agendamento da Vercel chama esta rotina.' }); return; }
  const k = env('SUPABASE_SERVICE_ROLE_KEY');
  const H = { apikey: k, 'Content-Type': 'application/json' };
  if (k.startsWith('eyJ')) H.Authorization = `Bearer ${k}`;
  try {
    const r = await rodarAvisos({
      sb: env('SUPABASE_URL').replace(/\/+$/, ''), H,
      chaveResend: env('RESEND_API_KEY'),
      remetente: env('AVISO_REMETENTE') || 'Pinta TCG <onboarding@resend.dev>',
    });
    res.status(200).json({ ok: true, ...r });
  } catch (err) {
    res.status(500).json({ error: String(err.message || err) });
  }
}
