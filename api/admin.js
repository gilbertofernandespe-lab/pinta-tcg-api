// api/admin.js
//
// Administração da loja: só o DONO (e-mail em DONO_EMAIL) consegue usar.
// Lista as contas, troca senha, bloqueia/desbloqueia, edita nome e
// WhatsApp e apaga contas. Usa a chave secreta do Supabase, que fica SÓ
// aqui na Vercel (nunca no site).
//
// Variáveis de ambiente (Vercel → pinta-tcg-api → Settings → Environment Variables):
//   SUPABASE_URL               — a mesma do config.js do site
//   SUPABASE_ANON_KEY          — a mesma do config.js do site
//   SUPABASE_SERVICE_ROLE_KEY  — Supabase → Project Settings → API Keys → chave secreta
//   DONO_EMAIL                 — o e-mail do seu login (o dono de tudo)

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
  res.setHeader('Access-Control-Allow-Origin', '*');
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
