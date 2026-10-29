import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMarkets, impliedFromOdds, brier, outcomeOf } from "./poisson.js";

test("les probabilités 1N2 font 100 %", () => {
  const m = computeMarkets(1.6, 1.1);
  const sum = m.p.reduce((s, x) => s + x, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("l'équipe qui attend plus de buts est favorite", () => {
  const m = computeMarkets(2.0, 0.8);
  assert.equal(m.pick, 0);
  assert.ok(m.p[0] > 0.6);
});

test("deux équipes identiques : victoires symétriques", () => {
  const m = computeMarkets(1.3, 1.3);
  assert.ok(Math.abs(m.p[0] - m.p[2]) < 1e-9);
});

test("la marge du bookmaker est retirée", () => {
  const r = impliedFromOdds([2.0, 3.4, 3.8]);
  assert.ok(Math.abs(r.p.reduce((s, x) => s + x, 0) - 1) < 1e-9);
  assert.ok(r.margin > 0);
});

test("score de Brier : parfait = 0", () => {
  assert.equal(brier([1, 0, 0], outcomeOf(2, 1)), 0);
});

import { liveMarkets } from "./liveProbs.js";

test("en direct : 2-0 à la 85e, la victoire est quasi certaine", () => {
  const r = liveMarkets(1.4, 1.2, { state: "in", period: 2, minute: 85, extra: 0, hg: 2, ag: 0, redH: 0, redA: 0 });
  assert.ok(r.p[0] > 0.95);
});

test("en direct : match terminé, l'issue est certaine", () => {
  const r = liveMarkets(1.4, 1.2, { state: "post", period: 2, minute: 90, extra: 0, hg: 1, ag: 1, redH: 0, redA: 0 });
  assert.ok(Math.abs(r.p[1] - 1) < 1e-9);
});

test("en direct : un carton rouge fait baisser les chances de l'équipe réduite à 10", () => {
  const base = { state: "in", period: 1, minute: 20, extra: 0, hg: 0, ag: 0, redH: 0, redA: 0 };
  const a = liveMarkets(1.4, 1.2, base), b = liveMarkets(1.4, 1.2, { ...base, redH: 1 });
  assert.ok(b.p[0] < a.p[0]);
});

test("en direct : à 0-0 avant le coup d'envoi, on retrouve le pronostic d'avant-match", () => {
  const pre = liveMarkets(1.5, 1.1, { state: "in", period: 1, minute: 0, extra: 0, hg: 0, ag: 0, redH: 0, redA: 0 });
  assert.ok(Math.abs(pre.p.reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(pre.p[0] > 0.42 && pre.p[0] < 0.52);
});

test("en direct : l'équipe menée pousse quand l'effet du score est mesuré", () => {
  const st = { state: "in", period: 2, minute: 60, extra: 0, hg: 1, ag: 0, redH: 0, redA: 0 };
  const base = { alpha: 0, gamma: 0, trail: 0, lead: 0, redOwn: 0, redOpp: 0, sot: 0 };
  const a = liveMarkets(1.3, 1.3, st, base), b = liveMarkets(1.3, 1.3, st, { ...base, trail: 0.3, lead: -0.1 });
  assert.ok(b.p[0] < a.p[0]);
});

test("en direct : plus de tirs cadrés que prévu, plus de chances de marquer", () => {
  const st = { state: "in", period: 1, minute: 30, extra: 0, hg: 0, ag: 0, redH: 0, redA: 0, sotH: 6, sotA: 0 };
  const base = { alpha: 0, gamma: 0, trail: 0, lead: 0, redOwn: 0, redOpp: 0, sot: 0 };
  const a = liveMarkets(1.3, 1.3, st, base), b = liveMarkets(1.3, 1.3, st, { ...base, sot: 0.2 });
  assert.ok(b.p[0] > a.p[0]);
});
