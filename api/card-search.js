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

  const { name, game } = req.query;

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

      // Código completo (número + total, ex.: 238/217): o total identifica
      // a coleção, então achamos ela primeiro e buscamos a carta dentro
      // dela — mais direto e confiável do que filtrar a lista geral de
      // cartas por número (o filtro localId da TCGdex é instável).
      if (localId && totalColecao) {
        try {
          const rs = await fetch('https://api.tcgdex.net/v2/en/sets');
          const sets = rs.ok ? await rs.json() : [];
          const colecoes = (Array.isArray(sets) ? sets : []).filter(
            (s) => String(s.cardCount?.official) === totalColecao ||
                   String(s.cardCount?.total) === totalColecao
          );

          for (const colecao of colecoes) {
            for (const lang of ['pt', 'en']) {
              try {
                const rd = await fetch(`https://api.tcgdex.net/v2/${lang}/sets/${colecao.id}`);
                if (!rd.ok) continue;
                const detalhe = await rd.json();
                const carta = (detalhe.cards || []).find((c) => String(c.localId) === localId);
                if (carta) {
                  data.push({ ...carta, id: carta.id || `${colecao.id}-${carta.localId}` });
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
      }

      const results = data.slice(0, 10).map((c) => ({
        name: c.name,
        set: c.id ? c.id.split('-')[0] : '',
        number: c.localId,
        image: c.image ? `${c.image}/high.webp` : null,
        rarity: null,
      }));

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
