/* =================================================================
   Prévia do painel (Decap CMS)
   -----------------------------------------------------------------
   Mostra, ao lado do formulário, cada foto no MESMO formato em que
   ela aparece no site (mesmo quadro, mesmo corte, mesmo zoom), usando
   o próprio style.css do site. Assim o cliente vê o resultado do
   "Ajuste da foto" antes de publicar.
   ================================================================= */
(function () {
  "use strict";
  if (!window.CMS) return;

  var h = window.h;
  var createClass = window.createClass;

  // mesmo visual do site dentro da prévia
  CMS.registerPreviewStyle(
    "https://fonts.googleapis.com/css2?family=Saira:wdth,wght@75..125,400..800&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
  );
  CMS.registerPreviewStyle("/style.css");
  CMS.registerPreviewStyle("/admin/preview.css");

  /* ---------------------------------------------------------------
     Utilidades
     --------------------------------------------------------------- */
  function toJS(entry) {
    var data = entry && entry.getIn(["data"]);
    return data && data.toJS ? data.toJS() : {};
  }

  // mesmas regras do site (script.js → normalizeFit)
  function normalizeFit(fit, padrao) {
    fit = fit || {};
    function n(v, min, max, def) {
      var x = Number(String(v === undefined || v === null || v === "" ? NaN : v).replace(",", "."));
      return isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
    }
    return {
      modo: fit.modo === "inteira" || fit.modo === "preencher" ? fit.modo : padrao,
      zoom: n(fit.zoom, 50, 300, 100),
      x: n(fit.x, 0, 100, 50),
      y: n(fit.y, 0, 100, 50),
    };
  }

  function fitStyle(fit, padrao) {
    var f = normalizeFit(fit, padrao);
    var style = {
      objectFit: f.modo === "inteira" ? "contain" : "cover",
      objectPosition: f.x + "% " + f.y + "%",
    };
    if (f.zoom !== 100) {
      style.transform = "scale(" + f.zoom / 100 + ")";
      style.transformOrigin = f.x + "% " + f.y + "%";
    }
    return style;
  }

  // endereço da foto: foto recém-enviada (ainda não publicada) vem do próprio painel;
  // foto já publicada é lida do site (caminhos "assets/..." são da raiz do site)
  function imageUrl(path, getAsset) {
    if (!path) return "";
    try {
      var asset = getAsset && getAsset(path);
      var url = asset && asset.toString();
      if (url && /^(blob:|data:|https?:)/.test(url)) return url;
    } catch (e) {
      /* usa o caminho do site */
    }
    return /^(https?:|\/)/.test(path) ? path : "/" + path;
  }

  function Photo(path, alt, fit, padrao, getAsset, extra) {
    if (!path) {
      return h("span", { className: "pv-empty" }, "Sem foto");
    }
    var extraLoad = extra && extra.onLoad;
    var props = {
      src: imageUrl(path, getAsset),
      alt: alt || "",
      style: fitStyle(fit, padrao),
      // foto que ainda não existe no site: mostra um aviso no lugar do ícone quebrado
      onError: function (e) {
        e.target.style.visibility = "hidden";
        if (e.target.parentNode) e.target.parentNode.setAttribute("data-sem-foto", "");
      },
      onLoad: function (e) {
        e.target.style.visibility = "";
        if (e.target.parentNode) e.target.parentNode.removeAttribute("data-sem-foto");
        if (extraLoad) extraLoad(e);
      },
    };
    return h("img", props);
  }

  function Block(title, note, children) {
    return h(
      "section",
      { className: "pv-block" },
      h("p", { className: "pv-label" }, title),
      note ? h("p", { className: "pv-note" }, note) : null,
      children,
    );
  }

  function specs(p) {
    var rows = [
      ["Material", p.material],
      ["Impressão", p.tecnologia],
      ["Acabamento", p.acabamento],
      ["Personalização", p.personalizacao],
    ].filter(function (r) {
      return r[1];
    });
    if (!rows.length) return null;
    return h(
      "dl",
      { className: "specs" },
      rows.map(function (r, i) {
        return h("div", { key: i }, h("dt", null, r[0]), h("dd", null, r[1]));
      }),
    );
  }

  /* ---------------------------------------------------------------
     Produtos — mesmo card do carrossel
     --------------------------------------------------------------- */
  var ProdutosPreview = createClass({
    render: function () {
      var getAsset = this.props.getAsset;
      var lista = toJS(this.props.entry).produtos || [];
      return h(
        "div",
        { className: "pv-root" },
        Block(
          "Produtos — como aparecem no site",
          "Cada foto aparece neste mesmo quadro. Use \"Ajuste da foto\" para escolher o que fica visível.",
          h(
            "ul",
            { className: "pv-products" },
            lista.map(function (p, i) {
              p = p || {};
              return h(
                "li",
                { className: "product-card", key: i },
                h(
                  "div",
                  { className: "product-media" },
                  Photo(p.foto, p.descricao_foto, p.ajuste, "preencher", getAsset),
                  p.categoria ? h("span", { className: "tag" }, p.categoria) : null,
                  p.exemplo ? h("span", { className: "tag demo-tag" }, "Exemplo") : null,
                ),
                h(
                  "div",
                  { className: "product-body" },
                  h("h3", null, p.nome || "(sem nome)"),
                  p.descricao ? h("p", null, p.descricao) : null,
                  specs(p),
                ),
              );
            }),
          ),
        ),
      );
    },
  });

  /* ---------------------------------------------------------------
     Portfólio — mesmo mosaico da galeria (formato do computador)
     --------------------------------------------------------------- */
  var LAYOUT = { grande: "is-wide", vertical: "is-tall" };
  var GaleriaPreview = createClass({
    render: function () {
      var getAsset = this.props.getAsset;
      var fotos = toJS(this.props.entry).fotos || [];
      return h(
        "div",
        { className: "pv-root" },
        Block(
          "Portfólio — mosaico como no computador",
          "No celular, as fotos grandes e verticais aparecem como quadrados.",
          h(
            "ul",
            { className: "gallery-grid pv-gallery" },
            fotos.map(function (g, i) {
              g = g || {};
              return h(
                "li",
                { className: "gallery-item " + (LAYOUT[g.tamanho] || ""), key: i },
                h(
                  "button",
                  { type: "button", tabIndex: -1 },
                  Photo(g.foto, g.descricao_foto, g.ajuste, "preencher", getAsset),
                  g.legenda ? h("span", { className: "cap" }, g.legenda) : null,
                ),
              );
            }),
          ),
        ),
      );
    },
  });

  /* ---------------------------------------------------------------
     Informações do site — marca, tela principal, etapas, Instagram
     --------------------------------------------------------------- */
  function heroBox(path, alt, fit, label, getAsset) {
    return h(
      "figure",
      { className: "pv-hero-item" },
      h(
        "div",
        { className: "pv-hero-box" },
        Photo(path, alt, fit, "inteira", getAsset, {
          // o quadro do site tem a mesma proporção da foto
          onLoad: function (e) {
            var img = e.target;
            if (img.naturalWidth) img.parentNode.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
          },
        }),
      ),
      h("figcaption", { className: "pv-label" }, label),
    );
  }

  var SitePreview = createClass({
    render: function () {
      var getAsset = this.props.getAsset;
      var d = toJS(this.props.entry);
      var marca = d.marca || {};
      var inicio = d.inicio || {};
      var proc = d.processo || {};
      var dif = d.diferenciais || {};
      var ig = d.instagram || {};
      var etapas = proc.etapas || [];
      var itens = dif.itens || [];
      var fotosIg = ig.fotos || [];
      var nome = (marca.nome || "").trim();
      var isForge = nome.replace(/\s+/g, "").toLowerCase() === "forgelab";

      return h(
        "div",
        { className: "pv-root" },

        Block(
          "Marca — topo e rodapé",
          null,
          h(
            "div",
            { className: "pv-brandbar" },
            h(
              "span",
              { className: "brand" },
              h("span", { className: "brand-mark" }, marca.logo ? Photo(marca.logo, "", marca.logo_ajuste, "inteira", getAsset) : null),
              isForge
                ? h("span", { className: "brand-name" }, h("span", { className: "bn-forge" }, "Forge"), h("span", { className: "bn-lab" }, "Lab"))
                : h("span", { className: "brand-name" }, nome || "(sem nome)"),
            ),
          ),
        ),

        Block(
          "Tela principal",
          "As duas fotos usam o mesmo ajuste, para o efeito de pintura continuar alinhado.",
          h(
            "div",
            null,
            h(
              "div",
              { className: "hero-copy pv-hero-copy" },
              h("p", { className: "eyebrow eyebrow-light" }, inicio.rotulo || ""),
              h("h1", { className: "hero-title" }, inicio.titulo || ""),
              h("p", { className: "hero-sub" }, inicio.subtitulo || ""),
            ),
            h(
              "div",
              { className: "pv-hero" },
              heroBox(inicio.foto_sem_pintura, inicio.descricao_foto, inicio.ajuste, "Sem pintura", getAsset),
              heroBox(inicio.foto_pintada, inicio.descricao_foto, inicio.ajuste, "Pintada (aparece ao passar o mouse)", getAsset),
            ),
          ),
        ),

        Block(
          "Como funciona",
          null,
          h(
            "div",
            null,
            h("h2", { className: "section-title pv-small-title" }, proc.titulo || ""),
            h(
              "ol",
              { className: "steps pv-steps" },
              etapas.map(function (s, i) {
                s = s || {};
                return h(
                  "li",
                  { className: "step", key: i },
                  h("figure", { className: "step-media" }, Photo(s.foto, s.descricao_foto, s.ajuste, "preencher", getAsset)),
                  h(
                    "div",
                    { className: "step-body" },
                    h("span", { className: "step-num" }, String(i + 1).padStart(2, "0")),
                    h("h3", null, s.titulo || ""),
                    h("p", null, s.texto || ""),
                  ),
                );
              }),
            ),
            proc.frase_final ? h("p", { className: "process-note" }, proc.frase_final) : null,
          ),
        ),

        Block(
          "Diferenciais",
          null,
          h(
            "div",
            { className: "features pv-features" },
            h(
              "h2",
              { className: "section-title pv-small-title" },
              (dif.titulo || "") + " ",
              h("em", null, dif.destaque || ""),
            ),
            h(
              "ul",
              { className: "features-list" },
              itens.map(function (it, i) {
                it = it || {};
                return h(
                  "li",
                  { key: i },
                  h("img", { className: "icon pv-icon", alt: "", src: "/assets/icons/" + (it.icone || "cube") + ".svg" }),
                  h("div", null, h("h3", null, it.titulo || ""), h("p", null, it.texto || "")),
                );
              }),
            ),
          ),
        ),

        Block(
          "Instagram — fotos ao lado do convite",
          ig.perfil ? "@" + String(ig.perfil).replace(/^@/, "") : null,
          h(
            "ul",
            { className: "insta-strip pv-insta" },
            fotosIg.map(function (f, i) {
              f = f || {};
              return h("li", { key: i }, Photo(f.foto, f.descricao_foto, f.ajuste, "preencher", getAsset));
            }),
          ),
        ),
      );
    },
  });

  // os nomes abaixo são os "name" dos arquivos no config.yml
  CMS.registerPreviewTemplate("produtos", ProdutosPreview);
  CMS.registerPreviewTemplate("galeria", GaleriaPreview);
  CMS.registerPreviewTemplate("site", SitePreview);
})();
