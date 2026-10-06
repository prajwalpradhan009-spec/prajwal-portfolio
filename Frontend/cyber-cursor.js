(() => {
  const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let cleanupCursor = null;

  function stopCursor() {
    if (!cleanupCursor) return;
    cleanupCursor();
    cleanupCursor = null;
  }

  function syncCursor() {
    stopCursor();
    if (!pointerQuery.matches || motionQuery.matches) return;

    const canvas = document.createElement('canvas');
    canvas.className = 'cyber-cursor-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    const cursor = document.createElement('div');
    cursor.className = 'cyber-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = `
      <svg class="cyber-cursor__pointer" viewBox="0 0 20 26" aria-hidden="true">
        <path d="M2 1.5 17.5 16l-7 .9-3.4 6.2L2 1.5Z" fill="rgba(7, 20, 26, .94)" stroke="currentColor" stroke-width="1.35" stroke-linejoin="round"/>
        <path d="m5.2 6.1 8.7 8.2-4.1.5-2.4 4.2L5.2 6.1Z" fill="currentColor" opacity=".28"/>
      </svg>
      <span class="cyber-cursor__hud">
        <i class="cyber-cursor__ring cyber-cursor__ring--ticks"></i>
        <i class="cyber-cursor__ring cyber-cursor__ring--outer"></i>
        <i class="cyber-cursor__ring cyber-cursor__ring--middle"></i>
        <i class="cyber-cursor__ring cyber-cursor__ring--inner"></i>
        <span class="cyber-cursor__indicator" aria-hidden="true">↗</span>
      </span>
    `;

    document.body.append(canvas, cursor);
    document.documentElement.classList.add('cyber-cursor-enabled');

    const context = canvas.getContext('2d');
    if (!context) {
      canvas.remove();
      cursor.remove();
      document.documentElement.classList.remove('cyber-cursor-enabled');
      return;
    }

    const state = {
      pointerX: -100,
      pointerY: -100,
      cursorX: -100,
      cursorY: -100,
      hudX: -100,
      hudY: -100,
      previousX: -100,
      previousY: -100,
      previousTime: 0,
      visible: false,
      magnetOffsetX: 0,
      magnetOffsetY: 0,
      frame: 0,
      clickTimer: 0,
      particles: [],
      trail: [],
    };
    const maxParticles = 72;
    const particleColors = ['105, 229, 225', '91, 255, 190'];

    function resizeCanvas() {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(window.innerWidth * pixelRatio);
      canvas.height = Math.round(window.innerHeight * pixelRatio);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    }

    function requestFrame() {
      if (!state.frame && !document.hidden) {
        state.frame = window.requestAnimationFrame(render);
      }
    }

    function addParticle(x, y, vx, vy, radius, life, color) {
      if (state.particles.length >= maxParticles) state.particles.shift();
      state.particles.push({ x, y, vx, vy, radius, life, born: performance.now(), color });
    }

    function updateHover(target) {
      if (!(target instanceof Element)) return;

      const link = target.closest('a');
      const button = target.closest('button, [role="button"]');
      const project = target.closest('.project-showcase, .project-card, [data-project-card]');
      const image = target.closest('img');

      cursor.classList.toggle('cyber-cursor--project', Boolean(project && !link && !button));
      cursor.classList.toggle('cyber-cursor--image', Boolean(image && !project && !link && !button));
      cursor.classList.toggle('cyber-cursor--link', Boolean(link));
      cursor.classList.toggle('cyber-cursor--button', Boolean(button && !link));
      cursor.querySelector('.cyber-cursor__indicator').textContent =
        link ? '↗' : project && !button ? 'VIEW' : '';
    }

    function getMagnetOffset(target, x, y) {
      if (!(target instanceof Element)) return [0, 0];
      const element = target.closest(
        '[data-cursor-magnetic], .button-primary, .button-connect, .resume-link, .social-circle, .project-btn, .theme-toggle, .menu-toggle, .gh-retry, .ai-launcher'
      );
      if (!element) return [0, 0];

      const bounds = element.getBoundingClientRect();
      const nearestX = Math.max(bounds.left, Math.min(x, bounds.right));
      const nearestY = Math.max(bounds.top, Math.min(y, bounds.bottom));
      const distance = Math.hypot(x - nearestX, y - nearestY);
      if (distance > 76) return [0, 0];

      const strength = (1 - distance / 76) * 0.11;
      const offsetX = (bounds.left + bounds.width / 2 - x) * strength;
      const offsetY = (bounds.top + bounds.height / 2 - y) * strength;
      const magnitude = Math.hypot(offsetX, offsetY);
      const limit = 9;
      const scale = magnitude > limit ? limit / magnitude : 1;
      return [offsetX * scale, offsetY * scale];
    }

    function createClickRipple(x, y) {
      const ripple = document.createElement('span');
      ripple.className = 'cyber-cursor__ripple';
      ripple.style.left = `${x - 6}px`;
      ripple.style.top = `${y - 6}px`;
      ripple.setAttribute('aria-hidden', 'true');
      document.body.append(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    }

    function render(now) {
      state.frame = 0;
      const targetX = state.pointerX + state.magnetOffsetX;
      const targetY = state.pointerY + state.magnetOffsetY;
      const dx = targetX - state.cursorX;
      const dy = targetY - state.cursorY;
      state.cursorX += dx * 0.34;
      state.cursorY += dy * 0.34;
      state.hudX += (targetX - state.hudX) * 0.19;
      state.hudY += (targetY - state.hudY) * 0.19;

      cursor.style.transform = `translate3d(${state.cursorX}px, ${state.cursorY}px, 0)`;
      cursor.style.setProperty('--cyber-hud-x', `${state.hudX - state.cursorX}px`);
      cursor.style.setProperty('--cyber-hud-y', `${state.hudY - state.cursorY}px`);

      const width = window.innerWidth;
      const height = window.innerHeight;
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'lighter';

      state.trail = state.trail.filter(point => now - point.time < 260);
      for (let index = 1; index < state.trail.length; index += 1) {
        const from = state.trail[index - 1];
        const to = state.trail[index];
        const age = now - to.time;
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.strokeStyle = `rgba(${particleColors[to.color]}, ${Math.max(0, 1 - age / 260) * Math.min(0.72, to.speed / 2)})`;
        context.lineWidth = Math.max(1, Math.min(4, to.speed * 1.2));
        context.lineCap = 'round';
        context.shadowColor = `rgba(${particleColors[to.color]}, .9)`;
        context.shadowBlur = 12;
        context.stroke();
      }

      context.shadowBlur = 0;
      state.particles = state.particles.filter(particle => {
        const age = now - particle.born;
        if (age >= particle.life) return false;

        const progress = age / particle.life;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= 0.97;
        particle.vy *= 0.97;
        const opacity = 1 - progress;
        const size = particle.radius * (1 - progress * 0.55);

        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(progress * 1.8);
        context.fillStyle = `rgba(${particle.color}, ${opacity})`;
        context.shadowColor = `rgba(${particle.color}, ${opacity})`;
        context.shadowBlur = particle.radius * 4;
        context.fillRect(-size / 2, -size / 2, size, size);
        context.restore();
        return true;
      });

      context.globalCompositeOperation = 'source-over';
      context.shadowBlur = 0;
      const pointerStillFollowing =
        Math.abs(targetX - state.cursorX) > 0.08 ||
        Math.abs(targetY - state.cursorY) > 0.08 ||
        Math.abs(targetX - state.hudX) > 0.08 ||
        Math.abs(targetY - state.hudY) > 0.08;
      if (pointerStillFollowing || state.particles.length || state.trail.length) requestFrame();
    }

    function onPointerMove(event) {
      if (event.pointerType === 'touch') return;
      const now = performance.now();
      const elapsed = Math.max(8, now - state.previousTime);
      const distance = state.previousTime
        ? Math.hypot(event.clientX - state.previousX, event.clientY - state.previousY)
        : 0;
      const speed = Math.min(7, distance / elapsed);
      state.pointerX = event.clientX;
      state.pointerY = event.clientY;

      if (!state.visible) {
        state.cursorX = state.hudX = state.pointerX;
        state.cursorY = state.hudY = state.pointerY;
      }
      state.visible = true;
      cursor.classList.add('is-visible');
      updateHover(event.target);
      [state.magnetOffsetX, state.magnetOffsetY] = getMagnetOffset(
        event.target,
        state.pointerX,
        state.pointerY
      );

      if (distance > 2) {
        const color = Math.random() < 0.38 ? 1 : 0;
        state.trail.push({ x: state.pointerX, y: state.pointerY, time: now, speed, color });
        if (state.trail.length > 15) state.trail.shift();

        if (distance > 4) {
          const count = speed > 1.5 ? 2 : 1;
          for (let index = 0; index < count; index += 1) {
            const spread = (Math.random() - 0.5) * 2.6;
            addParticle(
              state.pointerX + spread,
              state.pointerY + spread,
              (Math.random() - 0.5) * (0.8 + speed * 0.32),
              (Math.random() - 0.5) * (0.8 + speed * 0.32),
              1.4 + Math.random() * 1.7,
              260 + Math.random() * 220,
              particleColors[color]
            );
          }
        }
      }

      state.previousX = state.pointerX;
      state.previousY = state.pointerY;
      state.previousTime = now;
      requestFrame();
    }

    function onClick(event) {
      if (event.pointerType === 'touch') return;
      const x = event.clientX;
      const y = event.clientY;
      createClickRipple(x, y);
      for (let index = 0; index < 18; index += 1) {
        const angle = (Math.PI * 2 * index) / 18 + Math.random() * 0.16;
        const velocity = 1.1 + Math.random() * 3.5;
        addParticle(
          x,
          y,
          Math.cos(angle) * velocity,
          Math.sin(angle) * velocity,
          1.6 + Math.random() * 2,
          360 + Math.random() * 220,
          particleColors[index % 2]
        );
      }
      cursor.classList.add('is-clicking');
      window.clearTimeout(state.clickTimer);
      state.clickTimer = window.setTimeout(() => cursor.classList.remove('is-clicking'), 580);
      requestFrame();
    }

    function onPointerLeave() {
      state.visible = false;
      state.previousX = -100;
      state.previousY = -100;
      state.previousTime = 0;
      state.magnetOffsetX = 0;
      state.magnetOffsetY = 0;
      cursor.classList.remove('is-visible');
      cursor.classList.remove(
        'cyber-cursor--button',
        'cyber-cursor--link',
        'cyber-cursor--project',
        'cyber-cursor--image'
      );
      requestFrame();
    }

    function onVisibilityChange() {
      if (document.hidden && state.frame) {
        window.cancelAnimationFrame(state.frame);
        state.frame = 0;
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      } else if (!document.hidden && (state.visible || state.particles.length)) {
        requestFrame();
      }
    }

    function onPointerOut(event) {
      if (!event.relatedTarget) onPointerLeave();
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onClick, { passive: true });
    window.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);

    cleanupCursor = () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onClick);
      window.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.cancelAnimationFrame(state.frame);
      window.clearTimeout(state.clickTimer);
      canvas.remove();
      cursor.remove();
      document.querySelectorAll('.cyber-cursor__ripple').forEach(ripple => ripple.remove());
      document.documentElement.classList.remove('cyber-cursor-enabled');
    };
  }

  pointerQuery.addEventListener('change', syncCursor);
  motionQuery.addEventListener('change', syncCursor);
  syncCursor();
})();
