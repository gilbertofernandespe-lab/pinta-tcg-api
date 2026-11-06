// api/material.js — baixar um material (ex.: organizador de pasta binder em PDF)
//
// Só para quem tem conta no site: o pedido vem com o token de quem está
// logado. O PDF sai do bucket PRIVADO "materiais" do Supabase, ganha em cada
// página o nome e o e-mail de quem baixou + "proibida a comercialização",
// e é entregue por um link temporário (vale 5 minutos).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const env = (k) => String(process.env[k] || '').trim();
const json = async (r) => { try { return await r.json(); } catch { return {}; } };
function cabecalhos(tipo) {
  const k = env('SUPABASE_SERVICE_ROLE_KEY');
  const h = { apikey: k };
  if (tipo) h['Content-Type'] = tipo;
  if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`;
  return h;
}
// fontes padrão do PDF só têm acentos latinos: troca o resto
const latino = (t) => String(t || '').replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

export default async function handler(req, res) {
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
  if (!sb || !env('SUPABASE_ANON_KEY') || !env('SUPABASE_SERVICE_ROLE_KEY')) {
    res.status(500).json({ error: 'O download não está configurado no servidor.' });
    return;
  }

  // ---------- quem está baixando? (precisa ter conta) ----------
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) { res.status(401).json({ error: 'Entre na sua conta para baixar.' }); return; }
  const ru = await fetch(`${sb}/auth/v1/user`, { headers: { apikey: env('SUPABASE_ANON_KEY'), Authorization: `Bearer ${token}` } });
  const eu = await json(ru);
  if (!ru.ok || !eu.id) { res.status(401).json({ error: 'Sua sessão expirou. Entre de novo para baixar.' }); return; }

  let corpo = req.body || {};
  if (typeof corpo === 'string') { try { corpo = JSON.parse(corpo); } catch { corpo = {}; } }
  const id = String(corpo.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) { res.status(400).json({ error: 'Material inválido.' }); return; }
  if (corpo.aceito !== true) { res.status(400).json({ error: 'Confirme que o uso é pessoal e que não vai vender o material.' }); return; }

  try {
    const rm = await fetch(`${sb}/rest/v1/materiais?id=eq.${id}&ativo=eq.true&select=id,titulo,arquivo`, { headers: cabecalhos() });
    const m = (await json(rm))[0];
    if (!m) { res.status(404).json({ error: 'Esse material não está mais disponível.' }); return; }

    // PDF original (bucket privado)
    const caminho = String(m.arquivo).split('/').map(encodeURIComponent).join('/');
    const ro = await fetch(`${sb}/storage/v1/object/materiais/${caminho}`, { headers: cabecalhos() });
    if (!ro.ok) throw new Error('arquivo ' + ro.status);
    const original = new Uint8Array(await ro.arrayBuffer());

    // carimbo em cada página: de quem é e que é proibido vender
    const meta = eu.user_metadata || {};
    const nome = latino(String(meta.nome || '').trim()).slice(0, 60);
    const email = latino(String(eu.email || '')).slice(0, 80);
    const quando = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Recife' });
    const pdf = await PDFDocument.load(original, { ignoreEncryption: true });
    const fonte = await pdf.embedFont(StandardFonts.Helvetica);
    const texto = latino(`Uso pessoal de ${nome ? nome + ' - ' : ''}${email} - baixado em ${quando} em pintatcg.com.br - PROIBIDA A COMERCIALIZACAO, REVENDA OU REDISTRIBUICAO`);
    pdf.getPages().forEach((pg) => {
      const { width } = pg.getSize();
      let tam = 6.5;
      while (tam > 4 && fonte.widthOfTextAtSize(texto, tam) > width - 24) tam -= 0.25;
      const larg = fonte.widthOfTextAtSize(texto, tam);
      pg.drawRectangle({ x: (width - larg) / 2 - 4, y: 3, width: larg + 8, height: tam + 4, color: rgb(1, 1, 1), opacity: 0.8 });
      pg.drawText(texto, { x: (width - larg) / 2, y: 5, size: tam, font: fonte, color: rgb(0.35, 0.3, 0.25) });
    });
    pdf.setTitle(latino(m.titulo) + ' - Pinta TCG');
    pdf.setAuthor('Pinta TCG');
    pdf.setSubject(latino('Uso pessoal de ' + email + '. Proibida a comercializacao.'));
    pdf.setKeywords(['Pinta TCG', 'uso pessoal', 'proibida a venda', email]);
    pdf.setProducer('Pinta TCG - pintatcg.com.br');
    const pronto = await pdf.save();

    // guarda a cópia carimbada e devolve um link de 5 minutos
    const destino = `baixados/${eu.id}/${m.id}.pdf`;
    const up = await fetch(`${sb}/storage/v1/object/materiais/${destino}`, {
      method: 'POST', headers: { ...cabecalhos('application/pdf'), 'x-upsert': 'true' }, body: Buffer.from(pronto),
    });
    if (!up.ok) throw new Error('envio ' + up.status + ' ' + (await up.text()).slice(0, 120));
    const nomeArquivo = latino(m.titulo).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'material';
    const rs = await fetch(`${sb}/storage/v1/object/sign/materiais/${destino}`, {
      method: 'POST', headers: cabecalhos('application/json'),
      body: JSON.stringify({ expiresIn: 300 }),
    });
    const ds = await json(rs);
    const assinado = ds.signedURL || ds.signedUrl;
    if (!rs.ok || !assinado) throw new Error('link ' + rs.status);
    const url = `${sb}/storage/v1${assinado.startsWith('/') ? '' : '/'}${assinado}&download=${encodeURIComponent('Pinta-TCG-' + nomeArquivo + '.pdf')}`;

    // conta o download (por pessoa)
    await fetch(`${sb}/rest/v1/rpc/material_baixou`, {
      method: 'POST', headers: cabecalhos('application/json'), body: JSON.stringify({ p_material: m.id, p_customer: eu.id }),
    }).catch(() => {});

    res.status(200).json({ ok: true, url });
  } catch (err) {
    res.status(500).json({ error: 'Não deu para preparar o PDF agora. Tente de novo em instantes.', detalhe: String(err.message || err).slice(0, 200) });
  }
}
