import { useEffect, useRef } from 'react';
import { useApp } from '../lib/AppContext.jsx';

// Pixel snowfall behind the whole site. Paused when disabled or when the user prefers reduced motion.
export default function Snow() {
  const ref = useRef(null);
  const { settings } = useApp();
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const canvas = ref.current;
    if (!canvas || !settings.snow || reduce) { canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); return undefined; }
    const ctx = canvas.getContext('2d');
    let w, h, raf;
    const flakes = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: 2 + Math.floor(Math.random() * 3), v: 18 + Math.random() * 40, d: Math.random() * 6 }));
    const resize = () => { w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    const tick = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      for (const f of flakes) {
        f.y += (f.v * dt) / h; f.d += dt;
        if (f.y > 1.02) { f.y = -0.02; f.x = Math.random(); }
        ctx.globalAlpha = 0.45 + f.s * 0.12;
        ctx.fillRect(Math.round(f.x * w + Math.sin(f.d) * 12), Math.round(f.y * h), f.s, f.s);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [settings.snow]);
  return <canvas ref={ref} className="snow-canvas" aria-hidden="true" />;
}
