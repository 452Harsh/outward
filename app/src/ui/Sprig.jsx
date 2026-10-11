import { useEffect, useRef, useState } from 'preact/hooks';
import { onMouth } from '../audio/narrator.js';
import './sprig.css';

const INK = '#17251f';
const S = { stroke: INK, 'stroke-width': 3 };

/**
 * Sprig, the walking companion. Pure SVG + CSS, so it costs a few KB, stays
 * sharp at any size, pauses when the page is hidden (html.is-hidden) and
 * calms down for prefers-reduced-motion.
 * @param {{state?: 'idle'|'walking'|'thinking'|'speaking'|'listening'|'celebrating'|'sleepy'|'ready'|'wave',
 *          mouth?: number, level?: number, step?: number, size?: number|string, label?: string}} props
 */
export default function Sprig({ state = 'idle', mouth = 0, level = 0.3, step = 0.7, size = 160, label, voice = false, class: cls = '' }) {
  const [pose, setPose] = useState(null);
  const ref = useRef(null);

  // Lip-sync: with `voice`, the mouth follows narration directly on the SVG,
  // without re-rendering the screen every frame.
  useEffect(() => {
    if (!voice) return undefined;
    return onMouth((v) => ref.current?.style.setProperty('--mouth', v.toFixed(2)));
  }, [voice]);

  // Now and then, while idle, Sprig pulls out a map.
  useEffect(() => {
    if (state !== 'idle' || matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let off;
    const t = setInterval(() => {
      if (document.hidden) return;
      setPose('map');
      off = setTimeout(() => setPose(null), 2600);
    }, 13000);
    return () => {
      clearInterval(t);
      clearTimeout(off);
    };
  }, [state]);

  const style = {
    width: typeof size === 'number' ? `${size}px` : size,
    ...(voice ? {} : { '--mouth': Math.max(0, Math.min(1, mouth)).toFixed(2) }),
    '--level': Math.max(0, Math.min(1, level)).toFixed(2),
    '--step': `${Math.max(0.3, step).toFixed(2)}s`,
  };

  return (
    <svg
      ref={ref}
      class={`sprig ${cls}`}
      viewBox="0 0 200 232"
      data-state={state}
      data-pose={pose ?? undefined}
      style={style}
      role="img"
      aria-label={label ?? `Sprig, your walking companion (${state})`}
    >
      <defs>
        <clipPath id="sprig-bean">
          <ellipse cx="100" cy="120" rx="52" ry="62" />
        </clipPath>
      </defs>
      <ellipse class="shadow" cx="100" cy="222" rx="46" ry="7" />
      <g class="bob">
        <g class="legs">
          <g class="leg l">
            <rect x="79" y="168" width="16" height="30" rx="8" fill="#24684a" {...S} />
            <rect x="74" y="192" width="24" height="13" rx="6.5" fill="#5a3e2b" {...S} />
          </g>
          <g class="leg r">
            <rect x="105" y="168" width="16" height="30" rx="8" fill="#24684a" {...S} />
            <rect x="102" y="192" width="24" height="13" rx="6.5" fill="#5a3e2b" {...S} />
          </g>
        </g>
        <g class="breath">
          <rect x="32" y="122" width="136" height="22" rx="11" fill="#fff1d6" {...S} />
          <rect x="92" y="122" width="16" height="22" fill="#ff7a2f" {...S} />
          <rect x="38" y="148" width="18" height="30" rx="7" fill="#2f8f5b" {...S} />
          <rect x="144" y="148" width="18" height="30" rx="7" fill="#2f8f5b" {...S} />
          <ellipse cx="100" cy="120" rx="52" ry="62" fill="#f7d6a0" />
          <g clip-path="url(#sprig-bean)">
            <rect x="40" y="138" width="120" height="50" fill="#38a3e8" />
            <line x1="100" y1="146" x2="100" y2="184" stroke={INK} stroke-width="2.5" opacity=".45" />
            <circle cx="86" cy="160" r="2.4" fill={INK} opacity=".45" />
          </g>
          <ellipse cx="100" cy="120" rx="52" ry="62" fill="none" stroke={INK} stroke-width="3.5" />
          <path d="M70 140 L74 180 M130 140 L126 180" stroke="#2f8f5b" stroke-width="7" stroke-linecap="round" />
          <path d="M52 132 Q100 148 148 132 L149 143 Q100 160 51 143 Z" fill="#ff7a2f" {...S} stroke-linejoin="round" />
          <g class="face">
            <g class="eyes">
              <g class="eyes-open">
                <g class="pupils">
                  <ellipse cx="82" cy="100" rx="7" ry="9.5" fill={INK} />
                  <ellipse cx="118" cy="100" rx="7" ry="9.5" fill={INK} />
                  <circle cx="84.5" cy="96" r="2.6" fill="#fff" />
                  <circle cx="120.5" cy="96" r="2.6" fill="#fff" />
                </g>
              </g>
              <path class="eyes-closed" d="M74 102 Q82 107 90 102 M110 102 Q118 107 126 102" stroke={INK} stroke-width="3.5" fill="none" stroke-linecap="round" />
              <path class="eyes-happy" d="M74 103 Q82 93 90 103 M110 103 Q118 93 126 103" stroke={INK} stroke-width="3.5" fill="none" stroke-linecap="round" />
            </g>
            <path class="brow l" d="M74 86 Q81 82 88 85" stroke={INK} stroke-width="3" fill="none" stroke-linecap="round" />
            <path class="brow r" d="M112 85 Q119 82 126 86" stroke={INK} stroke-width="3" fill="none" stroke-linecap="round" />
            <ellipse cx="70" cy="114" rx="7" ry="4.5" fill="#ff9e8f" opacity=".8" />
            <ellipse cx="130" cy="114" rx="7" ry="4.5" fill="#ff9e8f" opacity=".8" />
            <path class="mouth-smile" d="M91 116 Q100 125 109 116" stroke={INK} stroke-width="3.5" fill="none" stroke-linecap="round" />
            <ellipse class="mouth-open" cx="100" cy="120" rx="7" ry="6" fill="#7a2e22" {...S} />
            <ellipse class="mouth-o" cx="100" cy="120" rx="4" ry="4.5" fill="#7a2e22" {...S} />
            <path class="mouth-big" d="M88 115 Q100 134 112 115 Z" fill="#7a2e22" {...S} stroke-linejoin="round" />
          </g>
          <g class="sprout">
            <path d="M100 59 C99 50 101 44 100 36" stroke="#2f8f5b" stroke-width="4.5" fill="none" stroke-linecap="round" />
            <path d="M100 42 C88 32 79 36 77 45 C88 48 96 46 100 42Z" fill="#49b86e" {...S} stroke-linejoin="round" />
            <path d="M100 38 C112 27 122 31 125 40 C114 44 106 42 100 38Z" fill="#49b86e" {...S} stroke-linejoin="round" />
          </g>
          <path class="tail" d="M120 144 C126 156 128 168 124 180 L136 178 C139 164 135 152 131 142 Z" fill="#ff7a2f" {...S} stroke-linejoin="round" />
          <g class="map">
            <rect x="76" y="150" width="48" height="30" rx="4" fill="#fff1d6" {...S} />
            <path d="M88 150 V180 M100 150 V180 M112 150 V180" stroke={INK} stroke-width="1.5" opacity=".4" />
            <path d="M80 172 Q92 158 104 166 T120 156" stroke="#ff7a2f" stroke-width="2.5" fill="none" stroke-dasharray="3 3" />
          </g>
          <g class="arm l" transform="translate(58 142)">
            <g class="arm-rot">
              <line x1="0" y1="0" x2="0" y2="30" stroke="#38a3e8" stroke-width="13" stroke-linecap="round" />
              <circle cx="0" cy="36" r="8" fill="#f7d6a0" {...S} />
            </g>
          </g>
          <g class="arm r" transform="translate(142 142)">
            <g class="arm-rot">
              <line x1="0" y1="0" x2="0" y2="30" stroke="#38a3e8" stroke-width="13" stroke-linecap="round" />
              <circle cx="0" cy="36" r="8" fill="#f7d6a0" {...S} />
            </g>
          </g>
        </g>
      </g>
      <g class="thought">
        <circle cx="140" cy="76" r="4" fill="#fff" stroke={INK} stroke-width="2.5" />
        <circle cx="150" cy="62" r="6" fill="#fff" stroke={INK} stroke-width="2.5" />
        <ellipse cx="172" cy="34" rx="28" ry="22" fill="#fff" {...S} />
        <circle class="dot" cx="160" cy="34" r="3.5" fill={INK} />
        <circle class="dot d2" cx="172" cy="34" r="3.5" fill={INK} />
        <circle class="dot d3" cx="184" cy="34" r="3.5" fill={INK} />
        <g class="orbit">
          <circle cx="172" cy="34" r="20" fill="none" />
          <path d="M190 30 l2 4 4 1 -3 3 1 4 -4-2 -4 2 1-4 -3-3 4-1z" fill="#ffc23d" stroke={INK} stroke-width="1" />
          <path d="M152 44 c4-6 9-6 10 0 c-4 3-7 3-10 0z" fill="#49b86e" stroke={INK} stroke-width="1" />
        </g>
      </g>
      <g class="rings" fill="none" stroke="#ff7a2f" stroke-width="3">
        <circle class="ring" cx="40" cy="96" r="12" opacity=".9" />
        <circle class="ring" cx="40" cy="96" r="22" opacity=".5" />
        <circle class="ring" cx="40" cy="96" r="32" opacity=".25" />
      </g>
      <g class="zzz" aria-hidden="true" font-family="var(--font-display)" font-weight="800" fill="#5b6b62">
        <text x="138" y="70" font-size="18">z</text>
        <text x="150" y="56" font-size="22">z</text>
        <text x="164" y="40" font-size="26">Z</text>
      </g>
    </svg>
  );
}
