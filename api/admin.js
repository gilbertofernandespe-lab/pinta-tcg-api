// api/admin.js
//
// Administração da loja: só o DONO (e-mail em DONO_EMAIL) consegue usar.
// Lista as contas, troca senha, bloqueia/desbloqueia, edita nome e
// WhatsApp e apaga contas. Também cadastra cliente pela loja (venda
// presencial) e manda o e-mail de "cartas novas" para quem pediu avisos.
// Usa a chave secreta do Supabase, que fica SÓ aqui na Vercel (nunca no site).
//
// Variáveis de ambiente (Vercel → pinta-tcg-api → Settings → Environment Variables):
//   SUPABASE_URL               — a mesma do config.js do site
//   SUPABASE_ANON_KEY          — a mesma do config.js do site
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Project Settings → API Keys → chave secreta
//   DONO_EMAIL                 — o e-mail do seu login (o dono de tudo)
//   RESEND_API_KEY             — a mesma do aviso de pedido (e-mail de cartas novas)
//   AVISO_REMETENTE            — ex.: 'Pinta TCG <loja@pintatcg.com.br>' (precisa de domínio
//                                verificado no Resend para mandar e-mail aos clientes)

const env = (k) => String(process.env[k] || '').trim();

function cabecalhosAdmin() {
  const k = env('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: k, 'Content-Type': 'application/json' };
  // chave antiga (service_role, começa com "eyJ") também vai no Authorization
  if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`;
  return h;
}

async function json(resp) {
  try { return await resp.json(); } catch { return {}; }
}

// senha temporária fácil de ditar (sem letras parecidas: 0/O, 1/l)
function senhaTemporaria() {
  const letras = 'abcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 4; i++) s += numeros[Math.floor(Math.random() * numeros.length)];
  return s;
}

export default async function handler(req, res) {
  // só o site da loja chama a administração
  const origem = String(req.headers.origin || '');
  const permitidas = /^https:\/\/(www\.)?pintatcg\.com\.br$|^https:\/\/pinta-tcg-colecao(-[a-z0-9-]+)?\.vercel\.app$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  if (permitidas.test(origem)) res.setHeader('Access-Control-Allow-Origin', origem);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }

  const sb = env('SUPABASE_URL').replace(/\/+$/, '');
  const faltam = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DONO_EMAIL'].filter((k) => !env(k));
  if (faltam.length) {
    res.status(500).json({ error: 'Falta configurar na Vercel (projeto pinta-tcg-api): ' + faltam.join(', ') + '.' });
    return;
  }

  // ---------- quem está pedindo? só o dono passa ----------
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Entre na sua conta de novo.' }); return; }
  const ru = await fetch(`${sb}/auth/v1/user`, {
    headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` },
  });
  const eu = await json(ru);
  if (!ru.ok || !eu.id) { res.status(401).json({ error: 'Sua sessão expirou. Saia e entre de novo.' }); return; }
  const dono = String(eu.email || '').toLowerCase() === env('DONO_EMAIL').toLowerCase();
  if (!dono) { res.status(403).json({ error: 'Só o dono da loja pode usar a administração.' }); return; }

  let corpo = req.body || {};
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = {}; } }
  const acao = String(corpo.acao || '');
  const id = String(corpo.id || '');
  const idValido = /^[0-9a-f-]{36}$/i.test(id);
  const H = cabecalhosAdmin();

  try {
    // ---------- só confere se é o dono ----------
    if (acao === 'quem') { res.status(200).json({ dono: true, id: eu.id }); return; }

    // ---------- lista de contas ----------
    if (acao === 'listar') {
      const usuarios = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const r = await fetch(`${sb}/auth/v1/admin/users?page=${pagina}&per_page=200`, { headers: H });
        const d = await json(r);
        if (!r.ok) {
          res.status(502).json({ error: 'O Supabase recusou a chave secreta. Confira a SUPABASE_SERVICE_ROLE_KEY na Vercel.', details: d.msg || d.message || d.error });
          return;
        }
        const lista = Array.isArray(d.users) ? d.users : [];
        usuarios.push(...lista);
        if (lista.length < 200) break;
      }
      const [rl, rp] = await Promise.all([
        fetch(`${sb}/rest/v1/lojistas?select=user_id`, { headers: H }),
        fetch(`${sb}/rest/v1/orders?select=customer_id,status,total,shipping_price&customer_id=not.is.null&limit=10000`, { headers: H }),
      ]);
      const lojistas = new Set((rl.ok ? await json(rl) : []).map((x) => x.user_id));
      const pedidos = {};
      (rp.ok ? await json(rp) : []).forEach((o) => {
        const p = pedidos[o.customer_id] = pedidos[o.customer_id] || { total: 0, comprado: 0 };
        p.total++;
        if (o.status === 'confirmado' || o.status === 'concluido') {
          p.comprado += (Number(o.total) || 0) + (Number(o.shipping_price) || 0);
        }
      });
      const agora = Date.now();
      res.status(200).json({
        eu: eu.id,
        contas: usuarios.map((u) => {
          const m = u.user_metadata || {};
          return {
            id: u.id,
            email: u.email || '',
            nome: m.nome || '',
            whatsapp: m.whatsapp || '',
            criado: u.created_at || null,
            ultimo_acesso: u.last_sign_in_at || null,
            bloqueado: !!(u.banned_until && Date.parse(u.banned_until) > agora),
            lojista: lojistas.has(u.id),
            dono: u.id === eu.id,
            pedidos: (pedidos[u.id] && pedidos[u.id].total) || 0,
            comprado: (pedidos[u.id] && pedidos[u.id].comprado) || 0,
          };
        }).sort((a, b) => (b.dono - a.dono) || String(b.criado).localeCompare(String(a.criado))),
      });
      return;
    }

    // ---------- cadastrar cliente (pela loja, ex.: venda na rua) ----------
    if (acao === 'criar') {
      const nome = String(corpo.nome || '').trim().slice(0, 80);
      const whatsapp = String(corpo.whatsapp || '').trim().slice(0, 40);
      const email = String(corpo.email || '').trim().toLowerCase().slice(0, 120);
      const avisos = corpo.avisos === true;
      let senha = String(corpo.senha || '');
      if (nome.length < 2) { res.status(400).json({ error: 'Coloque o nome do cliente.' }); return; }
      if (whatsapp.replace(/\D/g, '').length < 10) { res.status(400).json({ error: 'Coloque o WhatsApp com DDD.' }); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { res.status(400).json({ error: 'Confira o e-mail.' }); return; }
      if (!senha) senha = senhaTemporaria();
      if (senha.length < 6 || senha.length > 72) { res.status(400).json({ error: 'A senha precisa ter de 6 a 72 caracteres.' }); return; }
      const r = await fetch(`${sb}/auth/v1/admin/users`, {
        method: 'POST', headers: H,
        body: JSON.stringify({
          email, password: senha, email_confirm: true,
          user_metadata: { nome, whatsapp, avisos, origem: 'balcao' },
        }),
      });
      const d = await json(r);
      if (!r.ok) {
        const msg = String(d.msg || d.message || d.error_description || d.error || '');
        if (/already|registered|exists/i.test(msg)) { res.status(409).json({ error: 'Esse e-mail já tem conta. Procure o cliente pelo nome ou WhatsApp.' }); return; }
        throw new Error(msg || ('erro ' + r.status));
      }
      // a linha em "clientes" é criada pelo banco (gatilho); devolve ela
      let cliente = null;
      const rc = await fetch(`${sb}/rest/v1/clientes?user_id=eq.${d.id}&select=*`, { headers: H });
      if (rc.ok) { const lista = await json(rc); cliente = Array.isArray(lista) ? lista[0] || null : null; }
      res.status(200).json({ ok: true, id: d.id, senha, cliente });
      return;
    }

    // ---------- avisar clientes por e-mail: chegaram cartas novas ----------
    if (acao === 'novidades_email') {
      const chave = env('RESEND_API_KEY');
      if (!chave) { res.status(500).json({ error: 'Falta a RESEND_API_KEY na Vercel (projeto pinta-tcg-api).' }); return; }
      const remetente = env('AVISO_REMETENTE') || 'Pinta TCG <onboarding@resend.dev>';
      const assunto = String(corpo.assunto || '').trim().slice(0, 120) || '🃏 Chegaram cartas novas na Pinta TCG';
      const texto = String(corpo.texto || '').trim().slice(0, 2000);
      const link = /^https:\/\/[^\s"<>]+$/.test(String(corpo.link || '')) ? String(corpo.link) : '';
      const contaLink = /^https:\/\/[^\s"<>]+$/.test(String(corpo.conta || '')) ? String(corpo.conta) : '';
      const cartas = (Array.isArray(corpo.cartas) ? corpo.cartas : []).slice(0, 12).map((c) => ({
        nome: String((c && c.nome) || '').slice(0, 80),
        detalhe: String((c && c.detalhe) || '').slice(0, 120),
        preco: Number(c && c.preco) || 0,
        // e-mail não mostra .webp em vários aplicativos: usa o .png da TCGdex
        imagem: /^https:\/\/[^\s"<>]+$/.test(String((c && c.imagem) || ''))
          ? String(c.imagem).replace(/\/high\.webp$/, '/low.png').replace(/\/low\.webp$/, '/low.png') : '',
      }));

      // e-mail que o Resend aceita: sem ponto no começo/fim antes do @, sem
      // ".." e só letras sem acento (ex.: "fulano.@gmail.com" é recusado e
      // derrubava o envio de TODOS do mesmo lote)
      const emailValido = (e) => /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(e) && e.length <= 254;
      const invalidos = [];
      let destinatarios;
      if (corpo.teste) {
        destinatarios = [{ nome: 'Teste', email: String(eu.email || '') }];
      } else {
        const rd = await fetch(`${sb}/rest/v1/clientes?avisos=eq.true&email=not.is.null&select=nome,email&limit=2000`, { headers: H });
        if (!rd.ok) { res.status(502).json({ error: 'Não deu para ler a lista de clientes (rodou o sql/2026-10-melhorias.sql?).' }); return; }
        const vistos = new Set();
        destinatarios = [];
        (await json(rd)).forEach((c) => {
          const e = String(c.email || '').trim().toLowerCase();
          if (vistos.has(e)) return;
          vistos.add(e);
          if (emailValido(e)) destinatarios.push({ nome: c.nome, email: e });
          else invalidos.push({ nome: c.nome, email: c.email });
        });
      }
      if (!destinatarios.length) { res.status(200).json({ ok: true, enviados: 0, total: 0, invalidos }); return; }

      const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
      const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const grade = cartas.map((c) => `
        <td style="width:33%;padding:6px;vertical-align:top;text-align:center">
          ${c.imagem ? `<img src="${esc(c.imagem)}" alt="" width="140" style="width:100%;max-width:140px;border-radius:6px;display:block;margin:0 auto 6px">` : ''}
          <div style="font-size:13px;font-weight:bold;color:#1E1A13">${esc(c.nome)}</div>
          ${c.detalhe ? `<div style="font-size:11px;color:#6E6454">${esc(c.detalhe)}</div>` : ''}
          ${c.preco > 0 ? `<div style="font-size:14px;font-weight:bold;color:#E8384F;margin-top:2px">${BRL.format(c.preco)}</div>` : ''}
        </td>`);
      const linhas = [];
      for (let i = 0; i < grade.length; i += 3) linhas.push('<tr>' + grade.slice(i, i + 3).join('') + '</tr>');
      const montar = (nome) => `
        <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1E1A13">
          <div style="background:#1E1A13;color:#FFB627;padding:14px 18px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${esc(assunto)}</div>
          <div style="border:1px solid #e5dfd3;border-top:0;border-radius:0 0 12px 12px;padding:18px">
            <p style="margin:0 0 10px;font-size:15px">Olá${nome ? ', ' + esc(String(nome).split(/\s+/)[0]) : ''}!</p>
            ${texto ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;white-space:pre-line">${esc(texto)}</p>` : ''}
            ${linhas.length ? `<table role="presentation" style="width:100%;border-collapse:collapse">${linhas.join('')}</table>` : ''}
            ${link ? `<p style="margin:18px 0 0;text-align:center"><a href="${esc(link)}" style="background:#E8384F;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Ver as cartas na loja</a></p>` : ''}
            <p style="margin:22px 0 0;font-size:11px;color:#6E6454;line-height:1.5">Você recebe este e-mail porque pediu avisos de novidades da Pinta TCG.
              ${contaLink ? `Para não receber mais, desmarque em <a href="${esc(contaLink)}" style="color:#6E6454">Minha conta</a> ou responda pedindo para sair.` : 'Para não receber mais, responda pedindo para sair.'}</p>
          </div>
        </div>`;

      let enviados = 0;
      const falhas = [];
      for (let i = 0; i < destinatarios.length; i += 100) {
        const lote = destinatarios.slice(i, i + 100).map((d) => ({
          from: remetente, to: [d.email], subject: assunto, html: montar(d.nome),
        }));
        const r = await fetch('https://api.resend.com/emails/batch', {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(lote),
        });
        const d = await json(r);
        if (!r.ok && /`to`|to field|email address/i.test(String(d.message || d.error || '')) && lote.length > 1) {
          // um endereço ruim derruba o lote inteiro: manda um por um
          for (const um of lote) {
            const r1 = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
              body: JSON.stringify(um),
            });
            if (r1.ok) enviados += 1;
            else {
              const d1 = await json(r1);
              invalidos.push({ nome: (destinatarios.find((x) => x.email === um.to[0]) || {}).nome, email: um.to[0] });
              falhas.push(String(d1.message || d1.error || ('erro ' + r1.status)));
            }
          }
          continue;
        }
        if (!r.ok) {
          const msg = String(d.message || d.error || ('erro ' + r.status));
          if (/domain|verify|testing emails|own email/i.test(msg)) {
            res.status(400).json({
              error: 'O Resend só deixa mandar e-mail para outras pessoas depois que você verificar um domínio próprio (ex.: pintatcg.com.br) em resend.com/domains e colocar AVISO_REMETENTE na Vercel.',
              details: msg, enviados,
            });
            return;
          }
          falhas.push(msg);
          continue;
        }
        enviados += Array.isArray(d.data) ? d.data.length : lote.length;
      }
      if (!enviados && falhas.length) { res.status(502).json({ error: 'O Resend recusou: ' + falhas[0], invalidos }); return; }
      res.status(200).json({ ok: true, enviados, total: destinatarios.length, falhas: falhas.length, invalidos });
      return;
    }

    if (!idValido) { res.status(400).json({ error: 'Conta inválida.' }); return; }
    const mexerNoDono = id === eu.id;
    const atualizar = async (dados) => {
      const r = await fetch(`${sb}/auth/v1/admin/users/${id}`, { method: 'PUT', headers: H, body: JSON.stringify(dados) });
      const d = await json(r);
      if (!r.ok) throw new Error(d.msg || d.message || d.error_description || d.error || ('erro ' + r.status));
      return d;
    };

    // ---------- senha nova ----------
    if (acao === 'senha') {
      let senha = String(corpo.senha || '');
      if (!senha) senha = senhaTemporaria();
      if (senha.length < 6 || senha.length > 72) { res.status(400).json({ error: 'A senha precisa ter de 6 a 72 caracteres.' }); return; }
      await atualizar({ password: senha });
      res.status(200).json({ ok: true, senha });
      return;
    }

    // ---------- bloquear / desbloquear ----------
    if (acao === 'bloquear') {
      if (mexerNoDono) { res.status(400).json({ error: 'Você não pode bloquear a sua própria conta.' }); return; }
      await atualizar({ ban_duration: corpo.bloquear ? '876000h' : 'none' });
      res.status(200).json({ ok: true });
      return;
    }

    // ---------- nome e WhatsApp ----------
    if (acao === 'dados') {
      const nome = String(corpo.nome || '').trim().slice(0, 80);
      const whatsapp = String(corpo.whatsapp || '').trim().slice(0, 40);
      if (nome.length < 2) { res.status(400).json({ error: 'Coloque o nome.' }); return; }
      const atual = await fetch(`${sb}/auth/v1/admin/users/${id}`, { headers: H }).then(json);
      await atualizar({ user_metadata: { ...(atual.user_metadata || {}), nome, whatsapp } });
      res.status(200).json({ ok: true });
      return;
    }

    // ---------- apagar a conta ----------
    if (acao === 'apagar') {
      if (mexerNoDono) { res.status(400).json({ error: 'Você não pode apagar a sua própria conta.' }); return; }
      const r = await fetch(`${sb}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: H });
      if (!r.ok) { const d = await json(r); throw new Error(d.msg || d.message || d.error || ('erro ' + r.status)); }
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Ação desconhecida.' });
  } catch (err) {
    res.status(502).json({ error: 'O Supabase não aceitou: ' + (err.message || err) });
  }
}
