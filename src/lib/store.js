// Les pronos de l'utilisateur, gardés dans son navigateur.
import { useEffect, useState } from "react";

const KEY = "lucide.picks.v1";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function usePicks() {
  const [picks, setPicks] = useState(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(picks));
    } catch {
      /* stockage indisponible : les pronos restent en mémoire */
    }
  }, [picks]);
  const setPick = (id, outcome) => setPicks((p) => ({ ...p, [id]: outcome }));
  return [picks, setPick];
}

export const matchId = (m) => `${m.md}-${m.home}-${m.away}`;

export function useHashRoute() {
  const get = () => window.location.hash.replace(/^#/, "") || "/";
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const on = () => {
      setRoute(get());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path) => {
  window.location.hash = path;
};

export function formatKick(m) {
  return m.time ? `${formatDate(m.date)}, ${m.time.replace(":", " h ")}` : formatDate(m.date);
}

export function formatDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long",
  });
}
