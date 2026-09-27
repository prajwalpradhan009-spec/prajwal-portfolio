/* =========================================================================
   Tech Stack / Skills — behaviour only.
   The section ships fully readable without this file: the cards, the chips and
   the status graph all end up in their final state through CSS alone. This
   file only adds the two things CSS cannot do — knowing when the graph has
   scrolled into view, and following the cursor inside a card.
   ========================================================================= */

(function () {
  const section = document.querySelector('[data-sk-section]');
  if (!section) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ------------------------------------------------------------- graph */

  /* The graph rows and the three pills per row start collapsed (scaleX 0) and
     transparent. `is-ready` is the single switch that releases them, so the
     whole sequence stays in CSS and only the trigger lives here. */
  const graph = section.querySelector('[data-sk-graph]');
  if (graph) {
    if (reduceMotion.matches) {
      graph.classList.add('is-ready');
    } else {
      const graphObserver = new IntersectionObserver(
        entries => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-ready');
            graphObserver.unobserve(entry.target);
          }
        },
        { threshold: 0.2 }
      );
      graphObserver.observe(graph);
    }
  }

  /* ------------------------------------------------------- card glow */

  /* Writes the cursor position as two custom properties on the card; the glow
     is a radial gradient in skills.css that reads them. Deliberately skipped on
     coarse pointers (no hover to follow) and under reduced motion. */
  const cards = [...section.querySelectorAll('[data-sk-card]')];
  let wired = false;

  function cardIsInteractive() {
    return finePointer.matches && !reduceMotion.matches;
  }

  function wireCardGlow() {
    cards.forEach(card => {
      let rect = null;
      let frame = 0;
      let nextX = 0;
      let nextY = 0;

      const paint = () => {
        frame = 0;
        card.style.setProperty('--mx', `${nextX}px`);
        card.style.setProperty('--my', `${nextY}px`);
      };

      card.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse') return;
        rect = card.getBoundingClientRect();
      });

      card.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse' || !rect) return;
        nextX = event.clientX - rect.left;
        nextY = event.clientY - rect.top;
        // Coalesced into one write per frame: pointermove can fire several
        // times per frame and each write invalidates style for the card.
        if (!frame) frame = requestAnimationFrame(paint);
      }, { passive: true });

      card.addEventListener('pointerleave', () => {
        rect = null;
        if (frame) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      });
    });
    wired = true;
  }

  function syncCardGlow() {
    if (cardIsInteractive()) {
      if (!wired) wireCardGlow();
      return;
    }
    if (wired) {
      cards.forEach(card => {
        card.style.removeProperty('--mx');
        card.style.removeProperty('--my');
      });
    }
  }

  syncCardGlow();
  finePointer.addEventListener('change', syncCardGlow);
  reduceMotion.addEventListener('change', () => {
    if (reduceMotion.matches && graph) graph.classList.add('is-ready');
    syncCardGlow();
  });
})();
