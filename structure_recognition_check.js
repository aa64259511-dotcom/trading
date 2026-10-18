const assert = require("assert");
const core = require("./strategy-core");
const frozenDecisions = require("./structure_recognition_decisions.json");

function dateAt(index) {
  const date = new Date(Date.UTC(2020, 0, 1) + index * 86400000);
  return date.toISOString().slice(0, 10);
}

function candle(index, open, high, low, close, volume = 1000) {
  return { date: dateAt(index), open, high, low, close, volume };
}

function wave(count, { start = 80, drift = 0, amplitude = 1.2, period = 2.2 } = {}) {
  const closes = [];
  for (let index = 0; index < count; index += 1) {
    closes.push(start + index * drift + Math.sin(index / period) * amplitude);
  }
  return closes.map((close, index) => {
    const prev = index ? closes[index - 1] : close;
    return candle(index, prev, Math.max(prev, close) + 0.35, Math.min(prev, close) - 0.35, close, 1000 + (index % 7) * 80);
  });
}

function decisionOf(advice) {
  return {
    action: advice.action,
    actionText: advice.actionText,
    stage: advice.stage,
    model: advice.model,
    score: advice.score,
    side: advice.side,
    matched: advice.matched,
    missing: advice.missing,
    plan: advice.plan,
    stopLoss: advice.stopLoss,
    stopBasis: advice.stopBasis,
  };
}

const decisionKeys = ["action", "actionText", "stage", "model", "score", "side", "matched", "missing", "plan", "stopLoss", "stopBasis"];

function assertDecisionUnchanged(history, expected, levels = [], position = null) {
  const advice = core.analyze({ history, levels, position });
  decisionKeys.forEach((key) => {
    assert.deepStrictEqual(advice[key], expected[key], `decision field changed: ${key}`);
  });
  ["trendDirection", "trendStage", "trendConfidence", "supportCandidates", "resistanceCandidates", "supportValidation", "resistanceValidation"].forEach((key) => {
    assert.ok(Object.prototype.hasOwnProperty.call(advice, key), `missing ${key}`);
  });
  assert.strictEqual(advice.supportValidation.participatesInScoring, false);
  return advice;
}

const up = wave(90, { start: 40, drift: 0.55, amplitude: 1.1 });
const upAdvice = assertDecisionUnchanged(up, frozenDecisions.up);
const upStructure = core.recognizeMarketStructure(up);
assert.strictEqual(upStructure.trendDirection, "上涨", JSON.stringify({ direction: upStructure.trendDirection, stage: upStructure.trendStage, confidence: upStructure.trendConfidence }));
assert.ok(upStructure.trendConfidence >= 50, `up confidence ${upStructure.trendConfidence}`);
assert.ok(["上涨延续", "回踩确认", "突破确认", "趋势修复"].includes(upStructure.trendStage), upStructure.trendStage);
assert.ok(upStructure.supportCandidates.length > 0, "uptrend should expose support candidates");
assert.strictEqual(upAdvice.score, frozenDecisions.up.score);
assert.notStrictEqual(upAdvice.trendStage, upAdvice.stage);

const down = wave(90, { start: 160, drift: -0.55, amplitude: 1.1 });
assertDecisionUnchanged(down, frozenDecisions.down);
const downStructure = core.recognizeMarketStructure(down);
assert.strictEqual(downStructure.trendDirection, "下跌", JSON.stringify({ direction: downStructure.trendDirection, stage: downStructure.trendStage, confidence: downStructure.trendConfidence }));
assert.ok(["下跌延续", "超跌反弹", "趋势修复"].includes(downStructure.trendStage), downStructure.trendStage);

const chop = wave(80, { start: 100, drift: 0, amplitude: 1.4, period: 3 });
assertDecisionUnchanged(chop, frozenDecisions.chop);
const chopStructure = core.recognizeMarketStructure(chop);
assert.ok(["盘整", "趋势转换中"].includes(chopStructure.trendDirection), chopStructure.trendDirection);
assert.ok(["盘整区间", "震荡筑底", "趋势修复", "回踩确认"].includes(chopStructure.trendStage), chopStructure.trendStage);

const shortHistory = wave(8, { start: 20, drift: 0.2 });
const shortStructure = core.recognizeMarketStructure(shortHistory);
assert.strictEqual(shortStructure.trendStage, "K线不足");
assert.strictEqual(shortStructure.trendConfidence, 0);
assert.deepStrictEqual(shortStructure.supportCandidates, []);
assertDecisionUnchanged(shortHistory, frozenDecisions.short);

function rangeThenBreakout() {
  const bars = [];
  for (let cycle = 0; cycle < 8; cycle += 1) {
    const base = cycle * 10;
    const path = [100, 102, 105, 108, 110, 108, 105, 102, 100, 99];
    path.forEach((close, offset) => {
      const index = base + offset;
      const prev = bars.at(-1)?.close || close;
      const high = close >= 110 ? 110.4 : close + 0.4;
      const low = close <= 100 ? 99.2 : close - 0.4;
      bars.push(candle(index, prev, Math.max(high, prev, close), Math.min(low, prev, close), close, 900 + offset * 10));
    });
  }
  return bars;
}

const ranged = rangeThenBreakout();
const breakoutIndex = ranged.length;
const breakoutBar = candle(breakoutIndex, 108, 116, 111.5, 115, 1400);
const breakoutHistory = ranged.concat(breakoutBar);
const breakoutStructure = core.recognizeMarketStructure(breakoutHistory);
const pending = breakoutStructure.supportCandidates.filter((level) => level.source === "pressure_breakout");
assert.ok(pending.length > 0, `expected a pressure-breakout support candidate, got ${JSON.stringify(breakoutStructure.supportCandidates)}`);
pending.forEach((level) => {
  assert.notStrictEqual(level.status, "validated", `breakout bar upgraded support too early: ${JSON.stringify(level)}`);
});
assert.notStrictEqual(breakoutStructure.supportValidation.status, "validated");
assert.ok(["pending_retest", "testing", "candidate", "none"].includes(breakoutStructure.supportValidation.status), breakoutStructure.supportValidation.status);

function pullback(history, index, open, high, low, close) {
  return history.concat(candle(index, open, high, low, close, 1000));
}

let afterFirst = breakoutHistory.concat([
  candle(breakoutIndex + 1, 115, 116, 113.5, 114.5, 1000),
  candle(breakoutIndex + 2, 114.5, 115.5, 113.2, 114.2, 980),
]);
afterFirst = pullback(afterFirst, breakoutIndex + 3, 114, 114.4, 110.1, 113.2, 860);
const firstRetest = core.recognizeMarketStructure(afterFirst);
const firstBreakoutSupport = firstRetest.supportCandidates.find((level) => level.source === "pressure_breakout");
assert.ok(firstBreakoutSupport, "missing breakout support after first retest");
assert.notStrictEqual(firstBreakoutSupport.status, "validated", JSON.stringify(firstBreakoutSupport));
assert.ok(["testing", "pending_retest"].includes(firstBreakoutSupport.status), firstBreakoutSupport.status);

let afterSecond = afterFirst.concat([
  candle(breakoutIndex + 4, 113.2, 116, 113, 115.4, 1100),
  candle(breakoutIndex + 5, 115.4, 117, 114, 116.2, 1200),
]);
afterSecond = pullback(afterSecond, breakoutIndex + 6, 111.2, 115, 110.3, 114.6, 900);
const secondRetest = core.recognizeMarketStructure(afterSecond);
const confirmed = secondRetest.supportCandidates.find((level) => level.source === "pressure_breakout");
assert.ok(confirmed, "missing breakout support after second retest");
assert.strictEqual(confirmed.status, "validated", JSON.stringify(confirmed));
assert.ok(confirmed.touches >= 2, `touches ${confirmed.touches}`);

const singleBounce = [];
for (let index = 0; index < 40; index += 1) {
  const close = 120 - index * 0.8;
  const prev = singleBounce.at(-1)?.close || close;
  singleBounce.push(candle(index, prev, Math.max(prev, close) + 0.3, Math.min(prev, close) - 0.3, close, 1000));
}
const troughIndex = singleBounce.length;
singleBounce.push(candle(troughIndex, 88, 89, 80, 86, 1800));
for (let step = 1; step <= 8; step += 1) {
  const close = 86 + step * 0.15;
  const prev = singleBounce.at(-1).close;
  singleBounce.push(candle(troughIndex + step, prev, close + 0.2, close - 0.3, close, 1000));
}
const bounceStructure = core.recognizeMarketStructure(singleBounce);
bounceStructure.supportCandidates.forEach((level) => {
  if (level.price <= 90) {
    assert.notStrictEqual(level.status, "validated", `single bounce validated support ${JSON.stringify(level)}`);
  }
});

const prefix = up.slice(0, 70);
const early = core.recognizeMarketStructure(prefix);
const futureSpike = up.slice(70).map((bar, index) => ({
  ...bar,
  date: dateAt(200 + index),
  open: bar.open + 80,
  high: bar.high + 120,
  low: bar.low + 70,
  close: bar.close + 90,
}));
const samePrefix = core.recognizeMarketStructure(prefix.concat(futureSpike).slice(0, 70));
assert.deepStrictEqual(early, samePrefix);
const later = core.recognizeMarketStructure(prefix.concat(futureSpike));
assert.ok(later.resistanceCandidates.some((level) => level.price > early.resistanceCandidates.reduce((max, level) => Math.max(max, level.price), 0) + 20)
  || later.trendDirection !== early.trendDirection
  || later.supportValidation.price !== early.supportValidation.price);

const withLevels = up;
const levels = [
  { price: withLevels.at(-1).close * 0.97, role: "support" },
  { price: withLevels.at(-1).close * 1.08, role: "effective_resistance" },
  { price: withLevels.at(-1).close * 1.2, role: "breakout_target" },
];
assertDecisionUnchanged(withLevels, frozenDecisions.levels, levels, null);
assertDecisionUnchanged(withLevels, frozenDecisions.position, levels, { entryPrice: withLevels.at(-20).close, entryDate: withLevels.at(-20).date, stopLoss: withLevels.at(-20).close * 0.95 });

assert.strictEqual(upStructure.participatesInScoring, false);
assert.strictEqual(upStructure.weeklyTrendDirection, undefined);
assert.strictEqual(upStructure.weeklyTrendStage, undefined);
assert.strictEqual(upStructure.weeklyTrendBasis, undefined);
assert.strictEqual(upStructure.weeklyTrendStrength, undefined);
assert.strictEqual(upStructure.sellTrendBiasNote, undefined);
assert.strictEqual(downStructure.weeklyTrendDirection, undefined);
assert.strictEqual(upStructure.bypassSupportValidation.participatesInScoring, false);

function redate(bars, offset) {
  return bars.map((bar, index) => ({ ...bar, date: dateAt(offset + index) }));
}
const reversalDown = wave(140, { start: 220, drift: -0.5, amplitude: 1.2 });
const reversalUp = redate(wave(140, { start: reversalDown.at(-1).close, drift: 0.55, amplitude: 1.2 }), 140);
const reversalLater = core.recognizeMarketStructure(reversalDown.concat(reversalUp));

const rangedWeeks = [];
for (let index = 0; index < 180; index += 1) {
  const close = 100 + Math.sin(index / 8) * 14;
  const prev = rangedWeeks.at(-1)?.close || close;
  rangedWeeks.push(candle(index, prev, Math.max(prev, close) + 0.4, Math.min(prev, close) - 0.4, close));
}
const rangeStructure = core.recognizeMarketStructure(rangedWeeks);

function assertValidatedReasons(structure) {
  const seen = [...(structure.supportCandidates || [])];
  if (structure.supportValidation) seen.push(structure.supportValidation);
  if (structure.bypassSupportValidation) seen.push(structure.bypassSupportValidation);
  seen.forEach((level) => {
    if (!level || level.status !== "validated") return;
    const reason = level.validationReason || level.supportValidationReason || "";
    assert.ok(String(reason).trim().length > 0, `validated support missing reason ${JSON.stringify(level)}`);
  });
  (structure.bypassSupportValidation?.validationHistory || []).forEach((entry) => {
    assert.ok(String(entry.validationReason || "").trim().length > 0, JSON.stringify(entry));
  });
}
assertValidatedReasons(upStructure);
assertValidatedReasons(secondRetest);
assertValidatedReasons(rangeStructure);
assertValidatedReasons(reversalLater);
assert.ok(String(confirmed.validationReason || confirmed.supportValidationReason || "").trim().length > 0, JSON.stringify(confirmed));

const bypassAdvice = core.analyze({ history: up });
assert.strictEqual(bypassAdvice.score, frozenDecisions.up.score);
assert.strictEqual(bypassAdvice.action, frozenDecisions.up.action);
assert.strictEqual(bypassAdvice.stage, frozenDecisions.up.stage);
assert.strictEqual(bypassAdvice.bypassParticipatesInScoring, false);
assert.strictEqual(bypassAdvice.weeklyTrendDirection, undefined);
assert.ok(bypassAdvice.bypassBuyReason);
assert.ok(!bypassAdvice.bypassBuyReason.includes("周线"));
assert.ok(bypassAdvice.bypassSupportValidation);

const generated = require("fs").readFileSync("./strategy-core.js", "utf8");
const adviceStart = generated.indexOf("function ruleLibraryAdvice(");
const adviceEnd = generated.indexOf("function analyze(");
assert.ok(adviceStart > 0 && adviceEnd > adviceStart);
const adviceSource = generated.slice(adviceStart, adviceEnd);
assert.ok(!adviceSource.includes("recognizeMarketStructure"));
assert.ok(!adviceSource.includes("trendConfidence"));
assert.ok(!generated.includes("evaluateWeeklyTrendStructure"));
assert.ok(!generated.includes("weeklyTrendDirection"));
assert.ok(!generated.includes("sellTrendBiasNote"));
assert.ok(generated.includes("evaluateSupportPathValidation"));
assert.ok(generated.includes("buildBypassBuyGate"));
assert.ok(generated.includes("function applyHumanReplayOverrides("));
assert.ok(!adviceSource.includes("applyHumanReplayOverrides"));

function overrideBase(extra = {}) {
  return {
    side: "buy",
    action: "buy",
    actionText: "建议买入",
    stage: "上涨延续",
    model: "趋势模型",
    score: 88,
    matched: ["原模型"],
    participatesInScoring: false,
    stopLoss: 95,
    stopRiskPct: 5,
    pressurePlan: { price: 120 },
    bypassBuyEligible: false,
    bypassRiskReward: null,
    bypassStopLossPct: null,
    trendDirection: "上涨",
    trendStage: "上涨延续",
    ...extra,
  };
}
const overrideClose = { close: 100 };
const validatedHuman = { status: "真实支撑", evidence: "急跌修复", evidenceLabel: "急跌修复" };
const bought = core.applyHumanReplayOverrides(overrideBase(), validatedHuman, overrideClose);
assert.strictEqual(bought.action, "buy");
assert.strictEqual(bought.actionText, "建议买入");
assert.strictEqual(bought.score, 88);
assert.strictEqual(bought.model, "趋势模型");
assert.deepStrictEqual(bought.matched, ["原模型"]);
assert.strictEqual(bought.bypassBuyEligible, true);
assert.ok(bought.bypassRiskReward >= 3);

const noEvidence = core.applyHumanReplayOverrides(overrideBase(), { status: "validated", evidence: "" }, overrideClose);
assert.strictEqual(noEvidence.action, "watch");
assert.strictEqual(noEvidence.score, 88);

const pendingOverride = core.applyHumanReplayOverrides(overrideBase(), { status: "testing", evidence: "急跌修复" }, overrideClose);
assert.strictEqual(pendingOverride.action, "watch");
assert.strictEqual(pendingOverride.actionText, "建议观望");
assert.strictEqual(pendingOverride.score, 88);

const broken = core.applyHumanReplayOverrides(overrideBase(), { status: "broken", evidence: "急跌修复" }, overrideClose);
assert.strictEqual(broken.action, "watch");

const noResistance = core.applyHumanReplayOverrides(overrideBase({ pressurePlan: null, stopLoss: 95 }), validatedHuman, overrideClose);
assert.strictEqual(noResistance.action, "watch");
assert.ok(noResistance.bypassBuyReason.includes("未计算"));
assert.ok(!noResistance.bypassBuyReason.includes("120"));

const followBypass = core.applyHumanReplayOverrides(overrideBase({ bypassBuyEligible: true }), { status: "" }, overrideClose);
assert.strictEqual(followBypass.action, "buy");
assert.strictEqual(followBypass.score, 88);

const followBlocked = core.applyHumanReplayOverrides(overrideBase({ bypassBuyEligible: false }), { status: "" }, overrideClose);
assert.strictEqual(followBlocked.action, "watch");

const downBlocked = core.applyHumanReplayOverrides(overrideBase(), {
  ...validatedHuman,
  directionValue: "down",
  directionLabel: "下跌",
  stageValue: "downtrend_continuation",
  stageLabel: "下跌趋势延续",
}, overrideClose);
assert.strictEqual(downBlocked.action, "watch");
assert.strictEqual(downBlocked.trendDirection, "下跌");
assert.strictEqual(downBlocked.trendStage, "下跌趋势延续");
assert.strictEqual(downBlocked.score, 88);
assert.ok(downBlocked.trendBiasNote.includes("下跌"));

const rebound = core.applyHumanReplayOverrides(overrideBase(), {
  ...validatedHuman,
  directionValue: "down",
  directionLabel: "下跌",
  stageValue: "oversold_rebound",
  stageLabel: "下跌趋势中的超跌反弹",
}, overrideClose);
assert.strictEqual(rebound.action, "buy");
assert.ok(rebound.trendBiasNote.includes("超跌反弹"));

const held = core.applyHumanReplayOverrides(overrideBase({
  side: "sell",
  action: "hold_position",
  actionText: "继续持有",
}), { status: "candidate", evidence: "" }, overrideClose);
assert.strictEqual(held.action, "hold_position");
assert.strictEqual(held.score, 88);

const heldSell = core.applyHumanReplayOverrides(overrideBase({
  side: "sell",
  action: "hold_position",
  actionText: "继续持有",
}), { status: "", directionValue: "down", directionLabel: "下跌" }, overrideClose);
assert.strictEqual(heldSell.action, "sell");
assert.strictEqual(heldSell.actionText, "建议卖出");
assert.strictEqual(heldSell.score, 88);

const noFakeSell = core.applyHumanReplayOverrides(overrideBase({
  side: "sell",
  action: "hold_position",
  actionText: "继续持有",
  pressurePlan: null,
}), { status: "", directionValue: "down", directionLabel: "下跌" }, overrideClose);
assert.strictEqual(noFakeSell.action, "hold_position");
assert.ok(noFakeSell.trendBiasNote.includes("不另造卖点"));

const upHold = core.applyHumanReplayOverrides(overrideBase({
  side: "sell",
  action: "sell",
  actionText: "建议卖出",
}), { status: "", directionValue: "up", directionLabel: "上涨" }, overrideClose);
assert.strictEqual(upHold.action, "hold_position");
assert.strictEqual(upHold.actionText, "继续持有");
assert.strictEqual(upHold.score, 88);

console.log("structure recognition checks passed");
console.log(JSON.stringify({
  up: { direction: upStructure.trendDirection, stage: upStructure.trendStage, confidence: upStructure.trendConfidence, support: upStructure.supportValidation },
  down: { direction: downStructure.trendDirection, stage: downStructure.trendStage, confidence: downStructure.trendConfidence },
  chop: { direction: chopStructure.trendDirection, stage: chopStructure.trendStage, confidence: chopStructure.trendConfidence },
  breakout: breakoutStructure.supportValidation,
  firstRetest: firstBreakoutSupport,
  secondRetest: { status: confirmed.status, touches: confirmed.touches, price: confirmed.price },
}, null, 2));
