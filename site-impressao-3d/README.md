# Site — Impressão 3D com pintura artesanal

Site completo em **HTML, CSS e JavaScript puro** (sem frameworks).

```
site-impressao-3d/
├── index.html          estrutura e conteúdo fixo
├── style.css           identidade visual, layout e responsividade
├── script.js           configuração + todas as interações
├── assets/
│   ├── images/         imagens (demonstrativas, substituíveis)
│   └── icons/          favicon e ícones em SVG
└── integracoes/
    └── google-reviews-proxy.example.js   (opcional) avaliações reais com chave protegida
```

## 1. Como executar localmente

**Opção rápida:** dê dois cliques em `index.html`. Tudo funciona direto do computador.

**Opção recomendada (servidor local):** dentro da pasta do site, rode um destes comandos e abra o endereço indicado:

```bash
python3 -m http.server 8000      # depois abra http://localhost:8000
# ou
npx serve .
```

Para publicar, envie a pasta inteira para qualquer hospedagem de site estático (Netlify, Vercel, GitHub Pages, Hostinger, Locaweb etc.).

## 2. Inserir as informações verdadeiras

Abra `script.js` e edite o bloco **`SITE_CONFIG`** no topo do arquivo. Nada é inventado: campos vazios simplesmente não aparecem.

| O quê | Onde |
|---|---|
| Nome da marca, frase, logotipo | `brand.name`, `brand.tagline`, `brand.logo` |
| WhatsApp | `whatsapp.number` — só números, com 55 + DDD. Ex.: `'5511999999999'` |
| Mensagens automáticas do WhatsApp | `whatsapp.messages` (`{produto}` é trocado pelo nome da peça) |
| Instagram | `instagram.handle` e `instagram.url` |
| Endereço, mapa e rota | `location` (rua, número, bairro, cidade, estado, CEP, horários) |
| Avaliações do Google | `reviews` (link, nota, quantidade ou integração) |
| Títulos e textos principais | `texts` |
| Produtos do carrossel | `products` |
| Galeria / portfólio | `gallery` |

**Antes de publicar**, mude `showSetupNotices` para `false`. Isso:
- remove os avisos "a configurar";
- remove os cards de avaliações de exemplo e os selos "Exemplo" dos produtos;
- esconde seções que ainda não têm dados (Instagram, localização, avaliações).

Enquanto o número do WhatsApp estiver vazio, os botões abrem o WhatsApp para o visitante escolher o contato (a mensagem já vai preenchida).

### Adicionar um produto
Copie um item da lista `products` e altere os campos. Os campos técnicos são opcionais e só aparecem se preenchidos:

```js
{
  name: 'Nome da peça',
  category: 'Miniatura',
  description: 'Descrição breve.',
  image: 'assets/images/minha-foto.webp',
  alt: 'Descrição da foto para acessibilidade',
  material: 'Resina UV',            // material (PLA, PETG, Resina UV…)
  technology: 'MSLA',               // tecnologia (FDM, SLA, MSLA…)
  finish: 'Pintura manual',
  customization: 'Cores sob consulta',
},
```

> Material ≠ tecnologia: **PLA, PETG e resina UV** são materiais; **FDM, SLA e MSLA** são tecnologias de impressão.

Os produtos atuais são **demonstrativos** (`demo: true`, com o selo "Exemplo"): troque nomes, textos e fotos pelos reais.

## 3. Trocar as imagens do efeito de pintura (seção principal)

O efeito usa duas imagens **do mesmo objeto**:

- `assets/images/peca-sem-pintura.webp` — peça sem pintura
- `assets/images/peca-pintada.webp` — a mesma peça pintada

Regras para fotografar/gerar as suas:
1. **Mesma câmera, mesmo enquadramento, mesma distância e mesma posição da peça** (use tripé e marque a posição da peça na mesa).
2. **Mesmas dimensões em pixels** nas duas imagens (ex.: 1200 × 1000).
3. Iluminação parecida. Fundo transparente (PNG/WebP com transparência) fica mais bonito no palco escuro, mas fundo neutro também funciona.
4. Salve com os mesmos nomes acima ou altere `hero.imageBefore` / `hero.imageAfter` no `SITE_CONFIG`.

Se as dimensões forem diferentes, o console do navegador mostra um aviso. Ajustes finos do pincel ficam em `hero.brushSize`, `hero.brushSoftness`, `hero.trailFade` e `hero.leaveFade`.

As imagens atuais são **renderizações 3D ilustrativas** de uma miniatura de dragão (mesmo modelo, mesma câmera) criadas para validar a interação — não são fotos de produtos reais.

## 4. Suas fotos (produtos, processo, galeria e Instagram)

Nesta versão, apenas as duas imagens do efeito principal estão incluídas. Todos os outros lugares mostram um quadro **"Espaço para foto"** com o nome do arquivo esperado. Basta salvar a foto em `assets/images/` com esse nome — ela aparece sozinha, sem mexer no código.

| Onde aparece | Nomes dos arquivos | Formato sugerido |
|---|---|---|
| Carrossel de produtos | `produto-1.webp` … `produto-6.webp` | 6:5 (ex.: 1200 × 1000) |
| Como funciona (4 etapas) | `processo-1.webp` … `processo-4.webp` | 6:5 |
| Galeria / portfólio | `galeria-1.webp` … `galeria-9.webp` | quadrado; 1, 4 e 6 aparecem maiores |
| Instagram | `instagram-1.webp` … `instagram-4.webp` | quadrado |

Sugestões para a galeria (as legendas já indicam): peça antes da pintura, preparação, detalhe da pintura, pintura em andamento, pequenos detalhes, peça finalizada e antes/depois.

Se preferir outros nomes ou mais itens, altere `products`, `gallery` e `instagramGallery` no `SITE_CONFIG` (as etapas do processo ficam no `index.html`, seção "Como funciona"). Prefira WebP ou JPG com até ~1600 px de largura. Enquanto um item da galeria não tiver foto, ele não abre a ampliação.

## 5. Avaliações do Google (sem inventar dados)

Três caminhos, do mais simples ao mais completo:

1. **Só o link:** cole em `reviews.googleReviewsUrl` o link do perfil/avaliações no Google Maps. Aparece o botão "Ver todas as avaliações no Google".
2. **Dados copiados manualmente:** preencha `rating`, `count` e `items` com avaliações reais (com autorização/atribuição adequadas).
3. **Integração oficial:** use `integracoes/google-reviews-proxy.example.js`. Ele consulta a Places API (New) no servidor, com a chave guardada em variável de ambiente — **a chave nunca vai para o navegador**. Depois informe a URL do proxy em `reviews.proxyEndpoint`.

## 6. O que cada interação faz

- **Pintura interativa:** canvas com máscara dinâmica; o pincel segue o cursor (mouse/caneta), o dedo (toque) ou as setas do teclado. Botões "Sem pintura" / "Ver pintura completa" e o controle deslizante "Comparar".
- **Carrossel:** setas, indicadores, arraste com o mouse, deslize no celular e setas do teclado. Sem avanço automático.
- **Detalhes do produto:** clique na foto ou no nome; botão de orçamento já menciona a peça.
- **Galeria:** ampliação com navegação por setas, teclado e gesto de deslizar; `Esc` fecha.
- **Formulário de orçamento:** monta a mensagem e abre o WhatsApp. Não armazena dados.
- **Acessibilidade:** HTML semântico, foco visível, rótulos ARIA, suporte a teclado e respeito a "reduzir movimento".

## 7. Recursos externos

Somente as fontes gratuitas do Google Fonts (Fraunces, Instrument Sans, JetBrains Mono) e, quando houver endereço, o mapa incorporado do Google Maps. Nenhuma biblioteca JavaScript externa.
