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
      const buscar = async (lang) => {
        const url = `https://api.tcgdex.net/v2/${lang}/cards?name=${encodeURIComponent(name)}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`TCGdex respondeu ${r.status}`);
        return r.json();
      };

      let data = await buscar('pt');
      if (!Array.isArray(data) || data.length === 0) {
        data = await buscar('en'); // nem toda carta tem tradução ainda
      }

      const results = (Array.isArray(data) ? data : []).slice(0, 10).map((c) => ({
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
