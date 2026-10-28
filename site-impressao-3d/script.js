/* =================================================================
   ForgeLab — script principal
   -----------------------------------------------------------------
   1. CONFIGURAÇÃO  ← valores de RESERVA (o conteúdo oficial fica em dados/*.json
      e é editado pelo painel em /admin)
   1b. Carregamento dos dados do painel (dados/*.json)
   2. Utilidades
   3. Textos, marca e links de WhatsApp
   4. Cabeçalho e menu
   5. Experiência principal: revelação da pintura (PaintReveal)
   6. Produtos (carrossel + detalhes)
   7. Galeria (ampliação)
   8. Avaliações do Google
   9. Formulário de orçamento
   10. Instagram, localização e rodapé
   11. Animações de entrada e navegação ativa
   ================================================================= */

/* =================================================================
   1. CONFIGURAÇÃO (RESERVA)
   O conteúdo do site agora é editado pelo painel (/admin) e fica nos
   arquivos dados/site.json, dados/produtos.json e dados/galeria.json.
   Os valores abaixo são usados só quando esses arquivos não podem ser
   lidos (ex.: abrindo o index.html direto do computador).
   Campos vazios ('') ou null NÃO aparecem no site — nada é inventado.
   ================================================================= */
const SITE_CONFIG = {
  /* true  → mostra avisos discretos "a configurar" e exemplos de avaliações
             marcados como DEMONSTRAÇÃO (útil enquanto monta o site).
     false → versão para publicar: esconde avisos, exemplos e seções sem dados. */
  showSetupNotices: true,

  brand: {
    name: "ForgeLab", // nome provisório — substitua pelo nome real
    tagline:
      "Impressão 3D em resina e filamento, finalizada à mão — de miniaturas a action figures.",
    logo: "assets/images/forgelab-icon.png", // símbolo do logo (troque pela versão em alta resolução)
  },

  whatsapp: {
    // Somente números, com DDI 55 + DDD + número. Ex.: '5511999999999'
    // Enquanto estiver vazio, os botões abrem o WhatsApp para o visitante escolher o contato.
    number: "5511989980490",
    messages: {
      general:
        "Olá! Conheci o trabalho de vocês pelo site e gostaria de saber mais sobre os serviços de impressão 3D e pintura artesanal.",
      product:
        "Olá! Tenho interesse na peça {produto} e gostaria de solicitar um orçamento.",
    },
  },

  instagram: {
    handle: "forgelab.art", // ex.: 'seuatelie3d' (sem @)
    url: "https://www.instagram.com/forgelab.art/", // ex.: 'https://www.instagram.com/seuatelie3d/'
  },

  /* FRETE — o site consulta o CEP no ViaCEP (gratuito) para descobrir a cidade/UF
     e mostra o valor ESTIMADO da tabela abaixo. Valores em reais.
     null = "sob consulta" (o cliente confirma pelo WhatsApp). */
  shipping: {
    enabled: true,
    originState: "", // UF de onde você envia, ex.: 'SP' (usa a faixa "mesmoEstado")
    rates: {
      // ex.: mesmoEstado: 25, Sudeste: 32.9, Norte: 59.9
      mesmoEstado: null,
      Sudeste: null,
      Sul: null,
      "Centro-Oeste": null,
      Nordeste: null,
      Norte: null,
    },
    deadlines: {
      // prazos opcionais, ex.: mesmoEstado: '3 a 5 dias úteis'
      mesmoEstado: "",
      Sudeste: "",
      Sul: "",
      "Centro-Oeste": "",
      Nordeste: "",
      Norte: "",
    },
    note: "Estimativa para uma peça de tamanho pequeno a médio. O valor final é confirmado conforme tamanho, peso e embalagem.",
  },

  reviews: {
    googleReviewsUrl: "", // link para a página de avaliações no Google
    // Dados reais copiados manualmente (opcional). Deixe null/[] se não tiver.
    rating: null, // ex.: 4.9
    count: null, // ex.: 37
    items: [], // [{ author, rating, text, date }]
    // Integração segura: URL do SEU servidor/proxy que consulta a Google Places API
    // (a chave fica no servidor — veja integracoes/google-reviews-proxy.example.js)
    proxyEndpoint: "",
  },

  hero: {
    // As duas imagens PRECISAM ter o mesmo enquadramento, tamanho e posição.
    imageBefore: "assets/images/peca-sem-pintura.webp",
    imageAfter: "assets/images/peca-pintada.webp",
    altBefore:
      "Miniatura de dragão impressa em resina cinza, ainda sem pintura, com as linhas de impressão aparentes.",
    brushSize: 0.15, // raio do pincel em relação à largura da peça (0.08 – 0.25)
    brushSoftness: 0.5, // 0 = borda dura, 1 = borda muito difusa
    trailFade: 0.14, // quão rápido o rastro some enquanto o cursor está na peça
    leaveFade: 0.09, // quão rápido a peça volta a ficar sem pintura ao sair
  },

  texts: {
    hero: {
      eyebrow: "Impressão 3D · Action figures",
      title: "Da impressão à arte.",
      subtitle:
        "Impressão 3D de alta qualidade com pintura artesanal e acabamento feito nos mínimos detalhes.",
    },
    products: {
      title: "Peças que ganham vida.",
      lead: "Cada peça sai da impressora como uma escultura em estado bruto. A cor, a luz e a personalidade vêm depois — pelas mãos de quem pinta.",
    },
  },

  /* PRODUTOS — conteúdo DEMONSTRATIVO. Substitua pelos produtos reais.
     FOTOS: coloque o arquivo em assets/images com o nome indicado em "image".
     Enquanto a foto não existir, o site mostra um espaço reservado com o nome do arquivo.
     Campos técnicos (material, technology, finish, customization) são opcionais e
     só aparecem se preenchidos — preencha apenas o que for confirmado.
     Lembrete: material ≠ tecnologia. PLA/PETG/Resina UV são materiais;
     FDM, SLA e MSLA são tecnologias de impressão. Exemplo:
       material: 'Resina UV', technology: 'MSLA', finish: 'Pintura manual' */
  products: [
    {
      name: "Miniaturas e personagens",
      category: "Miniaturas",
      description:
        "Personagens e criaturas em pequena escala, com pintura detalhada à mão.",
      image: "assets/images/mikasa.png",
      alt: "Miniatura pintada à mão",
      finish: "Pintura manual",
      demo: true,
    },
    {
      name: "Estatuetas decorativas",
      category: "Decoração",
      description:
        "Peças para estantes, mesas e ambientes, com acabamento pensado para exposição.",
      image: "assets/images/est.png",
      alt: "Estatueta decorativa pintada à mão",
      finish: "Pintura manual",
      demo: true,
    },
    {
      name: "Action figures e colecionáveis",
      category: "Carlos",
      description: "Carlos",
      image: "assets/images/carlos.png",
      alt: "Figura colecionável pintada à mão",
      finish: "Pintura manual",
      demo: true,
    },
    {
      name: "Esculturas personalizadas",
      category: "Personalizados",
      description:
        "Sua ideia transformada em escultura: do modelo à pintura, definida com você.",
      image: "assets/images/produto-4.webp",
      alt: "Escultura personalizada pintada à mão",
      finish: "Pintura manual",
      customization: "Cores e detalhes sob consulta",
      demo: true,
    },
    {
      name: "Presentes personalizados",
      category: "Presentes",
      description:
        "Uma peça pensada para alguém, com cores e detalhes que tornam o presente único.",
      image: "assets/images/produto-5.webp",
      alt: "Presente personalizado impresso em 3D e pintado",
      finish: "Pintura manual",
      customization: "Cores e detalhes sob consulta",
      demo: true,
    },
    {
      name: "Peças sob encomenda",
      category: "Sob encomenda",
      description:
        "Tem uma ideia, um personagem ou um arquivo 3D? Avaliamos o projeto e indicamos o melhor caminho.",
      image: "assets/images/produto-6.webp",
      alt: "Peça produzida sob encomenda",
      customization: "Definida conforme o projeto",
      demo: true,
    },
  ],

  /* GALERIA / PORTFÓLIO — coloque as fotos com estes nomes em assets/images.
     layout: '' (quadrado) | 'wide' (grande) | 'tall' (vertical). A legenda sugere o tipo de foto. */
  gallery: [
    {
      src: "assets/images/galeria-1.webp",
      alt: "Peça recém-impressa, antes da pintura",
      caption: "Antes · textura da impressão",
      layout: "wide",
    },
    {
      src: "assets/images/galeria-2.webp",
      alt: "Peça durante a preparação",
      caption: "Preparação",
    },
    {
      src: "assets/images/galeria-3.webp",
      alt: "Detalhe da pintura manual",
      caption: "Detalhe da pintura",
    },
    {
      src: "assets/images/galeria-4.webp",
      alt: "Peça recebendo as primeiras camadas de tinta",
      caption: "Pintura em andamento",
      layout: "tall",
    },
    {
      src: "assets/images/galeria-5.webp",
      alt: "Close de acabamento",
      caption: "Pequenos detalhes",
    },
    {
      src: "assets/images/galeria-6.webp",
      alt: "Peça finalizada",
      caption: "Depois · peça finalizada",
      layout: "wide",
    },
    {
      src: "assets/images/galeria-7.webp",
      alt: "Comparação entre a peça sem pintura e pintada",
      caption: "Antes e depois",
    },
    {
      src: "assets/images/galeria-8.webp",
      alt: "Peça finalizada",
      caption: "Resultado final",
    },
    {
      src: "assets/images/galeria-9.webp",
      alt: "Peça finalizada",
      caption: "Resultado final",
    },
  ],

  /* Pequena galeria ao lado do convite para o Instagram */
  instagramGallery: [
    {
      src: "assets/images/instagram-1.webp",
      alt: "Foto do Instagram da ForgeLab",
    },
    {
      src: "assets/images/instagram-2.webp",
      alt: "Foto do Instagram da ForgeLab",
    },
    {
      src: "assets/images/instagram-3.webp",
      alt: "Foto do Instagram da ForgeLab",
    },
    {
      src: "assets/images/instagram-4.webp",
      alt: "Foto do Instagram da ForgeLab",
    },
  ],
};

/* Exemplos de layout das avaliações.
   NÃO são avaliações reais. Só aparecem com showSetupNotices: true
   e sempre com o selo "Demonstração". */
const DEMO_REVIEWS = [
  {
    author: "Nome do cliente",
    rating: 5,
    text: "Exemplo de layout: aqui aparecerá o comentário publicado por um cliente no Google.",
    date: "data da avaliação",
  },
  {
    author: "Nome do cliente",
    rating: 5,
    text: "Exemplo de layout: os textos reais são carregados pela integração ou copiados manualmente na configuração.",
    date: "data da avaliação",
  },
  {
    author: "Nome do cliente",
    rating: 5,
    text: "Exemplo de layout: este card some automaticamente quando showSetupNotices for false.",
    date: "data da avaliação",
  },
];

/* =================================================================
   1b. CARREGAMENTO DOS DADOS DO PAINEL
   -----------------------------------------------------------------
   O painel (/admin) grava o conteúdo nestes arquivos. O site lê os
   três com fetch e substitui os valores de reserva do SITE_CONFIG.
   Se a leitura falhar (arquivo aberto direto do computador, falta de
   internet, JSON com erro...), o site continua com a reserva acima.
   ================================================================= */
const DATA_FILES = {
  site: "dados/site.json",
  produtos: "dados/produtos.json",
  galeria: "dados/galeria.json",
};

async function fetchJSON(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(url, { cache: "no-cache", signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadContentData() {
  // aberto direto do computador (file://): não há servidor para ler os arquivos
  if (!/^https?:$/.test(location.protocol)) return;
  const [site, produtos, galeria] = await Promise.all(
    Object.values(DATA_FILES).map((url) =>
      fetchJSON(url).catch((err) => {
        console.warn(`[ForgeLab] Não foi possível ler ${url} — usando a reserva do script.`, err);
        return null;
      }),
    ),
  );
  const safely = (fn, data, nome) => {
    if (!data) return;
    try {
      fn(data);
    } catch (err) {
      console.warn(`[ForgeLab] Erro ao aplicar ${nome} — usando a reserva do script.`, err);
    }
  };
  safely(applySiteData, site, DATA_FILES.site);
  safely(applyProductsData, produtos, DATA_FILES.produtos);
  safely(applyGalleryData, galeria, DATA_FILES.galeria);
}

/* utilidades da conversão */
const has = (v) => v !== undefined && v !== null;
const setIf = (obj, key, value) => {
  if (has(value)) obj[key] = value;
};
const toNumber = (v) => {
  if (v === "" || !has(v)) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const TAMANHO_GALERIA = { grande: "wide", vertical: "tall" };
const REGIOES_FRETE = {
  mesmo_estado: "mesmoEstado",
  sudeste: "Sudeste",
  sul: "Sul",
  centro_oeste: "Centro-Oeste",
  nordeste: "Nordeste",
  norte: "Norte",
};

/** dados/site.json → SITE_CONFIG */
function applySiteData(d) {
  const C = SITE_CONFIG;
  const T = C.texts;
  T.sections = T.sections || {};
  const sec = (nome) => (T.sections[nome] = T.sections[nome] || {});

  if (d.marca) {
    setIf(C.brand, "name", d.marca.nome);
    setIf(C.brand, "tagline", d.marca.frase);
    setIf(C.brand, "logo", d.marca.logo);
    setIf(C.brand, "fit", d.marca.logo_ajuste);
  }
  if (d.whatsapp) {
    if (has(d.whatsapp.numero)) C.whatsapp.number = String(d.whatsapp.numero).replace(/\D/g, "");
    setIf(C.whatsapp.messages, "general", d.whatsapp.mensagem_geral);
    setIf(C.whatsapp.messages, "product", d.whatsapp.mensagem_produto);
  }
  if (d.inicio) {
    setIf(T.hero, "eyebrow", d.inicio.rotulo);
    setIf(T.hero, "title", d.inicio.titulo);
    setIf(T.hero, "subtitle", d.inicio.subtitulo);
    setIf(C.hero, "imageBefore", d.inicio.foto_sem_pintura || undefined);
    setIf(C.hero, "imageAfter", d.inicio.foto_pintada || undefined);
    setIf(C.hero, "altBefore", d.inicio.descricao_foto || undefined);
    setIf(C.hero, "fit", d.inicio.ajuste);
  }
  if (d.produtos_secao) {
    setIf(T.products, "title", d.produtos_secao.titulo);
    setIf(T.products, "lead", d.produtos_secao.texto);
  }
  if (d.processo) {
    setIf(sec("process"), "title", d.processo.titulo);
    setIf(sec("process"), "lead", d.processo.texto);
    setIf(sec("process"), "note", d.processo.frase_final);
    if (Array.isArray(d.processo.etapas)) {
      C.process = d.processo.etapas.map((e) => ({
        title: e.titulo || "",
        text: e.texto || "",
        image: e.foto || "",
        alt: e.descricao_foto || e.titulo || "",
        fit: e.ajuste,
      }));
    }
  }
  if (d.diferenciais) {
    setIf(sec("features"), "title", d.diferenciais.titulo);
    setIf(sec("features"), "highlight", d.diferenciais.destaque);
    setIf(sec("features"), "lead", d.diferenciais.texto);
    if (Array.isArray(d.diferenciais.itens)) {
      C.features = d.diferenciais.itens.map((i) => ({
        icon: i.icone,
        title: i.titulo || "",
        text: i.texto || "",
      }));
    }
  }
  if (d.portfolio_secao) {
    setIf(sec("gallery"), "title", d.portfolio_secao.titulo);
    setIf(sec("gallery"), "lead", d.portfolio_secao.texto);
  }
  if (d.avaliacoes) {
    const a = d.avaliacoes;
    setIf(sec("reviews"), "title", a.titulo);
    setIf(C.reviews, "googleReviewsUrl", a.link_google);
    if ("nota" in a) C.reviews.rating = toNumber(a.nota);
    if ("quantidade" in a) C.reviews.count = toNumber(a.quantidade);
    if (Array.isArray(a.lista)) {
      C.reviews.items = a.lista
        .filter((r) => r && r.texto)
        .map((r) => ({ author: r.nome || "", rating: toNumber(r.nota), text: r.texto, date: r.data || "" }));
    }
  }
  if (d.contato) {
    setIf(sec("contact"), "title", d.contato.titulo);
    setIf(sec("contact"), "lead", d.contato.texto);
    setIf(sec("contact"), "disclaimer", d.contato.aviso);
  }
  if (d.instagram) {
    const ig = d.instagram;
    setIf(sec("instagram"), "title", ig.titulo);
    if (has(ig.perfil)) C.instagram.handle = String(ig.perfil).replace(/^@/, "").trim();
    setIf(C.instagram, "url", ig.link);
    if (Array.isArray(ig.fotos)) {
      C.instagramGallery = ig.fotos.map((f) => ({
        src: f.foto || "",
        alt: f.descricao_foto || "Foto do Instagram",
        fit: f.ajuste,
      }));
    }
  }
  if (d.frete) {
    const f = d.frete;
    setIf(sec("shipping"), "title", f.titulo);
    setIf(sec("shipping"), "lead", f.texto);
    if (has(f.estado_origem)) C.shipping.originState = String(f.estado_origem).trim().toUpperCase();
    setIf(C.shipping, "note", f.observacao);
    if (f.regioes) {
      Object.entries(REGIOES_FRETE).forEach(([chave, nome]) => {
        const r = f.regioes[chave];
        if (!r) return;
        C.shipping.rates[nome] = toNumber(r.valor);
        C.shipping.deadlines[nome] = r.prazo || "";
      });
    }
  }
}

/** dados/produtos.json → SITE_CONFIG.products */
function applyProductsData(d) {
  if (!Array.isArray(d.produtos)) return;
  SITE_CONFIG.products = d.produtos
    .filter((p) => p && p.nome)
    .map((p) => ({
      name: p.nome,
      category: p.categoria || "",
      description: p.descricao || "",
      image: p.foto || "",
      alt: p.descricao_foto || p.nome,
      material: p.material || "",
      technology: p.tecnologia || "",
      finish: p.acabamento || "",
      customization: p.personalizacao || "",
      demo: !!p.exemplo,
      fit: p.ajuste,
    }));
}

/** dados/galeria.json → SITE_CONFIG.gallery */
function applyGalleryData(d) {
  if (!Array.isArray(d.fotos)) return;
  SITE_CONFIG.gallery = d.fotos
    .filter((g) => g && g.foto)
    .map((g) => ({
      src: g.foto,
      alt: g.descricao_foto || g.legenda || "Foto do portfólio",
      caption: g.legenda || "",
      layout: TAMANHO_GALERIA[g.tamanho] || "",
      fit: g.ajuste,
    }));
}

/* -----------------------------------------------------------------
   Ajuste de foto (definido no painel para cada imagem)
   { modo: "inteira" | "preencher", zoom: 50–300, x: 0–100, y: 0–100 }
   Aplicado com object-fit, object-position e scale — o arquivo da
   foto não é alterado. Sem ajuste, vale o padrão do CSS.
   ----------------------------------------------------------------- */
function normalizeFit(fit, padrao = "preencher") {
  if (!fit || typeof fit !== "object") return null;
  const n = (v, min, max, def) => {
    const x = toNumber(v);
    return x === null ? def : Math.min(max, Math.max(min, x));
  };
  return {
    modo: fit.modo === "inteira" || fit.modo === "preencher" ? fit.modo : padrao,
    zoom: n(fit.zoom, 50, 300, 100),
    x: n(fit.x, 0, 100, 50),
    y: n(fit.y, 0, 100, 50),
  };
}
function fitStyle(fit, padrao) {
  const f = normalizeFit(fit, padrao);
  if (!f) return "";
  let css = `object-fit:${f.modo === "inteira" ? "contain" : "cover"};object-position:${f.x}% ${f.y}%;`;
  if (f.zoom !== 100) css += `--img-scale:${f.zoom / 100};transform-origin:${f.x}% ${f.y}%;`;
  return css;
}
/** atributos para usar dentro de um <img ...> montado como texto */
function fitAttrs(fit, padrao) {
  const css = fitStyle(fit, padrao);
  if (!css) return "";
  return ` style="${css}"${normalizeFit(fit, padrao).zoom !== 100 ? " data-zoom" : ""}`;
}
/** aplica (ou limpa) o ajuste num <img> que já existe */
function applyFit(img, fit, padrao) {
  ["object-fit", "object-position", "--img-scale", "transform-origin"].forEach((p) =>
    img.style.removeProperty(p),
  );
  img.removeAttribute("data-zoom");
  const css = fitStyle(fit, padrao);
  if (!css) return;
  img.style.cssText += css;
  if (normalizeFit(fit, padrao).zoom !== 100) img.setAttribute("data-zoom", "");
}

/* -----------------------------------------------------------------
   Etapas do "Como funciona" e itens dos "Diferenciais"
   Só são remontados quando vêm do painel; sem dados, fica o HTML.
   ----------------------------------------------------------------- */
const FEATURE_ICONS = ["brush", "loupe", "cube", "layers", "chat", "palette", "hand", "star", "eye"];

function renderProcess() {
  const steps = SITE_CONFIG.process;
  const ol = $(".steps");
  if (!ol || !Array.isArray(steps) || !steps.length) return;
  ol.innerHTML = steps
    .map(
      (s, i) => `
      <li class="step" data-animate>
        <figure class="step-media"><img data-photo src="${escapeHTML(s.image)}" alt="${escapeHTML(s.alt)}" width="900" height="750" loading="lazy" decoding="async"${fitAttrs(s.fit, "preencher")}></figure>
        <div class="step-body">
          <span class="step-num">${String(i + 1).padStart(2, "0")}</span>
          <h3>${escapeHTML(s.title)}</h3>
          <p>${escapeHTML(s.text)}</p>
        </div>
      </li>`,
    )
    .join("");
}

function renderFeatures() {
  const items = SITE_CONFIG.features;
  const ul = $(".features-list");
  if (!ul || !Array.isArray(items) || !items.length) return;
  ul.innerHTML = items
    .map((it) => {
      const icon = FEATURE_ICONS.includes(it.icon) ? it.icon : "cube";
      return `<li data-animate><svg class="icon" aria-hidden="true"><use href="#i-${icon}"/></svg><div><h3>${escapeHTML(it.title)}</h3><p>${escapeHTML(it.text)}</p></div></li>`;
    })
    .join("");
}

/* =================================================================
   2. Utilidades
   ================================================================= */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const prefersReducedMotion = window.matchMedia(
  "(prefers-reduced-motion: reduce)",
);

const escapeHTML = (str = "") =>
  String(str).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

/** Link do WhatsApp com mensagem codificada corretamente. */
function waLink(message) {
  const number = (SITE_CONFIG.whatsapp.number || "").replace(/\D/g, "");
  const base = number ? `https://wa.me/${number}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(message)}`;
}
const waProductMessage = (name) =>
  SITE_CONFIG.whatsapp.messages.product.replace("{produto}", name);

function getPath(obj, path) {
  return path
    .split(".")
    .reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}

/** Esconde uma seção e os links de navegação que apontam para ela. */
function hideSection(id) {
  const section = document.getElementById(id);
  if (section) section.hidden = true;
  $$(`a[href="#${id}"]`).forEach((a) => {
    const li = a.closest("li");
    (li || a).hidden = true;
  });
}

function setupNote(el, html) {
  if (!el) return;
  if (SITE_CONFIG.showSetupNotices) {
    el.innerHTML = html;
    el.hidden = false;
  }
}

function stars(n) {
  const full = Math.round(Number(n) || 0);
  return Array.from(
    { length: 5 },
    (_, i) =>
      `<svg class="icon" style="opacity:${i < full ? 1 : 0.25}" aria-hidden="true"><use href="#i-star"/></svg>`,
  ).join("");
}

function loadImage(img) {
  return new Promise((resolve, reject) => {
    if (img.complete && img.naturalWidth) return resolve(img);
    img.addEventListener("load", () => resolve(img), { once: true });
    img.addEventListener(
      "error",
      () => reject(new Error(`Falha ao carregar ${img.src}`)),
      { once: true },
    );
  }).then((i) =>
    i.decode
      ? i
          .decode()
          .catch(() => {})
          .then(() => i)
      : i,
  );
}

/* -----------------------------------------------------------------
   Espaços reservados para fotos
   Toda <img data-photo> cujo arquivo ainda não existe é trocada por um
   quadro "Espaço para foto" com o nome do arquivo esperado. Assim que o
   arquivo for colocado na pasta, a foto aparece sozinha.
   ----------------------------------------------------------------- */
function showPhotoSlot(img) {
  const file = (img.getAttribute("src") || "").split("/").pop();
  img.hidden = true;
  let slot = img.nextElementSibling;
  if (!slot || !slot.classList.contains("photo-slot")) {
    slot = document.createElement("span");
    slot.className = "photo-slot";
    slot.setAttribute("role", "img");
    img.after(slot);
  }
  slot.setAttribute(
    "aria-label",
    `Espaço reservado para foto: ${img.alt || file}`,
  );
  slot.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-camera"/></svg>
    <span class="photo-slot-label">Espaço para foto</span>
    <code>${escapeHTML(file)}</code>`;
  slot.hidden = false;
  const btn = img.closest("[data-lb-index]");
  if (btn) btn.disabled = true; // galeria: não amplia espaço vazio
}
function hidePhotoSlot(img) {
  img.hidden = false;
  const slot = img.nextElementSibling;
  if (slot && slot.classList.contains("photo-slot")) slot.hidden = true;
  const btn = img.closest("[data-lb-index]");
  if (btn) btn.disabled = false;
}
document.addEventListener(
  "error",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      e.target.hasAttribute("data-photo")
    )
      showPhotoSlot(e.target);
  },
  true,
);
document.addEventListener(
  "load",
  (e) => {
    if (
      e.target instanceof HTMLImageElement &&
      e.target.hasAttribute("data-photo")
    )
      hidePhotoSlot(e.target);
  },
  true,
);
function checkExistingPhotos() {
  // imagens do HTML que falharam antes de o script rodar
  $$("img[data-photo]").forEach((img) => {
    if (img.getAttribute("src") && img.complete && img.naturalWidth === 0)
      showPhotoSlot(img);
  });
}

/* =================================================================
   3. Textos, marca e links de WhatsApp
   ================================================================= */
function applyContent() {
  document.documentElement.classList.remove("no-js");
  // telas de toque: mostra a dica "arraste o dedo" em vez de "passe o cursor"
  const touchOnly = window.matchMedia(
    "(hover: none), (pointer: coarse)",
  ).matches;
  if (touchOnly) document.documentElement.classList.add("is-touch");
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType === "touch")
        document.documentElement.classList.add("is-touch");
    },
    { passive: true },
  );
  const source = { brand: SITE_CONFIG.brand, ...SITE_CONFIG.texts };
  $$("[data-text]").forEach((el) => {
    const value = getPath(source, el.dataset.text);
    if (typeof value === "string" && value.trim()) el.textContent = value;
  });
  document.title = `${SITE_CONFIG.brand.name} — Impressão 3D com pintura artesanal`;

  // nome da marca no cabeçalho/rodapé: "FORGE" + "LAB" em roxo; outro nome aparece por inteiro
  const brandName = (SITE_CONFIG.brand.name || "").trim();
  if (brandName && brandName.replace(/\s+/g, "").toLowerCase() !== "forgelab") {
    $$(".brand-name").forEach((el) => {
      el.textContent = brandName;
      el.setAttribute("aria-label", brandName);
    });
  }

  if (SITE_CONFIG.brand.logo) {
    $$(".brand-mark").forEach((mark) => {
      mark.innerHTML = `<img src="${escapeHTML(SITE_CONFIG.brand.logo)}" alt="" width="34" height="34">`;
      applyFit(mark.firstElementChild, SITE_CONFIG.brand.fit, "inteira");
      const f = normalizeFit(SITE_CONFIG.brand.fit, "inteira");
      if (f && f.zoom > 100) mark.style.overflow = "hidden";
    });
  }

  $$('[data-wa="general"]').forEach((a) => {
    a.href = waLink(SITE_CONFIG.whatsapp.messages.general);
  });
  $$("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  if (!SITE_CONFIG.whatsapp.number) {
    console.info(
      "[ForgeLab] Configure SITE_CONFIG.whatsapp.number para que os botões abram a conversa com o estabelecimento.",
    );
  }
}

/* =================================================================
   4. Cabeçalho e menu
   ================================================================= */
function initHeader() {
  const header = $("[data-header]");
  const toggle = $("[data-menu-toggle]");
  const nav = $("[data-nav]");
  const label = $("[data-menu-label]");
  const floatBtn = $(".wa-float");

  const hero = $("#inicio");
  const setScrolled = () => {
    header.classList.toggle(
      "is-scrolled",
      window.scrollY > 24 || nav.classList.contains("is-open"),
    );
    // o botão flutuante só aparece depois do topo (que já tem seus próprios botões de WhatsApp)
    const pastHero = window.scrollY > hero.offsetHeight * 0.6;
    floatBtn.classList.toggle(
      "is-hidden",
      !pastHero || nav.classList.contains("is-open"),
    );
  };
  setScrolled();
  window.addEventListener("scroll", setScrolled, { passive: true });

  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    label.textContent = open ? "Fechar menu" : "Abrir menu";
    setScrolled();
  };
  toggle.addEventListener("click", () =>
    setOpen(!nav.classList.contains("is-open")),
  );
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia("(min-width: 960px)").addEventListener("change", (mq) => {
    if (mq.matches) setOpen(false);
  });
}

/* =================================================================
   5. EXPERIÊNCIA PRINCIPAL — revelação localizada da pintura
   -----------------------------------------------------------------
   Duas imagens alinhadas:
     • <img> base: peça sem pintura (sempre visível)
     • <canvas>: peça pintada recortada por uma MÁSCARA dinâmica
   A máscara é composta a cada quadro por:
     1. rastro do pincel (círculos de borda suave que seguem o cursor
        com leve atraso e somem aos poucos);
     2. revelação completa (círculo que cresce a partir do centro);
     3. comparação deslizante (faixa da esquerda para a direita).
   O laço de animação só roda enquanto há algo mudando.
   ================================================================= */
class PaintReveal {
  constructor(root, options) {
    this.root = root;
    this.opts = options;
    this.stage = $("[data-reveal-stage]", root);
    this.baseImg = $("[data-reveal-base]", root);
    this.canvas = $("[data-reveal-canvas]", root);
    this.cursorEl = $("[data-reveal-cursor]", root);
    this.wipeLine = $("[data-wipe-line]", root);
    this.btnOn = $("[data-reveal-on]", root);
    this.btnOff = $("[data-reveal-off]", root);
    this.range = $("[data-reveal-range]", root);

    this.ctx = this.canvas.getContext("2d");
    this.trail = document.createElement("canvas"); // rastro do pincel (persistente)
    this.mask = document.createElement("canvas"); // máscara final do quadro
    this.tctx = this.trail.getContext("2d");
    this.mctx = this.mask.getContext("2d");

    this.pointer = { x: 0, y: 0, inside: false };
    this.brush = { x: null, y: null, lastX: null, lastY: null };
    this.full = 0; // revelação completa atual (0–1)
    this.fullTarget = 0;
    this.wipe = 0; // comparação deslizante (0–1)
    this.residual = 0; // quadros restantes até o rastro sumir
    this.raf = null;
    this.ready = false;
    this.reduced = prefersReducedMotion.matches;
    prefersReducedMotion.addEventListener("change", (e) => {
      this.reduced = e.matches;
    });

    // anúncio para leitores de tela
    this.live = document.createElement("p");
    this.live.className = "sr-only";
    this.live.setAttribute("aria-live", "polite");
    root.appendChild(this.live);
  }

  async init() {
    const { imageBefore, imageAfter, altBefore } = this.opts;
    if (imageBefore && !this.baseImg.src.endsWith(imageBefore))
      this.baseImg.src = imageBefore;
    if (altBefore) this.baseImg.alt = altBefore;

    this.paintImg = new Image();
    this.paintImg.decoding = "async";
    this.paintImg.src = imageAfter;

    try {
      // A interação só é habilitada depois que AS DUAS imagens estão prontas.
      await Promise.all([loadImage(this.baseImg), loadImage(this.paintImg)]);
    } catch (err) {
      console.error("[PaintReveal]", err);
      this.stage.classList.remove("is-loading");
      this.live.textContent = "Não foi possível carregar a imagem pintada.";
      return;
    }

    const bw = this.baseImg.naturalWidth,
      bh = this.baseImg.naturalHeight;
    const pw = this.paintImg.naturalWidth,
      ph = this.paintImg.naturalHeight;
    if (bw !== pw || bh !== ph) {
      console.warn(
        `[PaintReveal] As imagens têm tamanhos diferentes (${bw}×${bh} e ${pw}×${ph}). ` +
          "Para um alinhamento perfeito, exporte as duas com as mesmas dimensões e enquadramento.",
      );
    }
    this.imgW = bw;
    this.imgH = bh;
    this.stage.style.aspectRatio = `${bw} / ${bh}`;

    this.resize();
    new ResizeObserver(() => this.resize()).observe(this.stage);
    this.bindEvents();

    [this.btnOn, this.btnOff, this.range].forEach((el) => {
      el.disabled = false;
    });
    this.stage.classList.remove("is-loading");
    this.ready = true;
  }

  /** Ajusta os canvas ao tamanho real do palco (com densidade de pixels). */
  resize() {
    const rect = this.stage.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    [this.canvas, this.trail, this.mask].forEach((c) => {
      c.width = W;
      c.height = H;
    });
    this.W = W;
    this.H = H;

    // Área onde as duas fotos são desenhadas. Padrão = foto inteira e centralizada
    // (equivalente a object-fit: contain). O ajuste do painel vale para as DUAS fotos,
    // assim elas continuam perfeitamente alinhadas.
    const f = normalizeFit(this.opts.fit, "inteira") || { modo: "inteira", zoom: 100, x: 50, y: 50 };
    const base =
      f.modo === "inteira"
        ? Math.min(W / this.imgW, H / this.imgH)
        : Math.max(W / this.imgW, H / this.imgH);
    const scale = (base * f.zoom) / 100;
    const fw = this.imgW * scale,
      fh = this.imgH * scale;
    this.fit = { x: ((W - fw) * f.x) / 100, y: ((H - fh) * f.y) / 100, w: fw, h: fh };

    // com ajuste diferente do padrão, a foto sem pintura é posicionada no mesmo retângulo
    const custom = f.modo !== "inteira" || f.zoom !== 100 || f.x !== 50 || f.y !== 50;
    this.stage.classList.toggle("is-custom-fit", custom);
    const bs = this.baseImg.style;
    if (custom) {
      bs.left = `${this.fit.x / dpr}px`;
      bs.top = `${this.fit.y / dpr}px`;
      bs.width = `${fw / dpr}px`;
      bs.height = `${fh / dpr}px`;
      bs.objectFit = "fill";
    } else {
      ["left", "top", "width", "height", "objectFit"].forEach((p) => (bs[p] = ""));
    }

    this.radius = Math.max(24 * dpr, fw * this.opts.brushSize);
    this.stage.style.setProperty("--brush", `${(this.radius * 2) / dpr}px`);
    this.buildBrush();
    this.brush.lastX = this.brush.lastY = null;
    this.updateWipeLine();
    this.compose();
  }

  /** Pré-desenha o "carimbo" do pincel: círculo com borda suave. */
  buildBrush() {
    const r = Math.ceil(this.radius);
    const c = document.createElement("canvas");
    c.width = c.height = r * 2;
    const g = c.getContext("2d");
    const soft = Math.min(Math.max(this.opts.brushSoftness, 0), 1);
    const grad = g.createRadialGradient(r, r, r * (1 - soft) * 0.92, r, r, r);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(0.55, "rgba(0,0,0,0.65)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, r * 2, r * 2);
    this.brushSprite = c;
    this.brushR = r;
  }

  bindEvents() {
    const st = this.stage;
    const toLocal = (e) => {
      const rect = st.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    const moveTo = (p) => {
      this.pointer.x = p.x * this.dpr;
      this.pointer.y = p.y * this.dpr;
      this.cursorEl.style.setProperty("--cx", `${p.x}px`);
      this.cursorEl.style.setProperty("--cy", `${p.y}px`);
    };
    const enter = () => {
      if (!this.pointer.inside) {
        this.brush.x = this.brush.lastX = null;
      }
      this.pointer.inside = true;
      this.cursorEl.classList.add("is-visible");
      this.start();
    };
    const leave = () => {
      this.pointer.inside = false;
      this.cursorEl.classList.remove("is-visible");
      this.start();
    };

    // Mouse / caneta: pinta ao passar
    st.addEventListener("pointermove", (e) => {
      if (e.pointerType === "touch" && !this.touching) return;
      if (e.pointerType !== "touch") st.classList.add("has-pointer");
      moveTo(toLocal(e));
      enter();
    });
    st.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "touch") leave();
    });

    // Toque: pinta arrastando o dedo
    st.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch") return;
      this.touching = true;
      st.setPointerCapture(e.pointerId);
      moveTo(toLocal(e));
      enter();
    });
    const endTouch = (e) => {
      if (e.pointerType !== "touch") return;
      this.touching = false;
      leave();
    };
    st.addEventListener("pointerup", endTouch);
    st.addEventListener("pointercancel", endTouch);

    // Teclado: setas movem o pincel; Enter/Espaço alterna a pintura completa
    st.addEventListener("keydown", (e) => {
      const step = (this.fit.w / this.dpr) * 0.05;
      const keys = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      if (keys[e.key]) {
        e.preventDefault();
        if (!this.kbPos)
          this.kbPos = {
            x: (this.fit.x + this.fit.w / 2) / this.dpr,
            y: (this.fit.y + this.fit.h / 2) / this.dpr,
          };
        const minX = this.fit.x / this.dpr,
          maxX = (this.fit.x + this.fit.w) / this.dpr;
        const minY = this.fit.y / this.dpr,
          maxY = (this.fit.y + this.fit.h) / this.dpr;
        this.kbPos.x = Math.min(
          maxX,
          Math.max(minX, this.kbPos.x + keys[e.key][0]),
        );
        this.kbPos.y = Math.min(
          maxY,
          Math.max(minY, this.kbPos.y + keys[e.key][1]),
        );
        moveTo(this.kbPos);
        enter();
        clearTimeout(this.kbTimer);
        this.kbTimer = setTimeout(leave, 1600);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.setFull(this.fullTarget ? 0 : 1);
      } else if (e.key === "Escape") {
        this.setFull(0);
      }
    });
    st.addEventListener("blur", () => {
      this.kbPos = null;
      clearTimeout(this.kbTimer);
      leave();
    });

    // Controles
    this.btnOn.addEventListener("click", () => this.setFull(1));
    this.btnOff.addEventListener("click", () => this.setFull(0));
    this.range.addEventListener("input", () => {
      this.wipe = Number(this.range.value) / 100;
      this.range.style.setProperty("--fill", `${this.range.value}%`);
      this.range.setAttribute("aria-valuetext", `${this.range.value}% pintado`);
      this.updateWipeLine();
      this.start();
    });
  }

  /** Revela (1) ou esconde (0) a pintura completa. "Sem pintura" também zera a comparação. */
  setFull(value) {
    this.fullTarget = value;
    if (!value) {
      this.wipe = 0;
      this.range.value = 0;
      this.range.style.setProperty("--fill", "0%");
      this.range.setAttribute("aria-valuetext", "0% pintado");
      this.tctx.clearRect(0, 0, this.W, this.H);
      this.residual = 0;
      this.updateWipeLine();
    }
    this.btnOn.classList.toggle("is-active", !!value);
    this.btnOn.setAttribute("aria-pressed", String(!!value));
    this.btnOff.classList.toggle("is-active", !value);
    this.btnOff.setAttribute("aria-pressed", String(!value));
    this.live.textContent = value
      ? "Pintura completa revelada."
      : "Peça exibida sem pintura.";
    if (this.reduced) this.full = value;
    this.start();
  }

  updateWipeLine() {
    if (!this.fit) return;
    const show = this.wipe > 0 && this.wipe < 1;
    const x = (this.fit.x + this.fit.w * this.wipe) / this.dpr;
    this.wipeLine.style.setProperty("--wipe-x", `${x}px`);
    this.wipeLine.classList.toggle("is-visible", show);
  }

  start() {
    if (!this.raf && this.ready)
      this.raf = requestAnimationFrame(() => this.frame());
  }

  frame() {
    this.raf = null;
    const { tctx, W, H } = this;
    const follow = this.reduced ? 1 : 0.35;

    // 1) pincel segue o cursor com leve suavização
    if (this.pointer.inside) {
      if (this.brush.x === null) {
        this.brush.x = this.pointer.x;
        this.brush.y = this.pointer.y;
      }
      this.brush.x += (this.pointer.x - this.brush.x) * follow;
      this.brush.y += (this.pointer.y - this.brush.y) * follow;
    }

    // 2) rastro some gradualmente (mais rápido sem redução de movimento)
    if (this.residual > 0 || this.pointer.inside) {
      const fade = this.reduced
        ? 1
        : this.pointer.inside
          ? this.opts.trailFade
          : this.opts.leaveFade;
      tctx.globalCompositeOperation = "destination-out";
      tctx.fillStyle = `rgba(0,0,0,${fade})`;
      tctx.fillRect(0, 0, W, H);
      tctx.globalCompositeOperation = "source-over";
    }

    // 3) carimba círculos ao longo do trajeto (sem falhas em movimentos rápidos)
    if (this.pointer.inside) {
      const { x, y } = this.brush;
      const lx = this.brush.lastX ?? x,
        ly = this.brush.lastY ?? y;
      const dist = Math.hypot(x - lx, y - ly);
      const spacing = Math.max(2, this.radius * 0.18);
      const n = Math.max(1, Math.ceil(dist / spacing));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        tctx.drawImage(
          this.brushSprite,
          lx + (x - lx) * t - this.brushR,
          ly + (y - ly) * t - this.brushR,
        );
      }
      this.brush.lastX = x;
      this.brush.lastY = y;
      this.residual = 90;
    } else if (this.residual > 0) {
      this.brush.lastX = this.brush.lastY = null;
      this.residual -= 1;
      if (this.residual <= 0) tctx.clearRect(0, 0, W, H); // limpa resíduos de arredondamento
    }

    // 4) animação da revelação completa
    if (this.full !== this.fullTarget) {
      this.full += (this.fullTarget - this.full) * (this.reduced ? 1 : 0.07);
      if (Math.abs(this.fullTarget - this.full) < 0.003)
        this.full = this.fullTarget;
    }

    this.compose();

    const busy =
      this.pointer.inside || this.residual > 0 || this.full !== this.fullTarget;
    if (busy) this.start();
  }

  /** Monta a máscara e recorta a imagem pintada com ela. */
  compose() {
    const { ctx, mctx, W, H, fit } = this;
    if (!W || !this.paintImg || !fit) return;
    const nothing =
      this.residual <= 0 &&
      !this.pointer.inside &&
      this.full <= 0 &&
      this.wipe <= 0;
    ctx.clearRect(0, 0, W, H);
    if (nothing) return;

    mctx.globalCompositeOperation = "source-over";
    mctx.clearRect(0, 0, W, H);
    mctx.drawImage(this.trail, 0, 0);

    if (this.full > 0) {
      if (this.full >= 0.999) {
        mctx.fillStyle = "#000";
        mctx.fillRect(0, 0, W, H);
      } else {
        // círculo que cresce a partir do centro da peça, com borda difusa
        const cx = fit.x + fit.w / 2,
          cy = fit.y + fit.h * 0.48;
        const maxR = Math.hypot(fit.w, fit.h) * 0.62;
        const e = 1 - Math.pow(1 - this.full, 3);
        const r = Math.max(1, e * maxR * 1.3);
        const g = mctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = g;
        mctx.fillRect(0, 0, W, H);
      }
    }

    if (this.wipe > 0) {
      const x = fit.x + fit.w * this.wipe;
      if (this.wipe >= 1) {
        mctx.fillStyle = "#000";
        mctx.fillRect(0, 0, W, H);
      } else {
        const soft = fit.w * 0.025;
        const g = mctx.createLinearGradient(x - soft, 0, x + soft, 0);
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        mctx.fillStyle = g;
        mctx.fillRect(0, 0, x + soft, H);
      }
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.paintImg, fit.x, fit.y, fit.w, fit.h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(this.mask, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
}

/* =================================================================
   6. Produtos — carrossel + diálogo de detalhes
   ================================================================= */
const SPEC_LABELS = {
  material: "Material",
  technology: "Impressão",
  finish: "Acabamento",
  customization: "Personalização",
};

function specsHTML(p) {
  return Object.entries(SPEC_LABELS)
    .filter(([key]) => p[key])
    .map(
      ([key, label]) =>
        `<div><dt>${label}</dt><dd>${escapeHTML(p[key])}</dd></div>`,
    )
    .join("");
}

function initProducts() {
  const list = SITE_CONFIG.products;
  const track = $("[data-carousel-track]");
  if (!list.length) {
    hideSection("produtos"); // painel sem nenhum produto
    return;
  }
  const showDemo = SITE_CONFIG.showSetupNotices;

  track.innerHTML = list
    .map(
      (p, i) => `
    <li class="product-card" aria-roledescription="slide" aria-label="${i + 1} de ${list.length}: ${escapeHTML(p.name)}">
      <button class="product-media" type="button" data-open-product="${i}" aria-label="Ver detalhes de ${escapeHTML(p.name)}">
        <img data-photo src="${escapeHTML(p.image)}" alt="${escapeHTML(p.alt || p.name)}" loading="lazy" decoding="async" width="900" height="750" draggable="false"${fitAttrs(p.fit, "preencher")}>
        ${p.category ? `<span class="tag">${escapeHTML(p.category)}</span>` : ""}
        ${p.demo && showDemo ? '<span class="tag demo-tag">Exemplo</span>' : ""}
      </button>
      <div class="product-body">
        <h3><button type="button" data-open-product="${i}">${escapeHTML(p.name)}</button></h3>
        ${p.description ? `<p>${escapeHTML(p.description)}</p>` : ""}
        ${specsHTML(p) ? `<dl class="specs">${specsHTML(p)}</dl>` : ""}
        <div class="product-actions">
          <a class="btn btn-accent" href="${waLink(waProductMessage(p.name))}" target="_blank" rel="noopener">
            <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg> Solicitar orçamento
          </a>
          <button class="btn btn-outline" type="button" data-open-product="${i}">Detalhes</button>
        </div>
      </div>
    </li>`,
    )
    .join("");

  initCarousel($("[data-carousel]"));
  initProductModal(list);
}

function initCarousel(root) {
  const track = $("[data-carousel-track]", root);
  const prev = $("[data-carousel-prev]", root);
  const next = $("[data-carousel-next]", root);
  const dotsWrap = $("[data-carousel-dots]", root);
  const cards = () => Array.from(track.children);
  let pages = 1;

  const offsets = () => {
    const c = cards();
    const o0 = c[0].offsetLeft;
    return c.map((el) => el.offsetLeft - o0);
  };
  const perView = () => {
    const c = cards();
    if (c.length < 2) return 1;
    const step = c[1].offsetLeft - c[0].offsetLeft;
    const visibleWidth =
      track.clientWidth - parseFloat(getComputedStyle(track).paddingLeft) * 2;
    return Math.max(
      1,
      Math.round((visibleWidth + (step - c[0].offsetWidth)) / step),
    );
  };
  const current = () => {
    const o = offsets();
    let best = 0;
    o.forEach((v, i) => {
      if (Math.abs(v - track.scrollLeft) < Math.abs(o[best] - track.scrollLeft))
        best = i;
    });
    return Math.min(best, pages - 1);
  };
  const goTo = (i) => {
    const idx = Math.max(0, Math.min(i, pages - 1));
    track.scrollTo({
      left: offsets()[idx],
      behavior: prefersReducedMotion.matches ? "auto" : "smooth",
    });
  };

  const buildDots = () => {
    pages = Math.max(1, cards().length - perView() + 1);
    dotsWrap.innerHTML = Array.from(
      { length: pages },
      (_, i) =>
        `<button type="button" aria-label="Ir para a posição ${i + 1} de ${pages}"></button>`,
    ).join("");
    dotsWrap.hidden = pages <= 1;
    update();
  };
  const update = () => {
    const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
    const idx = atEnd ? pages - 1 : current();
    $$("button", dotsWrap).forEach((d, i) =>
      d.setAttribute("aria-current", String(i === idx)),
    );
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = atEnd;
  };

  dotsWrap.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    goTo($$("button", dotsWrap).indexOf(b));
  });
  prev.addEventListener("click", () => goTo(current() - 1));
  next.addEventListener("click", () => goTo(current() + 1));

  let ticking = false;
  track.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
    },
    { passive: true },
  );

  track.addEventListener("keydown", (e) => {
    if (e.target !== track) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(current() + 1);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(current() - 1);
    }
  });

  // Arrastar com o mouse (no toque, a rolagem nativa já funciona)
  let drag = null;
  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    drag = {
      x: e.clientX,
      left: track.scrollLeft,
      moved: false,
      id: e.pointerId,
    };
  });
  track.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      track.classList.add("is-dragging");
      track.setPointerCapture(drag.id);
    }
    if (drag.moved) track.scrollLeft = drag.left - dx;
  });
  const endDrag = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      track.classList.remove("is-dragging");
      goTo(current());
      // impede que o fim do arraste conte como clique
      track.addEventListener(
        "click",
        (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
        },
        { capture: true, once: true },
      );
    }
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.addEventListener("dragstart", (e) => e.preventDefault());

  buildDots();
  window.addEventListener("resize", () => {
    clearTimeout(root._rz);
    root._rz = setTimeout(buildDots, 120);
  });
}

function bindDialogClose(dialog) {
  $$("[data-close]", dialog).forEach((b) =>
    b.addEventListener("click", () => dialog.close()),
  );
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  }); // clique no fundo
}

function initProductModal(list) {
  const dialog = $("[data-product-modal]");
  bindDialogClose(dialog);
  let lastFocus = null;

  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-open-product]");
    if (!trigger) return;
    const p = list[Number(trigger.dataset.openProduct)];
    if (!p) return;
    lastFocus = trigger;
    $("[data-pm-img]", dialog).src = p.image;
    $("[data-pm-img]", dialog).alt = p.alt || p.name;
    applyFit($("[data-pm-img]", dialog), p.fit, "preencher");
    $("[data-pm-category]", dialog).textContent = p.category || "";
    $("[data-pm-title]", dialog).textContent = p.name;
    $("[data-pm-desc]", dialog).textContent = p.description || "";
    const specs = specsHTML(p);
    $("[data-pm-specs]", dialog).innerHTML = specs;
    $("[data-pm-specs]", dialog).hidden = !specs;
    $("[data-pm-wa]", dialog).href = waLink(waProductMessage(p.name));
    dialog.showModal();
  });
  dialog.addEventListener("close", () => lastFocus && lastFocus.focus());
}

/* =================================================================
   7. Galeria com ampliação (lightbox)
   ================================================================= */
function initGallery() {
  const items = SITE_CONFIG.gallery;
  const grid = $("[data-gallery]");
  if (!items.length) {
    hideSection("galeria"); // painel sem nenhuma foto no portfólio
    return;
  }
  grid.innerHTML = items
    .map(
      (it, i) => `
    <li class="gallery-item fit-contain ${it.layout ? `is-${it.layout}` : ""} ${it.light ? "is-light" : ""}" data-animate>
      <button type="button" data-lb-index="${i}" aria-label="Ampliar: ${escapeHTML(it.caption || it.alt)}">
        <img data-photo src="${escapeHTML(it.src)}" alt="${escapeHTML(it.alt)}" loading="lazy" decoding="async"${fitAttrs(it.fit, "preencher")}>
        <span class="zoom" aria-hidden="true"><svg class="icon"><use href="#i-expand"/></svg></span>
        ${it.caption ? `<span class="cap">${escapeHTML(it.caption)}</span>` : ""}
      </button>
    </li>`,
    )
    .join("");

  const lb = $("[data-lightbox]");
  const img = $("[data-lb-img]", lb);
  const cap = $("[data-lb-caption]", lb);
  const count = $("[data-lb-count]", lb);
  let index = 0,
    lastFocus = null;

  const hasPhoto = (i) => {
    const b = grid.querySelector(`[data-lb-index="${i}"]`);
    return b && !b.disabled;
  };
  const show = (i, dir = 1) => {
    let next = (i + items.length) % items.length;
    for (let tries = 0; tries < items.length && !hasPhoto(next); tries++)
      next = (next + dir + items.length) % items.length;
    index = next;
    const it = items[index];
    img.src = it.src;
    img.alt = it.alt;
    cap.textContent = it.caption || it.alt;
    count.textContent = `${index + 1} / ${items.length}`;
  };

  grid.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lb-index]");
    if (!b) return;
    lastFocus = b;
    show(Number(b.dataset.lbIndex));
    lb.showModal();
  });
  $("[data-lb-prev]", lb).addEventListener("click", () => show(index - 1, -1));
  $("[data-lb-next]", lb).addEventListener("click", () => show(index + 1));
  lb.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") show(index - 1, -1);
    if (e.key === "ArrowRight") show(index + 1);
  });
  bindDialogClose(lb);
  lb.addEventListener("close", () => lastFocus && lastFocus.focus());

  // gesto de deslizar no celular
  let sx = null;
  const fig = $(".lb-figure", lb);
  fig.addEventListener("pointerdown", (e) => {
    sx = e.clientX;
  });
  fig.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx;
    sx = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1);
  });
}

/* =================================================================
   8. Avaliações do Google
   Ordem de prioridade dos dados:
     1) proxyEndpoint (seu servidor consulta a API oficial com a chave segura)
     2) dados reais preenchidos manualmente em SITE_CONFIG.reviews
     3) exemplos de layout (somente com showSetupNotices: true)
   ================================================================= */
async function initReviews() {
  const cfg = SITE_CONFIG.reviews;
  let data = {
    rating: cfg.rating,
    count: cfg.count,
    items: cfg.items || [],
    url: cfg.googleReviewsUrl,
  };

  if (cfg.proxyEndpoint) {
    try {
      const res = await fetch(cfg.proxyEndpoint, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      data = {
        rating: json.rating ?? data.rating,
        count: json.count ?? data.count,
        items:
          Array.isArray(json.reviews) && json.reviews.length
            ? json.reviews
            : data.items,
        url: json.url || data.url,
      };
    } catch (err) {
      console.warn("[Avaliações] Não foi possível carregar do proxy:", err);
    }
  }

  const ratingCard = $("[data-rating]");
  if (typeof data.rating === "number") {
    $("[data-rating-value]").textContent = data.rating.toLocaleString("pt-BR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
    $("[data-rating-stars]").innerHTML = stars(data.rating);
    $("[data-rating-count]").textContent =
      typeof data.count === "number"
        ? `${data.count.toLocaleString("pt-BR")} ${data.count === 1 ? "avaliação" : "avaliações"}`
        : "";
    ratingCard.hidden = false;
  }

  const listEl = $("[data-reviews-list]");
  const render = (items, demo) =>
    items
      .map(
        (r) => `
    <li class="review ${demo ? "is-demo" : ""}" data-animate>
      ${demo ? '<span class="badge-demo">Demonstração — não é uma avaliação real</span>' : ""}
      ${r.rating ? `<p class="review-stars" aria-label="Nota ${r.rating} de 5">${stars(r.rating)}</p>` : ""}
      <blockquote>${escapeHTML(r.text)}</blockquote>
      <footer>${r.author ? `<strong>${escapeHTML(r.author)}</strong>` : "<span></span>"}${r.date ? `<span>${escapeHTML(r.date)}</span>` : ""}</footer>
    </li>`,
      )
      .join("");

  if (data.items.length) {
    listEl.innerHTML = render(data.items.slice(0, 6), false);
  } else if (SITE_CONFIG.showSetupNotices) {
    listEl.innerHTML = render(DEMO_REVIEWS, true);
    setupNote(
      $("[data-reviews-note]"),
      "Ainda não há avaliações reais configuradas. Os cards abaixo são apenas <strong>exemplos de layout</strong>. " +
        "Preencha <code>SITE_CONFIG.reviews</code> ou configure o <code>proxyEndpoint</code>.",
    );
  }

  if (data.url) {
    $$("[data-google-reviews]").forEach((a) => {
      a.href = data.url;
      a.hidden = false;
    });
    $("[data-footer-reviews]").hidden = false;
  }

  if (
    !data.items.length &&
    !data.url &&
    typeof data.rating !== "number" &&
    !SITE_CONFIG.showSetupNotices
  ) {
    hideSection("avaliacoes");
  }
}

/* =================================================================
   9. Formulário de orçamento → mensagem no WhatsApp
   ================================================================= */
function initQuoteForm() {
  const form = $("[data-quote-form]");
  const showError = (input, errId, invalid) => {
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid) input.setAttribute("aria-describedby", errId);
    else input.removeAttribute("aria-describedby");
    $(`#${errId}`).hidden = !invalid;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = form.elements;
    const nome = f.nome.value.trim();
    const desc = f.descricao.value.trim();
    const ref = f.referencia.value.trim();

    const badRef = !!ref && !/^https?:\/\/\S+\.\S+/i.test(ref);
    showError(f.nome, "q-nome-erro", !nome);
    showError(f.descricao, "q-desc-erro", !desc);
    showError(f.referencia, "q-ref-erro", badRef);
    const firstInvalid = [
      !nome && f.nome,
      !desc && f.descricao,
      badRef && f.referencia,
    ].find(Boolean);
    if (firstInvalid) {
      firstInvalid.focus();
      return;
    }

    const lines = [
      "Olá! Gostaria de solicitar um orçamento pelo site.",
      "",
      `*Nome:* ${nome}`,
      `*Peça:* ${desc}`,
      `*Material:* ${f.material.value || "Não sei / quero sugestão"}`,
    ];
    if (f.dimensoes.value.trim())
      lines.push(`*Dimensões aproximadas:* ${f.dimensoes.value.trim()}`);
    lines.push(
      `*Pintura manual:* ${form.querySelector('input[name="pintura"]:checked')?.value || "Ainda não sei"}`,
    );
    if (ref) lines.push(`*Referência:* ${ref}`);
    lines.push(
      "",
      "Sei que o orçamento definitivo depende da avaliação do projeto.",
    );

    const url = waLink(lines.join("\n"));
    const win = window.open(url, "_blank", "noopener");
    if (!win) window.location.href = url;
  });

  ["nome", "descricao", "referencia"].forEach((name) => {
    form.elements[name].addEventListener("input", (ev) => {
      if (ev.target.getAttribute("aria-invalid") === "true") {
        ev.target.setAttribute("aria-invalid", "false");
        const err = {
          nome: "q-nome-erro",
          descricao: "q-desc-erro",
          referencia: "q-ref-erro",
        }[name];
        $(`#${err}`).hidden = true;
      }
    });
  });
}

/* =================================================================
   10. Instagram, localização e rodapé
   ================================================================= */
function initInstagram() {
  const { handle, url } = SITE_CONFIG.instagram;
  const strip = $("[data-insta-strip]");
  strip.innerHTML = SITE_CONFIG.instagramGallery
    .map(
      (g) =>
        `<li><img data-photo src="${escapeHTML(g.src)}" alt="${escapeHTML(g.alt)}" loading="lazy" decoding="async"${fitAttrs(g.fit, "preencher")}></li>`,
    )
    .join("");

  if (handle) {
    $("[data-insta-handle]").textContent = `@${handle.replace(/^@/, "")}`;
    $("[data-insta-handle-inline]").textContent =
      `@${handle.replace(/^@/, "")}`;
  }
  if (url) {
    $$("[data-insta-link]").forEach((a) => {
      a.href = url;
      a.hidden = false;
    });
    $("[data-footer-insta]").hidden = false;
  } else if (SITE_CONFIG.showSetupNotices) {
    setupNote(
      $("[data-insta-note]"),
      "Perfil do Instagram ainda não configurado. Preencha <code>SITE_CONFIG.instagram</code>.",
    );
  } else {
    hideSection("instagram");
  }
}

/* -----------------------------------------------------------------
   Calculadora de frete (estimativa)
   1) consulta o CEP no ViaCEP → cidade e UF
   2) converte a UF em região (ou "mesmoEstado")
   3) mostra o valor da tabela SITE_CONFIG.shipping.rates
   ----------------------------------------------------------------- */
const UF_REGION = {
  AC: "Norte",
  AP: "Norte",
  AM: "Norte",
  PA: "Norte",
  RO: "Norte",
  RR: "Norte",
  TO: "Norte",
  AL: "Nordeste",
  BA: "Nordeste",
  CE: "Nordeste",
  MA: "Nordeste",
  PB: "Nordeste",
  PE: "Nordeste",
  PI: "Nordeste",
  RN: "Nordeste",
  SE: "Nordeste",
  DF: "Centro-Oeste",
  GO: "Centro-Oeste",
  MT: "Centro-Oeste",
  MS: "Centro-Oeste",
  ES: "Sudeste",
  MG: "Sudeste",
  RJ: "Sudeste",
  SP: "Sudeste",
  PR: "Sul",
  RS: "Sul",
  SC: "Sul",
};
const brl = (v) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function initShipping() {
  const cfg = SITE_CONFIG.shipping;
  if (!cfg || cfg.enabled === false) {
    hideSection("frete");
    return;
  }

  const form = $("[data-ship-form]");
  const input = $("[data-ship-cep]");
  const btn = $("[data-ship-submit]");
  const errEl = $("[data-ship-error]");
  const out = $("[data-ship-result]");

  const hasRates = Object.values(cfg.rates || {}).some(
    (v) => typeof v === "number",
  );
  if (!hasRates) {
    setupNote(
      $("[data-ship-note]"),
      "ESPERAR O CARLOS PARA DEFINIR EM <code>SITE_CONFIG.shipping.rates</code>.",
    );
  }

  // máscara 00000-000
  input.addEventListener("input", () => {
    const d = input.value.replace(/\D/g, "").slice(0, 8);
    input.value = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
    errEl.hidden = true;
    input.removeAttribute("aria-invalid");
  });

  const showError = (msg) => {
    errEl.textContent = msg;
    errEl.hidden = false;
    input.setAttribute("aria-invalid", "true");
    out.hidden = true;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const cep = input.value.replace(/\D/g, "");
    if (cep.length !== 8) {
      showError("Digite um CEP com 8 números.");
      input.focus();
      return;
    }

    btn.disabled = true;
    btn.textContent = "Calculando…";
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.erro) {
        showError("CEP não encontrado. Confira os números.");
        return;
      }
      renderShipping(cep, data);
    } catch (err) {
      console.warn("[Frete]", err);
      const fmt = `${cep.slice(0, 5)}-${cep.slice(5)}`;
      errEl.hidden = true;
      out.innerHTML = `<p class="ship-meta">Não foi possível consultar o CEP agora. Fale com a gente e informamos o frete.</p>
        <a class="btn btn-accent" href="${waLink(`Olá! Gostaria de saber o valor do frete para o CEP ${fmt}.`)}" target="_blank" rel="noopener">
          <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg> Consultar frete no WhatsApp</a>`;
      out.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = "Calcular";
    }
  });

  function renderShipping(cep, data) {
    const uf = data.uf;
    const key =
      cfg.originState && uf === cfg.originState.toUpperCase()
        ? "mesmoEstado"
        : UF_REGION[uf];
    const rate = cfg.rates ? cfg.rates[key] : null;
    const deadline = cfg.deadlines ? cfg.deadlines[key] : "";
    const place = `${data.localidade} — ${uf}`;
    const fmt = `${cep.slice(0, 5)}-${cep.slice(5)}`;
    const hasPrice = typeof rate === "number";
    const priceText = !hasPrice
      ? "Sob consulta"
      : rate === 0
        ? "Grátis"
        : brl(rate);
    const msg =
      `Olá! Gostaria de confirmar o frete para o CEP ${fmt} (${place}).` +
      (hasPrice ? ` A estimativa do site foi ${priceText}.` : "");

    out.innerHTML = `
      <p class="ship-dest"><svg class="icon" aria-hidden="true"><use href="#i-pin"/></svg> Entrega em <strong>${escapeHTML(place)}</strong></p>
      <p class="ship-price"><small>Frete estimado</small>${escapeHTML(priceText)}</p>
      ${deadline ? `<p class="ship-meta">Prazo estimado: ${escapeHTML(deadline)}</p>` : ""}
      ${cfg.note ? `<p class="ship-note">${escapeHTML(cfg.note)}</p>` : ""}
      <a class="btn btn-accent" href="${waLink(msg)}" target="_blank" rel="noopener">
        <svg class="icon" aria-hidden="true"><use href="#i-whatsapp"/></svg> ${hasPrice ? "Confirmar frete no WhatsApp" : "Consultar frete no WhatsApp"}</a>`;
    out.hidden = false;
  }
}

/* =================================================================
   11. Animações de entrada e navegação ativa
   ================================================================= */
/* =================================================================
   Elementos surgindo ao entrar em cada seção
   Títulos, textos, cards e etapas sobem suavemente, em ordem,
   quando a seção aparece na tela. Basta incluir o seletor em
   ANIMATE_ITEMS para animar um elemento novo.
   ================================================================= */
const ANIMATE_ITEMS = [
  "[data-animate]",
  ".section .eyebrow",
  ".section .section-title",
  ".section .section-lead",
  ".product-card",
  ".step",
  ".process-note",
  ".features-intro > p",
  ".features-list li",
  ".gallery-item",
  ".rating-card",
  ".review",
  ".reviews-cta",
  ".quote-intro > p",
  ".quote-intro > .btn",
  ".quote-form",
  ".insta-handle",
  ".insta-copy > .btn",
  ".insta-strip",
  ".ship-card",
  ".footer-grid > *",
].join(", ");

function initAnimations() {
  const els = $$(ANIMATE_ITEMS).filter(
    (el) => !el.closest(".hero") && !el.parentElement.closest(ANIMATE_ITEMS),
  );
  els.forEach((el) => el.setAttribute("data-animate", ""));

  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const show = (el, i) => {
    el.style.transitionDelay = `${Math.min(i, 6) * 90}ms`;
    el.classList.add("is-visible");
    // limpa o atraso depois, para não atrasar efeitos de hover
    setTimeout(() => {
      el.style.transitionDelay = "";
    }, 1600);
  };

  const io = new IntersectionObserver(
    (entries) => {
      // tudo que entrou na tela junto aparece em sequência, na ordem da página
      const batch = entries
        .filter((en) => en.isIntersecting)
        .flatMap((en) => {
          io.unobserve(en.target);
          return en.target.classList.contains("carousel-track")
            ? $$("[data-animate]", en.target) // carrossel: todos os cards de uma vez, em cascata
            : [en.target];
        });
      batch.sort((x, y) =>
        x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1,
      );
      batch.forEach(show);
    },
    { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
  );

  els.forEach((el) => {
    if (!el.closest(".carousel-track")) io.observe(el);
  });
  $$(".carousel-track").forEach((t) => io.observe(t));
}
/* =================================================================
   Vida na tela principal
   - adiciona os pigmentos e a linha da impressora ao fundo;
   - demonstração automática: se ninguém mexer na peça, um "pincel
     fantasma" pinta um trecho sozinho e a pintura some em seguida.
     Para de vez assim que o visitante interage.
   ================================================================= */
function initHeroLife(reveal) {
  const light = $(".hero-light");
  if (light && !light.querySelector(".hero-orb")) {
    light.insertAdjacentHTML(
      "beforeend",
      '<span class="hero-orb"></span><span class="hero-orb"></span><span class="hero-orb"></span><span class="hero-scan"></span>',
    );
  }
  if (!reveal || !reveal.ready || prefersReducedMotion.matches) return;

  const FIRST_DELAY = 1800; // espera antes da 1ª demonstração (ms)
  const REPEAT_DELAY = 14000; // intervalo entre demonstrações (ms)
  const DURATION = 2600; // duração de cada passada do pincel (ms)

  const stage = reveal.stage;
  let touched = false,
    running = false,
    visible = true,
    timer = null;

  const stop = () => {
    touched = true;
    clearTimeout(timer);
  };
  ["pointerenter", "pointerdown", "keydown"].forEach((ev) =>
    stage.addEventListener(ev, stop, { passive: true }),
  );
  $$("[data-reveal-on], [data-reveal-off], [data-reveal-range]").forEach(
    (el) => {
      el.addEventListener("pointerdown", stop, { passive: true });
      el.addEventListener("keydown", stop);
    },
  );

  const schedule = (ms) => {
    clearTimeout(timer);
    if (!touched) timer = setTimeout(demo, ms);
  };

  function demo() {
    if (touched || running) return;
    if (!visible || document.hidden || reveal.fullTarget || reveal.wipe > 0)
      return schedule(4000);
    running = true;

    const { fit, dpr } = reveal;
    const cx = fit.x + fit.w * 0.5,
      cy = fit.y + fit.h * 0.42;
    const ax = fit.w * 0.2,
      ay = fit.h * 0.16;
    const t0 = performance.now();
    reveal.brush.x = reveal.brush.lastX = null;
    reveal.cursorEl.classList.add("is-visible", "is-ghost");

    const step = (now) => {
      if (touched) {
        // visitante assumiu: devolve o controle
        reveal.cursorEl.classList.remove("is-ghost");
        running = false;
        return;
      }
      const t = Math.min(1, (now - t0) / DURATION);
      const a = t * Math.PI * 2;
      // trajeto em "8" descendo pelo corpo do dragão
      const x = cx + ax * Math.sin(a);
      const y = cy + ay * Math.sin(2 * a) * 0.7 + ay * 1.6 * (t - 0.5);
      reveal.pointer.x = x;
      reveal.pointer.y = y;
      reveal.pointer.inside = true;
      reveal.cursorEl.style.setProperty("--cx", `${x / dpr}px`);
      reveal.cursorEl.style.setProperty("--cy", `${y / dpr}px`);
      reveal.start();

      if (t < 1) {
        requestAnimationFrame(step);
        return;
      }
      reveal.pointer.inside = false;
      reveal.cursorEl.classList.remove("is-visible", "is-ghost");
      reveal.start();
      running = false;
      schedule(REPEAT_DELAY);
    };
    requestAnimationFrame(step);
  }

  // só demonstra quando a peça está visível na tela
  new IntersectionObserver(
    ([en]) => {
      visible = en.isIntersecting;
    },
    { threshold: 0.4 },
  ).observe(stage);
  schedule(FIRST_DELAY);
}
/* =================================================================
   Inicialização
   ================================================================= */
/* =================================================================
   Destaque do menu conforme a seção visível
   (esta função tinha sido apagada sem querer — a chamada no final
   do arquivo gerava o erro "initActiveNav is not defined")
   ================================================================= */
function initActiveNav() {
  const links = $$(".main-nav li a");
  const map = new Map(links.map((a) => [a.getAttribute("href").slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        links.forEach((a) => a.classList.remove("is-active"));
        const a = map.get(en.target.id);
        if (a) a.classList.add("is-active");
      });
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  map.forEach((_, id) => {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  });
}

/* =================================================================
   Linha de progresso do "Como funciona"
   Uma linha roxa percorre as 4 etapas quando a seção aparece.
   ================================================================= */
function initStepsLine() {
  const steps = $(".steps");
  if (!steps) return;
  if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
    steps.classList.add("is-lit");
    return;
  }
  const io = new IntersectionObserver(
    ([en]) => {
      if (!en.isIntersecting) return;
      steps.classList.add("is-lit");
      io.disconnect();
    },
    { threshold: 0.25 },
  );
  io.observe(steps);
}

function startSite() {
  renderProcess();
  renderFeatures();
  applyContent();
  checkExistingPhotos();
  initHeader();

  const reveal = new PaintReveal($("[data-reveal]"), SITE_CONFIG.hero);
  reveal.init().then(() => initHeroLife(reveal));
  window.__paintReveal = reveal; // útil para depuração no console

  initProducts();
  initGallery();
  initReviews().finally(initAnimations);
  initQuoteForm();
  initInstagram();
  initShipping();
  initActiveNav();
  initStepsLine();
}

// Primeiro lê o conteúdo do painel (dados/*.json); depois monta o site.
// Se a leitura falhar, o site usa os valores de reserva do SITE_CONFIG.
document.addEventListener("DOMContentLoaded", () => {
  loadContentData()
    .catch((err) => console.warn("[ForgeLab] Usando o conteúdo de reserva.", err))
    .finally(startSite);
});
