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
      const url = `https://api.pokemontcg.io/v2/cards?q=name:"${encodeURIComponent(name)}"&pageSize=10`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Pokémon TCG API respondeu ${r.status}`);
      const data = await r.json();

      const results = (data.data || []).map((c) => ({
        name: c.name,
        set: c.set?.name,
        number: c.number && c.set?.printedTotal ? `${c.number}/${c.set.printedTotal}` : c.number,
        image: c.images?.small,
        rarity: c.rarity,
      }));

      res.status(200).json({ source: 'pokemontcg.io', results });
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
