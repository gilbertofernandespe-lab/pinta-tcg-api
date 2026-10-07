// api/aviso-pedido.js
//
// Recebe o aviso do banco (Supabase) quando entra um pedido novo na loja
// e manda um e-mail para você, pelo Resend (grátis até 100 e-mails/dia).
// Só aceita chamadas com a senha certa (AVISO_SEGREDO), que fica no
// supabase-extras.sql e aqui na Vercel.
//
// Variáveis de ambiente (veja vercel-env-exemplo.txt):
//   RESEND_API_KEY, AVISO_EMAIL, AVISO_SEGREDO
//   (opcional) SITE_URL — endereço do seu site, para o botão "Abrir pedidos"

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (t) => String(t == null ? '' : t)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const VARIACOES = {
  normal: 'Normal', reverse: 'Reverse Holo', holo: 'Holo', pokeball: 'Reverse Pokébola',
  masterball: 'Reverse Master Ball', primeira: '1ª Edição', carimbada: 'Carimbada', outra: 'Outra variação',
};

function numeroCarta(n) {
  const m = String(n || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? m[1].padStart(3, '0') + '/' + m[2].padStart(3, '0') : String(n || '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  const segredo = String(process.env.AVISO_SEGREDO || '');
  if (!segredo || req.headers['x-pinta-segredo'] !== segredo) {
    res.status(401).json({ error: 'Não autorizado.' });
    return;
  }
  if (!process.env.RESEND_API_KEY || !process.env.AVISO_EMAIL) {
    res.status(500).json({ error: 'Faltam RESEND_API_KEY ou AVISO_EMAIL na Vercel.' });
    return;
  }

  let p = req.body || {};
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = {}; } }

  const itens = Array.isArray(p.items) ? p.items : [];
  const envio = p.shipping && p.shipping.tipo === 'envio';
  const frete = Number(p.shipping_price) || 0;
  const total = (Number(p.total) || 0) + frete;
  const end = p.address || {};

  let whats = String(p.buyer_contact || '').replace(/\D/g, '');
  if (whats.length === 10 || whats.length === 11) whats = '55' + whats;

  const linhasItens = itens.map((i) =>
    `<tr><td style="padding:4px 0">${esc(i.qty)}× <b>${esc(i.name)}</b>` +
    `${i.number ? ' <span style="color:#6E6454">(' + esc(numeroCarta(i.number)) + ')</span>' : ''}` +
    `${(i.variant || i.condition || i.language) ? '<br><span style="color:#6E6454;font-size:13px">' +
      [VARIACOES[i.variant] || i.variant, i.condition, i.language].filter(Boolean).map(esc).join(' · ') + '</span>' : ''}</td>` +
    `<td style="padding:4px 0;text-align:right;white-space:nowrap">${BRL.format((Number(i.price) || 0) * (Number(i.qty) || 1))}</td></tr>`
  ).join('');

  const blocoEntrega = envio
    ? `<p style="margin:14px 0 4px"><b>📦 ${esc(p.shipping.nome || 'Envio')}</b> — ${BRL.format(frete)}</p>
       <p style="margin:0;color:#4A4236;font-size:14px">${esc(end.rua)}, ${esc(end.numero)}${end.complemento ? ' — ' + esc(end.complemento) : ''}<br>
       ${esc(end.bairro)} · ${esc(end.cidade)}/${esc(end.uf)} · CEP ${esc(String(end.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2'))}</p>`
    : '<p style="margin:14px 0 4px"><b>🤝 Entrega combinada pelo WhatsApp</b></p>';

  const site = String(process.env.SITE_URL || '').replace(/\/+$/, '');

  // O mesmo aviso serve para: pedido novo, cliente aceitou a alteração
  // e cliente cancelou o pedido (o banco chama aqui nos três casos).
  const num = p.numero ? ' Nº ' + p.numero : '';
  const tipo = p.status === 'aceito' ? 'aceito' : p.status === 'cancelado' ? 'cancelado' : 'novo';
  const titulo = tipo === 'aceito' ? '✅ Cliente aceitou a alteração do pedido' + num
    : tipo === 'cancelado' ? '❌ Cliente cancelou o pedido' + num
    : '🃏 Novo pedido' + num + ' na loja Pinta TCG';
  const explica = tipo === 'aceito' ? 'O cliente confirmou o pedido ajustado. Agora é só confirmar e separar as cartas na área de Pedidos.'
    : tipo === 'cancelado' ? 'O cliente cancelou este pedido. O estoque não foi mexido.'
    : 'Confira o estoque das cartas e confirme (ou altere) o pedido na área de Pedidos.';

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#1E1A13">
    <div style="background:#1E1A13;color:#FFB627;padding:14px 18px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">
      ${esc(titulo)}
    </div>
    <div style="border:1px solid #e5dfd3;border-top:0;border-radius:0 0 12px 12px;padding:18px">
      <p style="margin:0 0 10px;color:#4A4236;font-size:14px">${esc(explica)}</p>
      <p style="margin:0 0 4px;font-size:17px"><b>${esc(p.buyer_name)}</b></p>
      <p style="margin:0;color:#4A4236">WhatsApp: ${esc(p.buyer_contact)}${p.pix_ref ? ' · Pix ref.: <b>' + esc(p.pix_ref) + '</b>' : ''}</p>
      ${p.buyer_note ? `<p style="margin:10px 0 0;font-style:italic;color:#4A4236">“${esc(p.buyer_note)}”</p>` : ''}
      <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:15px">${linhasItens}</table>
      ${blocoEntrega}
      <p style="margin:16px 0 0;font-size:20px;text-align:right">Total: <b style="color:#E8384F">${BRL.format(total)}</b></p>
      <p style="margin:18px 0 0">
        ${whats.length >= 12 ? `<a href="https://wa.me/${whats}" style="background:#E8384F;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Chamar no WhatsApp</a>` : ''}
        ${site ? `<a href="${esc(site)}/index.html" style="margin-left:8px;color:#1E1A13;font-weight:bold">Abrir Pedidos →</a>` : ''}
      </p>
    </div>
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.AVISO_REMETENTE || 'Pinta TCG <onboarding@resend.dev>',
        to: [process.env.AVISO_EMAIL],
        subject: `${titulo}: ${p.buyer_name || 'comprador'} — ${BRL.format(total)}`,
        html,
      }),
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) { res.status(502).json({ error: 'Resend recusou o e-mail.', details: dados }); return; }
    res.status(200).json({ ok: true, id: dados.id });
  } catch (err) {
    res.status(502).json({ error: 'Falha ao enviar o e-mail.', details: err.message });
  }
}
