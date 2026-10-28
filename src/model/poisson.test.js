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
