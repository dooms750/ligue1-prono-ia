// Graphiques façon plateforme de marché : sparklines, grand graphique interactif, graphique du match.
// SVG fait main, sans bibliothèque : léger, net sur mobile, au doigt comme à la souris.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { inkOn } from "./ui.jsx";

export const UP = "#22c55e";
export const DOWN = "#f0525a";
export const FLAT = "#8b9bb0";

export const trendColor = (d) => (d > 0.0005 ? UP : d < -0.0005 ? DOWN : FLAT);

// Variation affichée comme sur un marché : ▲ +3,2 ou ▼ −1,4
export function Delta({ value, unit = "", digits = 1, className = "" }) {
  const up = value > 0.0005, down = value < -0.0005;
  const txt = `${up ? "+" : down ? "−" : ""}${Math.abs(value).toFixed(digits).replace(".", ",")}${unit}`;
  return (
    <span className={`chg ${up ? "up" : down ? "down" : "flat"} ${className}`}>
      <i aria-hidden="true">{up ? "▲" : down ? "▼" : "■"}</i>{txt}
    </span>
  );
}

let uid = 0;
const useUid = () => useMemo(() => `g${++uid}`, []);

// Petite courbe dans une ligne de liste.
export function Sparkline({ values, width = 84, height = 30, color }) {
  const id = useUid();
  if (!values || values.length < 2) return <svg width={width} height={height} aria-hidden="true" />;
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * width, height - 3 - ((v - min) / span) * (height - 6)]);
  const c = color || trendColor(values[values.length - 1] - values[0]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={c} stopOpacity="0.28" />
          <stop offset="1" stopColor={c} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} />
      <path d={d} fill="none" stroke={c} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={c} />
    </svg>
  );
}

function useWidth(ref, fallback = 360) {
  const [w, setW] = useState(Math.min(fallback, typeof window !== "undefined" ? window.innerWidth - 64 : fallback));
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const set = () => setW(Math.max(200, el.clientWidth));
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function niceTicks(min, max, n = 4) {
  const span = max - min || 1;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= step0) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}

/**
 * Grand graphique interactif.
 * series : [{ name, color, values: [nombre | null], area?: bool }]
 * labels : libellé de chaque point de l'axe X (même longueur que values)
 * markers : [{ i, label, color }] repères verticaux (buts, cartons)
 */
export function LineChart({
  series, labels, height = 220, yFormat = (v) => v.toFixed(0), yMin, yMax, markers = [],
  ariaLabel, tickEvery, invertY = false,
}) {
  const box = useRef(null);
  const width = useWidth(box);
  const [hover, setHover] = useState(null);
  const base = useUid();
  const ids = series.map((_, k) => `${base}-${k}`);
  const n = labels.length;
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  let lo = yMin ?? Math.min(...all), hi = yMax ?? Math.max(...all);
  if (yMin == null || yMax == null) {
    const pad = (hi - lo) * 0.12 || 1;
    if (yMin == null) lo -= pad;
    if (yMax == null) hi += pad;
  }
  const L = 8, R = 46, T = 14, B = 26;
  const x = (i) => L + (n <= 1 ? 0 : (i / (n - 1)) * (width - L - R));
  const yRaw = (v) => T + ((hi - v) / (hi - lo || 1)) * (height - T - B);
  const y = (v) => (invertY ? T + (height - T - B) - (yRaw(v) - T) : yRaw(v));
  const ticks = niceTicks(lo, hi);
  const every = tickEvery || Math.max(1, Math.ceil(n / 6));

  const pathOf = (vals) => {
    let d = "", pen = false;
    vals.forEach((v, i) => {
      if (v == null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const onMove = (e) => {
    const r = box.current.getBoundingClientRect();
    const px = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    const i = Math.round(((px - L) / (width - L - R)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const h = hover ?? n - 1;
  const main = series.find((s) => s.area) || series[0];

  return (
    <div className="lchart" ref={box}>
      <div className="lchart-tip" aria-live="polite">
        <span className="lchart-x">{labels[h]}</span>
        {series.map((s) => s.values[h] != null && (
          <span key={s.name} className="lchart-v"><i style={{ background: s.color }} />{s.name} <b>{yFormat(s.values[h])}</b></span>
        ))}
      </div>
      <svg width={width} height={height} role="img" aria-label={ariaLabel}
        onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} onTouchMove={onMove}
        style={{ touchAction: "pan-y" }}>
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={ids[k]} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.32" />
              <stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={width - R} y1={y(t)} y2={y(t)} className="lchart-grid" />
            <text x={width - R + 6} y={y(t) + 4} className="lchart-ytick">{yFormat(t)}</text>
          </g>
        ))}
        {labels.map((lb, i) => (i % every === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={height - 7} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="lchart-xtick">{lb}</text>
        ))}
        {markers.map((m, k) => (
          <g key={k}>
            <line x1={x(m.i)} x2={x(m.i)} y1={T} y2={height - B} stroke={m.color || "var(--gris)"} strokeDasharray="2 3" strokeWidth="1" />
            <text x={x(m.i)} y={T - 3} textAnchor="middle" className="lchart-mk" fill={m.color || "var(--gris)"}>{m.label}</text>
          </g>
        ))}
        {series.map((s, k) => s.area && (
          <path key={`a${k}`} d={`${pathOf(s.values)}L${x(n - 1)},${height - B}L${x(s.values.findIndex((v) => v != null))},${height - B}Z`}
            fill={`url(#${ids[k]})`} />
        ))}
        {series.map((s, k) => (
          <path key={`l${k}`} d={pathOf(s.values)} fill="none" stroke={s.color} strokeWidth={s.width || 2.2}
            strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />
        ))}
        <line x1={x(h)} x2={x(h)} y1={T} y2={height - B} className="lchart-cross" />
        {series.map((s, k) => s.values[h] != null && (
          <circle key={`c${k}`} cx={x(h)} cy={y(s.values[h])} r="4.5" fill={s.color} stroke="var(--nuit)" strokeWidth="2" />
        ))}
        {main && main.values[n - 1] != null && (
          <g>
            <rect x={width - R + 2} y={y(main.values[n - 1]) - 10} width={R - 4} height="20" rx="4" fill={main.color} />
            <text x={width - R / 2} y={y(main.values[n - 1]) + 4} textAnchor="middle" className="lchart-last" fill={/^#[0-9a-f]{6}$/i.test(main.color) ? inkOn(main.color) : "#04120a"}>{yFormat(main.values[n - 1])}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

// Onglets de période : 5J, 10J, Saison…
export function Ranges({ options, value, onChange }) {
  return (
    <div className="ranges" role="tablist">
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id} className={value === o.id ? "on" : ""}
          onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}
