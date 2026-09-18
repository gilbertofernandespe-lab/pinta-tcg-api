# Pinta TCG — ponte com a base de cartas

## Por que isso existe

A página da coleção (o artefato publicado) roda numa sandbox que bloqueia
chamadas pra qualquer API externa — é assim que o navegador protege o
artefato, e não tem como contornar isso de dentro da página. A solução
real é ter um pequeno servidor, fora dessa sandbox, que faz a chamada
pra Pokémon TCG API / Scryfall por você. Esse servidor é o que está
nesta pasta.

## Como colocar no ar (Vercel, gratuito)

1. Crie uma conta em https://vercel.com (dá pra entrar com GitHub).
2. Suba esta pasta (`pinta-tcg-api`) pra um repositório no GitHub.
3. Na Vercel: **Add New → Project**, escolha esse repositório, clique em
   **Deploy**. Não precisa configurar nada — a Vercel detecta a pasta
   `api/` automaticamente.
4. Em alguns segundos você recebe uma URL, tipo
   `https://pinta-tcg-api.vercel.app`.
5. Teste no navegador:
   `https://pinta-tcg-api.vercel.app/api/card-search?game=pokemon&name=Pikachu`
   — se voltar um JSON com cartas, está funcionando.

## Como conectar no site da coleção

Isso é o passo que ainda falta e que dá mais trabalho: trocar, no
formulário da coleção, a parte que hoje só aceita texto digitado por uma
busca que chama essa URL enquanto você digita, mostra os resultados
(com imagem oficial) e preenche o formulário ao escolher um. Esse tipo
de mudança — editar o app existente, testar, ajustar — é exatamente o
tipo de trabalho pro qual vale a pena usar o **Claude Code**: ele edita
os arquivos reais do projeto, roda e testa localmente, e te ajuda a
publicar tanto essa API quanto o site final, tudo com acesso de rede de
verdade (o que eu não tenho daqui do chat).

## Expandindo pra outros jogos

O arquivo `api/card-search.js` já resolve Pokémon e Magic. Pra Yu-Gi-Oh!,
One Piece, Digimon etc., o padrão é o mesmo: chamar a API oficial daquele
jogo e devolver os campos no mesmo formato (`name`, `set`, `number`,
`image`, `rarity`).
