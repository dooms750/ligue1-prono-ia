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
