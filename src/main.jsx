import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "@fontsource/big-shoulders-display/700";
import "@fontsource/big-shoulders-display/800";
import "@fontsource/big-shoulders-display/900";
import "@fontsource/figtree/400";
import "@fontsource/figtree/500";
import "@fontsource/figtree/600";
import "@fontsource/figtree/700";
import "./styles.css";
import "./theme.css";
import "./intro.css";

createRoot(document.getElementById("root")).render(<App />);

// Mode hors connexion (et installation sur l'écran d'accueil).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
