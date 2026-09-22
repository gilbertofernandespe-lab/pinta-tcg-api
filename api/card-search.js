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
      // Se um idioma não tiver a carta (ou a TCGdex tropeçar nesse idioma),
      // tratamos como "sem resultado" nesse idioma em vez de derrubar a
      // busca inteira — só falha de verdade (502) se a rede realmente cair.
      const buscar = async (lang) => {
        try {
          const url = `https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`;
          const r = await fetch(url);
          if (!r.ok) return [];
          const json = await r.json();
          return Array.isArray(json) ? json : [];
        } catch {
          return [];
        }
      };

      let data = await buscar('pt');
      if (data.length === 0) {
        data = await buscar('en'); // nem toda carta tem tradução ainda
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
