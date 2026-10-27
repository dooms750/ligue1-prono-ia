import React from "react";

// Pictogramme simple selon le temps annoncé.
function Icon({ w, size = 28 }) {
  const rainy = w.kind === "pluie" || (w.code >= 51 && w.code <= 67) || (w.code >= 80 && w.code <= 99);
  const windy = w.kind === "vent";
  const cloudy = rainy || (w.code != null && w.code >= 2);
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" fill="none" strokeWidth="2" strokeLinecap="round">
      {!cloudy && <><circle cx="16" cy="16" r="6" fill="var(--projecteur)" />{[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <line key={a} x1={16 + 9 * Math.cos((a * Math.PI) / 180)} y1={16 + 9 * Math.sin((a * Math.PI) / 180)}
          x2={16 + 12 * Math.cos((a * Math.PI) / 180)} y2={16 + 12 * Math.sin((a * Math.PI) / 180)} stroke="var(--projecteur)" />))}</>}
      {cloudy && <path d="M9 21h14a5 5 0 0 0 0-10 7 7 0 0 0-13 2 4 4 0 0 0-1 8z" fill="#c9d4df" stroke="none" />}
      {rainy && [11, 16, 21].map((x) => <line key={x} x1={x} y1="24" x2={x - 2} y2="29" stroke="#6f9bff" />)}
      {windy && <path d="M4 12h15a3 3 0 1 0-3-3M4 18h20a3 3 0 1 1-3 3" stroke="#c9d4df" />}
    </svg>
  );
}

const LABEL = { pluie: "pluie attendue", vent: "vent fort attendu", beau: "pas de pluie ni de vent gênant" };

// Résumé court, pour les cartes de match.
export function WeatherChip({ w, date }) {
  if (!w) return <span className="wx-chip wx-none">Météo à J-7 ({j7(date)})</span>;
  return (
    <span className={`wx-chip wx-${w.kind}`}>
      <Icon w={w} size={18} />
      {w.temp}°C · {w.roof ? "stade couvert" : LABEL[w.kind].split(" ")[0] === "pas" ? "sec" : LABEL[w.kind]} · confiance {w.confidenceLabel}
    </span>
  );
}

function j7(date) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() - 7);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
}

const pctTxt = (p) => `${Math.round(p * 100)} %`;

// Nombre de jours calendaires avant le match.
function daysTo(date) {
  const t = new Date(); t.setHours(12, 0, 0, 0);
  return Math.max(0, Math.round((new Date(date + "T12:00:00") - t) / 864e5));
}

// La carte complète : prévision, indice de confiance et évolution depuis J-7.
export function WeatherCard({ w, date }) {
  if (!w) {
    return (
      <div className="wx-card">
        <p className="muted">La prévision de ce match sera publiée à J-7, le {j7(date)}, puis affinée chaque jour jusqu'à J-2.</p>
      </div>
    );
  }
  const n = w.members || 51;
  const dry = Math.round((1 - w.pRain) * n);
  return (
    <div className="wx-card">
      <div className="wx-top">
        <Icon w={w} size={44} />
        <div>
          <strong>{w.temp}°C{w.desc ? `, ${w.desc}` : ""}</strong>
          <span>{w.stadium} · {daysTo(date) === 0 ? "prévision du jour du match" : `prévision à J-${daysTo(date)}`}</span>
        </div>
      </div>
      {w.roof && <p className="muted small">Stade couvert : la météo n'influence pas le jeu.</p>}
      <div className="wx-grid">
        <div><b>{pctTxt(w.pRain)}</b><span>risque de pluie gênante (plus de 1,5 mm pendant le match)</span></div>
        <div><b>{w.gust ?? "–"} km/h</b><span>rafales attendues, risque de vent fort {pctTxt(w.pWind)}</span></div>
      </div>
      <div className="wx-conf">
        <div className="wx-conf-head">
          <span>Indice de confiance</span>
          <b>{w.confidence}/100 · {w.confidenceLabel}</b>
        </div>
        <div className="wx-bar"><i style={{ width: `${w.confidence}%` }} /></div>
        <p className="muted small">
          {w.pRain < 0.5 ? `${dry} des ${n} scénarios` : `${n - dry} des ${n} scénarios`} du modèle européen ECMWF
          annoncent {w.pRain < 0.5 ? "un match au sec" : "de la pluie"}. La confiance monte quand le match approche
          et quand les scénarios sont d'accord.
        </p>
      </div>
      {w.history && w.history.length > 1 && (
        <div className="wx-hist">
          <span className="muted small">Évolution de la prévision</span>
          <ol>
            {w.history.map((h) => (
              <li key={h.day}>
                <b>J-{h.daysBefore}</b>
                <span>pluie {pctTxt(h.pRain)}</span>
                <span>conf. {h.conf}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <p className="wx-src">Sources : {(w.sources || []).join(", ")} via Open-Meteo. Mise à jour deux fois par jour.</p>
    </div>
  );
}
