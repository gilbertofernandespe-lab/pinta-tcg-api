// api/card-search.js
//
// Este é um servidor "ponte" (serverless function): ele roda FORA do
// navegador, então não tem a restrição de rede que a página do
// artefato tem. É ele quem chama a Pokémon TCG API / Scryfall de
// verdade; o site da coleção chama ESTE endpoint, nunca a API
// externa diretamente.
//
// Uso depois de implantado (deploy) na Vercel:
//   GET https://SEU-PROJETO.vercel.app/api/card-search?game=pokemon&name=Pikachu
//   GET https://SEU-PROJETO.vercel.app/api/card-search?game=magic&name=Lightning+Bolt

// ---------------------------------------------------------------------
// Coleções (sets) de Pokémon TCG — lista completa e cartas de cada uma
// ---------------------------------------------------------------------
const TCGDEX = 'https://api.tcgdex.net/v2';

async function pegarJSON(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// Número no padrão impresso na carta: 000/000
function numeroPadraoCarta(localId, total) {
  const n = String(localId ?? '').trim();
  if (!n) return '';
  if (/^\d+$/.test(n) && Number(total) > 0) {
    return n.padStart(3, '0') + '/' + String(total).padStart(3, '0');
  }
  return /^\d+$/.test(n) ? n.padStart(3, '0') : n;
}

// Limite de tempo: se a parte japonesa demorar, a lista normal não espera
function comLimite(promessa, ms, reserva) {
  return Promise.race([promessa, new Promise((ok) => setTimeout(() => ok(reserva), ms))]);
}

// Coleções JAPONESAS (a TCGdex guarda em /ja, com códigos próprios, ex.:
// SV2a). Entram na lista com idioma: 'ja' e série "Japonês · …".
// Coleções que já existem na lista internacional não são repetidas.
async function listarColecoesJa(idsInternacionais) {
  const [sets, series] = await Promise.all([
    pegarJSON(`${TCGDEX}/ja/sets`), pegarJSON(`${TCGDEX}/ja/series`),
  ]);
  const listaSets = (Array.isArray(sets) ? sets : []).filter((s) => s && s.id && !idsInternacionais.has(s.id));
  if (!listaSets.length) return { colecoes: [], series: [] };
  const listaSeries = Array.isArray(series) ? series : [];

  const detalhes = await Promise.all(listaSeries.map((s) => pegarJSON(`${TCGDEX}/ja/series/${encodeURIComponent(s.id)}`)));
  const serieDoSet = {};
  const ordemNaSerie = {};
  const posSerie = {};
  detalhes.forEach((d, i) => {
    const sid = listaSeries[i].id;
    const t = d && d.releaseDate ? Date.parse(d.releaseDate) : NaN;
    posSerie[sid] = Number.isNaN(t) ? i : t;
    if (!d || !Array.isArray(d.sets)) return;
    d.sets.forEach((st, j) => { serieDoSet[st.id] = sid; ordemNaSerie[st.id] = j; });
  });
  const nomeSerie = {};
  listaSeries.forEach((s) => { nomeSerie[s.id] = s.name; });

  const colecoes = listaSets
    .map((s, i) => ({ s, i, serie: serieDoSet[s.id] || 'outras' }))
    .sort((a, b) =>
      ((posSerie[b.serie] ?? -1) - (posSerie[a.serie] ?? -1)) ||
      ((ordemNaSerie[b.s.id] ?? b.i) - (ordemNaSerie[a.s.id] ?? a.i)))
    .map(({ s, serie }) => ({
      id: s.id,
      nome: s.name || s.id,
      nome_en: null,
      serie: 'ja:' + serie,
      idioma: 'ja',
      oficial: (s.cardCount && s.cardCount.official) || null,
      total: (s.cardCount && s.cardCount.total) || null,
      logo: s.logo ? `${s.logo}.webp` : null,
      simbolo: s.symbol ? `${s.symbol}.webp` : null,
    }));

  const usadas = [...new Set(colecoes.map((c) => c.serie))];
  const seriesJa = usadas
    .sort((a, b) => (posSerie[b.slice(3)] ?? -1) - (posSerie[a.slice(3)] ?? -1))
    .map((id) => ({ id, nome: 'Japonês · ' + (nomeSerie[id.slice(3)] || 'Outras') }));
  return { colecoes, series: seriesJa };
}

// ?acao=colecoes → todas as coleções, agrupadas por série, da mais nova
// para a mais antiga (sem as do Pokémon TCG Pocket, que é só digital).
// No fim da lista entram as coleções japonesas.
async function listarColecoes() {
  const [setsEn, setsPt, seriesEn, seriesPt] = await Promise.all([
    pegarJSON(`${TCGDEX}/en/sets`), pegarJSON(`${TCGDEX}/pt/sets`),
    pegarJSON(`${TCGDEX}/en/series`), pegarJSON(`${TCGDEX}/pt/series`),
  ]);
  const listaSets = Array.isArray(setsEn) ? setsEn : [];
  const listaSeries = Array.isArray(seriesEn) ? seriesEn : [];
  const nomePt = {};
  (Array.isArray(setsPt) ? setsPt : []).forEach((s) => { nomePt[s.id] = s.name; });
  const seriePt = {};
  (Array.isArray(seriesPt) ? seriesPt : []).forEach((s) => { seriePt[s.id] = s.name; });

  // detalhes de cada série: diz exatamente quais coleções são dela
  const detalhes = await Promise.all(listaSeries.map((s) => pegarJSON(`${TCGDEX}/en/series/${encodeURIComponent(s.id)}`)));
  const serieDoSet = {};
  const ordemNaSerie = {};
  detalhes.forEach((d, i) => {
    if (!d || !Array.isArray(d.sets)) return;
    d.sets.forEach((st, j) => { serieDoSet[st.id] = listaSeries[i].id; ordemNaSerie[st.id] = j; });
  });
  // plano B: pelo começo do código (sv01 → sv, swsh3 → swsh…)
  const idsSeries = listaSeries.map((s) => s.id).sort((a, b) => b.length - a.length);
  const serieDe = (setId) => serieDoSet[setId] ||
    idsSeries.find((sid) => String(setId).toLowerCase().startsWith(String(sid).toLowerCase())) || 'outras';

  // ordem das séries: pela data, se todas tiverem; senão, pela ordem da lista
  const datas = detalhes.map((d) => (d && d.releaseDate ? Date.parse(d.releaseDate) : NaN));
  const usarDatas = datas.length && datas.every((t) => !Number.isNaN(t));
  const posSerie = {};
  listaSeries.forEach((s, i) => { posSerie[s.id] = usarDatas ? datas[i] : i; });

  const colecoes = listaSets
    .map((s, i) => ({ s, i, serie: serieDe(s.id) }))
    .filter(({ serie }) => serie !== 'tcgp')
    .sort((a, b) =>
      ((posSerie[b.serie] ?? -1) - (posSerie[a.serie] ?? -1)) ||
      ((ordemNaSerie[b.s.id] ?? b.i) - (ordemNaSerie[a.s.id] ?? a.i)))
    .map(({ s, serie }) => ({
      id: s.id,
      nome: nomePt[s.id] || s.name,
      nome_en: s.name,
      serie,
      oficial: (s.cardCount && s.cardCount.official) || null,
      total: (s.cardCount && s.cardCount.total) || null,
      logo: s.logo ? `${s.logo}.webp` : null,
      simbolo: s.symbol ? `${s.symbol}.webp` : null,
    }));

  const usadas = new Set(colecoes.map((c) => c.serie));
  const series = listaSeries
    .filter((s) => usadas.has(s.id))
    .sort((a, b) => (posSerie[b.id] ?? 0) - (posSerie[a.id] ?? 0))
    .map((s) => ({ id: s.id, nome: seriePt[s.id] || s.name }));
  if (usadas.has('outras')) series.push({ id: 'outras', nome: 'Outras' });

  // coleções japonesas (se a busca delas falhar, a lista normal segue igual)
  let ja = { colecoes: [], series: [] };
  if (colecoes.length) {
    try {
      ja = await comLimite(listarColecoesJa(new Set(listaSets.map((s) => s.id))), 6000, ja);
    } catch { /* segue sem as japonesas */ }
  }

  return { colecoes: colecoes.concat(ja.colecoes), series: series.concat(ja.series) };
}

// ?acao=cartas&set=<id> → todas as cartas da coleção (nome em português
// quando existir, número 000/000 e imagem)
async function listarCartasDaColecao(setId) {
  const [pt, en] = await Promise.all([
    pegarJSON(`${TCGDEX}/pt/sets/${encodeURIComponent(setId)}`),
    pegarJSON(`${TCGDEX}/en/sets/${encodeURIComponent(setId)}`),
  ]);
  if (!en && !pt) return listarCartasDaColecaoJa(setId);
  const base = en || pt;
  const oficial = (base.cardCount && base.cardCount.official) || (pt && pt.cardCount && pt.cardCount.official) || null;
  const ptPorId = {};
  ((pt && pt.cards) || []).forEach((c) => { ptPorId[c.localId] = c; });
  const vistos = new Set();
  const cartas = [];
  [...((en && en.cards) || []), ...((pt && pt.cards) || [])].forEach((c) => {
    if (vistos.has(c.localId)) return;
    vistos.add(c.localId);
    const p = ptPorId[c.localId];
    const img = (p && p.image) || c.image || null;
    cartas.push({
      name: (p && p.name) || c.name,
      localId: c.localId,
      number: numeroPadraoCarta(c.localId, oficial),
      thumb: img ? `${img}/low.webp` : null,
      image: img ? `${img}/high.webp` : null,
    });
  });
  return {
    colecao: {
      id: setId,
      nome: (pt && pt.name) || (en && en.name) || setId,
      oficial,
      logo: base.logo ? `${base.logo}.webp` : null,
    },
    cartas,
  };
}

// Coleção que só existe em japonês
async function listarCartasDaColecaoJa(setId) {
  const ja = await pegarJSON(`${TCGDEX}/ja/sets/${encodeURIComponent(setId)}`);
  if (!ja) return null;
  const oficial = (ja.cardCount && ja.cardCount.official) || null;
  return {
    colecao: { id: setId, nome: ja.name || setId, oficial, idioma: 'ja', logo: ja.logo ? `${ja.logo}.webp` : null },
    cartas: (ja.cards || []).map((c) => ({
      name: c.name,
      localId: c.localId,
      number: numeroPadraoCarta(c.localId, oficial),
      thumb: c.image ? `${c.image}/low.webp` : null,
      image: c.image ? `${c.image}/high.webp` : null,
    })),
  };
}

export default async function handler(req, res) {
  // Libera o acesso pro navegador (site da coleção roda em outro
  // endereço — ou até como arquivo local — então sem isso o navegador
  // bloqueia a resposta e o fetch() do site falha com "Failed to fetch").
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { name, game, acao } = req.query;

  // Lista de coleções e cartas de uma coleção (guardadas 1 dia em cache)
  if (acao === 'colecoes') {
    const dados = await listarColecoes();
    if (!dados.colecoes.length) { res.status(502).json({ error: 'Não deu para carregar as coleções agora.' }); return; }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(dados);
    return;
  }
  if (acao === 'cartas') {
    const setId = String(req.query.set || '').trim();
    if (!/^[A-Za-z0-9._-]{1,40}$/.test(setId)) { res.status(400).json({ error: 'Coleção inválida.' }); return; }
    const dados = await listarCartasDaColecao(setId);
    if (!dados) { res.status(404).json({ error: 'Coleção não encontrada.' }); return; }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(dados);
    return;
  }

  // ?acao=carta&id=<coleção>-<número>  → raridade e variações que existem
  if (acao === 'carta') {
    const id = String(req.query.id || '').trim();
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(id)) { res.status(400).json({ error: 'Carta inválida.' }); return; }
    const c = await pegarJSON(`${TCGDEX}/en/cards/${encodeURIComponent(id)}`) ||
              await pegarJSON(`${TCGDEX}/ja/cards/${encodeURIComponent(id)}`);   // carta japonesa
    if (!c) { res.status(404).json({ error: 'Carta não encontrada.' }); return; }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json({ id, raridade: c.rarity || null, variantes: c.variants || null });
    return;
  }

  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Parâmetro "name" é obrigatório.' });
    return;
  }

  const jogo = (game || 'pokemon').toLowerCase();

  try {
    if (jogo.includes('pok')) {
      // pokemontcg.io foi descontinuada; TCGdex é gratuita, sem chave e já
      // devolve nomes em português quando disponíveis.
      //
      // Também aceita o "código da carta" (ex.: 238/217, ou só 238) em vez
      // do nome — o número antes da barra é o localId na TCGdex. O número
      // depois da barra não é a "quantidade": é o total oficial de cartas
      // daquela coleção, que serve como identificador dela (cada coleção
      // tem o seu total). Se vier nome + código juntos ("mimikyu 238/217"),
      // busca pelos dois ao mesmo tempo pra precisar mais o resultado.
      const termo = name.trim();
      const comBarra = termo.match(/(\d+)\s*\/\s*(\d+)/);
      const soNumero = !comBarra && termo.match(/^#?(\d+)$/);
      const localId = comBarra ? comBarra[1] : (soNumero ? soNumero[1] : null);
      const totalColecao = comBarra ? comBarra[2] : null;
      const textoNome = comBarra ? termo.replace(comBarra[0], '').trim()
                        : (soNumero ? '' : termo);

      let data = [];

      // Lista de coleções (uma vez só): serve pra achar a coleção pelo
      // total (238/217) e pra montar o número no padrão 000/000 em
      // todos os resultados.
      const listaSets = async (lang) => {
        try {
          const r = await fetch(`https://api.tcgdex.net/v2/${lang}/sets`);
          const j = r.ok ? await r.json() : [];
          return Array.isArray(j) ? j : [];
        } catch {
          return [];
        }
      };
      const [setsEn, setsPt, setsJaTodos] = await Promise.all([listaSets('en'), listaSets('pt'), listaSets('ja')]);
      // coleções japonesas = as que não existem na lista internacional
      const idsEn = new Set(setsEn.map((s) => s.id));
      const setsJa = setsJaTodos.filter((s) => s && s.id && !idsEn.has(s.id));
      const infoSet = {};
      for (const s of setsJa) infoSet[s.id] = { nome: s.name, total: s.cardCount?.official, lang: 'ja' };
      for (const s of setsEn) infoSet[s.id] = { nome: s.name, total: s.cardCount?.official };
      for (const s of setsPt) {
        infoSet[s.id] = { ...(infoSet[s.id] || {}), nome: s.name };
        if (!infoSet[s.id].total) infoSet[s.id].total = s.cardCount?.official;
      }

      // Mesmo número escrito de jeitos diferentes (25 = 025) conta como igual
      const mesmoNumero = (a, b) =>
        /^\d+$/.test(String(a)) && /^\d+$/.test(String(b))
          ? Number(a) === Number(b)
          : String(a).toLowerCase() === String(b).toLowerCase();

      // Código completo (número + total, ex.: 238/217): o total identifica
      // a coleção, então achamos ela primeiro e buscamos a carta dentro
      // dela — mais direto e confiável do que filtrar a lista geral de
      // cartas por número (o filtro localId da TCGdex é instável).
      // Coleção já conhecida (?set=me02.5&name=238): usado pelo site pra
      // completar o número de cartas antigas salvas só com "238".
      const setParam = String(req.query.set || '').trim();
      if (setParam && localId) {
        for (const lang of (infoSet[setParam]?.lang === 'ja' ? ['ja'] : ['pt', 'en', 'ja'])) {
          try {
            const rd = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${encodeURIComponent(setParam)}`);
            if (!rd.ok) continue;
            const detalhe = await rd.json();
            const carta = (detalhe.cards || []).find((c) => mesmoNumero(c.localId, localId));
            if (carta) {
              if (!infoSet[setParam]?.total && detalhe.cardCount?.official) {
                infoSet[setParam] = { ...(infoSet[setParam] || {}), total: detalhe.cardCount.official };
              }
              data.push({ ...carta, id: carta.id || `${setParam}-${carta.localId}`, _setId: setParam });
              break;
            }
          } catch {
            // tenta o outro idioma
          }
        }
      }

      if (data.length === 0 && localId && totalColecao) {
        try {
          // internacionais primeiro, depois as japonesas com o mesmo total
          const bate = (s) => mesmoNumero(s.cardCount?.official ?? '', totalColecao) ||
                              mesmoNumero(s.cardCount?.total ?? '', totalColecao);
          const colecoes = setsEn.filter(bate).concat(setsJa.filter(bate)).slice(0, 12);

          for (const colecao of colecoes) {
            for (const lang of (infoSet[colecao.id]?.lang === 'ja' ? ['ja'] : ['pt', 'en'])) {
              try {
                const rd = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${colecao.id}`);
                if (!rd.ok) continue;
                const detalhe = await rd.json();
                const carta = (detalhe.cards || []).find((c) => mesmoNumero(c.localId, localId));
                if (carta) {
                  data.push({ ...carta, id: carta.id || `${colecao.id}-${carta.localId}`, _setId: colecao.id });
                  break; // achou nesse idioma, não precisa tentar o outro
                }
              } catch {
                // tenta o próximo idioma/coleção
              }
            }
          }
        } catch {
          // segue pro plano B abaixo
        }
      }

      // Nome (com ou sem número solto), ou plano B se o código não achou
      // nada acima. Se um idioma não tiver a carta (ou a TCGdex tropeçar
      // nesse idioma), tratamos como "sem resultado" nesse idioma em vez
      // de derrubar a busca inteira.
      if (data.length === 0 && (textoNome || localId)) {
        const buscar = async (lang) => {
          try {
            const params = new URLSearchParams();
            if (textoNome) params.set('name', textoNome);
            if (localId) params.set('localId', `eq:${localId}`);
            const url = `https://api.tcgdex.net/v2/${lang}/cards?${params.toString()}`;
            const r = await fetch(url);
            if (!r.ok) return [];
            const json = await r.json();
            return Array.isArray(json) ? json : [];
          } catch {
            return [];
          }
        };

        data = await buscar('pt');
        if (data.length === 0) {
          data = await buscar('en'); // nem toda carta tem tradução ainda
        }
        if (data.length === 0) {
          data = await buscar('ja'); // nome digitado em japonês
        }
      }

      // Id da coleção a partir do id da carta ("me02.5-238" → "me02.5")
      const setDaCarta = (c) => {
        if (c._setId) return c._setId;
        const id = String(c.id || '');
        const suf = '-' + c.localId;
        if (c.localId != null && id.endsWith(suf)) return id.slice(0, -suf.length);
        return id.includes('-') ? id.slice(0, id.lastIndexOf('-')) : id;
      };

      // Número no padrão impresso na carta: 000/000 (ex.: 025/165, 238/217)
      const numeroPadrao = (localId, total) => {
        const n = String(localId ?? '').trim();
        if (!n) return '';
        if (/^\d+$/.test(n) && Number(total) > 0) {
          return n.padStart(3, '0') + '/' + String(total).padStart(3, '0');
        }
        return /^\d+$/.test(n) ? n.padStart(3, '0') : n; // promos/TG etc. ficam como estão
      };

      const results = data.slice(0, 10).map((c) => {
        const setId = setDaCarta(c);
        const info = infoSet[setId] || {};
        return {
          name: c.name,
          set: info.nome || setId,
          set_id: setId || null,
          card_id: c.id || (setId && c.localId != null ? `${setId}-${c.localId}` : null),
          number: numeroPadrao(c.localId, info.total),
          image: c.image ? `${c.image}/high.webp` : null,
          rarity: null,
          // 'ja' = carta de coleção japonesa (o site já marca o idioma Japonês)
          lang: info.lang || (/\/ja\//.test(String(c.image || '')) ? 'ja' : null),
        };
      });

      res.status(200).json({ source: 'tcgdex', results });
      return;
    }

    if (jogo.includes('magic') || jogo.includes('mtg')) {
      const url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(name)}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Scryfall respondeu ${r.status}`);
      const data = await r.json();

      const results = (data.data || []).map((c) => ({
        name: c.name,
        set: c.set_name,
        number: c.collector_number,
        image: c.image_uris?.small,
        rarity: c.rarity,
      }));

      res.status(200).json({ source: 'scryfall', results });
      return;
    }

    // Outros jogos (Yu-Gi-Oh!, One Piece, Digimon...) entram aqui
    // seguindo o mesmo padrão: buscar na API oficial, achatar a
    // resposta pro formato { name, set, number, image, rarity }.
    res.status(400).json({ error: `Jogo "${game}" ainda não tem uma fonte configurada.` });
  } catch (err) {
    res.status(502).json({ error: 'Erro ao consultar a base de cartas.', details: err.message });
  }
}
