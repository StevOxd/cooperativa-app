import React, { useEffect, useRef } from 'react';

/**
 * Fondo animado del inicio de sesión: una malla de puntos tenues que se apartan
 * del puntero y vuelven a su lugar. Es decorativo (canvas, sin librerías).
 *
 * - Solo reacciona fuera de `excludeRef` (la tarjeta de inicio de sesión) y no
 *   dibuja debajo de ella.
 * - Se desactiva en pantallas táctiles o menores de 1024 px y con
 *   `prefers-reduced-motion`; en esos casos el canvas queda vacío.
 * - Se pausa mientras la pestaña está oculta.
 *
 * @param {Object} props
 * @param {React.RefObject<HTMLElement>} props.excludeRef - Zona sin efecto (la tarjeta).
 */
export const ParticleField = ({ excludeRef }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointer = window.matchMedia('(pointer: fine)');
    const isEnabled = () => !reduceMotion.matches && finePointer.matches && window.innerWidth >= 1024;

    const ctx = canvas.getContext('2d');
    const SPACING = 26; // px entre puntos
    const RADIUS = 140; // alcance del puntero
    const PUSH = 2.4; // fuerza con que se apartan
    const SPRING = 0.045; // vuelta a su lugar
    const DAMPING = 0.84;
    const COLOR = '2, 132, 199'; // brand-600

    let particles = [];
    let width = 0;
    let height = 0;
    let frame = null;
    let pointer = null; // { x, y } o null si está fuera o sobre la tarjeta
    let exclude = null; // rectángulo de la tarjeta con un pequeño margen
    let start = performance.now();

    const readExclude = () => {
      const el = excludeRef?.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const pad = 12;
      return { left: r.left - pad, right: r.right + pad, top: r.top - pad, bottom: r.bottom + pad };
    };
    const inside = (x, y, r) => r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

    const build = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      exclude = readExclude();

      particles = [];
      for (let y = SPACING / 2; y < height; y += SPACING) {
        for (let x = SPACING / 2; x < width; x += SPACING) {
          // Leve desorden para que no se vea como una cuadrícula rígida.
          const hx = x + (Math.random() - 0.5) * SPACING * 0.5;
          const hy = y + (Math.random() - 0.5) * SPACING * 0.5;
          particles.push({ hx, hy, x: hx, y: hy, vx: 0, vy: 0, phase: Math.random() * Math.PI * 2, size: 0.9 + Math.random() * 0.7 });
        }
      }
    };

    const tick = (now) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        // Ondulación suave en reposo
        const tx = p.hx + Math.sin(t * 0.6 + p.phase) * 1.2;
        const ty = p.hy + Math.cos(t * 0.5 + p.phase) * 1.2;

        let glow = 0;
        if (pointer) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dist = Math.hypot(dx, dy);
          if (dist < RADIUS && dist > 0.01) {
            const f = (1 - dist / RADIUS) ** 2;
            p.vx += (dx / dist) * f * PUSH;
            p.vy += (dy / dist) * f * PUSH;
            glow = f;
          }
        }
        p.vx = (p.vx + (tx - p.x) * SPRING) * DAMPING;
        p.vy = (p.vy + (ty - p.y) * SPRING) * DAMPING;
        p.x += p.vx;
        p.y += p.vy;

        if (inside(p.x, p.y, exclude)) continue;

        const moved = Math.min(1, Math.hypot(p.x - tx, p.y - ty) / 18);
        const alpha = 0.16 + Math.max(glow, moved) * 0.5;
        ctx.fillStyle = `rgba(${COLOR}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + Math.max(glow, moved) * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      frame = requestAnimationFrame(tick);
    };

    const play = () => {
      if (frame === null && isEnabled() && !document.hidden) frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    const onPointerMove = (e) => {
      if (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      exclude = readExclude();
      pointer = inside(e.clientX, e.clientY, exclude) ? null : { x: e.clientX, y: e.clientY };
    };
    const onPointerLeave = () => {
      pointer = null;
    };
    const onResize = () => {
      if (!isEnabled()) {
        pause();
        ctx.clearRect(0, 0, width, height);
        return;
      }
      build();
      play();
    };
    const onScroll = () => {
      exclude = readExclude();
    };
    const onVisibility = () => (document.hidden ? pause() : play());
    const onPreferenceChange = () => onResize();

    if (isEnabled()) {
      build();
      start = performance.now();
      play();
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    reduceMotion.addEventListener?.('change', onPreferenceChange);
    finePointer.addEventListener?.('change', onPreferenceChange);

    return () => {
      pause();
      window.removeEventListener('pointermove', onPointerMove);
      document.documentElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotion.removeEventListener?.('change', onPreferenceChange);
      finePointer.removeEventListener?.('change', onPreferenceChange);
    };
  }, [excludeRef]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 print:hidden" />;
};

export default ParticleField;
