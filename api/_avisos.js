// api/_avisos.js — avisos automáticos por e-mail
//
// Quando chega (ou volta ao estoque) uma carta que algum cliente procura,
// ele recebe um e-mail com ela. "Procura" vem de três lugares:
//   • Minhas coleções (colecoes_cliente, com "quero que a loja me avise")
//   • Avise-me quando chegar (procuras abertas)
//   • Favoritos (♥ na loja)
// Cada carta é avisada uma vez só para cada cliente (tabela avisos_enviados).
// Roda pelo agendamento diário (api/avisos-cron.js) ou pelo botão
// "Enviar agora" da área do vendedor (admin.js, acao avisos_auto).
import { PintaPokedex } from './_pokedex.js';

const SITE = 'https://www.pintatcg.com.br';
// ---- contra excesso de e-mails ----
const INTERVALO_DIAS = 3;     // no máximo 1 aviso automático a cada 3 dias por cliente
const JANELA_DIAS = 7;        // cartas que chegaram nos últimos 7 dias (as que esperaram o intervalo entram no próximo)
const MAX_EMAILS_RODADA = 40; // teto por rodada (o plano grátis do Resend manda 100 por dia)
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const emailValido = (e) => /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/.test(e) && e.length <= 254;

// mesmas regras do site (colecao-alvo.js)
function normNum(n) {
  const s = String(n == null ? '' : n).split('/')[0].trim().toLowerCase().replace(/\s+/g, '');
  return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s.replace(/^0+(?=\d)/, '');
}
function setDaCarta(c) {
  if (c.set_id) return c.set_id;
  const m = String(c.image_url || '').match(/assets\.tcgdex\.net\/[^/]+\/[^/]+\/([^/]+)\//);
  return m ? m[1] : '';
}
const chaveCarta = (c) => setDaCarta(c) + '-' + normNum(c.number);
function numero3(n) {
  const m = String(n || '').match(/^(\d+)\s*\/\s*(\d+)$/);
  return m ? m[1].padStart(3, '0') + '/' + m[2].padStart(3, '0') : String(n || '');
}

// a carta faz parte desta coleção do cliente e ele ainda não tem?
function cartaNaColecao(a, c) {
  const p = a.params || {};
  const tenho = new Set(Array.isArray(a.tenho) ? a.tenho : []);
  if (a.tipo === 'colecao') return setDaCarta(c) === p.set_id && !tenho.has(chaveCarta(c));
  if (a.tipo === 'pokedex') {
    const n = PintaPokedex.numero(c.name);
    return !!n && n >= Number(p.de) && n <= Number(p.ate) && !tenho.has('dex-' + n);
  }
  if (a.tipo === 'pokemon') {
    const n = PintaPokedex.numero(c.name);
    return !!n && (p.dex || []).map(Number).includes(n) && !tenho.has(chaveCarta(c));
  }
  if (a.tipo === 'lista') {
    const k = chaveCarta(c);
    return (p.cartas || []).some((x) => x.chave === k) && !tenho.has(k);
  }
  return false;
}
// o texto do "Avise-me" bate com a carta?
function procuraBate(texto, c) {
  const t = semAcento(texto);
  const m = t.match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return numero3(c.number) === m[1].padStart(3, '0') + '/' + m[2].padStart(3, '0');
  const nome = semAcento(c.name);
  return nome.length >= 3 && t.length >= 3 && (t.includes(nome) || nome.includes(t));
}

async function pegar(sb, H, caminho) {
  const r = await fetch(`${sb}/rest/v1/${caminho}`, { headers: H });
  if (!r.ok) throw new Error('Supabase ' + r.status + ' em ' + caminho.split('?')[0] + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

export async function rodarAvisos({ sb, H, chaveResend, remetente, desdeHoras }) {
  const inicio = new Date().toISOString();
  const cfg = (await pegar(sb, H, 'loja_config?select=auto_aviso_em,auto_aviso_inicio&limit=1'))[0] || {};
  // olha as cartas da última semana (nunca antes de os avisos serem ligados);
  // quem já recebeu a carta não recebe de novo (avisos_enviados)
  const janela = Date.now() - (desdeHoras ? desdeHoras * 3600 * 1000 : JANELA_DIAS * 86400 * 1000);
  const inicioAvisos = cfg.auto_aviso_inicio ? Date.parse(cfg.auto_aviso_inicio) : Date.now();
  const desde = new Date(Math.max(janela, inicioAvisos)).toISOString();

  // cartas que chegaram ou voltaram ao estoque desde a última vez
  const campos = 'id,name,number,set_id,set_name,image_url,price,language,variant,condition,created_at,reposto_em,tipo';
  const filtro = 'for_sale=eq.true&quantity=gt.0&or=' + encodeURIComponent(`(created_at.gt."${desde}",reposto_em.gt."${desde}")`);
  const novas = (await pegar(sb, H, `cards?select=${campos}&${filtro}&limit=2000`)).filter((c) => c.tipo !== 'produto');
  const marcarRodada = () => fetch(`${sb}/rest/v1/loja_config?id=eq.true`, {
    method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ auto_aviso_em: inicio }),
  });
  if (!novas.length) { await marcarRodada(); return { novas: 0, clientes: 0, emails: 0, cartas: 0 }; }

  const [colecoes, procuras, favoritos] = await Promise.all([
    pegar(sb, H, 'colecoes_cliente?select=customer_id,nome,tipo,params,tenho&avisar=eq.true&limit=2000'),
    pegar(sb, H, 'procuras?select=customer_id,carta&status=eq.aberta&limit=2000'),
    pegar(sb, H, 'favoritos?select=customer_id,card_id,nome,numero&limit=5000').catch(() => []),
  ]);

  // cliente → { cartaId → motivo }
  const porCliente = {};
  const anotar = (cid, c, motivo) => {
    if (!cid) return;
    const m = (porCliente[cid] = porCliente[cid] || {});
    if (!m[c.id]) m[c.id] = motivo;
  };
  novas.forEach((c) => {
    colecoes.forEach((a) => { if (cartaNaColecao(a, c)) anotar(a.customer_id, c, 'da sua coleção “' + a.nome + '”'); });
    procuras.forEach((r) => { if (procuraBate(r.carta, c)) anotar(r.customer_id, c, 'você pediu aviso'); });
    favoritos.forEach((f) => {
      if (f.card_id === c.id || (f.nome && semAcento(f.nome) === semAcento(c.name) && f.numero && numero3(f.numero) === numero3(c.number))) {
        anotar(f.customer_id, c, 'está nos seus favoritos');
      }
    });
  });
  const ids = Object.keys(porCliente);
  if (!ids.length) { await marcarRodada(); return { novas: novas.length, clientes: 0, emails: 0, cartas: 0 }; }

  // já avisadas antes (não repete)
  const lista = ids.map((x) => '"' + x + '"').join(',');
  const enviados = await pegar(sb, H, `avisos_enviados?select=customer_id,card_id&customer_id=in.(${lista})&limit=20000`);
  const ja = new Set(enviados.map((e) => e.customer_id + ':' + e.card_id));
  const clientes = await pegar(sb, H, `clientes?select=user_id,nome,email,avisos&user_id=in.(${lista})`);
  // último aviso automático de cada um (no máximo 1 a cada INTERVALO_DIAS)
  const ultimos = await pegar(sb, H, `avisos_enviados?select=customer_id,enviado_em&customer_id=in.(${lista})&order=enviado_em.desc&limit=20000`);
  const ultimoPor = {};
  ultimos.forEach((u) => { if (!ultimoPor[u.customer_id]) ultimoPor[u.customer_id] = Date.parse(u.enviado_em); });
  const limiteIntervalo = Date.now() - INTERVALO_DIAS * 86400 * 1000;
  const cliPor = {};
  clientes.forEach((c) => { cliPor[c.user_id] = c; });
  const cartaPor = {};
  novas.forEach((c) => { cartaPor[c.id] = c; });

  const envios = [];
  let adiados = 0;
  ids.forEach((cid) => {
    const cli = cliPor[cid];
    const email = String((cli && cli.email) || '').trim().toLowerCase();
    if (!cli || !emailValido(email)) return;
    if (ultimoPor[cid] && ultimoPor[cid] > limiteIntervalo) { adiados += 1; return; }   // recebeu há pouco: espera
    const itens = Object.entries(porCliente[cid]).filter(([id]) => !ja.has(cid + ':' + id))
      // favorito só avisa quem aceitou receber avisos da loja
      .filter(([, motivo]) => motivo !== 'está nos seus favoritos' || cli.avisos === true)
      .map(([id, motivo]) => ({ c: cartaPor[id], motivo }));
    if (itens.length) envios.push({ cid, cli, email, itens });
  });
  // teto por rodada: quem passar fica para a próxima (nada se perde)
  if (envios.length > MAX_EMAILS_RODADA) { adiados += envios.length - MAX_EMAILS_RODADA; envios.length = MAX_EMAILS_RODADA; }
  if (!envios.length) { await marcarRodada(); return { novas: novas.length, clientes: 0, emails: 0, cartas: 0, adiados }; }
  if (!chaveResend) throw new Error('Falta a RESEND_API_KEY na Vercel (projeto pinta-tcg-api).');

  const montar = (e) => {
    const primeiro = String(e.cli.nome || '').trim().split(/\s+/)[0];
    const mostrar = e.itens.slice(0, 12);
    const celulas = mostrar.map(({ c, motivo }) => {
      const img = /^https:\/\//.test(c.image_url || '')
        ? String(c.image_url).replace(/\/high\.webp$/, '/low.png').replace(/\/low\.webp$/, '/low.png') : '';
      return `<td style="width:33%;padding:6px;vertical-align:top;text-align:center">
        <a href="${SITE}/c/${encodeURIComponent(c.id)}" style="text-decoration:none;color:#1E1A13">
        ${img ? `<img src="${esc(img)}" alt="" width="140" style="width:100%;max-width:140px;border-radius:6px;display:block;margin:0 auto 6px">` : ''}
        <div style="font-size:13px;font-weight:bold">${esc(c.name)}</div>
        <div style="font-size:11px;color:#6E6454">${esc([numero3(c.number), c.set_name].filter(Boolean).join(' · '))}</div>
        ${Number(c.price) > 0 ? `<div style="font-size:14px;font-weight:bold;color:#E8384F;margin-top:2px">${BRL.format(Number(c.price))}</div>` : ''}
        <div style="font-size:10px;color:#8A5A00;margin-top:2px">${esc(motivo)}</div></a></td>`;
    });
    const linhas = [];
    for (let i = 0; i < celulas.length; i += 3) linhas.push('<tr>' + celulas.slice(i, i + 3).join('') + '</tr>');
    const n = e.itens.length;
    const assunto = n === 1 ? '🔔 Chegou ' + e.itens[0].c.name + ' na Pinta TCG' : '🔔 Chegaram ' + n + ' cartas que você procura na Pinta TCG';
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#1E1A13">
      <div style="background:#1E1A13;color:#FFB627;padding:14px 18px;border-radius:12px 12px 0 0;font-size:18px;font-weight:bold">${esc(assunto)}</div>
      <div style="border:1px solid #e5dfd3;border-top:0;border-radius:0 0 12px 12px;padding:18px">
        <p style="margin:0 0 10px;font-size:15px">Olá${primeiro ? ', ' + esc(primeiro) : ''}!</p>
        <p style="margin:0 0 14px;font-size:15px;line-height:1.5">${n === 1 ? 'Chegou uma carta' : 'Chegaram cartas'} que você está procurando. Corre que tem pouca unidade:</p>
        <table role="presentation" style="width:100%;border-collapse:collapse">${linhas.join('')}</table>
        ${n > mostrar.length ? `<p style="font-size:13px;color:#6E6454">…e mais ${n - mostrar.length}.</p>` : ''}
        <p style="margin:18px 0 0;text-align:center"><a href="${SITE}/minha-colecao.html" style="background:#E8384F;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Ver na loja</a></p>
        <p style="margin:22px 0 0;font-size:11px;color:#6E6454;line-height:1.5">Você recebe este aviso porque montou uma coleção, pediu aviso ou favoritou cartas na Pinta TCG.
          Mandamos no máximo um aviso destes a cada ${INTERVALO_DIAS} dias.
          Para não receber mais, desmarque “Quero que a loja me avise” em <a href="${SITE}/minha-colecao.html" style="color:#6E6454">Minhas coleções</a>, apague o pedido de aviso em <a href="${SITE}/conta.html" style="color:#6E6454">Minha conta</a> ou responda pedindo para sair.</p>
      </div></div>`;
    return { from: remetente, to: [e.email], subject: assunto, html };
  };

  let emails = 0;
  let cartasAvisadas = 0;
  const falhas = [];
  for (const e of envios) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chaveResend}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(montar(e)),
    });
    if (!r.ok) { falhas.push((await r.text()).slice(0, 160)); continue; }
    emails += 1;
    cartasAvisadas += e.itens.length;
    await fetch(`${sb}/rest/v1/avisos_enviados`, {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(e.itens.map(({ c, motivo }) => ({ customer_id: e.cid, card_id: c.id, motivo }))),
    });
  }
  await marcarRodada();
  return { novas: novas.length, clientes: envios.length, emails, cartas: cartasAvisadas, falhas, adiados, intervaloDias: INTERVALO_DIAS };
}
