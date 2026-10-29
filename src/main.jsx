import "@fontsource-variable/sora";
import "@fontsource-variable/inter";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
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
