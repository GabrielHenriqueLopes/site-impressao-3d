# Tela principal com movimento

O que entra:

1. **Demonstração automática da pintura** — se o visitante não mexer na peça, um pincel fantasma (anel tracejado) pinta um trecho do dragão sozinho e a pintura some. Repete a cada ~14 s enquanto a peça está na tela e **para de vez quando o visitante interage**. Ensina a interação, especialmente no celular.
2. **Dragão flutuando** de leve (pausa enquanto o visitante pinta).
3. **Manchas de pigmento** se movendo devagar no fundo.
4. **Linha de luz subindo** de tempos em tempos, como o bico de uma impressora.
5. **Entrada suave** do título, textos e botões ao abrir o site, e as bolinhas de tinta do rótulo "pulando".

Nenhuma mudança no HTML. São 3 passos — use **Ctrl+F** para achar.

---

## 1. `style.css` — cole no final do arquivo

```css
/* ---------- Vida na tela principal ----------
   Entrada suave, peça flutuando, pigmentos no fundo e a "linha da impressora".
   Tudo é desativado automaticamente para quem prefere menos movimento. */

/* entrada ao abrir o site */
.hero-copy > * {
  animation: hero-in 0.9s var(--ease) both;
}
.hero-copy > :nth-child(1) {
  animation-delay: 0.1s;
}
.hero-copy > :nth-child(2) {
  animation-delay: 0.22s;
}
.hero-copy > :nth-child(3) {
  animation-delay: 0.34s;
}
.hero-copy > :nth-child(4) {
  animation-delay: 0.46s;
}
.reveal {
  animation: hero-stage-in 1.2s var(--ease) 0.15s both;
}
@keyframes hero-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
@keyframes hero-stage-in {
  from {
    opacity: 0;
    transform: translateY(26px) scale(0.97);
  }
}

/* peça flutuando (pausa quando o visitante está pintando) */
.reveal-stage {
  animation: hero-float 7s ease-in-out 1.4s infinite;
}
.reveal-stage::before {
  animation: hero-float-shadow 7s ease-in-out 1.4s infinite;
}
.reveal-stage:hover,
.reveal-stage:hover::before,
.reveal-stage:focus-visible,
.reveal-stage:focus-visible::before {
  animation-play-state: paused;
}
@keyframes hero-float {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}
@keyframes hero-float-shadow {
  0%,
  100% {
    transform: translateY(0) scaleX(1);
    opacity: 1;
  }
  50% {
    transform: translateY(10px) scaleX(0.88);
    opacity: 0.7;
  }
}

/* manchas de pigmento se movendo devagar no fundo */
.hero-orb {
  position: absolute;
  width: 40vmax;
  height: 40vmax;
  border-radius: 50%;
  background: radial-gradient(closest-side, var(--c), transparent);
  opacity: 0.14;
  pointer-events: none;
  will-change: transform;
  animation: orb-drift 20s ease-in-out infinite alternate;
}
.hero-orb:nth-of-type(1) {
  --c: var(--accent-bright);
  left: 40%;
  top: -10%;
}
.hero-orb:nth-of-type(2) {
  --c: var(--ochre);
  left: 68%;
  top: 40%;
  animation-duration: 24s;
  animation-delay: -8s;
}
.hero-orb:nth-of-type(3) {
  --c: #3f8a66;
  left: 18%;
  top: 50%;
  animation-duration: 28s;
  animation-delay: -14s;
}
@keyframes orb-drift {
  0% {
    transform: translate(0, 0) scale(1);
  }
  50% {
    transform: translate(-4vmax, 3vmax) scale(1.12);
  }
  100% {
    transform: translate(3vmax, -2vmax) scale(0.94);
  }
}

/* linha de luz subindo, como o bico de uma impressora 3D */
.hero-scan {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 1px;
  pointer-events: none;
  background: linear-gradient(
    90deg,
    transparent 5%,
    rgba(240, 122, 79, 0.6) 50%,
    transparent 95%
  );
  box-shadow: 0 0 18px 2px rgba(240, 122, 79, 0.22);
  opacity: 0;
  animation: hero-scan 10s cubic-bezier(0.45, 0, 0.35, 1) 2.5s infinite;
}
@keyframes hero-scan {
  0% {
    top: 100%;
    opacity: 0;
  }
  6% {
    opacity: 0.8;
  }
  50% {
    opacity: 0.5;
  }
  62% {
    top: 0%;
    opacity: 0;
  }
  100% {
    top: 0%;
    opacity: 0;
  }
}

/* bolinhas de tinta do rótulo "pulando" em sequência */
.swatches i {
  animation: swatch-hop 3.6s ease-in-out infinite;
}
.swatches i:nth-child(2) {
  animation-delay: 0.15s;
}
.swatches i:nth-child(3) {
  animation-delay: 0.3s;
}
.swatches i:nth-child(4) {
  animation-delay: 0.45s;
}
@keyframes swatch-hop {
  0%,
  70%,
  100% {
    transform: none;
  }
  78% {
    transform: translateY(-4px);
  }
  86% {
    transform: none;
  }
}

/* pincel da demonstração automática */
.reveal-cursor.is-ghost {
  border-color: rgba(255, 255, 255, 0.3);
  border-style: dashed;
}

@media (prefers-reduced-motion: reduce) {
  .hero-orb,
  .hero-scan {
    display: none;
  }
}
```

## 2. `script.js` — cole esta função antes da linha `function initActiveNav() {`

```js
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
```

## 3. `script.js` — no final do arquivo, troque a linha

```js
reveal.init();
```

por

```js
reveal.init().then(() => initHeroLife(reveal));
```

---

## Ajustes opcionais

- **Frequência da demonstração:** `FIRST_DELAY` e `REPEAT_DELAY` no começo da função (em milissegundos). Para demonstrar só uma vez, troque `schedule(REPEAT_DELAY);` por nada (apague a linha).
- **Pigmentos mais fortes ou mais fracos:** `opacity: .14` em `.hero-orb`.
- **Sem a flutuação:** apague as duas linhas `.reveal-stage { animation: ... }` e `.reveal-stage::before { animation: ... }`.
- **Sem a linha de luz:** apague o bloco `.hero-scan`.

Quem usa "reduzir movimento" no sistema não vê nenhuma dessas animações.
