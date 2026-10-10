import { useEffect, useRef } from 'preact/hooks';
import { projectPath } from '../engine/activity.js';

const NICE = [20, 50, 100, 200, 500, 1000, 2000, 5000];

/** The walk drawn from GPS points only: no map tiles, nothing downloaded. */
export default function WalkMap({ path, height = 220 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    const css = getComputedStyle(canvas);
    const color = (v) => css.getPropertyValue(v).trim();

    const { points, mPerPx } = projectPath(path, w, height, 20);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 4;
    for (let i = 1; i < points.length; i++) {
      const [a, b] = [points[i - 1], points[i]];
      g.setLineDash(b.resumed ? [6, 8] : []);
      g.strokeStyle = color(b.resumed ? '--muted' : '--accent');
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
    g.setLineDash([]);
    const dot = (p, c, r) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(p.x, p.y, r, 0, Math.PI * 2);
      g.fill();
    };
    if (points.length) {
      dot(points[0], color('--green'), 7);
      dot(points.at(-1), color('--accent'), 7);
    }

    // Scale bar
    if (mPerPx) {
      const m = NICE.find((n) => n / mPerPx >= 50) ?? NICE.at(-1);
      const px = m / mPerPx;
      g.strokeStyle = color('--muted');
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(16, height - 14);
      g.lineTo(16 + px, height - 14);
      g.stroke();
      g.fillStyle = color('--muted');
      g.font = '12px system-ui, sans-serif';
      g.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, 16, height - 20);
    }
  }, [path, height]);

  if (!path?.length) return <p class="hint">No GPS path for this walk.</p>;
  return (
    <canvas
      ref={ref}
      class="walkmap"
      style={{ height: `${height}px` }}
      role="img"
      aria-label={`Your walk, ${path.length} GPS points. Dashed lines are straight-line estimates while the screen was off.`}
    />
  );
}
