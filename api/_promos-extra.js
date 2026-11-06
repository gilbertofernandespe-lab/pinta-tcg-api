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


// ---------------------------------------------------------------------
// Coleções novas que já saíram mas a TCGdex ainda não cadastrou.
// Quando a TCGdex cadastrar o mesmo código, a versão dela passa na frente.
// Fotos: images.scrydex.com/pokemon/<código scrydex>-<número>/large
// ---------------------------------------------------------------------
const COLECOES_MANUAIS = {
  me06: {
    nome: 'Reinado Delta', nome_en: 'Delta Reign', serie: 'me', oficial: 103, scrydex: 'me6',
    logo: 'https://images.scrydex.com/pokemon/me6-logo/logo',
    simbolo: 'https://images.scrydex.com/pokemon/me6-symbol/symbol',
    cartas: [
      ['001', "Heracross"],
      ['002', "Surskit"],
      ['003', "Masquerain"],
      ['004', "Cacnea"],
      ['005', "Cacturne"],
      ['006', "Combee"],
      ['007', "Vespiquen"],
      ['008', "Shaymin"],
      ['009', "Virizion"],
      ['010', "Wimpod"],
      ['011', "Mega Golisopod ex"],
      ['012', "Sprigatito"],
      ['013', "Floragato"],
      ['014', "Meowscarada ex"],
      ['015', "Smoliv"],
      ['016', "Dolliv"],
      ['017', "Arboliva"],
      ['018', "Growlithe"],
      ['019', "Arcanine"],
      ['020', "Magmar"],
      ['021', "Magmortar"],
      ['022', "Torkoal"],
      ['023', "Heat Rotom ex"],
      ['024', "Heatmor"],
      ['025', "Mantine"],
      ['026', "Kyogre"],
      ['027', "Frillish"],
      ['028', "Jellicent"],
      ['029', "Wishiwashi ex"],
      ['030', "Electabuzz"],
      ['031', "Electivire"],
      ['032', "Jolteon"],
      ['033', "Raikou ex"],
      ['034', "Rotom"],
      ['035', "Thundurus"],
      ['036', "Pincurchin"],
      ['037', "Pawmi"],
      ['038', "Pawmo"],
      ['039', "Pawmot"],
      ['040', "Wattrel"],
      ['041', "Kilowattrel"],
      ['042', "Miraidon"],
      ['043', "Drowzee"],
      ['044', "Hypno"],
      ['045', "Giratina"],
      ['046', "Golett"],
      ['047', "Mega Golurk ex"],
      ['048', "Enamorus"],
      ['049', "Sandshrew"],
      ['050', "Sandslash"],
      ['051', "Onix"],
      ['052', "Steelix"],
      ['053', "Groudon"],
      ['054', "Landorus"],
      ['055', "Nidoran ♀"],
      ['056', "Nidorina"],
      ['057', "Nidoqueen"],
      ['058', "Spinarak"],
      ['059', "Ariados"],
      ['060', "Sableye"],
      ['061', "Carvanha"],
      ['062', "Sharpedo"],
      ['063', "Darkrai"],
      ['064', "Purrloin"],
      ['065', "Liepard"],
      ['066', "Zorua"],
      ['067', "Zoroark ex"],
      ['068', "Inkay"],
      ['069', "Mega Malamar ex"],
      ['070', "Morpeko"],
      ['071', "Zarude"],
      ['072', "Druddigon"],
      ['073', "Jangmo-o"],
      ['074', "Hakamo-o"],
      ['075', "Kommo-o"],
      ['076', "Cyclizar"],
      ['077', "Tauros"],
      ['078', "Eevee"],
      ['079', "Delibird"],
      ['080', "Azurill"],
      ['081', "Swablu"],
      ['082', "Altaria"],
      ['083', "Kecleon"],
      ['084', "Mega Rayquaza ex"],
      ['085', "Tornadus"],
      ['086', "Fletchling"],
      ['087', "Fletchinder"],
      ['088', "Talonflame ex"],
      ['089', "Aarune"],
      ['090', "Adventure Lantern"],
      ['091', "Custom Vest"],
      ['092', "Emcee's Hype"],
      ['093', "Grisham"],
      ['094', "Legendary Pyroduct (Left)"],
      ['095', "Legendary Pyroduct (Right)"],
      ['096', "Legendary Summit (Left)"],
      ['097', "Legendary Summit (Right)"],
      ['098', "Legendary Trench (Left)"],
      ['099', "Legendary Trench (Right)"],
      ['100', "Mega Rayquaza Cap"],
      ['101', "Tasty Rice Ball"],
      ['102', "Tate & Liza's Training"],
      ['103', "Zinnia's Trust"],
      ['104', "Masquerain"],
      ['105', "Sprigatito"],
      ['106', "Growlithe"],
      ['107', "Magmortar"],
      ['108', "Electivire"],
      ['109', "Pincurchin"],
      ['110', "Enamorus"],
      ['111', "Groudon"],
      ['112', "Zorua"],
      ['113', "Inkay"],
      ['114', "Eevee"],
      ['115', "Azurill"],
      ['116', "Altaria"],
      ['117', "Kecleon"],
      ['118', "Mega Golisopod ex"],
      ['119', "Heat Rotom ex"],
      ['120', "Wishiwashi ex"],
      ['121', "Raikou ex"],
      ['122', "Mega Golurk ex"],
      ['123', "Mega Malamar ex"],
      ['124', "Talonflame ex"],
      ['125', "Aarune"],
      ['126', "Adventure Lantern"],
      ['127', "Custom Vest"],
      ['128', "Emcee's Hype"],
      ['129', "Pokémon Catcher"],
      ['130', "Tate & Liza's Training"],
      ['131', "Zinnia's Trust"],
      ['132', "Bubbly Water Energy"],
      ['133', "Growing Grass Energy"],
      ['134', "Nitro Fire Energy"],
      ['135', "Mega Golisopod ex"],
      ['136', "Raikou ex"],
      ['137', "Mega Golurk ex"],
      ['138', "Mega Rayquaza ex"],
      ['139', "Aarune"],
      ['140', "Zinnia's Trust"],
      ['141', "Mega Rayquaza ex"],
    ],
  },
};
const fotoManual = (col, n, tam) => `https://images.scrydex.com/pokemon/${col.scrydex}-${parseInt(n, 10)}/${tam}`;
const numManual = (col, n) => (Number(n) <= col.oficial ? n + '/' + String(col.oficial).padStart(3, '0') : n + '/' + String(col.oficial).padStart(3, '0'));
// raridade pela posição na coleção (o resto você escolhe no cadastro)
function raridadeManual(col, n, nome) {
  const x = Number(n);
  if (x <= col.oficial) return / ex$/.test(nome) ? 'Double rare' : null;
  if (x <= 117) return 'Illustration rare';
  if (x <= 131) return 'Ultra Rare';
  if (x <= 134) return 'Hyper rare';
  if (x <= 140) return 'Special illustration rare';
  return 'Hyper rare';
}

// lista para o seletor de coleções (só as que a TCGdex ainda não tem)
export function colecoesManuais(jaTem) {
  return Object.entries(COLECOES_MANUAIS).filter(([id]) => !jaTem.has(id)).map(([id, c]) => ({
    id, nome: c.nome, nome_en: c.nome_en, serie: c.serie, oficial: c.oficial, total: c.cartas.length,
    logo: c.logo, simbolo: c.simbolo,
  }));
}
// todas as cartas de uma coleção manual (acao=cartas)
export function colecaoManual(setId) {
  const col = COLECOES_MANUAIS[setId];
  if (!col) return null;
  return {
    colecao: { id: setId, nome: col.nome, oficial: col.oficial, logo: col.logo },
    cartas: col.cartas.map(([n, nome]) => ({
      name: nome, localId: n, number: numManual(col, n),
      thumb: fotoManual(col, n, 'medium'), image: fotoManual(col, n, 'large'),
    })),
  };
}
export const infoManual = (setId) => {
  const c = COLECOES_MANUAIS[setId];
  return c ? { nome: c.nome, total: c.oficial } : null;
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
  const col = COLECOES_MANUAIS[m[1]];
  if (col) {
    const alvo = String(m[2]).padStart(3, '0');
    const c = col.cartas.find(([n]) => n === alvo);
    if (!c) return null;
    const alta = Number(alvo) > col.oficial;
    return { raridade: raridadeManual(col, alvo, c[1]), variantes: alta || / ex$/.test(c[1]) ? { holo: true, normal: false, reverse: false } : { normal: true, reverse: true, holo: false } };
  }
  const lista = PROMOS_EXTRA[m[1]] || [];
  const alvo = /^\d+$/.test(m[2]) ? m[2].padStart(3, '0') : m[2];
  return lista.find((p) => p.n === alvo) ? { raridade: 'Promo', variantes: { holo: true, normal: false, reverse: false } } : null;
}

// Busca por nome/número (cadastro de carta): devolve as extras que batem
export function buscarExtras(textoNome, localId, totalColecao) {
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const q = norm(textoNome);
  const out = [];
  Object.entries(PROMOS_EXTRA).forEach(([set, lista]) => lista.forEach((p) => {
    if (totalColecao) return;   // "000/000" é número de coleção, não de promo
    const bateNome = q && norm(p.nome).includes(q);
    const bateNum = localId && parseInt(localId, 10) === parseInt(p.n, 10);
    if ((q && localId) ? (bateNome && bateNum) : (bateNome || bateNum)) {
      out.push({
        name: p.nome, localId: p.n, id: `${set}-${p.n}`, _setId: set,
        image: null, _imgPronta: p.img ? foto(set, p.n, 'large') : null,
      });
    }
  }));
  Object.entries(COLECOES_MANUAIS).forEach(([set, col]) => col.cartas.forEach(([n, nome]) => {
    if (totalColecao && Number(totalColecao) !== col.oficial) return;
    const bateNome = q && norm(nome).includes(q);
    const bateNum = localId && parseInt(localId, 10) === parseInt(n, 10);
    if ((q && localId) ? (bateNome && bateNum) : (bateNome || bateNum)) {
      out.push({ name: nome, localId: n, id: `${set}-${n}`, _setId: set, _manual: true, image: null, _imgPronta: fotoManual(col, n, 'large') });
    }
  }));
  return out;
}
