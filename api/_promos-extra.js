// api/_promos-extra.js — cartas promo que já saíram mas ainda não estão na TCGdex
//
// A TCGdex (de onde vêm as coleções) às vezes demora semanas para cadastrar
// as promos novas. Enquanto isso, elas entram por esta lista. Quando a TCGdex
// cadastrar o mesmo número, a versão dela passa na frente automaticamente.
// (O "_" no começo do nome faz a Vercel não tratar este arquivo como endpoint.)
//
// Para acrescentar uma promo: { n: 'número', nome: 'nome em português', img: true|false }
// img: true = já existe foto em images.scrydex.com/pokemon/<coleção>-<número>/large

const PROMOS_EXTRA = {
  mep: [
    { n: '089', nome: 'Mega Zeraora ex', img: true },
    { n: '090', nome: 'Mega Darkrai ex', img: true },
    { n: '091', nome: 'Mega Dragonite ex', img: true },
    { n: '092', nome: 'Resort Paraíso', img: true },
    { n: '093', nome: 'Pikachu', img: true },
    { n: '094', nome: 'Exeggutor de Alola', img: true },
    { n: '095', nome: 'Lucario', img: true },
    { n: '096', nome: 'Moltres', img: true },
    { n: '097', nome: 'Articuno', img: true },
    { n: '098', nome: 'Zapdos', img: true },
    { n: '099', nome: 'Greninja ex', img: true },
    { n: '100', nome: 'Sylveon ex', img: true },
    { n: '101', nome: 'Nidorina', img: true },
    { n: '102', nome: 'Victini', img: true },
    { n: '103', nome: 'Zeraora', img: true },
    { n: '104', nome: 'Mewtwo', img: true },
    { n: '105', nome: 'Mew', img: true },
    { n: '106', nome: 'Ditto', img: true },
    { n: '107', nome: 'Pikachu ex', img: true },
    { n: '108', nome: 'Espeon ex', img: true },
    { n: '109', nome: 'Pikachu ex', img: true },
    { n: '110', nome: 'Umbreon ex', img: true },
    { n: '111', nome: 'Masquerain', img: false },
    { n: '112', nome: 'Magmortar', img: false },
    { n: '113', nome: 'Enamorus', img: false },
    { n: '114', nome: 'Kommo-o', img: false },
    { n: '115', nome: 'Spritzee', img: false },
    { n: '116', nome: 'Seel', img: false },
    { n: '117', nome: 'Kyogre', img: false },
    { n: '120', nome: 'Fanfarra de Celebração', img: true },
  ],
};

const foto = (set, n, tam) => `https://images.scrydex.com/pokemon/${set}-${parseInt(n, 10)}/${tam}`;

// Cartas extras de uma coleção, no formato da lista de cartas (acao=cartas)
export function extrasDaColecao(setId, jaTem) {
  return (PROMOS_EXTRA[setId] || [])
    .filter((p) => !jaTem.has(p.n))
    .map((p) => ({
      name: p.nome,
      localId: p.n,
      number: p.n,
      thumb: p.img ? foto(setId, p.n, 'medium') : null,
      image: p.img ? foto(setId, p.n, 'large') : null,
    }));
}

// Uma carta extra pelo id ("mep-089") — para raridade/variações
export function extraPorId(id) {
  const m = String(id || '').match(/^(.+)-(\w+)$/);
  if (!m) return null;
  const lista = PROMOS_EXTRA[m[1]] || [];
  const alvo = /^\d+$/.test(m[2]) ? m[2].padStart(3, '0') : m[2];
  return lista.find((p) => p.n === alvo) ? { raridade: 'Promo', variantes: { holo: true, normal: false, reverse: false } } : null;
}

// Busca por nome/número (cadastro de carta): devolve as extras que batem
export function buscarExtras(textoNome, localId) {
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const q = norm(textoNome);
  const out = [];
  Object.entries(PROMOS_EXTRA).forEach(([set, lista]) => lista.forEach((p) => {
    const bateNome = q && norm(p.nome).includes(q);
    const bateNum = localId && parseInt(localId, 10) === parseInt(p.n, 10);
    if ((q && localId) ? (bateNome && bateNum) : (bateNome || bateNum)) {
      out.push({
        name: p.nome, localId: p.n, id: `${set}-${p.n}`, _setId: set,
        image: null, _imgPronta: p.img ? foto(set, p.n, 'large') : null,
      });
    }
  }));
  return out;
}
