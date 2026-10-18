const fields = {
  stockName: document.querySelector("#stockName"),
  price: document.querySelector("#price"),
  ma5: document.querySelector("#ma5"),
  ma20: document.querySelector("#ma20"),
  ma60: document.querySelector("#ma60"),
  rsi: document.querySelector("#rsi"),
  macdDif: document.querySelector("#macdDif"),
  macdDea: document.querySelector("#macdDea"),
  volumeRatio: document.querySelector("#volumeRatio"),
  atr: document.querySelector("#atr"),
  support: document.querySelector("#support"),
  resistance: document.querySelector("#resistance"),
  position: document.querySelector("#position"),
  profit: document.querySelector("#profit"),
};

const output = {
  strategyLabel: document.querySelector("#strategyLabel"),
  stockTitle: document.querySelector("#stockTitle"),
  scoreValue: document.querySelector("#scoreValue"),
  scoreRing: document.querySelector("#scoreRing"),
  decisionBox: document.querySelector("#decisionBox"),
  decisionLevel: document.querySelector("#decisionLevel"),
  decisionText: document.querySelector("#decisionText"),
  entryRange: document.querySelector("#entryRange"),
  stopLoss: document.querySelector("#stopLoss"),
  targetPrice: document.querySelector("#targetPrice"),
  signalList: document.querySelector("#signalList"),
  marketState: document.querySelector("#marketState"),
};

const canvas = document.querySelector("#signalChart");
const ctx = canvas ? canvas.getContext("2d") : null;
let activeStrategy = "buy";
let activeView = "replay";
let lastTrainingResult = null;
let lastBuyAnalysis = null;
let stockSearchTimer = null;
let marketSearchTimer = null;
let marketRealtimeTimer = null;
let replayRealtimeTimer = null;
let marketWatchlistSnapshotTimer = null;
let marketState = {
  data: null,
  market: "",
  symbol: "",
  displaySymbol: "",
  name: "",
  realtimeQuote: null,
  realtimeWatchStatus: null,
  watchlist: [],
  position: { status: "flat", entryDate: "", entryPrice: null },
  manualLevels: [],
  frame: "daily",
  visibleCount: 180,
  dragOffset: 0,
  hoverIndex: null,
  hoverY: null,
  drawingLevel: false,
  selectedLevelId: null,
  draggingLevelId: null,
  isDragging: false,
  dragStartX: 0,
  dragStartOffset: 0,
  chartScale: null,
  watchDrag: null,
  watchSuppressClick: false,
};
let backtestState = {
  status: "idle",
  data: null,
  simulationData: null,
  startIndex: 0,
  endIndex: 0,
  currentIndex: 0,
  minBuyScore: 80,
  feeRate: 0,
  equity: 1,
  peakEquity: 1,
  maxDrawdown: 0,
  position: null,
  trades: [],
  signals: [],
  buySignals: 0,
  sellSignals: 0,
  manualLevels: [],
  previousReplayState: null,
  stepExecuted: false,
  blindMode: false,
  blindSymbol: "",
  blindDate: "",
};

let replayState = {
  data: null,
  frame: "daily",
  cursor: 0,
  position: null,
  marketPosition: { status: "flat", entryDate: "", entryPrice: null, stopLoss: null },
  equity: 1,
  log: [],
  visibleCount: 700,
  dragOffset: 0,
  hoverIndex: null,
  hoverY: null,
  isDragging: false,
  dragStartX: 0,
  dragStartOffset: 0,
  dragMoved: false,
  selectedNoteDate: null,
  writeTraining: false,
  blindMode: false,
  blindSymbol: "",
  blindDate: "",
  drawingLevel: false,
  manualLevels: [],
  selectedLevelId: null,
  draggingLevelId: null,
  lastLevelHitId: null,
  suppressNextCanvasClick: false,
  trainingRecords: [],
  sessionId: "",
  trainingStartDate: "",
  aiAdviceFeedback: null,
  autoBreakDrawKeys: [],
  autoLevelSnapshot: null,
  levelCorrections: [],
  dragLevelStart: null,
  serverAdvice: null,
  serverAdviceKey: "",
  serverAdviceStatus: "idle",
};

const TIMEFRAME_LABELS = {
  daily: "\u65e5\u7ebf",
  weekly: "\u5468\u7ebf",
  monthly: "\u6708\u7ebf",
  "5m": "5\u5206\u949f",
  "30m": "30\u5206\u949f",
  "60m": "60\u5206\u949f",
};

function timeframeLabel(frame = replayState.frame) {
  return TIMEFRAME_LABELS[frame] || frame || "\u65e5\u7ebf";
}

function apiUrl(path) {
  return `${window.location.origin}${path}`;
}

const samples = {
  buy: {
    stockName: "示例科技",
    price: 28.6,
    ma5: 28.1,
    ma20: 27.45,
    ma60: 25.8,
    rsi: 58,
    macdDif: 0.32,
    macdDea: 0.18,
    volumeRatio: 1.4,
    atr: 3.2,
    support: 26.7,
    resistance: 30.2,
    position: 30,
    profit: 8.5,
  },
  sell: {
    stockName: "成长制造",
    price: 41.2,
    ma5: 40.9,
    ma20: 39.6,
    ma60: 35.2,
    rsi: 76,
    macdDif: 0.44,
    macdDea: 0.51,
    volumeRatio: 2.1,
    atr: 4.8,
    support: 38.7,
    resistance: 42.4,
    position: 80,
    profit: 24.5,
  },
};

const sampleWeeklyCsv = `date,open,high,low,close,volume
2023-06-16,18.20,19.10,17.80,18.90,120000
2023-06-23,18.95,19.40,18.30,18.70,128000
2023-06-30,18.65,18.90,17.60,17.95,132000
2023-07-07,17.90,18.40,17.30,18.25,118000
2023-07-14,18.20,19.20,18.00,19.05,150000
2023-07-21,19.10,20.30,18.80,20.10,168000
2023-07-28,20.05,20.80,19.40,19.70,141000
2023-08-04,19.65,20.10,18.90,19.20,136000
2023-08-11,19.15,19.80,18.60,19.55,129000
2023-08-18,19.50,21.00,19.20,20.70,174000
2023-08-25,20.75,21.40,20.10,20.40,160000
2023-09-01,20.30,20.60,19.30,19.75,139000
2023-09-08,19.70,20.10,18.95,19.15,131000
2023-09-15,19.10,19.55,18.40,18.85,126000
2023-09-22,18.80,19.70,18.55,19.45,143000
2023-09-29,19.50,20.50,19.20,20.25,162000
2023-10-06,20.20,21.20,19.90,20.90,175000
2023-10-13,20.95,21.55,20.20,20.65,166000
2023-10-20,20.60,21.00,19.70,20.05,149000
2023-10-27,20.00,20.40,19.05,19.35,138000
2023-11-03,19.30,19.80,18.70,19.10,132000
2023-11-10,19.05,20.20,18.95,20.05,151000
2023-11-17,20.00,21.10,19.70,20.85,170000
2023-11-24,20.80,21.60,20.30,21.35,181000
2023-12-01,21.30,22.10,20.80,21.85,190000
2023-12-08,21.80,22.30,21.20,21.55,172000
2023-12-15,21.50,22.00,20.85,21.05,158000
2023-12-22,21.00,21.40,20.20,20.55,146000
2023-12-29,20.50,21.10,20.00,20.95,151000
2024-01-05,21.00,22.00,20.70,21.80,176000
2024-01-12,21.85,22.70,21.40,22.45,198000
2024-01-19,22.40,23.10,21.90,22.10,187000
2024-01-26,22.05,22.50,21.15,21.60,165000
2024-02-02,21.55,21.90,20.70,21.20,150000
2024-02-09,21.15,21.70,20.55,21.45,144000
2024-02-16,21.40,22.40,21.10,22.15,169000
2024-02-23,22.20,23.20,21.80,22.95,205000
2024-03-01,22.90,23.50,22.30,22.65,188000
2024-03-08,22.60,23.00,21.80,22.20,169000
2024-03-15,22.15,22.60,21.40,21.85,155000
2024-03-22,21.80,22.30,21.05,21.30,148000
2024-03-29,21.25,22.00,20.85,21.75,153000
2024-04-05,21.80,22.70,21.40,22.55,178000
2024-04-12,22.60,23.40,22.10,23.20,207000
2024-04-19,23.25,24.10,22.80,23.85,221000
2024-04-26,23.80,24.50,23.15,23.40,202000
2024-05-03,23.35,23.90,22.60,22.95,181000
2024-05-10,22.90,23.60,22.30,23.25,169000
2024-05-17,23.30,24.30,22.90,24.05,214000
2024-05-24,24.10,25.00,23.70,24.75,238000
2024-05-31,24.70,25.40,24.00,24.30,217000
2024-06-07,24.25,24.80,23.50,23.85,190000
2024-06-14,23.80,24.25,23.05,23.35,173000
2024-06-21,23.30,23.90,22.70,23.65,166000
2024-06-28,23.60,24.60,23.20,24.35,194000
2024-07-05,24.40,25.20,23.90,24.95,226000
2024-07-12,25.00,25.80,24.40,25.55,251000
2024-07-19,25.50,26.10,24.80,25.05,230000
2024-07-26,25.00,25.50,24.20,24.55,199000
2024-08-02,24.50,24.95,23.80,24.15,181000
2024-08-09,24.10,24.70,23.50,24.40,174000
2024-08-16,24.45,25.40,24.00,25.20,211000
2024-08-23,25.25,26.20,24.90,25.95,250000
2024-08-30,25.90,26.80,25.20,26.40,275000
2024-09-06,26.35,27.20,25.80,26.75,289000
2024-09-13,26.70,27.45,26.00,26.25,256000
2024-09-20,26.20,26.80,25.40,25.85,224000
2024-09-27,25.80,26.20,24.95,25.30,201000
2024-10-04,25.25,25.90,24.70,25.65,188000
2024-10-11,25.70,26.60,25.20,26.35,219000
2024-10-18,26.40,27.30,25.90,27.05,263000
2024-10-25,27.00,27.80,26.30,27.55,286000
2024-11-01,27.50,28.30,26.90,27.10,254000
2024-11-08,27.05,27.55,26.20,26.65,222000
2024-11-15,26.60,27.10,25.80,26.25,205000
2024-11-22,26.20,26.90,25.50,26.70,197000
2024-11-29,26.75,27.90,26.40,27.65,246000
2024-12-06,27.70,28.80,27.20,28.35,298000
2024-12-13,28.30,29.20,27.80,28.85,320000
2024-12-20,28.80,29.60,28.10,28.40,288000
2024-12-27,28.35,28.90,27.50,27.95,246000
2025-01-03,27.90,28.50,27.10,27.55,220000
2025-01-10,27.50,28.20,26.90,27.85,208000
2025-01-17,27.90,28.90,27.40,28.60,254000
2025-01-24,28.65,29.70,28.10,29.35,312000
2025-01-31,29.30,30.20,28.70,29.80,338000
2025-02-07,29.75,30.60,29.00,29.25,306000
2025-02-14,29.20,29.80,28.30,28.75,264000
2025-02-21,28.70,29.20,27.90,28.30,231000
2025-02-28,28.25,29.00,27.70,28.80,225000
2025-03-07,28.85,30.00,28.40,29.70,286000
2025-03-14,29.75,30.80,29.20,30.45,350000
2025-03-21,30.40,31.30,29.80,30.90,371000
2025-03-28,30.85,31.60,30.10,30.35,323000
2025-04-04,30.30,30.90,29.40,29.85,280000
2025-04-11,29.80,30.40,28.90,29.30,245000
2025-04-18,29.25,29.90,28.50,29.65,230000
2025-04-25,29.70,30.70,29.20,30.45,288000
2025-05-02,30.50,31.50,29.90,31.10,345000
2025-05-09,31.05,32.00,30.40,31.55,378000
2025-05-16,31.50,32.30,30.90,31.05,336000
2025-05-23,31.00,31.60,30.20,30.65,291000
2025-05-30,30.60,31.10,29.70,30.15,260000
2025-06-06,30.10,30.80,29.40,30.50,249000`;

function numberValue(id) {
  const value = Number(fields[id].value);
  return Number.isFinite(value) ? value : 0;
}

function getInputs() {
  return {
    stockName: fields.stockName.value.trim() || "未命名股票",
    price: numberValue("price"),
    ma5: numberValue("ma5"),
    ma20: numberValue("ma20"),
    ma60: numberValue("ma60"),
    rsi: numberValue("rsi"),
    macdDif: numberValue("macdDif"),
    macdDea: numberValue("macdDea"),
    volumeRatio: numberValue("volumeRatio"),
    atr: numberValue("atr"),
    support: numberValue("support"),
    resistance: numberValue("resistance"),
    position: numberValue("position"),
    profit: numberValue("profit"),
    risk: document.querySelector("input[name='risk']:checked").value,
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatPrice(value) {
  return value > 0 ? value.toFixed(2) : "--";
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function riskFactor(risk) {
  return { conservative: 0.82, balanced: 1, aggressive: 1.18 }[risk];
}

function buildSignal(type, title, detail, points) {
  return { type, title, detail, points };
}

function evaluateBuy(data) {
  const signals = [];
  let score = 50;
  const aboveShortTrend = data.price > data.ma5 && data.ma5 > data.ma20;
  const aboveMajorTrend = data.ma20 > data.ma60;
  const macdGolden = data.macdDif > data.macdDea;
  const nearSupport = data.support > 0 && (data.price - data.support) / data.price <= 0.08;
  const farFromResistance = data.resistance > 0 && (data.resistance - data.price) / data.price >= 0.06;
  const volumeHealthy = data.volumeRatio >= 1.1 && data.volumeRatio <= 2.4;
  const rsiHealthy = data.rsi >= 45 && data.rsi <= 68;

  if (aboveShortTrend) {
    score += 13;
    signals.push(buildSignal("positive", "短线趋势向上", "价格站上5日线，且5日线高于20日线，买入后的趋势承接更好。", 13));
  } else {
    score -= 12;
    signals.push(buildSignal("negative", "短线趋势不足", "价格或5日线尚未形成有效上行排列，追入前需要等待确认。", -12));
  }

  if (aboveMajorTrend) {
    score += 10;
    signals.push(buildSignal("positive", "中期结构占优", "20日线高于60日线，说明中期资金结构偏强。", 10));
  } else {
    score -= 8;
    signals.push(buildSignal("negative", "中期结构偏弱", "20日线低于60日线，反弹可能仍受中期趋势压制。", -8));
  }

  if (macdGolden) {
    score += 11;
    signals.push(buildSignal("positive", "MACD保持多头", "DIF高于DEA，动能仍在多方一侧。", 11));
  } else {
    score -= 10;
    signals.push(buildSignal("negative", "MACD动能走弱", "DIF低于DEA，短期上行动能需要重新修复。", -10));
  }

  if (rsiHealthy) {
    score += 9;
    signals.push(buildSignal("positive", "RSI区间健康", "RSI未过热也未过弱，适合用分批方式观察入场。", 9));
  } else if (data.rsi > 72) {
    score -= 12;
    signals.push(buildSignal("negative", "RSI偏热", "RSI过高时回撤概率上升，买点需要更靠近支撑位。", -12));
  } else {
    score -= 6;
    signals.push(buildSignal("neutral", "RSI偏弱", "RSI偏低说明资金尚未明显回流，适合等待放量确认。", -6));
  }

  if (nearSupport && farFromResistance) {
    score += 12;
    signals.push(buildSignal("positive", "盈亏比合理", "价格距离支撑较近、距离压力仍有空间，策略容错更高。", 12));
  } else {
    score -= 7;
    signals.push(buildSignal("neutral", "空间不够理想", "当前位置的支撑或上方空间不够充分，仓位应更克制。", -7));
  }

  if (volumeHealthy) {
    score += 8;
    signals.push(buildSignal("positive", "成交量配合", "成交量温和放大，说明买盘参与度提升但未明显失控。", 8));
  } else if (data.volumeRatio > 2.8) {
    score -= 7;
    signals.push(buildSignal("neutral", "放量过急", "短线资金可能已经拥挤，适合等待回踩而不是一次性追高。", -7));
  } else {
    score -= 6;
    signals.push(buildSignal("negative", "量能不足", "量能未能支持突破，信号可靠性下降。", -6));
  }

  const volatilityPenalty = data.atr > 5 ? 8 : data.atr > 3.8 ? 3 : 0;
  score -= volatilityPenalty;
  if (volatilityPenalty) {
    signals.push(buildSignal("neutral", "波动率偏高", "ATR较高时应降低单次买入比例，并把止损写清楚。", -volatilityPenalty));
  }

  const factor = riskFactor(data.risk);
  const entryLow = Math.max(data.support, data.price * (1 - 0.012 * factor));
  const entryHigh = data.price * (1 + 0.006 * factor);
  const stopLoss = Math.min(data.support * 0.985, data.price * (1 - (data.atr / 100) * 1.15));
  const target = data.resistance > data.price ? data.resistance : data.price * (1 + 0.08 * factor);

  return {
    score: clamp(Math.round(score), 0, 100),
    signals,
    entryRange: `${formatPrice(entryLow)} - ${formatPrice(entryHigh)}`,
    stopLoss: formatPrice(stopLoss),
    targetPrice: formatPrice(target),
  };
}

function evaluateSell(data) {
  const signals = [];
  let score = 45;
  const rsiOverheated = data.rsi >= 72;
  const macdDead = data.macdDif < data.macdDea;
  const nearResistance = data.resistance > 0 && Math.abs(data.resistance - data.price) / data.price <= 0.04;
  const trendBreak = data.price < data.ma5 || data.ma5 < data.ma20;
  const profitEnough = data.profit >= 15;
  const heavyPosition = data.position >= 70;

  if (rsiOverheated) {
    score += 15;
    signals.push(buildSignal("positive", "RSI进入高位", "短期上涨已经偏拥挤，适合考虑分批止盈。", 15));
  } else {
    score -= 7;
    signals.push(buildSignal("neutral", "RSI尚未过热", "若趋势仍强，可以保留核心仓位观察。", -7));
  }

  if (macdDead) {
    score += 14;
    signals.push(buildSignal("positive", "MACD出现转弱", "DIF低于DEA，动能切换时应优先控制回撤。", 14));
  } else {
    score -= 8;
    signals.push(buildSignal("neutral", "MACD仍偏强", "多头动能尚未完全破坏，卖出节奏不宜过急。", -8));
  }

  if (nearResistance) {
    score += 12;
    signals.push(buildSignal("positive", "接近压力区", "价格靠近近20日压力位，继续上行的盈亏比下降。", 12));
  } else {
    score -= 4;
    signals.push(buildSignal("neutral", "距离压力仍有空间", "若没有其他卖出信号，可用移动止盈保护利润。", -4));
  }

  if (trendBreak) {
    score += 13;
    signals.push(buildSignal("positive", "趋势保护触发", "价格跌破5日线或5日线转弱，适合降低短线仓位。", 13));
  } else {
    score -= 6;
    signals.push(buildSignal("neutral", "趋势仍未破坏", "均线结构仍偏强，卖出可以以分批止盈为主。", -6));
  }

  if (profitEnough) {
    score += 10;
    signals.push(buildSignal("positive", "已有可保护利润", "持仓收益较高，优先把浮盈转化为确定性。", 10));
  } else if (data.profit <= -6) {
    score += 9;
    signals.push(buildSignal("negative", "亏损扩大", "跌破计划亏损线时应执行止损，避免亏损失控。", 9));
  } else {
    signals.push(buildSignal("neutral", "盈亏仍在观察区", "当前盈亏未到强制卖出阈值，重点看趋势信号。", 0));
  }

  if (heavyPosition) {
    score += 8;
    signals.push(buildSignal("positive", "仓位偏高", "仓位较重时卖出信号的权重应提高，先降风险再等机会。", 8));
  }

  const factor = riskFactor(data.risk);
  const sellLow = data.resistance > 0 ? Math.min(data.price, data.resistance * 0.985) : data.price * 0.99;
  const sellHigh = data.resistance > 0 ? data.resistance * 1.01 : data.price * 1.025;
  const stopLoss = Math.max(data.ma20 * 0.985, data.price * (1 - (data.atr / 100) * factor));
  const target = data.support > 0 ? data.support : data.price * 0.94;

  return {
    score: clamp(Math.round(score), 0, 100),
    signals,
    entryRange: `${formatPrice(sellLow)} - ${formatPrice(sellHigh)}`,
    stopLoss: formatPrice(stopLoss),
    targetPrice: formatPrice(target),
  };
}

function decisionFor(strategy, score) {
  if (strategy === "buy") {
    if (score >= 75) return ["强买入观察", "趋势、动能和盈亏比同时支持，可按计划分批买入，并把止损放在支撑下方。", "positive"];
    if (score >= 60) return ["小仓位试探", "信号偏积极，但仍有瑕疵，适合先轻仓参与，确认后再加仓。", "neutral"];
    return ["暂不买入", "买入条件不足，优先等待趋势、量能或支撑位置出现更清晰的确认。", "negative"];
  }
  if (score >= 75) return ["主动卖出", "多个卖出条件共振，建议分批止盈或减仓，避免利润快速回撤。", "positive"];
  if (score >= 58) return ["减仓保护", "存在一定卖出压力，适合降低仓位并设置移动止盈。", "neutral"];
  return ["继续持有观察", "强卖出信号不足，可以保留仓位，但需要跟踪均线和止损位。", "negative"];
}

function updateDecisionStyle(type) {
  output.decisionBox.className = `decision ${type}`;
  const color = type === "positive" ? "var(--green)" : type === "negative" ? "var(--red)" : "var(--amber)";
  output.decisionBox.style.borderLeftColor = color;
  output.scoreRing.style.background = `radial-gradient(circle at center, #fff 58%, transparent 59%), conic-gradient(${color} ${Number(output.scoreValue.textContent) * 3.6}deg, #e5eaf0 0deg)`;
}

function renderSignals(signals) {
  output.signalList.innerHTML = signals
    .map((signal) => {
      const icon = signal.type === "positive" ? "+" : signal.type === "negative" ? "-" : "!";
      const points = signal.points > 0 ? `+${signal.points}` : `${signal.points}`;
      return `
        <article class="signal-item ${signal.type}">
          <span class="signal-icon">${icon}</span>
          <div><strong>${signal.title}</strong><p>${signal.detail}</p></div>
          <span class="signal-points">${points} 分</span>
        </article>`;
    })
    .join("");
}

function drawChart(data) {
  if (!canvas || !ctx) return;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const values = [data.support, data.ma60, data.ma20, data.ma5, data.price, data.resistance].filter((value) => value > 0);
  const min = Math.min(...values) * 0.97;
  const max = Math.max(...values) * 1.03;
  const y = (value) => height - 36 - ((value - min) / (max - min || 1)) * (height - 66);

  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i += 1) {
    const gy = 24 + i * ((height - 52) / 4);
    ctx.beginPath();
    ctx.moveTo(28, gy);
    ctx.lineTo(width - 24, gy);
    ctx.stroke();
  }

  const points = [[60, data.ma60], [190, data.ma20], [320, data.ma5], [470, data.price], [620, activeStrategy === "buy" ? data.resistance : data.support]];
  ctx.strokeStyle = activeStrategy === "buy" ? "#16865a" : "#c2413b";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  points.forEach(([x, value], index) => {
    const py = y(value);
    if (index === 0) ctx.moveTo(x, py);
    else ctx.lineTo(x, py);
  });
  ctx.stroke();

  [["支撑", data.support, "#16865a"], ["MA60", data.ma60, "#647284"], ["MA20", data.ma20, "#2369b8"], ["MA5", data.ma5, "#b7791f"], ["现价", data.price, "#17202a"], ["压力", data.resistance, "#c2413b"]].forEach(([label, value, color], index) => {
    if (value <= 0) return;
    const x = 46 + index * 116;
    const py = y(value);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, py, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#17202a";
    ctx.font = "13px Microsoft YaHei, sans-serif";
    ctx.fillText(label, x - 14, Math.min(py + 24, height - 12));
  });
}

function formatLevel(level) {
  if (!level) return "--";
  return `${formatPrice(level.low)} - ${formatPrice(level.high)}`;
}

function buySignalType(result) {
  if (result.model?.worthBuying) return "positive";
  if (result.model?.modelHit) return "neutral";
  return "negative";
}

function buildBuySignals(result) {
  const model = result.model || {};
  const trend = result.trend || {};
  const phase = result.phase || {};
  const rr = model.riskReward == null ? "--" : `${model.riskReward}`;
  const waitPattern = model.waitPattern || {};
  const waitItems = Array.isArray(waitPattern.items) ? waitPattern.items.join("；") : "等待支撑踩稳、突破交易密集区或头肩底等结构确认。";
  const supportText = formatLevel(result.support);
  const resistanceText = formatLevel(result.resistance);
  return [
    buildSignal(
      phase.majorTrend === "uptrend" ? "positive" : phase.majorTrend === "downtrend" ? "negative" : "neutral",
      phase.label || trend.label || "当前阶段",
      phase.detail || trend.detail || "等待阶段数据。",
      phase.majorTrend === "uptrend" ? 18 : phase.majorTrend === "range" ? 8 : -8,
    ),
    buildSignal(
      "neutral",
      "关键价格位置",
      `当前价 ${formatPrice(result.currentPrice)}；当前支撑 ${supportText}；当前压力 ${resistanceText}；近期关键低点 ${formatPrice(phase.recentKeyLow || 0)}；近30周关键低点 ${formatPrice(phase.weeklyKeyLow || 0)}；阶段回撤 ${phase.drawdownPct ?? "--"}%。`,
      0,
    ),
    buildSignal(
      "neutral",
      waitPattern.label || "需要等待的结构形态",
      waitItems,
      0,
    ),
    buildSignal(
      model.modelHit ? "positive" : "neutral",
      model.model || "买入模型",
      model.modelDetail || "等待模型确认。",
      model.modelHit ? 28 : 0,
    ),
    buildSignal(
      model.riskReward >= 3 ? "positive" : "negative",
      `盈亏比 ${rr}`,
      model.riskReward >= 3 ? "止损到上方压力的空间满足大于3的要求。" : "上方压力与止损之间的空间暂不满足大于3的要求。",
      model.riskReward >= 3 ? 24 : -12,
    ),
  ];
}

function renderBuyAnalysis(result) {
  lastBuyAnalysis = result;
  const model = result.model || {};
  const type = buySignalType(result);
  output.strategyLabel.textContent = "买入策略";
  output.stockTitle.textContent = `${displaySecuritySymbol(result, result.symbol)} · ${result.analysisDate}`;
  output.scoreValue.textContent = model.score ?? 0;
  output.decisionLevel.textContent = result.phase?.label || model.decision || "等待分析";
  output.decisionText.textContent = `${model.decision || "结论"}：${model.model || "模型"}，${model.modelDetail || ""}`;
  output.entryRange.textContent = model.entryPrice ? formatPrice(model.entryPrice) : "--";
  output.stopLoss.textContent = model.stopLoss ? `${formatPrice(model.stopLoss)} · ${model.stopBasis}` : "--";
  output.targetPrice.textContent = model.targetPrice ? `${formatPrice(model.targetPrice)} · 盈亏比 ${model.riskReward ?? "--"}` : "--";
  output.marketState.textContent = `买入评分 ${model.score ?? 0}`;
  updateDecisionStyle(type);
  renderSignals(buildBuySignals(result));
  drawChart({
    support: result.support?.mid || result.currentPrice * 0.95,
    ma60: result.support?.high || result.currentPrice * 0.97,
    ma20: result.currentPrice,
    ma5: model.entryPrice || result.currentPrice,
    price: result.currentPrice,
    resistance: result.resistance?.mid || result.currentPrice * 1.06,
  });
  const supportInput = document.querySelector("#buyManualSupport");
  const resistanceInput = document.querySelector("#buyManualResistance");
  if (supportInput && !supportInput.value && result.support) supportInput.value = formatPrice(result.support.mid);
  if (resistanceInput && !resistanceInput.value && result.resistance) resistanceInput.value = formatPrice(result.resistance.mid);
  setStatus("#buyStatus", `当前价 ${formatPrice(result.currentPrice)}，支撑 ${formatLevel(result.support)}，压力 ${formatLevel(result.resistance)}`, type);
}

async function requestBuyAnalysis(successText = "买入分析完成") {
  const button = document.querySelector("#fetchBuyAnalysis");
  const previousText = button?.textContent;
  const payload = {
    symbol: document.querySelector("#buySymbol").value.trim(),
    date: document.querySelector("#buyDate").value,
    supportCorrection: Number(document.querySelector("#buyManualSupport").value) || 0,
    resistanceCorrection: Number(document.querySelector("#buyManualResistance").value) || 0,
  };
  try {
    if (!payload.symbol) throw new Error("\u8bf7\u586b\u5199\u80a1\u7968\u4ee3\u7801\u3002");
    if (button) {
      button.disabled = true;
      button.textContent = "正在拉取真实数据...";
    }
    setStatus("#buyStatus", "正在拉取日线、周线并计算买入模型...", "neutral");
    const response = await fetch(apiUrl("/api/buy-analysis"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "买入分析失败。");
    renderBuyAnalysis(data);
    setStatus("#buyStatus", successText, buySignalType(data));
  } catch (error) {
    setStatus("#buyStatus", error.message, "negative");
    output.decisionLevel.textContent = "分析失败";
    output.decisionText.textContent = error.message;
    updateDecisionStyle("negative");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function recalcBuyRisk() {
  await requestBuyAnalysis("已按修正支撑压力重新计算盈亏比");
}

function replayDailyCursorDate() {
  const candles = replayState.data?.timeframes?.daily || [];
  return candles[replayState.cursor]?.date || "";
}

function currentReplayCandle() {
  const candles = replayState.data?.timeframes?.daily || [];
  return candles[replayState.cursor] || null;
}

function candleTradeDate(candle) {
  return String(candle?.tradeDate || candle?.date || "").slice(0, 10);
}

function replayVisibleCandles() {
  if (!replayState.data) return [];
  const candles = replayState.data.timeframes[replayState.frame] || [];
  const cursorDate = replayDailyCursorDate();
  const visible = candles.filter((item) => candleTradeDate(item) <= cursorDate);
  const maxOffset = Math.max(0, visible.length - replayState.visibleCount);
  replayState.dragOffset = Math.max(0, Math.min(replayState.dragOffset || 0, maxOffset));
  const end = visible.length - replayState.dragOffset;
  const start = Math.max(0, end - replayState.visibleCount);
  return visible.slice(start, end);
}

function clampReplayDragOffset() {
  if (!replayState.data) return;
  const candles = replayState.data.timeframes[replayState.frame] || [];
  const cursorDate = replayDailyCursorDate();
  const visible = candles.filter((item) => candleTradeDate(item) <= cursorDate);
  const maxOffset = Math.max(0, visible.length - replayState.visibleCount);
  replayState.dragOffset = Math.max(0, Math.min(replayState.dragOffset || 0, maxOffset));
}

function sma(values, period) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    const slice = values.slice(index - period + 1, index + 1);
    return slice.reduce((sum, value) => sum + value, 0) / period;
  });
}

function ema(values, period) {
  const factor = 2 / (period + 1);
  const result = [];
  let previous = null;
  values.forEach((value) => {
    previous = previous === null ? value : value * factor + previous * (1 - factor);
    result.push(previous);
  });
  return result;
}

function macdSeries(candles) {
  const closes = candles.map((item) => item.close);
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const dif = closes.map((_, index) => ema12[index] - ema26[index]);
  const dea = ema(dif, 9);
  const hist = dif.map((value, index) => (value - dea[index]) * 2);
  return { dif, dea, hist };
}

function replayAnnotationMap() {
  const notes = new Map();
  replayState.log.forEach((item) => {
    const text = item.action === "hold" ? item.note : item.note || item.reason;
    if (!text) return;
    const existing = notes.get(item.date) || [];
    existing.push({ ...item, annotationText: text });
    notes.set(item.date, existing);
  });
  return notes;
}

function replayActionLabel(action) {
  return action === "buy" ? "买入" : action === "sell" ? "卖出" : "观望";
}

function updateReplayWriteToggle() {
  const button = document.querySelector("#replayWriteToggle");
  if (!button) return;
  button.textContent = replayState.writeTraining ? "\u8bad\u7ec3\u6a21\u5f0f" : "\u884c\u60c5\u6a21\u5f0f";
  button.setAttribute("aria-pressed", replayState.writeTraining ? "true" : "false");
  button.classList.toggle("active", replayState.writeTraining);
  document.querySelector(".decision-actions")?.classList.toggle("hidden", !replayState.writeTraining);
  document.querySelector("#replayPositionCard")?.classList.toggle("hidden", replayState.writeTraining);
  if (!replayState.writeTraining) document.querySelector("#aiFeedbackPanel")?.classList.add("hidden");
}


function updateReplayBlindUi() {
  const searchInput = document.querySelector("#replayStockSearch");
  const symbolInput = document.querySelector("#replaySymbol");
  const dateInput = document.querySelector("#replayDate");
  const blindSymbol = document.querySelector("#blindSymbol");
  const blindDate = document.querySelector("#blindDate");
  const revealButton = document.querySelector("#revealReplayIdentity");
  const hidden = replayState.blindMode;
  symbolInput?.classList.toggle("hidden", hidden);
  dateInput?.classList.toggle("hidden", hidden);
  blindSymbol?.classList.toggle("hidden", !hidden);
  blindDate?.classList.toggle("hidden", !hidden);
  revealButton?.classList.toggle("hidden", !hidden);
  if (searchInput) {
    searchInput.readOnly = hidden;
    searchInput.value = hidden ? "盲选样本" : searchInput.value === "盲选样本" ? "" : searchInput.value;
  }
  if (blindSymbol) blindSymbol.textContent = hidden ? "股票已隐藏" : "";
  if (blindDate) blindDate.textContent = hidden ? "日期已隐藏" : "";
  updateReplayCurrentDate();
}

async function revealReplayIdentity() {
  replayState.blindMode = false;
  updateReplayBlindUi();
  const symbol = replayState.blindSymbol || document.querySelector("#replaySymbol").value;
  const searchInput = document.querySelector("#replayStockSearch");
  if (symbol && searchInput && !searchInput.value.trim()) {
    try {
      const response = await fetch(apiUrl(`/api/search-stocks?q=${encodeURIComponent(symbol)}&limit=1`), { cache: "no-store" });
      const data = await response.json();
      const match = data.matches?.[0];
      searchInput.value = match?.name ? `${match.name} ${symbol}` : symbol;
    } catch {
      searchInput.value = symbol;
    }
  }
  setStatus("#replayStatus", `已显示：${replayState.blindSymbol || document.querySelector("#replaySymbol").value} / ${replayState.blindDate || document.querySelector("#replayDate").value}`, "neutral");
}

function toggleReplayWriteMode() {
  replayState.writeTraining = !replayState.writeTraining;
  if (!replayState.writeTraining && replayState.data) {
    replayState.marketPosition = loadReplayMarketPosition(replayState.data);
    applyReplayMarketPosition();
  } else if (replayState.writeTraining) {
    syncReplayPositionFromLog();
  }
  updateReplayWriteToggle();
  updateReplayDecisionMode();
  updateReplayUi();
  const message = replayState.writeTraining
    ? "\u5df2\u5207\u6362\u4e3a\u8bad\u7ec3\u6a21\u5f0f\uff0c\u4e70\u5165\u3001\u5356\u51fa\u3001\u89c2\u671b\u64cd\u4f5c\u4f1a\u663e\u793a\u5e76\u53ef\u5199\u5165\u8bad\u7ec3\u96c6\u3002"
    : "\u5df2\u5207\u6362\u4e3a\u884c\u60c5\u6a21\u5f0f\uff0c\u4ec5\u67e5\u770b\u884c\u60c5\u548cAI\u5efa\u8bae\uff0c\u4e0d\u663e\u793a\u4e70\u5165\u3001\u5356\u51fa\u3001\u89c2\u671b\u64cd\u4f5c\u3002";
  setStatus("#replayStatus", message, replayState.writeTraining ? "positive" : "neutral");
}


function updateReplayDecisionMode() {
  const hasPosition = Boolean(replayState.position);
  const marketMode = !replayState.writeTraining;
  document.querySelector(".decision-actions")?.classList.toggle("hidden", marketMode);
  document.querySelector(".decision-buy-entry")?.classList.toggle("hidden", marketMode || hasPosition);
  document.querySelector(".decision-sell-entry")?.classList.toggle("hidden", marketMode || !hasPosition);
}


function updateBuyStopLossVisibility({ clearWhenHidden = true } = {}) {
  const hasBuyReason = Boolean(document.querySelector("#replayBuyReason")?.value.trim());
  document.querySelectorAll(".buy-stop-field").forEach((field) => {
    field.classList.toggle("hidden", !hasBuyReason);
  });
  if (!hasBuyReason && clearWhenHidden) {
    const stopLoss = document.querySelector("#replayStopLoss");
    const stopLossReason = document.querySelector("#replayStopLossReason");
    if (stopLoss) stopLoss.value = "";
    if (stopLossReason) stopLossReason.value = "";
  }
}

function hideStockSearchResults() {
  const panel = document.querySelector("#stockSearchResults");
  if (!panel) return;
  panel.classList.add("hidden");
  panel.innerHTML = "";
}

function selectStockSearchResult(match) {
  const symbolInput = document.querySelector("#replaySymbol");
  const searchInput = document.querySelector("#replayStockSearch");
  if (symbolInput) symbolInput.value = match.symbol;
  const displaySymbol = match.displaySymbol || match.symbol;
  if (searchInput) searchInput.value = match.name ? `${match.name} ${displaySymbol}` : displaySymbol;
  hideStockSearchResults();
  setStatus("#replayStatus", `已选择 ${match.name || "股票"} ${displaySymbol}。`, "neutral");
}

function renderStockSearchResults(matches = []) {
  const panel = document.querySelector("#stockSearchResults");
  if (!panel) return;
  if (!matches.length) {
    panel.innerHTML = `<div class="stock-search-option"><span></span><strong>未找到匹配股票</strong><small>可直接输入代码</small></div>`;
    panel.classList.remove("hidden");
    return;
  }
  panel.innerHTML = matches.map((match) => `
    <button class="stock-search-option" type="button" data-symbol="${escapeHtml(match.symbol)}" data-name="${escapeHtml(match.name || "")}" data-initials="${escapeHtml(match.initials || "")}" data-market="${escapeHtml(match.market || "")}" data-display-symbol="${escapeHtml(match.displaySymbol || match.symbol)}">
      <span>${escapeHtml(match.displaySymbol || match.symbol)}</span>
      <strong>${escapeHtml(match.name || "名称未收录")}</strong>
      <small>${escapeHtml(match.market === "hk" ? "港股" : match.market === "futures" ? "期货" : match.initials || "")}</small>
    </button>
  `).join("");
  panel.classList.remove("hidden");
}

async function searchReplayStock() {
  const input = document.querySelector("#replayStockSearch");
  if (!input) return;
  if (replayState.blindMode) {
    hideStockSearchResults();
    return;
  }
  const query = input.value.trim();
  if (!query) {
    hideStockSearchResults();
    return;
  }
  if (isDirectSecurityCode(query)) {
    document.querySelector("#replaySymbol").value = query;
    hideStockSearchResults();
    return;
  }
  try {
    const response = await fetch(apiUrl(`/api/search-stocks?q=${encodeURIComponent(query)}&limit=20`));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "股票搜索失败。");
    const matches = data.matches || [];
    const exact = matches.length === 1 && (
      matches[0].name === query ||
      matches[0].initials === query.toUpperCase()
    );
    if (exact) {
      selectStockSearchResult(matches[0]);
      return;
    }
    renderStockSearchResults(matches);
  } catch (error) {
    renderStockSearchResults([]);
    setStatus("#replayStatus", error.message, "negative");
  }
}

function scheduleReplayStockSearch() {
  window.clearTimeout(stockSearchTimer);
  stockSearchTimer = window.setTimeout(searchReplayStock, 220);
}

function isDirectSecurityCode(value = "") {
  const text = String(value || "").trim();
  return /^\d{6}$/.test(text)
    || /^\d{5}$/.test(text)
    || /^HK[:._-]?\d{1,5}(\.HK)?$/i.test(text)
    || /^\d{1,5}\.HK$/i.test(text)
    || /^[A-Z]{1,4}\d{2,4}([._-]?[A-Z]+)?$/i.test(text)
    || /^\d{1,3}#[A-Z0-9]+$/i.test(text);
}

const MARKET_WATCHLIST_KEY = "trading-advice:watchlist:v1";
const MARKET_LEVEL_STORAGE_PREFIX = "trading-advice:market-levels:v1";
const MARKET_POSITION_STORAGE_PREFIX = "trading-advice:market-position:v1";

function hideMarketStockSearchResults() {
  const panel = document.querySelector("#marketStockSearchResults");
  if (!panel) return;
  panel.classList.add("hidden");
  panel.innerHTML = "";
}

function loadMarketWatchlist() {
  try {
    const items = JSON.parse(window.localStorage.getItem(MARKET_WATCHLIST_KEY) || "[]");
    marketState.watchlist = Array.isArray(items) ? items : [];
  } catch {
    marketState.watchlist = [];
  }
}

function saveMarketWatchlist() {
  try {
    window.localStorage.setItem(MARKET_WATCHLIST_KEY, JSON.stringify(marketState.watchlist || []));
  } catch {
    // Ignore storage failures in embedded browsers.
  }
}

function marketWatchKey(symbol, market = "cn") {
  return `${market || "cn"}:${symbol || ""}`;
}

function isMarketWatchlisted(symbol = marketState.symbol, market = marketState.market) {
  const key = marketWatchKey(symbol, market);
  return (marketState.watchlist || []).some((item) => marketWatchKey(item.symbol, item.market) === key);
}

async function syncMarketRealtimeWatchlist() {
  try {
    const response = await fetch(apiUrl("/api/realtime-watchlist"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: marketState.watchlist || [], replace: true }),
    });
    const data = await response.json();
    if (response.ok) marketState.realtimeWatchStatus = data;
  } catch {
    // The local watchlist remains usable even if the realtime bridge is offline.
  }
}

async function refreshMarketRealtimeSubscriptionStatus() {
  try {
    const response = await fetch(apiUrl("/api/realtime-watchlist"), { cache: "no-store" });
    const data = await response.json();
    if (response.ok) {
      marketState.realtimeWatchStatus = data;
      return data;
    }
  } catch {
    // Keep the last known subscription status if the local server is busy.
  }
  return marketState.realtimeWatchStatus;
}

function marketLevelRole(level) {
  if (level && LEVEL_ROLE_LABELS[level.role]) return level.role;
  const current = marketCandles().at(-1)?.close || 0;
  return Number(level?.price) <= current ? "support" : "effective_resistance";
}

function marketLevelSide(level) {
  return levelSideFromRole(marketLevelRole(level));
}

function serializeMarketLevel(level) {
  if (!level) return null;
  const role = marketLevelRole(level);
  return {
    id: level.id,
    price: Number(level.price) || null,
    side: levelSideFromRole(role),
    role,
    roleLabel: levelRoleLabel(role),
    reason: level.reason || "",
    auto: Boolean(level.auto),
    score: level.score ?? null,
  };
}

function marketLevelStorageKey() {
  if (!marketState.symbol) return "";
  const market = String(marketState.market || "cn").toLowerCase();
  const symbol = String(marketState.symbol).trim().toUpperCase()
    .replace(/^HK[:._-]?/, "")
    .replace(/^31#/, "")
    .split(/[.:]/)[0];
  return `${MARKET_LEVEL_STORAGE_PREFIX}:${market}:${symbol}`;
}

function defaultMarketPosition() {
  return { status: "flat", entryDate: "", entryPrice: null, stopLoss: null };
}

function normalizeMarketPosition(payload) {
  const status = payload?.status === "held" ? "held" : "flat";
  const entryPrice = Number(payload?.entryPrice);
  const stopLoss = Number(payload?.stopLoss);
  return {
    status,
    entryDate: status === "held" ? String(payload?.entryDate || "") : "",
    entryPrice: status === "held" && Number.isFinite(entryPrice) && entryPrice > 0 ? entryPrice : null,
    stopLoss: status === "held" && Number.isFinite(stopLoss) && stopLoss > 0 ? stopLoss : null,
  };
}

function marketPositionStorageKey(symbol = marketState.symbol, market = marketState.market) {
  if (!symbol) return "";
  return `${MARKET_POSITION_STORAGE_PREFIX}:${market || "cn"}:${symbol}`;
}

function loadMarketPosition() {
  try {
    const key = marketPositionStorageKey();
    if (!key) return defaultMarketPosition();
    return normalizeMarketPosition(JSON.parse(window.localStorage.getItem(key) || "null"));
  } catch {
    return defaultMarketPosition();
  }
}

function saveMarketPosition() {
  try {
    const key = marketPositionStorageKey();
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify({
      ...normalizeMarketPosition(marketState.position),
      savedAt: new Date().toISOString(),
      market: marketState.market || "cn",
      symbol: marketState.symbol,
    }));
  } catch {
    // Ignore storage failures in embedded browsers.
  }
}

function marketPositionForAdvice() {
  const position = normalizeMarketPosition(marketState.position);
  if (position.status !== "held") return null;
  if (!position.entryDate || !(Number(position.entryPrice) > 0) || !(Number(position.stopLoss) > 0)) return null;
  return {
    entryDate: position.entryDate,
    entryPrice: Number(position.entryPrice),
    stopLoss: Number(position.stopLoss),
    stopLossReason: "\u5f53\u524d\u72b6\u6001\u624b\u52a8\u8bb0\u5f55\u6b62\u635f",
    reason: "\u884c\u60c5\u6a21\u5f0f\u624b\u52a8\u8bb0\u5f55\u6301\u4ed3",
  };
}

function updateMarketPositionUi() {
  const position = normalizeMarketPosition(marketState.position);
  const status = position.status;
  document.querySelectorAll("input[name='marketPositionStatus']").forEach((input) => {
    input.checked = input.value === status;
  });
  const fields = document.querySelector("#marketPositionFields");
  fields?.classList.toggle("hidden", status !== "held");
  const entryDate = document.querySelector("#marketEntryDate");
  const entryPrice = document.querySelector("#marketEntryPrice");
  const stopLoss = document.querySelector("#marketStopLoss");
  if (entryDate) entryDate.value = position.entryDate || "";
  if (entryPrice) entryPrice.value = position.entryPrice ? String(position.entryPrice) : "";
  if (stopLoss) stopLoss.value = position.stopLoss ? String(position.stopLoss) : "";
  const summary = document.querySelector("#marketPositionSummary");
  if (summary) {
    summary.textContent = status === "held"
      ? `\u5df2\u6301\u4ed3${position.entryDate && position.entryPrice && position.stopLoss ? `\uff1a\u4e70\u5165 ${position.entryDate} / ${formatPrice(position.entryPrice)}\uff0c\u6b62\u635f ${formatPrice(position.stopLoss)}` : "\uff1a\u8bf7\u586b\u5199\u4e70\u5165\u65e5\u671f\u3001\u4e70\u5165\u4ef7\u683c\u548c\u6b62\u635f\u4ef7\u683c"}`
      : "\u672a\u6301\u4ed3";
  }
}

function readMarketPositionFromUi() {
  const status = document.querySelector("input[name='marketPositionStatus']:checked")?.value === "held" ? "held" : "flat";
  const entryPrice = Number(document.querySelector("#marketEntryPrice")?.value);
  return normalizeMarketPosition({
    status,
    entryDate: document.querySelector("#marketEntryDate")?.value || "",
    entryPrice,
    stopLoss: Number(document.querySelector("#marketStopLoss")?.value),
  });
}

function syncMarketPositionFromUi({ refreshAdvice = true } = {}) {
  marketState.position = readMarketPositionFromUi();
  saveMarketPosition();
  updateMarketPositionUi();
  if (refreshAdvice && marketState.symbol) {
    requestMarketAiAdvice()
      .catch((error) => setStatus("#marketStatus", error.message, "negative"));
  }
}

function replayPositionStorageKey(data = replayState.data) {
  if (!data?.symbol) return "";
  return `${MARKET_POSITION_STORAGE_PREFIX}:${data.market || "cn"}:${data.symbol}`;
}

function loadReplayMarketPosition(data = replayState.data) {
  try {
    const key = replayPositionStorageKey(data);
    if (!key) return defaultMarketPosition();
    return normalizeMarketPosition(JSON.parse(window.localStorage.getItem(key) || "null"));
  } catch {
    return defaultMarketPosition();
  }
}

function saveReplayMarketPosition() {
  try {
    const key = replayPositionStorageKey();
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify({
      ...normalizeMarketPosition(replayState.marketPosition),
      savedAt: new Date().toISOString(),
      market: replayState.data?.market || "cn",
      symbol: replayState.data?.symbol || "",
    }));
  } catch {
    // Ignore storage failures in embedded browsers.
  }
}

function replayMarketPositionForAdvice() {
  const position = normalizeMarketPosition(replayState.marketPosition);
  if (position.status !== "held") return null;
  if (!position.entryDate || !(Number(position.entryPrice) > 0) || !(Number(position.stopLoss) > 0)) return null;
  return {
    entryDate: position.entryDate,
    entryPrice: Number(position.entryPrice),
    stopLoss: Number(position.stopLoss),
    stopLossReason: "\u5f53\u524d\u72b6\u6001\u624b\u52a8\u8bb0\u5f55\u6b62\u635f",
    reason: "\u884c\u60c5\u6a21\u5f0f\u624b\u52a8\u8bb0\u5f55\u6301\u4ed3",
  };
}

function applyReplayMarketPosition() {
  if (replayState.writeTraining) return;
  replayState.position = replayMarketPositionForAdvice();
  replayState.equity = 1;
}

function updateReplayPositionUi() {
  const card = document.querySelector("#replayPositionCard");
  if (card) card.classList.toggle("hidden", replayState.writeTraining);
  const position = normalizeMarketPosition(replayState.marketPosition);
  document.querySelectorAll("input[name='replayPositionStatus']").forEach((input) => {
    input.checked = input.value === position.status;
  });
  document.querySelector("#replayPositionFields")?.classList.toggle("hidden", position.status !== "held");
  const entryDate = document.querySelector("#replayEntryDateInput");
  const entryPrice = document.querySelector("#replayEntryPriceInput");
  const stopLoss = document.querySelector("#replayStopLossInput");
  if (entryDate) entryDate.value = position.entryDate || "";
  if (entryPrice) entryPrice.value = position.entryPrice ? String(position.entryPrice) : "";
  if (stopLoss) stopLoss.value = position.stopLoss ? String(position.stopLoss) : "";
  const summary = document.querySelector("#replayPositionSummary");
  if (summary) {
    summary.textContent = position.status === "held"
      ? `\u5df2\u6301\u4ed3${position.entryDate && position.entryPrice && position.stopLoss ? `\uff1a\u4e70\u5165 ${position.entryDate} / ${formatPrice(position.entryPrice)}\uff0c\u6b62\u635f ${formatPrice(position.stopLoss)}` : "\uff1a\u8bf7\u586b\u5199\u4e70\u5165\u65e5\u671f\u3001\u4e70\u5165\u4ef7\u683c\u548c\u6b62\u635f\u4ef7\u683c"}`
      : "\u672a\u6301\u4ed3";
  }
}

function readReplayPositionFromUi() {
  const status = document.querySelector("input[name='replayPositionStatus']:checked")?.value === "held" ? "held" : "flat";
  return normalizeMarketPosition({
    status,
    entryDate: document.querySelector("#replayEntryDateInput")?.value || "",
    entryPrice: Number(document.querySelector("#replayEntryPriceInput")?.value),
    stopLoss: Number(document.querySelector("#replayStopLossInput")?.value),
  });
}

function syncReplayPositionFromUi() {
  replayState.marketPosition = readReplayPositionFromUi();
  saveReplayMarketPosition();
  applyReplayMarketPosition();
  updateReplayPositionUi();
  updateReplayUi();
}

function loadMarketLevels() {
  try {
    const key = marketLevelStorageKey();
    if (!key) return [];
    let payload = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!payload && marketState.symbol) {
      const legacyKey = `${MARKET_LEVEL_STORAGE_PREFIX}:${marketState.market || "cn"}:${marketState.symbol}`;
      payload = JSON.parse(window.localStorage.getItem(legacyKey) || "null");
      if (payload) window.localStorage.setItem(key, JSON.stringify(payload));
    }
    const levels = Array.isArray(payload?.levels) ? payload.levels : Array.isArray(payload) ? payload : [];
    return levels.map(normalizeStoredLevel).filter(Boolean).sort((a, b) => a.price - b.price);
  } catch {
    return [];
  }
}

function saveMarketLevels() {
  try {
    const key = marketLevelStorageKey();
    if (!key) return;
    window.localStorage.setItem(key, JSON.stringify({
      savedAt: new Date().toISOString(),
      market: marketState.market || "cn",
      symbol: marketState.symbol,
      levels: (marketState.manualLevels || []).map(serializeMarketLevel).filter(Boolean),
    }));
  } catch {
    // Ignore storage failures in embedded browsers.
  }
}

function updateMarketLevelToolUi() {
  document.querySelector("#marketDrawLevelLine")?.classList.toggle("active", marketState.drawingLevel);
  const selected = (marketState.manualLevels || []).find((level) => level.id === marketState.selectedLevelId);
  document.querySelector("#marketSelectedLevelTools")?.classList.toggle("hidden", !selected);
  const reasonInput = document.querySelector("#marketSelectedLevelReason");
  const roleInput = document.querySelector("#marketSelectedLevelRole");
  if (selected) {
    if (reasonInput) reasonInput.value = selected.reason || "";
    if (roleInput) roleInput.value = marketLevelRole(selected);
  }
  const info = document.querySelector("#marketActiveLevelInfo");
  if (!info) return;
  if (marketState.drawingLevel) {
    info.textContent = "\u753b\u7ebf\u6a21\u5f0f\uff1a\u70b9\u51fb\u4ef7\u683c\u533a\u6dfb\u52a0\u4e00\u6761\u7ebf";
  } else if (selected) {
    info.textContent = `\u5df2\u9009\u4e2d${levelRoleLabel(marketLevelRole(selected))} ${formatPrice(selected.price)}\uff0c\u53ef\u62d6\u52a8\u8c03\u6574\u6216\u5199\u5165\u539f\u56e0`;
  } else {
    info.textContent = "\u6b63\u5e38\u6d4f\u89c8\uff1a\u53ef\u70b9\u51fb\u753b\u7ebf\u6216\u5207\u6362\u7ea7\u522b";
  }
}

function updateMarketTimeframeUi() {
  document.querySelectorAll(".market-timeframe-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.frame === marketState.frame);
  });
}

function renderWatchlistInto(list, count) {
  if (count) count.textContent = `${marketState.watchlist.length} \u53ea`;
  if (!list) return;
  if (!marketState.watchlist.length) {
    list.innerHTML = `<div class="dataset-empty">\u6682\u65e0\u81ea\u9009\u80a1\uff0c\u53ef\u5728\u884c\u60c5\u9875\u6216\u5f53\u524d\u52a0\u8f7d\u54c1\u79cd\u4e2d\u52a0\u5165\u3002</div>`;
    return;
  }
  const metricText = (item) => {
    const price = Number(item.latestClose);
    const pct = Number(item.changePct);
    if (!Number.isFinite(price)) return `<span class="watchlist-price muted">--</span>`;
    const pctText = Number.isFinite(pct) ? formatPercent(pct) : "--";
    const pctClass = Number.isFinite(pct) && pct > 0 ? "positive-text" : Number.isFinite(pct) && pct < 0 ? "negative-text" : "";
    return `<span class="watchlist-price">${formatPrice(price)}</span><span class="watchlist-change ${pctClass}">${pctText}</span>`;
  };
  const itemTitle = (item) => item.name || item.displayName || item.displaySymbol || item.symbol;
  const itemMeta = (item) => {
    const sourceText = item.latestSource === "qmt_realtime" ? " \u00b7 QMT" : "";
    const timeText = item.latestSource === "qmt_realtime"
      && item.latestTimeSource !== "qmt_raw"
      ? ` \u00b7 ${formatRealtimeTimestamp(null)}`
      : item.latestSource === "qmt_realtime"
      ? ` \u00b7 ${formatRealtimeTimestamp(item.latestTime)}`
      : (item.latestTime ? ` \u00b7 ${formatSourceTimestamp(item.latestTime)}` : "");
    return `${escapeHtml(item.displaySymbol || item.symbol)}${item.latestDate ? ` &middot; ${escapeHtml(item.latestDate)}` : ""}${escapeHtml(timeText)}${sourceText}`;
  };
  list.innerHTML = marketState.watchlist.map((item) => `
    <div class="watchlist-item" data-symbol="${escapeHtml(item.symbol)}" data-market="${escapeHtml(item.market || "")}">
      <button class="watchlist-main" type="button" data-symbol="${escapeHtml(item.symbol)}" data-market="${escapeHtml(item.market || "")}">
        <span class="watchlist-drag-handle" aria-hidden="true">&#9776;</span>
        <span class="watchlist-title">
          <strong>${escapeHtml(itemTitle(item))}</strong>
          <small>${itemMeta(item)}</small>
        </span>
        <span class="watchlist-metrics">${metricText(item)}</span>
      </button>
      <button class="watchlist-remove" type="button" data-symbol="${escapeHtml(item.symbol)}" data-market="${escapeHtml(item.market || "")}">\u5220\u9664</button>
    </div>
  `).join("");
}


function renderMarketWatchlist() {
  renderWatchlistInto(document.querySelector("#watchlist"), document.querySelector("#watchlistCount"));
  renderWatchlistInto(document.querySelector("#trainingWatchlist"), document.querySelector("#trainingWatchlistCount"));
}


function marketDisplayTitle() {
  const name = marketState.name || "";
  const code = marketState.displaySymbol || marketState.symbol || "";
  if (name && code) return `${name} ${code}`;
  return code || "\u8bf7\u9009\u62e9\u80a1\u7968";
}

function mergeWatchlistSnapshot(items = []) {
  const byKey = new Map(items.map((item) => [marketWatchKey(item.symbol, item.market), item]));
  let changed = false;
  marketState.watchlist = (marketState.watchlist || []).map((item) => {
    const snapshot = byKey.get(marketWatchKey(item.symbol, item.market));
    if (!snapshot) return item;
    changed = true;
    return {
      ...item,
      ...snapshot,
      name: snapshot.name || item.name || "",
      displaySymbol: snapshot.displaySymbol || item.displaySymbol || item.symbol,
    };
  });
  if (changed) saveMarketWatchlist();
  return changed;
}

async function refreshMarketWatchlistSnapshot() {
  if (!marketState.watchlist.length) {
    renderMarketWatchlist();
    return;
  }
  try {
    const response = await fetch(apiUrl("/api/market-watchlist-snapshot"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbols: marketState.watchlist }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "watchlist snapshot failed");
    if (mergeWatchlistSnapshot(data.items || [])) renderMarketWatchlist();
    updateMarketHeader();
  } catch {
    // Keep the saved watchlist visible even if local quote enrichment fails.
  }
}

function startMarketWatchlistSnapshotPolling() {
  window.clearInterval(marketWatchlistSnapshotTimer);
  refreshMarketWatchlistSnapshot();
  marketWatchlistSnapshotTimer = null;
}

function setTrainingWatchlistCollapsed(collapsed) {
  const layout = document.querySelector("#replayView .replay-layout");
  layout?.classList.toggle("watchlist-collapsed", collapsed);
  document.querySelector("#expandTrainingWatchlist")?.classList.toggle("hidden", !collapsed);
  const button = document.querySelector("#toggleTrainingWatchlist");
  if (button) {
    button.textContent = "\u6536\u8d77";
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
  }
  window.setTimeout(() => { updateReplayUi(); drawMarketChart(); }, 60);
}

function toggleTrainingWatchlist() {
  const layout = document.querySelector("#replayView .replay-layout");
  setTrainingWatchlistCollapsed(!layout?.classList.contains("watchlist-collapsed"));
}


function watchlistItemKeyFromElement(element) {
  if (!element) return "";
  return marketWatchKey(element.dataset.symbol, element.dataset.market || "cn");
}

function startWatchlistLongPress(event) {
  const item = event.target.closest(".watchlist-item");
  if (!item || event.target.closest(".watchlist-remove")) return;
  window.clearTimeout(marketState.watchDrag?.timer);
  marketState.watchDrag = {
    key: watchlistItemKeyFromElement(item),
    pointerId: event.pointerId,
    dragging: false,
    timer: window.setTimeout(() => {
      if (!marketState.watchDrag) return;
      marketState.watchDrag.dragging = true;
      item.classList.add("dragging");
      item.setPointerCapture?.(event.pointerId);
      setStatus("#marketStatus", "\u5df2\u8fdb\u5165\u81ea\u9009\u80a1\u6392\u5e8f\u6a21\u5f0f\uff0c\u62d6\u52a8\u540e\u677e\u624b\u4fdd\u5b58\u3002", "neutral");
    }, 450),
  };
}

function moveWatchlistItem(dragKey, targetKey) {
  if (!dragKey || !targetKey || dragKey === targetKey) return false;
  const from = marketState.watchlist.findIndex((item) => marketWatchKey(item.symbol, item.market) === dragKey);
  const to = marketState.watchlist.findIndex((item) => marketWatchKey(item.symbol, item.market) === targetKey);
  if (from < 0 || to < 0 || from === to) return false;
  const [item] = marketState.watchlist.splice(from, 1);
  marketState.watchlist.splice(to, 0, item);
  return true;
}

function dragWatchlistItem(event) {
  const drag = marketState.watchDrag;
  if (!drag) return;
  if (!drag.dragging) {
    if (Math.abs(event.movementX || 0) + Math.abs(event.movementY || 0) > 8) window.clearTimeout(drag.timer);
    return;
  }
  event.preventDefault();
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".watchlist-item");
  const targetKey = watchlistItemKeyFromElement(target);
  if (!targetKey || targetKey === drag.key) return;
  if (moveWatchlistItem(drag.key, targetKey)) {
    renderMarketWatchlist();
    document.querySelectorAll(".watchlist-item").forEach((item) => {
      item.classList.toggle("dragging", watchlistItemKeyFromElement(item) === drag.key);
    });
  }
}

function endWatchlistDrag() {
  const drag = marketState.watchDrag;
  if (!drag) return;
  window.clearTimeout(drag.timer);
  if (drag.dragging) {
    saveMarketWatchlist();
    syncMarketRealtimeWatchlist();
    renderMarketWatchlist();
    marketState.watchSuppressClick = true;
    setStatus("#marketStatus", "\u81ea\u9009\u80a1\u6392\u5e8f\u5df2\u4fdd\u5b58\u3002", "positive");
  }
  marketState.watchDrag = null;
}

function marketSelectedInput() {
  const input = document.querySelector("#marketStockSearch");
  const value = input?.dataset.symbol || input?.value.trim() || "";
  return {
    symbol: value,
    market: input?.dataset.market || null,
    displaySymbol: input?.dataset.displaySymbol || value,
    name: input?.dataset.name || "",
  };
}

function setMarketSearchSelection(match) {
  const input = document.querySelector("#marketStockSearch");
  if (!input) return;
  const displaySymbol = match.displaySymbol || match.symbol;
  input.value = match.name ? `${match.name} ${displaySymbol}` : displaySymbol;
  input.dataset.symbol = match.symbol;
  input.dataset.market = match.market || "";
  input.dataset.displaySymbol = displaySymbol;
  input.dataset.name = match.name || "";
}

function renderMarketSearchResults(matches = []) {
  const panel = document.querySelector("#marketStockSearchResults");
  if (!panel) return;
  if (!matches.length) {
    panel.innerHTML = `<div class="stock-search-option"><span></span><strong>\u672a\u627e\u5230\u5339\u914d\u80a1\u7968</strong><small>\u53ef\u76f4\u63a5\u8f93\u5165\u4ee3\u7801</small></div>`;
    panel.classList.remove("hidden");
    return;
  }
  panel.innerHTML = matches.map((match) => `
    <button class="stock-search-option" type="button" data-symbol="${escapeHtml(match.symbol)}" data-name="${escapeHtml(match.name || "")}" data-initials="${escapeHtml(match.initials || "")}" data-market="${escapeHtml(match.market || "")}" data-display-symbol="${escapeHtml(match.displaySymbol || match.symbol)}">
      <span>${escapeHtml(match.displaySymbol || match.symbol)}</span>
      <strong>${escapeHtml(match.name || "\u540d\u79f0\u672a\u6536\u5f55")}</strong>
      <small>${escapeHtml(match.market === "hk" ? "\u6e2f\u80a1" : match.initials || "")}</small>
    </button>
  `).join("");
  panel.classList.remove("hidden");
}

async function searchMarketStock() {
  const input = document.querySelector("#marketStockSearch");
  const query = input?.value.trim() || "";
  if (!query) {
    hideMarketStockSearchResults();
    return;
  }
  delete input.dataset.symbol;
  delete input.dataset.market;
  delete input.dataset.displaySymbol;
  delete input.dataset.name;
  if (isDirectSecurityCode(query)) {
    hideMarketStockSearchResults();
    return;
  }
  try {
    const response = await fetch(apiUrl(`/api/search-stocks?q=${encodeURIComponent(query)}&limit=20`), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u80a1\u7968\u641c\u7d22\u5931\u8d25\u3002");
    renderMarketSearchResults(data.matches || []);
  } catch (error) {
    renderMarketSearchResults([]);
    setStatus("#marketStatus", error.message, "negative");
  }
}

function scheduleMarketStockSearch() {
  window.clearTimeout(marketSearchTimer);
  marketSearchTimer = window.setTimeout(searchMarketStock, 220);
}

function marketCandles() {
  return marketState.data?.timeframes?.[marketState.frame || "daily"] || [];
}

function marketVisibleCandles() {
  const candles = marketCandles();
  const maxOffset = Math.max(0, candles.length - marketState.visibleCount);
  marketState.dragOffset = Math.max(0, Math.min(marketState.dragOffset || 0, maxOffset));
  const end = candles.length - marketState.dragOffset;
  const start = Math.max(0, end - marketState.visibleCount);
  return candles.slice(start, end);
}

function clampMarketDragOffset() {
  const candles = marketCandles();
  const maxOffset = Math.max(0, candles.length - marketState.visibleCount);
  marketState.dragOffset = Math.max(0, Math.min(marketState.dragOffset || 0, maxOffset));
}

function resetMarketAiCard(label = "--") {
  const actionNode = document.querySelector("#marketAiActionText");
  if (actionNode) {
    actionNode.className = "rule-advice-action-card watch";
    actionNode.innerHTML = `<span>\u64cd\u4f5c\u5efa\u8bae</span><strong id="marketAiDecision">${escapeHtml(label)}</strong>`;
  } else {
    document.querySelector("#marketAiDecision").textContent = label;
  }
  const stage = document.querySelector("#marketAiStage");
  if (stage) stage.textContent = "\u7b49\u5f85K\u7ebf\u6570\u636e";
  document.querySelector("#marketAiPhase").textContent = "--";
  document.querySelector("#marketAiModel").textContent = "--";
  document.querySelector("#marketAiScore").textContent = "--";
  const body = document.querySelector("#marketAiBody");
  if (body) body.textContent = "\u52a0\u8f7d\u884c\u60c5\u540e\uff0c\u663e\u793aAI\u5efa\u8bae\u3002";
  updateMarketPositionUi();
}

function drawMarketChart() {
  const canvas = document.querySelector("#marketChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const candles = marketVisibleCandles();
  if (!candles.length) {
    marketState.chartScale = null;
    ctx.fillStyle = "#647284";
    ctx.font = "16px Microsoft YaHei, sans-serif";
    const message = marketState.data
      ? `${timeframeLabel(marketState.frame)}\u884c\u60c5\u5c1a\u672a\u5bfc\u5165`
      : "\u8bf7\u9009\u62e9\u80a1\u7968\u67e5\u770bK\u7ebf";
    ctx.fillText(message, 24, 42);
    return;
  }
  const priceTop = 24;
  const priceBottom = Math.round(height * 0.62);
  const volumeTop = priceBottom + 18;
  const volumeBottom = Math.round(height * 0.78);
  const macdTop = volumeBottom + 20;
  const macdBottom = height - 48;
  const levelPrices = (marketState.manualLevels || []).map((level) => Number(level.price)).filter((price) => price > 0);
  const priceSamples = candles.flatMap((item) => [item.high, item.low]).concat(levelPrices);
  const maxPrice = Math.max(...priceSamples) * 1.02;
  const minPrice = Math.min(...priceSamples) * 0.98;
  const y = (value) => priceBottom - ((value - minPrice) / (maxPrice - minPrice || 1)) * (priceBottom - priceTop);
  const chartHeight = priceBottom - priceTop;
  const priceAtY = (py) => maxPrice - ((py - priceTop) / (chartHeight || 1)) * (maxPrice - minPrice);
  marketState.chartScale = { priceTop, priceBottom, macdBottom, y, priceAtY };
  const step = candleStep(width, candles.length);
  const bodyWidth = Math.max(Math.min(step * 0.62, 10), 1);

  ctx.strokeStyle = "#edf1f5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const py = priceTop + i * (chartHeight / 4);
    ctx.beginPath();
    ctx.moveTo(44, py);
    ctx.lineTo(width - 20, py);
    ctx.stroke();
  }
  const lastClose = candles.at(-1)?.close || 0;
  (marketState.manualLevels || []).forEach((level) => {
    const price = Number(level.price);
    if (!price) return;
    const ly = y(price);
    const isSupport = marketLevelSide(level) === "support";
    const selected = level.id === marketState.selectedLevelId;
    const color = isSupport ? "#16865a" : "#c2413b";
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 3 : 1.4;
    ctx.setLineDash(selected ? [] : [6, 5]);
    ctx.beginPath();
    ctx.moveTo(44, ly);
    ctx.lineTo(width - 20, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(`${levelRoleLabel(marketLevelRole(level))} ${formatPrice(price)}`, 50, Math.max(14, ly - 6));
  });
  candles.forEach((item, index) => {
    const x = 48 + index * step;
    const up = item.close >= item.open;
    const color = up ? "#c2413b" : "#16865a";
    ctx.strokeStyle = color;
    ctx.fillStyle = up ? "#fff" : color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y(item.high));
    ctx.lineTo(x, y(item.low));
    ctx.stroke();
    const openY = y(item.open);
    const closeY = y(item.close);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
    ctx.strokeRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    if (!up) ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });

  const closes = candles.map((item) => item.close);
  function drawMa(period, color, label, labelX) {
    const values = sma(closes, period);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    values.forEach((value, index) => {
      if (value == null) return;
      const x = 48 + index * step;
      const py = y(value);
      if (!started) {
        ctx.moveTo(x, py);
        started = true;
      }
      else ctx.lineTo(x, py);
    });
    if (started) ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(label, labelX, 16);
  }
  drawMa(5, "#b7791f", "MA5", 48);
  drawMa(10, "#2369b8", "MA10", 90);
  const maxVolume = Math.max(...candles.map((item) => item.volume || 0), 1);
  candles.forEach((item, index) => {
    const x = 48 + index * step;
    const barHeight = ((item.volume || 0) / maxVolume) * (volumeBottom - volumeTop);
    ctx.fillStyle = item.close >= item.open ? "rgba(194, 65, 59, 0.45)" : "rgba(22, 134, 90, 0.45)";
    ctx.fillRect(x - bodyWidth / 2, volumeBottom - barHeight, bodyWidth, Math.max(barHeight, 1));
  });
  ctx.fillStyle = "#647284";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText("\u6210\u4ea4\u91cf", 48, volumeTop - 5);

  const macd = macdSeries(candles);
  const macdValues = [...macd.dif, ...macd.dea, ...macd.hist].map((value) => Math.abs(value));
  const macdMax = Math.max(...macdValues, 0.01);
  const macdZero = macdTop + (macdBottom - macdTop) / 2;
  const macdY = (value) => macdZero - (value / macdMax) * ((macdBottom - macdTop) / 2);
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(44, macdZero);
  ctx.lineTo(width - 20, macdZero);
  ctx.stroke();
  macd.hist.forEach((value, index) => {
    const x = 48 + index * step;
    const py = macdY(value);
    ctx.fillStyle = value >= 0 ? "rgba(194, 65, 59, 0.55)" : "rgba(22, 134, 90, 0.55)";
    ctx.fillRect(x - bodyWidth / 2, Math.min(py, macdZero), bodyWidth, Math.max(Math.abs(py - macdZero), 1));
  });
  function drawMacdLine(values, color, label, labelX) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = 48 + index * step;
      const py = macdY(value);
      if (index === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, labelX, macdTop - 5);
  }
  ctx.fillStyle = "#647284";
  ctx.fillText("MACD", 48, macdTop - 5);
  drawMacdLine(macd.dif, "#2369b8", "DIF", 104);
  drawMacdLine(macd.dea, "#b7791f", "DEA", 144);

  if (marketState.hoverIndex !== null && candles[marketState.hoverIndex]) {
    const item = candles[marketState.hoverIndex];
    const prevItem = candles[marketState.hoverIndex - 1];
    const changePct = prevItem?.close > 0 ? ((item.close - prevItem.close) / prevItem.close) * 100 : null;
    const x = 48 + marketState.hoverIndex * step;
    const hoverY = Math.max(priceTop, Math.min(priceBottom, marketState.hoverY ?? y(item.close)));
    const hoverPrice = maxPrice - ((hoverY - priceTop) / (chartHeight || 1)) * (maxPrice - minPrice);
    ctx.strokeStyle = "#2369b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, priceTop);
    ctx.lineTo(x, macdBottom);
    ctx.moveTo(44, hoverY);
    ctx.lineTo(width - 20, hoverY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#2369b8";
    ctx.fillRect(44, hoverY - 10, 56, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(formatPrice(hoverPrice), 50, hoverY + 4);
    const lines = [
      `${item.date}  \u5f00:${formatPrice(item.open)} \u6536:${formatPrice(item.close)} \u9ad8:${formatPrice(item.high)} \u4f4e:${formatPrice(item.low)} \u6da8\u8dcc:${changePct === null ? "--" : formatPercent(changePct)}`,
    ];
    ctx.font = "12px Microsoft YaHei, sans-serif";
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxX = 116;
    const boxY = priceTop + 8;
    const boxHeight = 12 + lines.length * 18;
    ctx.fillStyle = "rgba(23, 32, 42, 0.88)";
    ctx.fillRect(boxX, boxY, Math.min(textWidth + 18, width - 136), boxHeight);
    ctx.fillStyle = "#ffffff";
    lines.forEach((line, index) => {
      ctx.fillText(line, boxX + 9, boxY + 19 + index * 18);
    });
  }

  const last = candles.at(-1);
  ctx.fillStyle = "#17202a";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText(`${marketDisplayTitle()}  ${timeframeLabel(marketState.frame)} ${last.date}  O:${formatPrice(last.open)} H:${formatPrice(last.high)} L:${formatPrice(last.low)} C:${formatPrice(last.close)}`, 48, height - 20);
  updateMarketLevelToolUi();
}

function updateMarketHeader() {
  const title = document.querySelector("#marketTitle");
  const subtitle = document.querySelector("#marketSubtitle");
  const source = document.querySelector("#marketDataSource");
  const candles = marketCandles();
  const last = candles.at(-1);
  if (title) title.textContent = marketDisplayTitle();
  if (subtitle) subtitle.textContent = last
    ? `${timeframeLabel(marketState.frame)} ${last.date} \u6536\u76d8 ${formatPrice(last.close)}`
    : `${timeframeLabel(marketState.frame)} --`;
  if (source) source.textContent = marketQuoteSourceText();
}

function marketAdviceActionClass(decision = "") {
  if (/^\u5efa\u8bae\u4e70\u5165/.test(decision)) return "buy";
  if (decision.includes("\u5356\u51fa")) return "sell";
  if (decision.includes("\u6301\u6709")) return "hold_position";
  return "watch";
}

function marketBypassFromAdvice(adviceLike) {
  const daily = marketState.data?.timeframes?.daily || [];
  if (!daily.length) return adviceLike || null;
  const structure = recognizeMarketStructure(daily);
  const lastClose = Number(daily.at(-1)?.close || 0);
  const manual = (marketState.manualLevels || [])
    .map((level) => ({ ...level, price: Number(level.price) }))
    .filter((level) => level.price > 0 && level.price <= lastClose)
    .sort((a, b) => b.price - a.price)[0];
  const bypass = manual
    ? evaluateSupportPathValidation(daily, manual.price, { source: "manual" })
    : structure.bypassSupportValidation;
  const advice = adviceLike || {};
  const pressurePrice = Number(advice.pressurePlan?.price || advice.targetPrice || 0);
  const gate = buildBypassBuyGate({
    stopLoss: advice.stopLoss,
    stopRiskPct: advice.stopRiskPct,
    pressurePlan: pressurePrice > 0 ? { price: pressurePrice } : advice.pressurePlan,
  }, bypass, daily);
  return {
    ...structure,
    bypassSupportValidation: bypass,
    ...gate,
  };
}

function renderMarketAiAdvice(data) {
  const model = data.model || {};
  const decision = model.decision || "--";
  const phase = data.phase?.label || data.trend?.label || "--";
  const actionNode = document.querySelector("#marketAiActionText");
  const scoreNode = document.querySelector("#marketAiScore");
  const stageNode = document.querySelector("#marketAiStage");
  const bodyNode = document.querySelector("#marketAiBody");
  if (actionNode) {
    actionNode.className = `rule-advice-action-card ${marketAdviceActionClass(decision)}`;
    actionNode.innerHTML = `<span>\u64cd\u4f5c\u5efa\u8bae</span><strong id="marketAiDecision">${escapeHtml(decision)}</strong>`;
  }
  if (stageNode) stageNode.textContent = phase;
  if (scoreNode) {
    scoreNode.textContent = model.score != null ? `${Math.round(model.score)}\u5206` : "--";
    scoreNode.className = model.score >= 75 ? "positive-text" : model.score >= 60 ? "" : "negative-text";
  }
  const waitItems = model.waitPattern?.items || [];
  const listHtml = (items = []) => items.length
    ? `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    : `<p class="muted">\u6682\u65e0</p>`;
  const supportText = data.support ? `${formatPrice(data.support.low)} - ${formatPrice(data.support.high)}` : "--";
  const resistanceText = data.resistance ? `${formatPrice(data.resistance.low)} - ${formatPrice(data.resistance.high)}` : "--";
  const planItems = [
    model.entryPrice ? `\u5165\u573a\u53c2\u8003\uff1a${formatPrice(model.entryPrice)}` : "",
    model.stopLoss ? `\u6b62\u635f\uff1a${formatPrice(model.stopLoss)}\uff08${model.stopBasis || "--"}\uff09` : "",
    model.targetPrice ? `\u76ee\u6807\uff1a${formatPrice(model.targetPrice)}` : "",
    model.riskReward ? `\u76c8\u4e8f\u6bd4\uff1a${model.riskReward}` : "",
  ].filter(Boolean);
  if (bodyNode) {
    bodyNode.innerHTML = `
      <div class="rule-advice-section">
        <span>\u5f53\u524d\u72b6\u6001</span>
        <p>\u672a\u6301\u4ed3</p>
      </div>
      <div class="rule-advice-section">
        <span>\u64cd\u4f5c\u5efa\u8bae</span>
        <p>${escapeHtml(decision)}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u5f53\u524d\u9636\u6bb5</span>
        <p>${escapeHtml(phase)}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u5339\u914d\u6a21\u578b</span>
        <p>${escapeHtml(model.model || "--")}${model.score == null ? "" : `\uff0c\u5339\u914d\u5ea6 ${Math.round(model.score)} \u5206`}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u652f\u6491\u538b\u529b</span>
        <p>\u652f\u6491\uff1a${escapeHtml(supportText)}</p>
        <p>\u538b\u529b\uff1a${escapeHtml(resistanceText)}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u4ea4\u6613\u8ba1\u5212</span>
        ${listHtml(planItems)}
      </div>
      <div class="rule-advice-section">
        <span>\u7b49\u5f85\u786e\u8ba4</span>
        ${listHtml(waitItems)}
      </div>
      <div class="rule-advice-section">
        <span>\u8be6\u7ec6\u8bf4\u660e</span>
        <p>${escapeHtml(model.modelDetail || data.trend?.detail || "--")}</p>
      </div>
      ${bypassStructureSectionHtml(marketBypassFromAdvice({
        stopLoss: model.stopLoss,
        pressurePlan: { price: model.targetPrice || data.resistance?.low || null },
        stopRiskPct: model.stopLoss && data.price ? null : null,
      }))}
    `;
  }
  document.querySelector("#marketAiPhase").textContent = phase;
  document.querySelector("#marketAiModel").textContent = model.model || "--";
}

function marketReplayAdvicePayload() {
  if (!marketState.data?.timeframes?.daily?.length) return null;
  const previous = {
    data: replayState.data,
    frame: replayState.frame,
    cursor: replayState.cursor,
    position: replayState.position,
    manualLevels: replayState.manualLevels,
  };
  try {
    const daily = marketState.data.timeframes.daily || [];
    replayState.data = marketState.data;
    replayState.frame = "daily";
    replayState.cursor = Math.max(0, daily.length - 1);
    replayState.position = marketPositionForAdvice();
    replayState.manualLevels = marketState.manualLevels || [];
    return replayServerAdviceRequestData();
  } finally {
    replayState.data = previous.data;
    replayState.frame = previous.frame;
    replayState.cursor = previous.cursor;
    replayState.position = previous.position;
    replayState.manualLevels = previous.manualLevels;
  }
}

function renderMarketRuleAdvice(advice) {
  const actionNode = document.querySelector("#marketAiActionText");
  const scoreNode = document.querySelector("#marketAiScore");
  const stageNode = document.querySelector("#marketAiStage");
  const bodyNode = document.querySelector("#marketAiBody");
  if (!advice) {
    resetMarketAiCard("\u7b49\u5f85K\u7ebf");
    return;
  }
  const sideLabel = advice.side === "sell" ? "\u5356\u51fa\u89c2\u5bdf" : "\u4e70\u5165\u89c2\u5bdf";
  if (actionNode) {
    actionNode.className = `rule-advice-action-card ${advice.action || "watch"}`;
    actionNode.innerHTML = `<span>\u64cd\u4f5c\u5efa\u8bae</span><strong id="marketAiDecision">${escapeHtml(advice.actionText || "--")}</strong>`;
  }
  if (stageNode) stageNode.textContent = advice.stage || "--";
  if (scoreNode) {
    scoreNode.textContent = advice.score == null ? "--" : `${Math.round(advice.score)}\u5206`;
    scoreNode.className = advice.score >= 75 ? "positive-text" : advice.score >= 60 ? "" : "negative-text";
  }
  const listHtml = (items = []) => items.length
    ? `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
    : `<p class="muted">\u6682\u65e0</p>`;
  if (bodyNode) {
    bodyNode.innerHTML = `
      <div class="rule-advice-section">
        <span>\u5f53\u524d\u72b6\u6001</span>
        <p>${advice.side === "sell" ? "\u5df2\u6301\u4ed3" : "\u672a\u6301\u4ed3"}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u64cd\u4f5c\u5efa\u8bae</span>
        <p>${escapeHtml(advice.actionText || "--")}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u5f53\u524d\u9636\u6bb5</span>
        <p>${escapeHtml(advice.stage || "--")}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u5339\u914d\u6a21\u578b</span>
        <p>${escapeHtml(advice.model || "--")}${advice.score == null ? "" : `\uff0c\u5339\u914d\u5ea6 ${Math.round(advice.score)} \u5206`}</p>
      </div>
      <div class="rule-advice-section">
        <span>\u7b26\u5408\u6761\u4ef6</span>
        ${listHtml(advice.matched || [])}
      </div>
      <div class="rule-advice-section">
        <span>\u7f3a\u5931\u6761\u4ef6</span>
        ${listHtml(advice.missing || [])}
      </div>
      <div class="rule-advice-section">
        <span>\u4ea4\u6613\u8ba1\u5212</span>
        ${listHtml(advice.plan || [])}
      </div>
      ${bypassStructureSectionHtml(marketBypassFromAdvice(advice))}
    `;
  }
  document.querySelector("#marketAiPhase").textContent = advice.stage || "--";
  document.querySelector("#marketAiModel").textContent = advice.model || "--";
}

async function requestMarketAiAdvice() {
  if (!marketState.symbol) {
    setStatus("#marketStatus", "\u8bf7\u5148\u9009\u62e9\u80a1\u7968\u3002", "negative");
    return;
  }
  updateMarketPositionUi();
  const position = normalizeMarketPosition(marketState.position);
  if (position.status === "held") {
    if (!marketPositionForAdvice()) {
      renderMarketRuleAdvice({
        score: null,
        side: "sell",
        sideLabel: "\u5356\u51fa\u89c2\u5bdf",
        actionText: "\u8bf7\u5148\u586b\u5199\u4e70\u5165\u65e5\u671f\u3001\u4e70\u5165\u4ef7\u683c\u548c\u6b62\u635f\u4ef7\u683c",
        stage: "\u6301\u4ed3\u4fe1\u606f\u4e0d\u5b8c\u6574",
        model: "\u6301\u4ed3\u72b6\u6001\u8bb0\u5f55",
        matched: ["\u5f53\u524d\u72b6\u6001\u4e3a\u5df2\u6301\u4ed3"],
        missing: ["\u9700\u8981\u4e70\u5165\u65e5\u671f", "\u9700\u8981\u4e70\u5165\u4ef7\u683c", "\u9700\u8981\u6b62\u635f\u4ef7\u683c"],
        plan: ["\u8865\u5145\u6301\u4ed3\u4fe1\u606f\u540e\uff0cAI\u5c06\u6309\u5356\u51fa\u89c2\u5bdf\u65b9\u5411\u8bc4\u4f30\u3002"],
      });
      return null;
    }
    const advice = await fetchReplayServerAdvice(marketReplayAdvicePayload());
    renderMarketRuleAdvice(advice);
    return advice;
  }
  const response = await fetch(apiUrl("/api/buy-analysis"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol: marketState.symbol, market: marketState.market || null, date: "", includeRealtime: isMarketWatchlisted() }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI\u5efa\u8bae\u83b7\u53d6\u5931\u8d25\u3002");
  renderMarketAiAdvice(data);
  return data;
}

function formatSourceTimestamp(value) {
  if (!value) return "--";
  const pad = (number) => String(number).padStart(2, "0");
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  if (h === "00" && mi === "00" && s === "00") return `${y}-${mo}-${d}`;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function formatRealtimeTimestamp(value) {
  const text = String(value || "");
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return "\u0051MT\u672a\u8fd4\u56de\u65f6\u5206\u79d2";
  const formatted = formatSourceTimestamp(text);
  return /^\d{4}-\d{2}-\d{2}$/.test(formatted) ? "\u0051MT\u672a\u8fd4\u56de\u65f6\u5206\u79d2" : formatted;
}

function qmtRawQuoteTime(record) {
  return record?.quoteTimeSource ? record.quoteTime : null;
}

function currentRealtimeSubscriptionItem() {
  const status = marketState.realtimeWatchStatus || {};
  const key = marketWatchKey(marketState.symbol, marketState.market);
  return (status.symbols || []).find((item) => marketWatchKey(item.symbol, item.market) === key) || null;
}

function currentWatchlistItem() {
  const key = marketWatchKey(marketState.symbol, marketState.market);
  return (marketState.watchlist || []).find((item) => marketWatchKey(item.symbol, item.market) === key) || null;
}

function marketQuoteSourceText() {
  const quote = marketState.realtimeQuote;
  const watchItem = currentWatchlistItem();
  const hasWatchQmt = watchItem?.latestSource === "qmt_realtime";
  const qmtTime = hasWatchQmt && watchItem.latestTimeSource === "qmt_raw" ? watchItem.latestTime : null;
  const subscription = currentRealtimeSubscriptionItem();
  const subscriptionTime = formatSourceTimestamp(subscription?.updatedAt || marketState.realtimeWatchStatus?.updatedAt);
  const watched = isMarketWatchlisted();

  // helper: best available timestamp for "\u83b7\u53d6\u65f6\u95f4"
  const rawBestTime = quote ? qmtRawQuoteTime(quote) : (hasWatchQmt ? qmtTime : (subscription?.updatedAt || marketState.realtimeWatchStatus?.updatedAt));
  const bestTime = (quote || hasWatchQmt) ? formatRealtimeTimestamp(rawBestTime) : formatSourceTimestamp(rawBestTime);
  const timeText = bestTime !== "--" ? bestTime : "";

  if (!watched) {
    return `\u6570\u636e\u6765\u6e90\uff1a\u672c\u5730K\u7ebf${timeText ? ` \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}` : " \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a--"} \u00b7 \u8ba2\u9605\uff1a\u672a\u52a0\u5165\u81ea\u9009\uff0c\u672a\u8ba2\u9605`;
  }
  if (!subscription) {
    return `\u6570\u636e\u6765\u6e90\uff1a\u672c\u5730K\u7ebf${timeText ? ` \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}` : " \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a--"} \u00b7 \u8ba2\u9605\uff1a\u540c\u6b65\u4e2d`;
  }
  if (!quote) {
    if (hasWatchQmt) {
      return `\u6570\u636e\u6765\u6e90\uff1aQMT\u5b9e\u65f6\u884c\u60c5 \u00b7 \u884c\u60c5\u65e5\u671f\uff1a${watchItem.latestDate || "--"} \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${bestTime} \u00b7 \u8ba2\u9605\uff1a\u5df2\u8ba2\u9605`;
    }
    return `\u6570\u636e\u6765\u6e90\uff1a\u672c\u5730K\u7ebf${timeText ? ` \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}` : " \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a--"} \u00b7 \u8ba2\u9605\uff1a\u5df2\u8bf7\u6c42QMT\u8ba2\u9605\uff0c\u7b49\u5f85\u6865\u63a5 \u00b7 \u8ba2\u9605\u65f6\u95f4\uff1a${subscriptionTime}`;
  }
  return `\u6570\u636e\u6765\u6e90\uff1aQMT\u5b9e\u65f6\u884c\u60c5 \u00b7 \u884c\u60c5\u65e5\u671f\uff1a${quote.trade_date || "--"} \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${bestTime} \u00b7 \u8ba2\u9605\uff1a\u5df2\u8ba2\u9605`;
}

function applyMarketRealtimeQuote(quote) {
  marketState.realtimeQuote = quote || null;
  if (!quote || !marketState.data?.timeframes?.daily) return;
  const daily = marketState.data.timeframes.daily;
  const row = {
    date: quote.trade_date,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.close,
    volume: quote.volume || 0,
    amount: quote.amount || 0,
    source: quote.source || "qmt_realtime",
    receivedAt: quote.receivedAt || null,
    quoteTime: qmtRawQuoteTime(quote),
    quoteTimeSource: quote.quoteTimeSource || null,
    realtime: true,
  };
  const last = daily.at(-1);
  if (last && last.date === row.date) {
    daily[daily.length - 1] = { ...last, ...row };
  } else if (!last || row.date > last.date) {
    daily.push(row);
  }
}

function applyReplayRealtimeQuote(quote) {
  if (!quote || !replayState.data?.timeframes?.daily) return false;
  const daily = replayState.data.timeframes.daily;
  const currentDate = currentReplayCandle()?.date || "";
  const row = {
    date: quote.trade_date,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.close,
    volume: quote.volume || 0,
    amount: quote.amount || 0,
    source: quote.source || "qmt_realtime",
    receivedAt: quote.receivedAt || null,
    quoteTime: qmtRawQuoteTime(quote),
    quoteTimeSource: quote.quoteTimeSource || null,
    realtime: true,
  };
  const index = daily.findIndex((item) => item.date === row.date);
  if (index >= 0) {
    daily[index] = { ...daily[index], ...row };
  } else {
    daily.push(row);
    daily.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }
  // Realtime polling must update the latest bar without pulling a user back to it
  // after they have navigated to a previous trading day.
  const preservedIndex = currentDate ? daily.findIndex((item) => item.date === currentDate) : -1;
  replayState.cursor = preservedIndex >= 0
    ? preservedIndex
    : Math.min(replayState.cursor || 0, daily.length - 1);
  replayState.data.timeframes.weekly = dailyToWeeklyCandles(daily);
  replayState.data.timeframes.monthly = dailyToMonthlyCandles(daily);
  return true;
}

async function refreshReplayRealtimeQuote({ redraw = true } = {}) {
  const data = replayState.data;
  if (!data?.symbol) return null;
  try {
    const url = `/api/realtime-quote?symbol=${encodeURIComponent(data.symbol)}&market=${encodeURIComponent(data.market || "")}`;
    const response = await fetch(apiUrl(url), { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "realtime quote failed");
    const quote = payload.quote || null;
    if (applyReplayRealtimeQuote(quote) && redraw) updateReplayUi();
    return quote;
  } catch {
    return null;
  }
}

function startReplayRealtimePolling() {
  window.clearInterval(replayRealtimeTimer);
  if (!replayState.data?.symbol) return;
  refreshReplayRealtimeQuote({ redraw: true });
  replayRealtimeTimer = null;
}


async function refreshMarketRealtimeQuote({ redraw = true } = {}) {
  await refreshMarketRealtimeSubscriptionStatus();
  if (!marketState.symbol || !isMarketWatchlisted()) {
    marketState.realtimeQuote = null;
    updateMarketHeader();
    return null;
  }
  try {
    const url = `/api/realtime-quote?symbol=${encodeURIComponent(marketState.symbol)}&market=${encodeURIComponent(marketState.market || "")}`;
    const response = await fetch(apiUrl(url), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "realtime quote failed");
    applyMarketRealtimeQuote(data.quote || null);
    updateMarketHeader();
    if (redraw && data.quote && marketState.frame === "daily") drawMarketChart();
    return data.quote || null;
  } catch {
    marketState.realtimeQuote = null;
    updateMarketHeader();
    return null;
  }
}

function startMarketRealtimePolling() {
  window.clearInterval(marketRealtimeTimer);
  marketRealtimeTimer = null;
}

async function refreshWatchlistQuotes() {
  const button = document.querySelector("#refreshTrainingWatchlist");
  const previousText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "刷新中...";
  }
  try {
    await syncMarketRealtimeWatchlist();
    const requestResponse = await fetch(apiUrl("/api/realtime-refresh"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const refreshPayload = await requestResponse.json().catch(() => ({}));
    if (!requestResponse.ok) throw new Error(refreshPayload.error || "实时行情刷新失败");
    await refreshMarketWatchlistSnapshot();
    renderMarketWatchlist();
    setStatus("#replayStatus", "股票池行情已刷新。", "positive");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

window.addEventListener("beforeunload", () => {
  if (marketState.symbol && (marketState.manualLevels || []).length) saveMarketLevels();
});

async function fillWatchlistHistory() {
  const button = document.querySelector("#getTrainingWatchlist");
  const previousText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "获取中..."; }
  try {
    await syncMarketRealtimeWatchlist();
    const response = await fetch(apiUrl("/api/fill-watchlist-history"), { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "历史行情获取失败");
    if (marketState.symbol && isMarketWatchlisted()) await loadMarketSymbol(marketState.symbol, marketState.market);
    await refreshMarketWatchlistSnapshot();
    renderMarketWatchlist();
    setStatus("#replayStatus", `已补充 ${result.inserted || 0} 条 A 股缺失日线。`, "positive");
  } finally {
    if (button) { button.disabled = false; button.textContent = previousText; }
  }
}

async function loadMarketSymbol(symbol, market = null, meta = {}) {
  if (!symbol) {
    setStatus("#marketStatus", "\u8bf7\u8f93\u5165\u80a1\u7968\u4ee3\u7801\u3001\u5168\u79f0\u6216\u7b80\u79f0\u3002", "negative");
    return;
  }
  setStatus("#marketStatus", "\u6b63\u5728\u8bfb\u53d6\u884c\u60c5...", "neutral");
  resetMarketAiCard("\u8bfb\u53d6\u4e2d...");
  const includeRealtime = isMarketWatchlisted(symbol, market);
  const response = await fetch(apiUrl("/api/trade-replay"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, market, date: "", lookback: 700, includeRealtime }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "\u884c\u60c5\u8bfb\u53d6\u5931\u8d25\u3002");
  marketState.data = data;
  marketState.symbol = data.symbol || symbol;
  marketState.market = data.market || market || "cn";
  marketState.displaySymbol = data.displaySymbol || meta.displaySymbol || displaySecuritySymbol(data, symbol);
  marketState.name = data.name || meta.name || marketState.name || "";
  marketState.realtimeQuote = null;
  marketState.position = loadMarketPosition();
  marketState.manualLevels = loadMarketLevels();
  marketState.frame = "daily";
  marketState.visibleCount = 180;
  marketState.dragOffset = 0;
  marketState.hoverIndex = null;
  marketState.hoverY = null;
  marketState.selectedLevelId = null;
  marketState.drawingLevel = false;
  marketState.draggingLevelId = null;
  marketState.isDragging = false;
  updateMarketTimeframeUi();
  updateMarketLevelToolUi();
  updateMarketPositionUi();
  updateMarketHeader();
  drawMarketChart();
  await refreshMarketRealtimeQuote({ redraw: true });
  startMarketRealtimePolling();
  setStatus("#marketStatus", `\u5df2\u52a0\u8f7d ${marketDisplayTitle()}`, "positive");
  try {
    await requestMarketAiAdvice();
  } catch (error) {
    setStatus("#marketStatus", error.message, "negative");
  }
}

async function loadMarketFromInput() {
  const input = document.querySelector("#marketStockSearch");
  let selected = marketSelectedInput();
  const raw = input?.value.trim() || "";
  const directCode = isDirectSecurityCode(raw);
  if (!input?.dataset.symbol && raw && !directCode) {
    const response = await fetch(apiUrl(`/api/search-stocks?q=${encodeURIComponent(raw)}&limit=1`), { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "\u80a1\u7968\u641c\u7d22\u5931\u8d25\u3002");
    const match = data.matches?.[0];
    if (match) {
      setMarketSearchSelection(match);
      selected = marketSelectedInput();
    }
  }
  await loadMarketSymbol(selected.symbol, selected.market, selected);
}

async function addCurrentMarketToWatchlist() {
  if (!marketState.symbol) {
    setStatus("#marketStatus", "\u8bf7\u5148\u52a0\u8f7d\u4e00\u53ea\u80a1\u7968\u3002", "negative");
    return;
  }
  const key = `${marketState.market || "cn"}:${marketState.symbol}`;
  const exists = marketState.watchlist.some((item) => `${item.market || "cn"}:${item.symbol}` === key);
  if (!exists) {
    marketState.watchlist.unshift({
      symbol: marketState.symbol,
      market: marketState.market || "cn",
      displaySymbol: marketState.displaySymbol,
      name: document.querySelector("#marketStockSearch")?.dataset.name || "",
    });
    saveMarketWatchlist();
    renderMarketWatchlist();
  }
  await syncMarketRealtimeWatchlist();
  await refreshMarketWatchlistSnapshot();
  await refreshMarketRealtimeQuote({ redraw: true });
  startMarketRealtimePolling();
  setStatus("#marketStatus", exists ? "\u81ea\u9009\u80a1\u5df2\u5b58\u5728\u3002" : "\u5df2\u52a0\u5165\u81ea\u9009\u80a1\u3002", "positive");
}

async function addCurrentReplayToWatchlist() {
  if (!replayState.data?.symbol) {
    setStatus("#replayStatus", "\u8bf7\u5148\u52a0\u8f7d\u4e00\u53ea\u80a1\u7968\u3002", "negative");
    return;
  }
  const data = replayState.data;
  const market = data.market || "cn";
  const key = marketWatchKey(data.symbol, market);
  const exists = (marketState.watchlist || []).some((item) => marketWatchKey(item.symbol, item.market) === key);
  if (!exists) {
    marketState.watchlist.unshift({
      symbol: data.symbol,
      market,
      displaySymbol: displaySecuritySymbol(data, data.symbol),
      name: data.name || "",
    });
    saveMarketWatchlist();
    renderMarketWatchlist();
  }
  await syncMarketRealtimeWatchlist();
  await refreshMarketWatchlistSnapshot();
  if (marketState.symbol === data.symbol && (marketState.market || "cn") === market) {
    await refreshMarketRealtimeQuote({ redraw: true });
    startMarketRealtimePolling();
  }
  setStatus("#replayStatus", exists ? "\u81ea\u9009\u80a1\u5df2\u5b58\u5728\u3002" : "\u5df2\u52a0\u5165\u81ea\u9009\u80a1\uff0cQMT\u6865\u63a5\u5c06\u6309\u81ea\u9009\u5217\u8868\u8ba2\u9605\u3002", "positive");
}

function marketCanvasPoint(event) {
  const canvas = document.querySelector("#marketChart");
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  return {
    canvas,
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function marketLevelAt(y) {
  const scale = marketState.chartScale;
  if (!scale) return null;
  return (marketState.manualLevels || []).find((level) => Math.abs(scale.y(level.price) - y) <= 7) || null;
}

function toggleMarketDrawing() {
  if (!marketState.data) {
    setStatus("#marketStatus", "\u8bf7\u5148\u52a0\u8f7dK\u7ebf\u3002", "negative");
    return;
  }
  marketState.drawingLevel = !marketState.drawingLevel;
  marketState.selectedLevelId = null;
  updateMarketLevelToolUi();
  drawMarketChart();
  setStatus("#marketStatus", marketState.drawingLevel ? "\u753b\u7ebf\u6a21\u5f0f\uff1a\u5728K\u7ebf\u4ef7\u683c\u533a\u70b9\u51fb\u6dfb\u52a0\u652f\u6491\u538b\u529b\u7ebf\u3002" : "\u5df2\u9000\u51fa\u753b\u7ebf\u6a21\u5f0f\u3002", "neutral");
}

function clearMarketLevels() {
  marketState.manualLevels = [];
  marketState.selectedLevelId = null;
  marketState.drawingLevel = false;
  updateMarketLevelToolUi();
  saveMarketLevels();
  drawMarketChart();
  setStatus("#marketStatus", "\u5df2\u6e05\u7a7a\u884c\u60c5\u753b\u5e03\u4e0a\u7684\u652f\u6491\u538b\u529b\u7ebf\u3002", "neutral");
}

function autoDrawMarketLevelLines() {
  if (!marketState.data) {
    setStatus("#marketStatus", "\u8bf7\u5148\u52a0\u8f7dK\u7ebf\u3002", "negative");
    return;
  }
  const candles = marketCandles();
  const current = candles.at(-1);
  if (!current || candles.length < 30) {
    setStatus("#marketStatus", `${timeframeLabel(marketState.frame)}\u53ef\u7528K\u7ebf\u592a\u5c11\uff0c\u6682\u65f6\u65e0\u6cd5\u81ea\u52a8\u753b\u7ebf\u3002`, "negative");
    return;
  }
  const currentPrice = Number(current.close) || 0;
  const points = [
    ...autoLevelSwings(candles, 3),
    ...autoLevelBodyZones(candles, 0.014),
  ];
  const clusters = clusterAutoLevels(points, currentPrice, 0.02)
    .filter((level) => Math.abs(level.price - currentPrice) / Math.max(currentPrice, 0.01) <= 0.35);
  const existing = (marketState.manualLevels || []).filter((level) => Number(level.price) > 0);
  const candidateSupport = clusters
    .filter((level) => level.price < currentPrice)
    .filter((level) => !existing.some((manual) => Math.abs(manual.price - level.price) / currentPrice <= 0.006))
    .sort((a, b) => (currentPrice - a.price) - (currentPrice - b.price) || b.score - a.score)[0];
  const candidateResistance = clusters
    .filter((level) => level.price > currentPrice)
    .filter((level) => !existing.some((manual) => Math.abs(manual.price - level.price) / currentPrice <= 0.006))
    .sort((a, b) => (a.price - currentPrice) - (b.price - currentPrice) || b.score - a.score)[0];
  const selected = [candidateSupport, candidateResistance].filter(Boolean);
  if (!selected.length) {
    setStatus("#marketStatus", "\u6ca1\u6709\u627e\u5230\u9700\u8981\u65b0\u589e\u7684\u652f\u6491\u538b\u529b\u5019\u9009\u7ebf\u3002", "neutral");
    return;
  }
  selected.forEach((level) => {
    marketState.manualLevels.push({
      id: createLevelId("market-auto"),
      price: level.price,
      role: level.price < currentPrice ? "support" : "effective_resistance",
      reason: `${timeframeLabel(marketState.frame)}\u81ea\u52a8\u753b\u7ebf\uff1a${level.reason || ""}`,
      auto: true,
      score: level.score ?? null,
    });
  });
  marketState.manualLevels = marketState.manualLevels.sort((a, b) => a.price - b.price);
  marketState.selectedLevelId = null;
  marketState.drawingLevel = false;
  updateMarketLevelToolUi();
  saveMarketLevels();
  drawMarketChart();
  const supportText = candidateSupport ? `\u652f\u6491 ${formatPrice(candidateSupport.price)}` : "\u652f\u6491\u672a\u65b0\u589e";
  const resistanceText = candidateResistance ? `\u538b\u529b ${formatPrice(candidateResistance.price)}` : "\u538b\u529b\u672a\u65b0\u589e";
  setStatus("#marketStatus", `${timeframeLabel(marketState.frame)}\u81ea\u52a8\u753b\u7ebf\u5df2\u5b8c\u6210\uff1a${supportText}\uff0c${resistanceText}\u3002`, "positive");
}

function selectMarketTimeframe(frame) {
  marketState.frame = frame || "daily";
  marketState.dragOffset = 0;
  marketState.hoverIndex = null;
  marketState.hoverY = null;
  updateMarketTimeframeUi();
  updateMarketHeader();
  drawMarketChart();
  if (marketState.data && !marketCandles().length) {
    setStatus("#marketStatus", `${timeframeLabel(marketState.frame)}\u884c\u60c5\u5c1a\u672a\u5bfc\u5165\uff0c\u5bfc\u5165\u5bf9\u5e94\u7ea7\u522b\u540e\u53ef\u7528\u3002`, "neutral");
  }
}

function startMarketLevelDrag(event) {
  if (!marketState.data || event.button !== 0 || marketState.drawingLevel) return;
  const point = marketCanvasPoint(event);
  const scale = marketState.chartScale;
  if (!point || !scale) return;
  const hit = marketLevelAt(point.y);
  event.preventDefault();
  if (hit) {
    marketState.selectedLevelId = hit.id;
    marketState.draggingLevelId = hit.id;
    marketState.suppressNextCanvasClick = true;
  } else {
    marketState.isDragging = true;
    marketState.dragStartX = event.clientX;
    marketState.dragStartOffset = marketState.dragOffset || 0;
    marketState.selectedLevelId = null;
  }
  marketState.dragMoved = false;
  point.canvas.classList.add("dragging");
  drawMarketChart();
}

function dragMarketLevel(event) {
  if (!marketState.draggingLevelId && !marketState.isDragging) return;
  const point = marketCanvasPoint(event);
  const scale = marketState.chartScale;
  if (!point || !scale) return;
  if (marketState.draggingLevelId) {
    const level = marketState.manualLevels.find((item) => item.id === marketState.draggingLevelId);
    if (!level) return;
    const boundedY = Math.max(scale.priceTop, Math.min(scale.priceBottom, point.y));
    level.price = Math.max(0.01, scale.priceAtY(boundedY));
    marketState.dragMoved = true;
  } else if (marketState.isDragging) {
    const candles = marketVisibleCandles();
    const step = candleStep(point.canvas.width, candles.length || 1);
    const delta = event.clientX - marketState.dragStartX;
    const offsetDelta = Math.round(delta / Math.max(step, 1));
    if (Math.abs(delta) > 4) {
      marketState.dragMoved = true;
      marketState.suppressNextCanvasClick = true;
    }
    marketState.dragOffset = marketState.dragStartOffset + offsetDelta;
    clampMarketDragOffset();
    marketState.hoverIndex = null;
    marketState.hoverY = null;
  }
  drawMarketChart();
}

function endMarketLevelDrag() {
  if (!marketState.draggingLevelId && !marketState.isDragging) return;
  if (marketState.draggingLevelId && marketState.dragMoved) {
    saveMarketLevels();
    setStatus("#marketStatus", "\u753b\u7ebf\u5df2\u4fdd\u5b58\u3002", "positive");
  }
  marketState.draggingLevelId = null;
  marketState.isDragging = false;
  marketState.dragMoved = false;
  document.querySelector("#marketChart")?.classList.remove("dragging");
}

function updateMarketHover(event) {
  if (!marketState.data || marketState.isDragging || marketState.draggingLevelId) return;
  const point = marketCanvasPoint(event);
  const candles = marketVisibleCandles();
  if (!point || !candles.length) return;
  const step = candleStep(point.canvas.width, candles.length);
  const index = Math.round((point.x - 48) / step);
  marketState.hoverIndex = Math.max(0, Math.min(candles.length - 1, index));
  marketState.hoverY = point.y;
  drawMarketChart();
}

function clearMarketHover() {
  marketState.hoverIndex = null;
  marketState.hoverY = null;
  drawMarketChart();
}

function zoomMarketChart(direction) {
  if (!marketState.data) return;
  const next = marketState.visibleCount + direction * 20;
  marketState.visibleCount = Math.max(30, Math.min(700, next));
  clampMarketDragOffset();
  marketState.hoverIndex = null;
  marketState.hoverY = null;
  drawMarketChart();
}

function handleMarketWheel(event) {
  if (activeView !== "market" || !marketState.data) return;
  event.preventDefault();
  zoomMarketChart(event.deltaY < 0 ? -1 : 1);
}

function handleMarketChartClick(event) {
  if (!marketState.data) return;
  if (marketState.suppressNextCanvasClick) {
    marketState.suppressNextCanvasClick = false;
    return;
  }
  if (marketState.dragMoved) {
    marketState.dragMoved = false;
    return;
  }
  const point = marketCanvasPoint(event);
  const scale = marketState.chartScale;
  if (!point || !scale) return;
  const hit = marketLevelAt(point.y);
  if (hit) {
    marketState.selectedLevelId = hit.id;
    marketState.drawingLevel = false;
    updateMarketLevelToolUi();
    drawMarketChart();
    return;
  }
  if (!marketState.drawingLevel) {
    marketState.selectedLevelId = null;
    drawMarketChart();
    return;
  }
  if (point.x < 44 || point.x > point.canvas.width - 20 || point.y < scale.priceTop || point.y > scale.priceBottom) {
    marketState.drawingLevel = false;
    updateMarketLevelToolUi();
    setStatus("#marketStatus", "\u5df2\u9000\u51fa\u753b\u7ebf\u6a21\u5f0f\u3002", "neutral");
    return;
  }
  const price = Math.max(0.01, scale.priceAtY(point.y));
  const lastClose = marketCandles().at(-1)?.close || 0;
  const level = {
    id: createLevelId("market"),
    price,
    role: price <= lastClose ? "support" : "effective_resistance",
    reason: "",
  };
  marketState.manualLevels.push(level);
  marketState.selectedLevelId = level.id;
  marketState.drawingLevel = false;
  updateMarketLevelToolUi();
  saveMarketLevels();
  drawMarketChart();
  setStatus("#marketStatus", "\u5df2\u6dfb\u52a0\u652f\u6491\u538b\u529b\u7ebf\uff0c\u540e\u7eed\u6253\u5f00\u8be5\u80a1\u4f1a\u81ea\u52a8\u8bfb\u53d6\u3002", "positive");
}

function saveMarketSelectedLevelReason() {
  const selected = (marketState.manualLevels || []).find((level) => level.id === marketState.selectedLevelId);
  if (!selected) {
    setStatus("#marketStatus", "\u8bf7\u5148\u5728\u753b\u5e03\u4e0a\u9009\u4e2d\u4e00\u6761\u652f\u6491\u538b\u529b\u7ebf\u3002", "negative");
    return;
  }
  const reasonInput = document.querySelector("#marketSelectedLevelReason");
  const roleInput = document.querySelector("#marketSelectedLevelRole");
  selected.reason = reasonInput?.value.trim() || "";
  selected.role = LEVEL_ROLE_LABELS[roleInput?.value] ? roleInput.value : marketLevelRole(selected);
  saveMarketLevels();
  updateMarketLevelToolUi();
  drawMarketChart();
  setStatus("#marketStatus", "\u5df2\u5199\u5165\u884c\u60c5\u753b\u7ebf\u7c7b\u578b\u548c\u539f\u56e0\u3002", "positive");
}

function deleteMarketSelectedLevel() {
  const selected = (marketState.manualLevels || []).find((level) => level.id === marketState.selectedLevelId);
  if (!selected) {
    setStatus("#marketStatus", "\u8bf7\u5148\u5728\u753b\u5e03\u4e0a\u9009\u4e2d\u4e00\u6761\u652f\u6491\u538b\u529b\u7ebf\u3002", "negative");
    return;
  }
  marketState.manualLevels = marketState.manualLevels.filter((level) => level.id !== selected.id);
  marketState.selectedLevelId = null;
  marketState.drawingLevel = false;
  saveMarketLevels();
  updateMarketLevelToolUi();
  drawMarketChart();
  setStatus("#marketStatus", "\u5df2\u5220\u9664\u9009\u4e2d\u753b\u7ebf\u3002", "neutral");
}

function replayLogText(item) {
  const base = item.action === "hold" ? item.note || "无备注" : item.note || item.reason || "无备注";
  if (item.action !== "buy" || !item.stopLoss) return base;
  return `${base}；止损 ${formatPrice(item.stopLoss)}：${item.stopLossReason || "未填写原因"}`;
}

function recordSummary(record) {
  const parts = [];
  if (record.reason) parts.push(record.reason);
  if (record.note && record.note !== record.reason) parts.push(record.note);
  if (record.stopLoss) parts.push(`止损 ${formatPrice(record.stopLoss)}`);
  if (record.support) parts.push(`支撑 ${formatPrice(record.support)}`);
  if (record.resistance) parts.push(`压力 ${formatPrice(record.resistance)}`);
  return parts.join("；") || "无备注";
}

function createTrainingSessionId(symbol, date) {
  return `${symbol || "stock"}-${date || "date"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function displaySecuritySymbol(data, fallback = "--") {
  if (!data) return fallback;
  return data.displaySymbol || (data.market === "hk" ? `HK:${data.symbol}` : data.market === "futures" ? `FUT:${data.symbol}` : data.symbol) || fallback;
}

function replayQuoteStatusText(candle) {
  const label = timeframeLabel(replayState.frame);
  if (replayState.blindMode) {
    if (["5m", "30m", "60m"].includes(replayState.frame)) {
      return candle ? `\u672c\u5730${label}` : `${label}\u672a\u5bfc\u5165`;
    }
    return candle?.realtime ? "QMT\u5b9e\u65f6\u884c\u60c5" : `\u672c\u5730${label}`;
  }
  const rawTime = candle?.realtime ? qmtRawQuoteTime(candle) : candle?.date;
  const timeText = candle?.realtime ? formatRealtimeTimestamp(rawTime) : formatSourceTimestamp(rawTime);
  if (["5m", "30m", "60m"].includes(replayState.frame)) {
    return candle ? `\u672c\u5730${label} \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}` : `${label}\u672a\u5bfc\u5165`;
  }
  return candle?.realtime
    ? `QMT\u5b9e\u65f6\u884c\u60c5 \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}`
    : `\u672c\u5730${label} \u00b7 \u83b7\u53d6\u65f6\u95f4\uff1a${timeText}`;
}

function renderDatasetActions(actions = []) {
  return actions.map((record) => {
    const adviceLabel = record.aiAdviceText || record.aiAdviceAction || "";
    const feedbackText = record.aiAdviceAccepted === true
      ? "认可"
      : record.aiAdviceAccepted === false
        ? `不认可${record.aiAdviceDisagreeReason ? `：${record.aiAdviceDisagreeReason}` : ""}`
        : "";
    const aiLine = adviceLabel || feedbackText
      ? `<small>AI建议：${escapeHtml(adviceLabel || "--")}${record.aiAdviceScore == null ? "" : `（${Math.round(record.aiAdviceScore)}分）`}；反馈：${escapeHtml(feedbackText || "未评价")}</small>`
      : "";
    return `
    <div class="dataset-action-row">
      <strong>${record.date || "--"} · ${replayActionLabel(record.action)}</strong>
      <div>
        <span>${recordSummary(record)}</span>
        ${aiLine}
      </div>
    </div>
  `;
  }).join("");
}

function datasetReturnSummary(actions = []) {
  let position = null;
  let equity = 1;
  let completedTrades = 0;
  actions.forEach((record) => {
    if (record.action === "buy" && !position) {
      const entryPrice = Number(record.price);
      if (entryPrice > 0) position = { entryPrice };
      return;
    }
    if (record.action === "sell" && position) {
      const exitPrice = Number(record.price);
      if (exitPrice > 0) {
        equity *= exitPrice / position.entryPrice;
        completedTrades += 1;
      }
      position = null;
    }
  });
  return {
    completedTrades,
    openPosition: Boolean(position),
    returnPct: (equity - 1) * 100,
  };
}

function replayStateFromActions(actions = []) {
  let position = null;
  let equity = 1;
  actions.forEach((record) => {
    if (record.action === "buy" && !position) {
      const entryPrice = Number(record.price);
      if (entryPrice > 0) {
        position = {
          entryDate: record.date,
          entryPrice,
          reason: record.reason || record.note || "",
          stopLoss: Number(record.stopLoss) || null,
          stopLossReason: record.stopLossReason || "",
        };
      }
      return;
    }
    if (record.action === "sell" && position) {
      const exitPrice = Number(record.price);
      if (exitPrice > 0) equity *= exitPrice / position.entryPrice;
      position = null;
    }
  });
  return { equity, position };
}

function renderTrainingRecords(datasets = []) {
  const list = document.querySelector("#trainingRecordList");
  if (!list) return;
  if (!datasets.length) {
    list.innerHTML = `<div class="dataset-empty">暂无训练集</div>`;
    return;
  }
  list.innerHTML = datasets.map((dataset) => {
    const actions = dataset.actions || [];
    const returnSummary = datasetReturnSummary(actions);
    const returnClass = returnSummary.returnPct === 0 ? "" : returnSummary.returnPct > 0 ? "positive-text" : "negative-text";
    const actionSummary = actions.reduce((summary, item) => {
      summary[item.action] = (summary[item.action] || 0) + 1;
      return summary;
    }, {});
    return `
    <article class="dataset-row" data-id="${dataset.id}">
      <div class="dataset-main">
        <div class="dataset-title-row">
          <strong>${displaySecuritySymbol(dataset, dataset.symbol || "--")}</strong>
          <span class="dataset-return ${returnClass}">累计收益率 ${formatPercent(returnSummary.returnPct)}</span>
        </div>
        <p>${dataset.startDate || "--"} 至 ${dataset.endDate || "--"} · ${actions.length} 条记录 · 买入 ${actionSummary.buy || 0} / 卖出 ${actionSummary.sell || 0} / 观望 ${actionSummary.hold || 0}</p>
        <small>${returnSummary.completedTrades} 笔完成交易${returnSummary.openPosition ? "，当前仍持仓" : ""} · ${dataset.savedAt ? new Date(dataset.savedAt).toLocaleString() : "未记录保存时间"}</small>
        <div class="dataset-action-list hidden" id="datasetActions-${dataset.id}">${renderDatasetActions(actions)}</div>
      </div>
      <div class="dataset-actions">
        <button class="secondary-button" type="button" data-action="toggle-actions" data-id="${dataset.id}" aria-expanded="false">展开操作</button>
        <button class="secondary-button" type="button" data-action="restore" data-id="${dataset.id}">复现</button>
        <button class="secondary-button danger-button" type="button" data-action="delete" data-id="${dataset.id}">删除</button>
      </div>
    </article>
  `;
  }).join("");
}

function toggleDatasetActions(recordId, button) {
  const panel = document.getElementById(`datasetActions-${recordId}`);
  if (!panel) return;
  const collapsed = panel.classList.toggle("hidden");
  button.textContent = collapsed ? "展开操作" : "收起操作";
  button.setAttribute("aria-expanded", collapsed ? "false" : "true");
}


function timingQualityLabel(key) {
  return {
    good_timing: "买点较好",
    early_or_tight_stop: "偏早/止损紧",
    bad_timing: "择时失败",
    invalid_stop: "止损需修正",
    missing_stop: "缺少止损",
    wide_swing: "波动过大",
    weak_follow_through: "延续偏弱",
    neutral_timing: "结果中性",
  }[key] || key || "--";
}

function renderTimingQualityReport(result) {
  const panel = document.querySelector("#timingQualityPanel");
  if (!panel) return;
  const summary = result.summary || {};
  const counts = result.qualityCounts || {};
  const items = result.items || [];
  const metric = (value, suffix = "%") => (value == null ? "--" : `${Number(value).toFixed(2)}${suffix}`);
  const countText = Object.entries(counts)
    .map(([key, value]) => `<span>${escapeHtml(timingQualityLabel(key))}: <strong>${value}</strong></span>`)
    .join(" ");
  const rows = items.slice(0, 40).map((item) => {
    const qualityClass = item.quality === "good_timing" ? "positive" : ["bad_timing", "invalid_stop"].includes(item.quality) ? "negative" : "neutral";
    return `
      <tr>
        <td>${escapeHtml(item.symbol)}<br><small>${escapeHtml(item.date)}</small></td>
        <td><span class="decision ${qualityClass}">${escapeHtml(timingQualityLabel(item.quality))}</span><br><small>${escapeHtml(item.qualityReason)}</small></td>
        <td>${formatPrice(Number(item.entryPrice))}<br><small>止损 ${item.stopLoss == null ? "--" : formatPrice(Number(item.stopLoss))}</small></td>
        <td>${metric(item.r5)} / ${metric(item.r10)} / ${metric(item.r20)}</td>
        <td>浮盈 ${metric(item.mfe20)}<br><small>回撤 ${metric(item.mae20)}，最高 ${item.mfeR == null ? "--" : `${item.mfeR}R`}</small></td>
        <td>${item.hitStop20 ? "是" : "否"}</td>
      </tr>`;
  }).join("");
  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="chart-header">
      <h3>训练集择时复盘</h3>
      <span>按买入后20个交易日统计</span>
    </div>
    <div class="metrics-strip">
      <div><span>买入样本</span><strong>${summary.evaluatedBuyCount || 0}/${summary.buyCount || 0}</strong></div>
      <div><span>20日触发止损</span><strong>${summary.hitStop20Rate == null ? "--" : `${summary.hitStop20Rate}%`}</strong></div>
      <div><span>10日正收益</span><strong>${summary.positiveR10Rate == null ? "--" : `${summary.positiveR10Rate}%`}</strong></div>
      <div><span>20日正收益</span><strong>${summary.positiveR20Rate == null ? "--" : `${summary.positiveR20Rate}%`}</strong></div>
      <div><span>平均最大浮盈</span><strong>${metric(summary.avgMfe20)}</strong></div>
      <div><span>平均最大回撤</span><strong>${metric(summary.avgMae20)}</strong></div>
    </div>
    <p class="muted">${countText || "暂无分类结果"}</p>
    <table>
      <thead><tr><th>标的</th><th>择时分类</th><th>买入/止损</th><th>5/10/20日</th><th>20日波动</th><th>触发止损</th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6">暂无可评估买入样本</td></tr>`}</tbody>
    </table>
  `;
}

async function analyzeTimingQuality() {
  const status = document.querySelector("#datasetStatus");
  const button = document.querySelector("#analyzeTimingQuality");
  const previousText = button?.textContent || "分析择时质量";
  try {
    if (button) {
      button.disabled = true;
      button.textContent = "正在分析...";
    }
    if (status) {
      status.textContent = "正在按买入后20个交易日复盘择时质量...";
      status.className = "training-status neutral";
    }
    const response = await fetch(apiUrl("/api/trade-replay-timing-quality"), { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "择时质量分析失败。");
    renderTimingQualityReport(result);
    if (status) {
      const summary = result.summary || {};
      status.textContent = `已分析 ${summary.evaluatedBuyCount || 0} 条买入样本，20日触发止损率 ${summary.hitStop20Rate ?? "--"}%`;
      status.className = "training-status positive";
    }
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.className = "training-status negative";
    }
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

async function loadTrainingRecords() {
  const status = document.querySelector("#datasetStatus");
  try {
    if (status) {
      status.textContent = "正在读取训练集...";
      status.className = "training-status neutral";
    }
    const response = await fetch(apiUrl("/api/trade-replay-datasets"));
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "训练集读取失败。");
    replayState.trainingRecords = result.datasets || [];
    renderTrainingRecords(replayState.trainingRecords);
    if (status) {
      status.textContent = `共 ${result.count || 0} 个训练集，${result.recordCount || 0} 条操作记录`;
      status.className = "training-status positive";
    }
  } catch (error) {
    renderTrainingRecords([]);
    if (status) {
      status.textContent = error.message;
      status.className = "training-status negative";
    }
  }
}

async function restoreTrainingRecord(recordId) {
  const dataset = replayState.trainingRecords?.find((item) => String(item.id) === String(recordId));
  if (!dataset) return;
  const first = dataset.actions?.[0] || {};
  const focus = dataset.actions?.at(-1) || first;
  document.querySelector("#replaySymbol").value = dataset.symbol || first.symbol || "";
  document.querySelector("#replayDate").value = dataset.startDate || first.date || "";
  replayState.blindMode = false;
  await loadTradeReplay({
    button: document.querySelector("#startReplay"),
    symbol: dataset.symbol || first.symbol,
    market: dataset.market || first.market || null,
    date: dataset.startDate || first.date,
    blind: false,
    loadingText: "正在复现...",
    sessionId: dataset.id,
  });
  const daily = replayState.data?.timeframes?.daily || [];
  const index = daily.findIndex((item) => item.date === focus.date);
  if (index >= 0) replayState.cursor = index;
  replayState.log = (dataset.actions || []).map((record) => ({
    ...record,
    label: replayActionLabel(record.action),
    price: Number(record.price) || 0,
  }));
  const restoredState = replayStateFromActions(dataset.actions || []);
  replayState.equity = restoredState.equity;
  replayState.position = restoredState.position;
  replayState.selectedNoteDate = focus.date;
  replayState.sessionId = dataset.id;
  replayState.trainingStartDate = dataset.startDate || first.date || "";
  document.querySelector("#replayStructure").value = focus.structure || first.structure || "";
  document.querySelector("#replayTrendDirection").value = focus.humanTrendDirection || first.humanTrendDirection || "";
  document.querySelector("#replayTrendStage").value = focus.humanTrendStage || first.humanTrendStage || "";
  document.querySelector("#replaySupportStatus").value = focus.supportStatus || first.supportStatus || "";
  document.querySelector("#replaySupportEvidence").value = focus.supportValidationEvidence || first.supportValidationEvidence || "";
  updateReplayUi();
  setView("replay");
  setStatus("#replayStatus", `已复现训练集：${displaySecuritySymbol(dataset, dataset.symbol || first.symbol)} ${dataset.startDate || first.date}`, "positive");
}

async function deleteTrainingRecord(recordId) {
  const status = document.querySelector("#datasetStatus");
  try {
    const response = await fetch(apiUrl("/api/delete-trade-replay-record"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: recordId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "删除训练集失败。");
    if (status) {
      status.textContent = result.deleted ? "已删除训练集。" : "未找到要删除的训练集。";
      status.className = result.deleted ? "training-status positive" : "training-status neutral";
    }
    await loadTrainingRecords();
  } catch (error) {
    if (status) {
      status.textContent = error.message;
      status.className = "training-status negative";
    }
  }
}

function shouldWriteReplayDecision(action, note) {
  if (!replayState.writeTraining) return false;
  const advice = currentAiAdviceSnapshot();
  if (isActionableAiAdvice(advice) && action !== advice.action) return true;
  if (action === "hold") return Boolean(note);
  return true;
}

function replayChartCanvas() {
  return document.querySelector(replayState.chartCanvasSelector || "#replayChart");
}

function replayStatusSelector() {
  return replayState.statusSelector || "#replayStatus";
}

function setReplayChartStatus(message, type = "neutral") {
  setStatus(replayStatusSelector(), message, type);
}

function replayLevelUiSelector(replaySelector, backtestSelector) {
  return replayState.backtestMode ? backtestSelector : replaySelector;
}

function replayLevelInfoText() {
  const selected = selectedManualLevel();
  if (replayState.drawingLevel) return "画线模式：点击价格区域添加一条线";
  if (selected) {
    const typeText = manualLevelType(selected) === "support" ? "支撑" : "压力";
    return `已选中${typeText}线 ${formatPrice(selected.price)}，可拖动调整或删除`;
  }
  return "";
}


function replayChartScale() {
  const candles = replayVisibleCandles();
  if (!candles.length) return null;
  const levelPrices = replayState.manualLevels.map((level) => level.price).filter((price) => price > 0);
  const prices = candles.flatMap((item) => [item.high, item.low]).concat(levelPrices);
  const min = Math.min(...prices) * 0.98;
  const max = Math.max(...prices) * 1.02;
  const canvas = replayChartCanvas();
  const height = canvas?.height || 560;
  const priceTop = 24;
  const priceBottom = Math.round(height * 0.62);
  const chartHeight = priceBottom - priceTop;
  const y = (value) => priceBottom - ((value - min) / (max - min || 1)) * chartHeight;
  const priceAtY = (py) => max - ((py - priceTop) / (chartHeight || 1)) * (max - min);
  return { candles, min, max, priceTop, priceBottom, chartHeight, y, priceAtY };
}

function candleStep(canvasWidth, candleCount) {
  return (canvasWidth - 64) / Math.max(candleCount - 1, 1);
}

const LEVEL_ROLE_LABELS = {
  support: "\u652f\u6491",
  pending_support: "\u5f85\u56de\u8e29\u786e\u8ba4\u652f\u6491",
  near_resistance: "\u8fd1\u7aef\u538b\u529b",
  effective_resistance: "\u6709\u6548\u538b\u529b",
  breakout_target: "\u7a81\u7834\u76ee\u6807",
};

function levelRoleLabel(role) {
  return LEVEL_ROLE_LABELS[role] || LEVEL_ROLE_LABELS.effective_resistance;
}

function levelSideFromRole(role) {
  return ["support", "pending_support"].includes(role) ? "support" : "resistance";
}

function inferredLevelRole(level) {
  if (!level) return "";
  if (LEVEL_ROLE_LABELS[level.role]) return level.role;
  const current = currentReplayCandle()?.close || 0;
  return level.price <= current ? "support" : "effective_resistance";
}

function ensureLevelRole(level) {
  if (level && !LEVEL_ROLE_LABELS[level.role]) level.role = inferredLevelRole(level);
  if (level && !level.validationStatus) level.validationStatus = level.auto ? "candidate" : "testing";
  return level;
}

function sortedLevelsByDistance(levels, current) {
  return levels.slice().sort((a, b) => Math.abs(a.price - current) - Math.abs(b.price - current));
}

function nearestManualLevels() {
  const current = currentReplayCandle()?.close || 0;
  const levels = (replayState.manualLevels || []).map(ensureLevelRole).filter((level) => Number(level.price) > 0);
  const supports = levels
    .filter((level) => inferredLevelRole(level) === "support")
    .filter((level) => level.price <= current)
    .sort((a, b) => b.price - a.price);
  const pressureLevels = levels
    .filter((level) => level.price >= current && inferredLevelRole(level) !== "support")
    .sort((a, b) => a.price - b.price);
  const byRole = (role) => sortedLevelsByDistance(pressureLevels.filter((level) => inferredLevelRole(level) === role), current)[0] || null;
  const nearResistance = byRole("near_resistance");
  const effectiveResistance = byRole("effective_resistance");
  const breakoutTarget = byRole("breakout_target");
  const resistance = effectiveResistance || nearResistance || breakoutTarget || pressureLevels[0] || null;
  return {
    support: supports[0] || null,
    resistance,
    nearResistance,
    effectiveResistance,
    breakoutTarget,
    pressures: pressureLevels,
  };
}

function selectedManualLevel() {
  return replayState.manualLevels.find((level) => level.id === replayState.selectedLevelId) || null;
}

function createLevelId(prefix = "level") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function manualLevelType(level) {
  return levelSideFromRole(inferredLevelRole(level));
}

function levelTrainingContext() {
  const candle = currentReplayCandle();
  return {
    symbol: replayState.data?.symbol || "",
    sessionId: replayState.sessionId || "",
    date: candle?.date || "",
    currentPrice: candle?.close || null,
    timeframe: "weekly",
  };
}

function levelTrainingSide(priceOrLevel) {
  if (priceOrLevel && typeof priceOrLevel === "object") return manualLevelType(priceOrLevel);
  const current = currentReplayCandle()?.close || 0;
  const price = Number(priceOrLevel) || 0;
  if (!current || !price) return "";
  return price <= current ? "support" : "resistance";
}

function serializeLevel(level) {
  if (!level) return null;
  const role = inferredLevelRole(level);
  return {
    id: level.id,
    price: Number(level.price) || null,
    side: levelSideFromRole(role),
    role,
    roleLabel: levelRoleLabel(role),
    validationStatus: level.validationStatus || (role === "pending_support" ? "testing" : "candidate"),
    validationReason: level.validationReason || level.supportValidationReason || "",
    supportValidationReason: level.supportValidationReason || level.validationReason || "",
    pathId: level.pathId || "",
    pathLabel: level.pathLabel || "",
    bypassStatus: level.bypassStatus || "",
    reason: level.reason || "",
    auto: Boolean(level.auto),
    score: level.score ?? null,
  };
}

const REPLAY_LEVEL_STORAGE_PREFIX = "trading-advice:replay-levels:v1";

function replayLevelStorageKey(data = replayState.data, startDate = replayState.trainingStartDate) {
  if (!data?.symbol || !startDate) return "";
  return `${REPLAY_LEVEL_STORAGE_PREFIX}:${data.market || "cn"}:${data.symbol}:${startDate}`;
}

function normalizeStoredLevel(level) {
  const price = Number(level?.price);
  if (!Number.isFinite(price) || price <= 0) return null;
  const role = LEVEL_ROLE_LABELS[level.role] ? level.role : "";
  return {
    id: level.id || createLevelId("stored"),
    price,
    role,
    reason: String(level.reason || ""),
    validationStatus: level.validationStatus || "",
    validationReason: String(level.validationReason || level.supportValidationReason || ""),
    supportValidationReason: String(level.supportValidationReason || level.validationReason || ""),
    pathId: level.pathId || "",
    pathLabel: level.pathLabel || "",
    bypassStatus: level.bypassStatus || "",
    auto: Boolean(level.auto),
    score: level.score ?? null,
  };
}

function loadSavedReplayLevels(data, startDate) {
  try {
    const key = replayLevelStorageKey(data, startDate);
    if (!key || !window.localStorage) return [];
    const payload = JSON.parse(window.localStorage.getItem(key) || "null");
    const levels = Array.isArray(payload?.levels) ? payload.levels : Array.isArray(payload) ? payload : [];
    return levels.map(normalizeStoredLevel).filter(Boolean).sort((a, b) => a.price - b.price);
  } catch (error) {
    return [];
  }
}

function hasSavedReplayLevelState(data, startDate) {
  try {
    const key = replayLevelStorageKey(data, startDate);
    return Boolean(key && window.localStorage && window.localStorage.getItem(key) !== null);
  } catch (error) {
    return false;
  }
}

function saveReplayLevels() {
  if (replayState.backtestMode || !replayState.data) return;
  try {
    const key = replayLevelStorageKey();
    if (!key || !window.localStorage) return;
    const levels = (replayState.manualLevels || []).map(serializeLevel).filter(Boolean);
    window.localStorage.setItem(key, JSON.stringify({
      savedAt: new Date().toISOString(),
      market: replayState.data.market || "cn",
      symbol: replayState.data.symbol,
      startDate: replayState.trainingStartDate,
      levels,
    }));
  } catch (error) {
    // localStorage may be unavailable in some embedded browsers; ignore autosave failures.
  }
}

function recordLevelCorrection(action, level, detail = {}) {
  const candle = currentReplayCandle();
  if (!candle || !level) return;
  replayState.levelCorrections = replayState.levelCorrections || [];
  replayState.levelCorrections.push({
    action,
    date: candle.date,
    currentPrice: candle.close,
    levelId: level.id,
    side: detail.side || levelTrainingSide(detail.toPrice ?? level.price),
    role: detail.role || inferredLevelRole(level),
    previousRole: detail.previousRole || null,
    fromPrice: detail.fromPrice ?? null,
    toPrice: detail.toPrice ?? level.price ?? null,
    reason: detail.reason ?? level.reason ?? "",
    sourceAuto: Boolean(level.auto),
    recordedAt: new Date().toISOString(),
  });
}

function updateLevelTrainingUi() {
  const countNode = document.querySelector("#levelTrainingCount");
  if (countNode) countNode.textContent = `${(replayState.levelCorrections || []).length} 条修正`;
  const backtestCountNode = document.querySelector("#backtestLevelCount");
  if (backtestCountNode) backtestCountNode.textContent = `${(replayState.manualLevels || []).length} 条线`;
}

function buildLevelTrainingPayload() {
  const nearest = nearestManualLevels();
  return {
    ...levelTrainingContext(),
    autoSnapshot: replayState.autoLevelSnapshot,
    corrections: replayState.levelCorrections || [],
    acceptedLevels: {
      support: serializeLevel(nearest.support),
      resistance: serializeLevel(nearest.resistance),
    },
    allLevels: (replayState.manualLevels || []).map(serializeLevel),
    supportPath: nearest.support ? {
      validationStatus: nearest.support.bypassStatus || nearest.support.validationStatus || "",
      pathId: nearest.support.pathId || "",
      validationReason: nearest.support.validationReason || nearest.support.supportValidationReason || "",
    } : null,
  };
}

async function saveLevelTrainingSample() {
  if (!replayState.data) {
    setStatus("#replayStatus", "请先开始训练并加载K线数据。", "negative");
    return;
  }
  if (!replayState.autoLevelSnapshot) {
    setStatus("#replayStatus", "请先点击周线自动画线，生成自动线快照。", "negative");
    return;
  }
  if (!(replayState.levelCorrections || []).length) {
    setStatus("#replayStatus", "当前没有人工修正动作，暂不保存画线训练样本。", "negative");
    return;
  }
  const payload = buildLevelTrainingPayload();
  const response = await fetch(apiUrl("/api/level-training-sample"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) {
    setStatus("#replayStatus", result.error || "保存画线训练样本失败。", "negative");
    return;
  }
  replayState.levelCorrections = [];
  updateLevelTrainingUi();
  setStatus("#replayStatus", "已保存画线训练样本，可用于拟合周线自动画线准确度。", "positive");
}

function syncManualLevelInputs() {
  const nearest = nearestManualLevels();
  const supportInput = document.querySelector("#replaySupport");
  const resistanceInput = document.querySelector("#replayResistance");
  const supportReason = document.querySelector("#replaySupportReason");
  const resistanceReason = document.querySelector("#replayResistanceReason");
  const selectedReason = document.querySelector("#selectedLevelReason");
  const selectedRole = document.querySelector("#selectedLevelRole");
  const selected = selectedManualLevel();
  let supportReasonText = nearest.support?.reason || "";
  let resistanceReasonText = nearest.resistance?.reason || "";
  if (selected) {
    if (manualLevelType(selected) === "support") {
      supportReasonText = selected.reason || "";
    } else {
      resistanceReasonText = selected.reason || "";
    }
  }
  if (supportInput) supportInput.value = nearest.support ? formatPrice(nearest.support.price) : "";
  if (resistanceInput) resistanceInput.value = nearest.resistance ? formatPrice(nearest.resistance.price) : "";
  if (supportReason) supportReason.value = supportReasonText;
  if (resistanceReason) resistanceReason.value = resistanceReasonText;
  if (selectedReason) selectedReason.value = selected?.reason || "";
  if (selectedRole && selected) selectedRole.value = inferredLevelRole(selected);
}

function updateLevelToolUi() {
  const drawSelector = replayLevelUiSelector("#drawLevelLine", "#backtestDrawLevelLine");
  const selectedToolsSelector = replayLevelUiSelector("#selectedLevelTools", "#backtestSelectedLevelTools");
  const infoSelector = replayLevelUiSelector("#activeLevelInfo", "#backtestActiveLevelInfo");
  document.querySelector(drawSelector)?.classList.toggle("active", replayState.drawingLevel);
  const selected = selectedManualLevel();
  document.querySelector(selectedToolsSelector)?.classList.toggle("hidden", !selected);
  updateLevelTrainingUi();
  const info = document.querySelector(infoSelector);
  if (info) info.textContent = replayLevelInfoText();
}

function updateReplayCurrentDate() {
  const node = document.querySelector("#replayCurrentDate");
  if (!node) return;
  const candle = currentReplayCandle();
  node.textContent = replayState.blindMode && candle ? "日期已隐藏" : candle?.date || "--";
}

function drawReplayChart() {
  const canvas = replayChartCanvas();
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const candles = replayVisibleCandles();
  if (!candles.length) {
    ctx.fillStyle = "#647284";
    ctx.font = "16px Microsoft YaHei, sans-serif";
    const message = replayState.data
      ? `${timeframeLabel()}\u884c\u60c5\u5c1a\u672a\u5bfc\u5165`
      : "\u7b49\u5f85\u52a0\u8f7dK\u7ebf\u6570\u636e";
    ctx.fillText(message, 24, 40);
    return;
  }

  const scale = replayChartScale();
  if (!scale) return;
  const { min, max, priceTop, priceBottom, chartHeight, y } = scale;
  const volumeTop = priceBottom + 18;
  const volumeBottom = Math.round(height * 0.78);
  const macdTop = volumeBottom + 20;
  const macdBottom = height - 48;
  const step = candleStep(width, candles.length);
  const bodyWidth = Math.max(Math.min(step * 0.62, 10), 1);

  ctx.strokeStyle = "#edf1f5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const gy = priceTop + i * (chartHeight / 4);
    ctx.beginPath();
    ctx.moveTo(44, gy);
    ctx.lineTo(width - 20, gy);
    ctx.stroke();
  }

  function drawLevel(price, color, label, active = false, selected = false) {
    if (price <= 0) return;
    const ly = y(price);
    ctx.strokeStyle = color;
    ctx.lineWidth = selected ? 3 : active ? 2.2 : 1.2;
    ctx.setLineDash(selected ? [] : [6, 5]);
    ctx.beginPath();
    ctx.moveTo(44, ly);
    ctx.lineTo(width - 20, ly);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(width - 28, ly, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(`${label} ${formatPrice(price)}`, 48, Math.max(14, ly - 6));
    ctx.lineWidth = 1;
  }

  const nearest = nearestManualLevels();
  const currentPrice = currentReplayCandle()?.close || 0;
  replayState.manualLevels.forEach((level) => {
    const selected = level.id === replayState.selectedLevelId;
    const active = selected || level.id === nearest.support?.id || level.id === nearest.resistance?.id;
    const type = level.price <= currentPrice ? "support" : "resistance";
    drawLevel(level.price, type === "support" ? "#16865a" : "#c2413b", type === "support" ? "支撑" : "压力", active, selected);
  });

  const closes = candles.map((item) => item.close);
  const ma5 = sma(closes, 5);
  const ma10 = sma(closes, 10);

  function drawLine(values, color, label) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    let started = false;
    values.forEach((value, index) => {
      if (value === null) return;
      const x = 48 + index * step;
      const py = y(value);
      if (!started) {
        ctx.moveTo(x, py);
        started = true;
      } else {
        ctx.lineTo(x, py);
      }
    });
    if (started) ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(label, label === "MA5" ? 48 : 94, 16);
  }

  candles.forEach((item, index) => {
    const x = 48 + index * step;
    const up = item.close >= item.open;
    const color = up ? "#c2413b" : "#16865a";
    ctx.strokeStyle = color;
    ctx.fillStyle = up ? "#fff" : color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y(item.high));
    ctx.lineTo(x, y(item.low));
    ctx.stroke();
    const openY = y(item.open);
    const closeY = y(item.close);
    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(Math.abs(openY - closeY), 2);
    ctx.strokeRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
    if (!up) ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight);
  });

  drawLine(ma5, "#b7791f", "MA5");
  drawLine(ma10, "#2369b8", "MA10");

  const maxVolume = Math.max(...candles.map((item) => item.volume || 0), 1);
  candles.forEach((item, index) => {
    const x = 48 + index * step;
    const barHeight = ((item.volume || 0) / maxVolume) * (volumeBottom - volumeTop);
    ctx.fillStyle = item.close >= item.open ? "rgba(194, 65, 59, 0.45)" : "rgba(22, 134, 90, 0.45)";
    ctx.fillRect(x - bodyWidth / 2, volumeBottom - barHeight, bodyWidth, Math.max(barHeight, 1));
  });
  ctx.fillStyle = "#647284";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText("成交量", 48, volumeTop - 5);

  const macd = macdSeries(candles);
  const macdValues = [...macd.dif, ...macd.dea, ...macd.hist].map((value) => Math.abs(value));
  const macdMax = Math.max(...macdValues, 0.01);
  const macdZero = macdTop + (macdBottom - macdTop) / 2;
  const macdY = (value) => macdZero - (value / macdMax) * ((macdBottom - macdTop) / 2);
  ctx.strokeStyle = "#e2e8f0";
  ctx.beginPath();
  ctx.moveTo(44, macdZero);
  ctx.lineTo(width - 20, macdZero);
  ctx.stroke();
  macd.hist.forEach((value, index) => {
    const x = 48 + index * step;
    const py = macdY(value);
    ctx.fillStyle = value >= 0 ? "rgba(194, 65, 59, 0.55)" : "rgba(22, 134, 90, 0.55)";
    ctx.fillRect(x - bodyWidth / 2, Math.min(py, macdZero), bodyWidth, Math.max(Math.abs(py - macdZero), 1));
  });
  function drawMacdLine(values, color, label, labelX) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    values.forEach((value, index) => {
      const x = 48 + index * step;
      const py = macdY(value);
      if (index === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    });
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillText(label, labelX, macdTop - 5);
  }
  drawMacdLine(macd.dif, "#2369b8", "DIF", 104);
  drawMacdLine(macd.dea, "#b7791f", "DEA", 144);
  ctx.fillStyle = "#647284";
  ctx.fillText("MACD", 48, macdTop - 5);

  const annotationMap = replayAnnotationMap();
  candles.forEach((item, index) => {
    const annotations = annotationMap.get(item.date);
    if (!annotations?.length) return;
    const x = 48 + index * step;
    const markerY = y(item.high) - 12;
    const latest = annotations.at(-1);
    const fill = latest.action === "buy" ? "#2369b8" : latest.action === "sell" ? "#c2413b" : "#647284";
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, Math.max(priceTop + 10, markerY), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "9px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(latest.action === "buy" ? "B" : latest.action === "sell" ? "S" : "N", x, Math.max(priceTop + 13, markerY + 3));
    ctx.textAlign = "left";
  });

  if (replayState.hoverIndex !== null && candles[replayState.hoverIndex]) {
    const item = candles[replayState.hoverIndex];
    const prevItem = candles[replayState.hoverIndex - 1];
    const changePct = prevItem?.close > 0 ? ((item.close - prevItem.close) / prevItem.close) * 100 : null;
    const x = 48 + replayState.hoverIndex * step;
    const hoverY = Math.max(priceTop, Math.min(priceBottom, replayState.hoverY ?? y(item.close)));
    const hoverPrice = max - ((hoverY - priceTop) / (chartHeight || 1)) * (max - min);
    ctx.strokeStyle = "#2369b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, priceTop);
    ctx.lineTo(x, macdBottom);
    ctx.moveTo(44, hoverY);
    ctx.lineTo(width - 20, hoverY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#2369b8";
    ctx.fillRect(44, hoverY - 10, 56, 20);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Microsoft YaHei, sans-serif";
    ctx.fillText(formatPrice(hoverPrice), 50, hoverY + 4);

    const hoverAnnotations = annotationMap.get(item.date) || [];
    const selectedAnnotations = replayState.selectedNoteDate === item.date ? annotationMap.get(replayState.selectedNoteDate) || [] : [];
    const activeAnnotations = hoverAnnotations.length ? hoverAnnotations : selectedAnnotations;
    const hoverDateText = replayState.blindMode ? "日期已隐藏" : item.date;
    const lines = [
      `${hoverDateText}  开:${formatPrice(item.open)} 收:${formatPrice(item.close)} 高:${formatPrice(item.high)} 低:${formatPrice(item.low)} 涨跌:${changePct === null ? "--" : formatPercent(changePct)}`,
      `光标价 ${formatPrice(hoverPrice)}`,
      ...activeAnnotations.slice(-3).map((note) => `${replayActionLabel(note.action)}：${note.annotationText}`),
    ];
    ctx.font = "12px Microsoft YaHei, sans-serif";
    const textWidth = Math.max(...lines.map((line) => ctx.measureText(line).width));
    const boxX = 116;
    const boxY = priceTop + 8;
    const boxHeight = 12 + lines.length * 18;
    ctx.fillStyle = "rgba(23, 32, 42, 0.88)";
    ctx.fillRect(boxX, boxY, Math.min(textWidth + 18, width - 96), boxHeight);
    ctx.fillStyle = "#ffffff";
    lines.forEach((line, index) => {
      ctx.fillText(line, boxX + 9, boxY + 19 + index * 18);
    });
  }

  const last = candles.at(-1);
  const lastDateText = replayState.blindMode ? "日期已隐藏" : last.date;
  ctx.fillStyle = "#17202a";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText(`${lastDateText}${last.realtime ? " 实时" : ""}  O:${formatPrice(last.open)} H:${formatPrice(last.high)} L:${formatPrice(last.low)} C:${formatPrice(last.close)}`, 48, height - 20);
}

function updateReplayHover(event) {
  if (!replayState.data) return;
  if (replayState.isDragging) return;
  const canvas = replayChartCanvas();
  const candles = replayVisibleCandles();
  if (!canvas || !candles.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const canvasX = x * scaleX;
  const step = candleStep(canvas.width, candles.length);
  const index = Math.round((canvasX - 48) / step);
  replayState.hoverIndex = Math.max(0, Math.min(candles.length - 1, index));
  replayState.hoverY = y * scaleY;
  drawReplayChart();
}

function startReplayDrag(event) {
  if (!replayState.data || event.button !== 0) return;
  const canvas = replayChartCanvas();
  const scale = replayChartScale();
  if (!canvas || !scale) return;
  const rect = canvas.getBoundingClientRect();
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  const hit = replayState.manualLevels.find((level) => Math.abs(scale.y(level.price) - y) <= 7);
  if (hit) {
    event.preventDefault();
    event.stopPropagation();
    replayState.selectedLevelId = hit.id;
    replayState.draggingLevelId = hit.id;
    replayState.dragLevelStart = { ...hit };
    replayState.lastLevelHitId = hit.id;
    replayState.suppressNextCanvasClick = true;
    replayState.dragMoved = false;
    syncManualLevelInputs();
    updateLevelToolUi();
    drawReplayChart();
    canvas.classList.add("dragging");
    return;
  }
  replayState.isDragging = true;
  replayState.dragMoved = false;
  replayState.dragStartX = event.clientX;
  replayState.dragStartOffset = replayState.dragOffset || 0;
  replayChartCanvas()?.classList.add("dragging");
}

function dragReplayChart(event) {
  if (replayState.draggingLevelId) {
    const canvas = replayChartCanvas();
    const scale = replayChartScale();
    if (!canvas || !scale) return;
    const rect = canvas.getBoundingClientRect();
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const price = Math.max(0.01, scale.priceAtY(Math.max(scale.priceTop, Math.min(scale.priceBottom, y))));
    const level = replayState.manualLevels.find((item) => item.id === replayState.draggingLevelId);
    if (level) {
      level.price = price;
      replayState.dragMoved = true;
      replayState.lastLevelHitId = null;
      updateLevelToolUi();
      refreshReplayAdviceFromLevels({ resetFeedback: true });
    }
    return;
  }
  if (!replayState.isDragging || !replayState.data) return;
  const canvas = replayChartCanvas();
  const candles = replayVisibleCandles();
  if (!canvas || !candles.length) return;
  const rect = canvas.getBoundingClientRect();
  const step = candleStep(canvas.width, candles.length);
  const scaleX = canvas.width / rect.width;
  const delta = (event.clientX - replayState.dragStartX) * scaleX;
  const offsetDelta = Math.round(delta / step);
  if (Math.abs(delta) > 4) replayState.dragMoved = true;
  if (replayState.dragMoved) replayState.lastLevelHitId = null;
  replayState.dragOffset = replayState.dragStartOffset + offsetDelta;
  clampReplayDragOffset();
  replayState.hoverIndex = null;
  replayState.hoverY = null;
  drawReplayChart();
}

function endReplayDrag() {
  if (replayState.draggingLevelId) {
    if (!replayState.dragMoved) {
      replayState.selectedLevelId = replayState.draggingLevelId;
      replayState.drawingLevel = false;
      updateLevelToolUi();
      refreshReplayAdviceFromLevels();
      replayState.lastLevelHitId = null;
      replayState.dragMoved = false;
    } else {
      const level = replayState.manualLevels.find((item) => item.id === replayState.draggingLevelId);
      if (level && replayState.dragLevelStart) {
        recordLevelCorrection("move", level, {
          fromPrice: replayState.dragLevelStart.price,
          toPrice: level.price,
          reason: level.reason || "",
          side: levelTrainingSide(level.price),
        });
      }
      saveReplayLevels();
      updateLevelTrainingUi();
    }
    replayState.draggingLevelId = null;
    replayState.dragLevelStart = null;
    replayChartCanvas()?.classList.remove("dragging");
    return;
  }
  if (!replayState.isDragging) return;
  replayState.isDragging = false;
  replayChartCanvas()?.classList.remove("dragging");
}

function selectReplayAnnotation(event) {
  if (!replayState.data) return;
  if (replayState.suppressNextCanvasClick) {
    replayState.suppressNextCanvasClick = false;
    replayState.lastLevelHitId = null;
    replayState.dragMoved = false;
    updateLevelToolUi();
    refreshReplayAdviceFromLevels();
    return;
  }
  if (replayState.lastLevelHitId && !replayState.dragMoved) {
    replayState.selectedLevelId = replayState.lastLevelHitId;
    replayState.lastLevelHitId = null;
    replayState.drawingLevel = false;
    updateLevelToolUi();
    refreshReplayAdviceFromLevels();
    return;
  }
  if (replayState.dragMoved) {
    replayState.dragMoved = false;
    replayState.lastLevelHitId = null;
    return;
  }
  const canvas = replayChartCanvas();
  const candles = replayVisibleCandles();
  if (!canvas || !candles.length) return;
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const scale = replayChartScale();
  if (scale && replayState.drawingLevel) {
    const canvasY = y * (canvas.height / rect.height);
    const canvasX = x * (canvas.width / rect.width);
    const hit = replayState.manualLevels.find((level) => Math.abs(scale.y(level.price) - canvasY) <= 7);
    if (hit) {
      replayState.selectedLevelId = hit.id;
      replayState.drawingLevel = false;
      updateLevelToolUi();
      refreshReplayAdviceFromLevels();
      setStatus("#replayStatus", "已选中支撑压力线，可进行对应操作。", "neutral");
      return;
    }
    if (canvasX >= 44 && canvasX <= canvas.width - 20 && canvasY >= scale.priceTop && canvasY <= scale.priceBottom) {
      const levelPrice = Math.max(0.01, scale.priceAtY(canvasY));
      const current = currentReplayCandle()?.close || 0;
      const level = {
        id: createLevelId("manual"),
        price: levelPrice,
        role: levelPrice <= current ? "support" : "effective_resistance",
        reason: "",
      };
      replayState.manualLevels.push(level);
      replayState.selectedLevelId = level.id;
      replayState.drawingLevel = false;
      recordLevelCorrection("add", level, {
        toPrice: level.price,
        side: levelTrainingSide(level.price),
      });
      saveReplayLevels();
      updateLevelToolUi();
      refreshReplayAdviceFromLevels({ resetFeedback: true });
      setStatus("#replayStatus", "已添加支撑压力线，可拖动调整，并在画布上方填写画线原因。", "positive");
      return;
    }
    replayState.drawingLevel = false;
    replayState.selectedLevelId = null;
    updateLevelToolUi();
    refreshReplayAdviceFromLevels();
    setStatus("#replayStatus", "已退出画线模式。", "neutral");
    return;
  } else if (scale) {
    const canvasY = y * (canvas.height / rect.height);
    const hit = replayState.manualLevels.find((level) => Math.abs(scale.y(level.price) - canvasY) <= 7);
    if (hit) {
      replayState.selectedLevelId = hit.id;
      updateLevelToolUi();
      refreshReplayAdviceFromLevels();
      return;
    }
    replayState.selectedLevelId = null;
    updateLevelToolUi();
    refreshReplayAdviceFromLevels();
  }
  const scaleX = canvas.width / rect.width;
  const canvasX = x * scaleX;
  const step = candleStep(canvas.width, candles.length);
  const index = Math.round((canvasX - 48) / step);
  const candle = candles[Math.max(0, Math.min(candles.length - 1, index))];
  const annotations = replayAnnotationMap().get(candle.date) || [];
  replayState.selectedNoteDate = annotations.length ? candle.date : null;
  drawReplayChart();
}

function clearReplayHover() {
  replayState.hoverIndex = null;
  replayState.hoverY = null;
  drawReplayChart();
}

function deleteSelectedLevel() {
  const selected = selectedManualLevel();
  if (!selected) {
    setStatus("#replayStatus", "请先在画布上选中一条支撑压力线。", "negative");
    return;
  }
  recordLevelCorrection("delete", selected, {
    fromPrice: selected.price,
    reason: selected.reason || "",
    side: manualLevelType(selected),
  });
  replayState.manualLevels = replayState.manualLevels.filter((level) => level.id !== selected.id);
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  saveReplayLevels();
  updateLevelToolUi();
  refreshReplayAdviceFromLevels({ resetFeedback: true });
  setStatus("#replayStatus", "已删除选中的支撑压力线。", "neutral");
}

function saveSelectedLevelReason() {
  const selected = selectedManualLevel();
  if (!selected) {
    setReplayChartStatus("\u8bf7\u5148\u5728\u753b\u5e03\u4e0a\u9009\u4e2d\u4e00\u6761\u652f\u6491\u538b\u529b\u7ebf\u3002", "negative");
    return;
  }
  const reasonInput = document.querySelector("#selectedLevelReason");
  const roleInput = document.querySelector("#selectedLevelRole");
  const previousReason = selected.reason || "";
  const previousRole = inferredLevelRole(selected);
  selected.reason = reasonInput?.value.trim() || "";
  selected.role = LEVEL_ROLE_LABELS[roleInput?.value] ? roleInput.value : previousRole;
  if (selected.reason !== previousReason || selected.role !== previousRole) {
    recordLevelCorrection("reason", selected, {
      toPrice: selected.price,
      reason: selected.reason,
      side: manualLevelType(selected),
      role: selected.role,
      previousRole,
    });
  }
  replayState.drawingLevel = false;
  replayState.selectedLevelId = null;
  saveReplayLevels();
  updateLevelToolUi();
  refreshReplayAdviceFromLevels();
  setReplayChartStatus("\u5df2\u5199\u5165\u9009\u4e2d\u7ebf\u7684\u7c7b\u578b\u548c\u539f\u56e0\u3002", "positive");
}


function autoLevelHistory() {
  const daily = replayState.data?.timeframes?.daily || [];
  if (!daily.length) return [];
  return dailyToWeeklyCandles(daily.slice(0, replayState.cursor + 1)).slice(-180);
}

function dailyToWeeklyCandles(dailyCandles = []) {
  const weeks = [];
  dailyCandles.forEach((candle) => {
    const date = new Date(`${candle.date}T00:00:00`);
    if (Number.isNaN(date.getTime())) return;
    const day = date.getDay() || 7;
    date.setDate(date.getDate() + (5 - day));
    const weekKey = formatDateInputValue(date);
    let week = weeks.at(-1);
    if (!week || week.date !== weekKey) {
      week = {
        date: weekKey,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume || 0,
      };
      weeks.push(week);
      return;
    }
    week.high = Math.max(week.high, candle.high);
    week.low = Math.min(week.low, candle.low);
    week.close = candle.close;
    week.volume = (week.volume || 0) + (candle.volume || 0);
  });
  return weeks;
}

function autoLevelSwings(candles, windowSize = 4) {
  const points = [];
  for (let index = windowSize; index < candles.length - windowSize; index += 1) {
    const slice = candles.slice(index - windowSize, index + windowSize + 1);
    const candle = candles[index];
    const high = Math.max(...slice.map((item) => item.high));
    const low = Math.min(...slice.map((item) => item.low));
    const recency = index / Math.max(candles.length - 1, 1);
    if (candle.high === high) {
      points.push({ price: candle.high, kind: "swing_high", weight: 1.2 + recency * 0.6 });
    }
    if (candle.low === low) {
      points.push({ price: candle.low, kind: "swing_low", weight: 1.2 + recency * 0.6 });
    }
  }
  return points;
}

function autoLevelBodyZones(candles, binPct = 0.012) {
  const groups = new Map();
  candles.forEach((candle, index) => {
    const bodyLow = Math.min(candle.open, candle.close);
    const bodyHigh = Math.max(candle.open, candle.close);
    const mid = (bodyLow + bodyHigh) / 2;
    if (mid <= 0) return;
    const key = Math.round(mid / (mid * binPct));
    const group = groups.get(key) || { prices: [], weight: 0 };
    group.prices.push(mid, bodyLow, bodyHigh);
    group.weight += 0.55 + (index / Math.max(candles.length - 1, 1)) * 0.35;
    groups.set(key, group);
  });
  return [...groups.values()]
    .filter((group) => group.prices.length >= 8)
    .map((group) => ({
      price: average(group.prices, (value) => value),
      kind: "body_cluster",
      weight: group.weight,
    }));
}

function clusterAutoLevels(points, currentPrice, mergePct = 0.018) {
  const sorted = points.filter((point) => point.price > 0).sort((a, b) => a.price - b.price);
  const clusters = [];
  sorted.forEach((point) => {
    const last = clusters.at(-1);
    if (last && Math.abs(point.price - last.price) / last.price <= mergePct) {
      last.points.push(point);
      last.weight += point.weight;
      last.price = average(last.points, (item) => item.price);
    } else {
      clusters.push({ price: point.price, weight: point.weight, points: [point] });
    }
  });
  return clusters.map((cluster) => {
    const swingHighs = cluster.points.filter((point) => point.kind === "swing_high").length;
    const swingLows = cluster.points.filter((point) => point.kind === "swing_low").length;
    const bodyClusters = cluster.points.filter((point) => point.kind === "body_cluster").length;
    const distancePct = Math.abs(cluster.price - currentPrice) / Math.max(currentPrice, 0.01);
    const distanceScore = Math.max(0, 2 - distancePct * 10);
    const type = cluster.price <= currentPrice ? "support" : "resistance";
    const reasons = [];
    if (swingLows) reasons.push(`摆动低点${swingLows}次`);
    if (swingHighs) reasons.push(`摆动高点${swingHighs}次`);
    if (bodyClusters) reasons.push("K线实体密集区");
    return {
      price: cluster.price,
      type,
      score: cluster.weight + distanceScore,
      reason: `自动识别：${reasons.join("，") || "价格反复触碰"}；距离当前价${(distancePct * 100).toFixed(1)}%`,
    };
  });
}

function autoDrawLevelLines({ silent = false } = {}) {
  if (!replayState.data) {
    if (!silent) setStatus("#replayStatus", "请先开始训练并加载K线数据。", "negative");
    return;
  }
  const candle = currentReplayCandle();
  const candles = autoLevelHistory();
  if (!candle || candles.length < 30) {
    if (!silent) setStatus("#replayStatus", "可用周线太少，暂时无法自动画线。", "negative");
    return;
  }
  const currentPrice = candle.close;
  const points = [
    ...autoLevelSwings(candles, 3),
    ...autoLevelBodyZones(candles, 0.014),
  ];
  const clusters = clusterAutoLevels(points, currentPrice, 0.02)
    .filter((level) => Math.abs(level.price - currentPrice) / currentPrice <= 0.35);
  replayState.autoLevelSnapshot = {
    ...levelTrainingContext(),
    params: {
      lookbackWeeks: 180,
      swingWindow: 3,
      bodyBinPct: 0.014,
      mergePct: 0.02,
      maxDistancePct: 0.35,
    },
    autoLevels: clusters
      .slice()
      .sort((a, b) => Math.abs(a.price - currentPrice) - Math.abs(b.price - currentPrice))
      .slice(0, 12)
      .map((level) => ({
        price: level.price,
        side: level.type,
        score: level.score,
        reason: level.reason,
      })),
  };
  const existingLevels = replayState.manualLevels.filter((level) => level.price > 0);
  const existingSupport = existingLevels
    .filter((level) => level.price < currentPrice)
    .sort((a, b) => (currentPrice - a.price) - (currentPrice - b.price))[0];
  const existingResistance = existingLevels
    .filter((level) => level.price > currentPrice)
    .sort((a, b) => (a.price - currentPrice) - (b.price - currentPrice))[0];
  const candidateSupport = clusters
    .filter((level) => level.price < currentPrice)
    .filter((level) => !existingLevels.some((existing) => Math.abs(existing.price - level.price) / currentPrice <= 0.006))
    .sort((a, b) => (currentPrice - a.price) - (currentPrice - b.price) || b.score - a.score)[0];
  const candidateResistance = clusters
    .filter((level) => level.price > currentPrice)
    .filter((level) => !existingLevels.some((existing) => Math.abs(existing.price - level.price) / currentPrice <= 0.006))
    .sort((a, b) => (a.price - currentPrice) - (b.price - currentPrice) || b.score - a.score)[0];
  const supportLine = existingSupport || candidateSupport;
  const resistanceLine = existingResistance || candidateResistance;
  const selected = [
    existingSupport ? null : candidateSupport,
    existingResistance ? null : candidateResistance,
  ].filter(Boolean);
  if (!supportLine && !resistanceLine) {
    if (!silent) setStatus("#replayStatus", "没有找到足够可靠的支撑压力候选线。", "negative");
    return;
  }
  let addedCount = 0;
  selected.forEach((level) => {
    const duplicate = replayState.manualLevels.some((manual) => Math.abs(manual.price - level.price) / currentPrice <= 0.006);
    if (duplicate) return;
    replayState.manualLevels.push({
      id: level.id || createLevelId("auto"),
      price: level.price,
      role: level.price < currentPrice ? "support" : "effective_resistance",
      reason: level.reason,
      auto: true,
      score: level.score ?? null,
      validationStatus: "candidate",
    });
    addedCount += 1;
  });
  replayState.manualLevels = replayState.manualLevels.sort((a, b) => a.price - b.price);
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  saveReplayLevels();
  syncManualLevelInputs();
  updateLevelToolUi();
  updateReplayUi();
  const supportText = supportLine ? `支撑 ${formatPrice(supportLine.price)}` : "下方支撑未找到";
  const resistanceText = resistanceLine ? `压力 ${formatPrice(resistanceLine.price)}` : "上方压力未找到";
  const message = `周线自动线已更新：${supportText}，${resistanceText}。${addedCount ? `本次补齐 ${addedCount} 条。` : "无需新增。"}可继续拖动、删除或写原因。`;
  if (!silent) setReplayChartStatus(message, "positive");
  return { addedCount, supportLine, resistanceLine, message };
}

function detectBrokenManualLevel(previousCandle, candle) {
  if (!previousCandle || !candle || !replayState.manualLevels.length) return null;
  const previousClose = Number(previousCandle.close) || 0;
  const currentClose = Number(candle.close) || 0;
  if (previousClose <= 0 || currentClose <= 0) return null;
  const levels = replayState.manualLevels.map(ensureLevelRole).filter((level) => Number(level.price) > 0);
  const brokenSupports = levels
    .filter((level) => inferredLevelRole(level) === "support")
    .filter((level) => level.price <= previousClose && currentClose < level.price)
    .sort((a, b) => b.price - a.price);
  const brokenResistances = levels
    .filter((level) => inferredLevelRole(level) !== "support")
    .filter((level) => level.price >= previousClose && currentClose > level.price)
    .sort((a, b) => a.price - b.price);
  if (brokenSupports.length) return { type: "support", level: brokenSupports[0] };
  if (brokenResistances.length) return { type: "resistance", level: brokenResistances[0] };
  return null;
}

function convertBrokenPressureToSupport(previousCandle, candle) {
  if (!previousCandle || !candle || !replayState.manualLevels.length) return "";
  const previousClose = Number(previousCandle.close) || 0;
  const currentClose = Number(candle.close) || 0;
  if (previousClose <= 0 || currentClose <= 0) return "";
  const changed = [];
  const currentCandle = candle;
  replayState.manualLevels.forEach((level) => {
    ensureLevelRole(level);
    const price = Number(level.price) || 0;
    if (!price) return;
    const previousRole = inferredLevelRole(level);

    // 突破压力 -> 支撑
    if (!["support", "pending_support"].includes(previousRole) && previousClose <= price && currentClose > price) {
      level.role = "pending_support";
      level.validationStatus = "testing";
      if (!String(level.reason || "").includes("等待回踩确认")) {
        level.reason = level.reason ? `${level.reason}；突破后等待回踩确认` : "突破压力后等待回踩确认";
      }
      recordLevelCorrection("role_change", level, {
        fromPrice: price, toPrice: price, side: "support", role: "pending_support", previousRole, reason: level.reason,
      });
      changed.push({ price, direction: "突破压力", newRole: "待回踩确认支撑" });
    }
    if (previousRole === "pending_support"
      && currentClose >= price * 0.995
      && currentClose <= price * 1.02
      && currentClose >= Number(currentCandle.open || 0)) {
      level.role = "support";
      level.validationStatus = "validated";
      level.reason = level.reason ? `${level.reason}；回踩确认支撑` : "突破后回踩确认支撑";
      recordLevelCorrection("role_change", level, {
        fromPrice: price, toPrice: price, side: "support", role: "support", previousRole, reason: level.reason,
      });
      changed.push({ price, direction: "突破后回踩", newRole: "支撑" });
    }
    // 跌破支撑 -> 有效压力
    if (["support", "pending_support"].includes(previousRole) && previousClose >= price && currentClose < price) {
      level.role = "effective_resistance";
      level.validationStatus = "broken";
      if (!String(level.reason || "").includes("跌破后转压力")) {
        level.reason = level.reason ? `${level.reason}；跌破后转压力` : "跌破支撑后转压力";
      }
      recordLevelCorrection("role_change", level, {
        fromPrice: price, toPrice: price, side: "resistance", role: "effective_resistance", previousRole, reason: level.reason,
      });
      changed.push({ price, direction: "跌破支撑", newRole: "有效压力" });
    }
  });
  if (!changed.length) return "";
  saveReplayLevels();
  const messages = changed.map((c) => `${c.direction} ${formatPrice(c.price)}，转为${c.newRole}。`).join("");
  return messages;
}

function updateDynamicLevelValidation(previousCandle, candle) {
  if (!candle || !replayState.manualLevels.length) return "";
  const current = Number(candle.close) || 0;
  if (current <= 0) return "";
  const recent = (replayState.data?.timeframes?.daily || [])
    .slice(0, replayState.cursor + 1)
    .slice(-30);
  const messages = [];
  replayState.manualLevels.forEach((level) => {
    ensureLevelRole(level);
    const price = Number(level.price) || 0;
    if (!price) return;
    const role = inferredLevelRole(level);
    const near = Math.abs(current - price) / price <= 0.025;
    const bullish = Number(candle.close) >= Number(candle.open);
    const bearish = Number(candle.close) <= Number(candle.open);
    const supportTests = recent.filter((item) => Number(item.low) <= price * 1.015 && Number(item.close) >= price * 0.995).length;
    const resistanceTests = recent.filter((item) => Number(item.high) >= price * 0.985 && Number(item.close) <= price * 1.005).length;
    if (role === "support" && level.validationStatus !== "broken") {
      if (near && level.validationStatus === "candidate") level.validationStatus = "testing";
      if (supportTests >= 2 && bullish && Number(candle.close) >= price * 0.995) {
        if (level.validationStatus !== "validated") messages.push(`支撑 ${formatPrice(price)} 完成回踩确认`);
        level.validationStatus = "validated";
      }
      if (previousCandle && Number(previousCandle.close) >= price && current < price * 0.99) {
        level.validationStatus = "broken";
        level.reason = level.reason ? `${level.reason}；收盘跌破待重新验证` : "收盘跌破，原支撑失效";
      }
    }
    if (role !== "support" && level.validationStatus !== "broken") {
      if (near && level.validationStatus === "candidate") level.validationStatus = "testing";
      if (resistanceTests >= 2 && bearish && current <= price * 1.005) level.validationStatus = "validated";
    }
    if (role === "support" || role === "pending_support") {
      const result = evaluateSupportPathValidation(recent.length ? (replayState.data?.timeframes?.daily || []).slice(0, replayState.cursor + 1) : [candle], price, { source: "manual" });
      const previousBypass = level.bypassStatus || "";
      if (previousBypass && previousBypass !== result.status) {
        messages.push(`支撑 ${formatPrice(price)} 验证状态 ${level.bypassStatusLabel || previousBypass}→${result.label}：${result.validationReason}`);
      }
      level.bypassStatus = result.status;
      level.bypassStatusLabel = result.label;
      level.pathId = result.pathId;
      level.pathLabel = result.pathLabel;
      level.validationReason = result.validationReason;
      level.supportValidationReason = result.supportValidationReason;
      if (!String(level.validationReason || "").trim()) {
        level.validationReason = `${candle.date || ""} 支撑验证状态更新，原因未写明。`;
        level.supportValidationReason = level.validationReason;
      }
    }
  });
  if (!messages.length) return "";
  saveReplayLevels();
  return messages.join("；");
}

function autoDrawAfterLevelBreak(previousCandle, candle) {
  const broken = detectBrokenManualLevel(previousCandle, candle);
  if (!broken || !candle) return "";
  const key = `${candle.date}:${broken.type}:${broken.level.id}:${formatPrice(broken.level.price)}`;
  if (replayState.autoBreakDrawKeys?.includes(key)) return "";
  replayState.autoBreakDrawKeys = [...(replayState.autoBreakDrawKeys || []), key].slice(-80);
  const directionText = broken.type === "support" ? "跌破支撑" : "突破压力";
  return `检测到${directionText} ${formatPrice(broken.level.price)}，不自动补支撑压力线；请人工确认是否需要重画。`;
}

function zoomReplayChart(direction) {
  if (!replayState.data) return;
  const next = replayState.visibleCount + direction * 20;
  replayState.visibleCount = Math.max(30, Math.min(700, next));
  clampReplayDragOffset();
  replayState.hoverIndex = null;
  replayState.hoverY = null;
  replayState.selectedNoteDate = null;
  drawReplayChart();
  setStatus("#replayStatus", `当前显示 ${replayState.visibleCount} 根K线。`, "neutral");
}

function replayDailyHistory() {
  const daily = replayState.data?.timeframes?.daily || [];
  if (!daily.length) return [];
  return daily.slice(0, replayState.cursor + 1);
}

function average(items, selector) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + selector(item), 0) / items.length;
}

function pressurePlanFromLevels(nearest, options = {}) {
  const conservative = nearest.effectiveResistance || nearest.nearResistance || nearest.resistance || null;
  const breakoutTarget = nearest.breakoutTarget || null;
  const allowBreakout = Boolean(options.allowBreakout && breakoutTarget);
  const selected = allowBreakout ? breakoutTarget : conservative || breakoutTarget;
  const mode = allowBreakout ? "breakout" : "conservative";
  return {
    level: selected || null,
    price: selected?.price || null,
    mode,
    modeLabel: allowBreakout ? "\u7a81\u7834\u76ee\u6807\u53e3\u5f84" : "\u4fdd\u5b88\u538b\u529b\u53e3\u5f84",
    reason: allowBreakout
      ? "\u7a81\u7834/\u56de\u8e29\u786e\u8ba4\u6210\u7acb\uff0c\u8fd1\u7aef\u538b\u529b\u4e0d\u518d\u4f5c\u4e3a\u552f\u4e00\u76ee\u6807\uff0c\u91c7\u7528\u4e0b\u4e00\u5c42\u7a81\u7834\u76ee\u6807\u6d4b\u7b97\u76c8\u4e8f\u6bd4\u3002"
      : "\u666e\u901a\u4e70\u70b9\u6216\u4fee\u590d\u6a21\u578b\u5148\u770b\u4fdd\u5b88\u538b\u529b\uff0c\u4e0d\u4e3a\u4e86\u51d1 3R \u5f3a\u884c\u653e\u5927\u76ee\u6807\u3002",
    near: nearest.nearResistance || null,
    effective: nearest.effectiveResistance || null,
    breakoutTarget,
    conservative,
  };
}

function pressurePlanSummary(plan) {
  if (!plan?.level) return "\u672a\u753b\u4e0a\u65b9\u538b\u529b";
  return `${plan.modeLabel}\uff1a${levelRoleLabel(inferredLevelRole(plan.level))} ${formatPrice(plan.price)}`;
}

function ruleRiskRewardLine(candle, supportPrice, resistancePrice, fallbackStop = null, pressureLabel = "??") {
  if (!candle) return null;
  const entityLow = Math.min(candle.open, candle.close);
  const stopPrice = fallbackStop || (supportPrice ? Math.min(entityLow, supportPrice * 0.99) : entityLow);
  if (!resistancePrice || stopPrice <= 0 || candle.close <= stopPrice) {
    return {
      ratio: null,
      text: resistancePrice
        ? `止损参考 ${formatPrice(stopPrice)}，当前止损空间不理想。`
        : `止损参考 ${formatPrice(stopPrice)}；未画出上方压力，暂不计算固定盈亏比。`,
    };
  }
  const risk = candle.close - stopPrice;
  const reward = resistancePrice - candle.close;
  if (reward <= 0) {
    return { ratio: 0, text: `止损参考 ${formatPrice(stopPrice)}；当前已经贴近或高于压力位，不适合追。` };
  }
  const ratio = reward / risk;
  return {
    ratio,
    text: `止损 ${formatPrice(stopPrice)}，压力 ${formatPrice(resistancePrice)}，盈亏比 ${ratio.toFixed(2)}${ratio >= 3 ? "，满足规则库要求。" : "，暂未达到 3 以上。"}`,
  };
}

function ruleLibraryAdvice() {
  const history = replayDailyHistory();
  const candle = history.at(-1);
  if (!candle || history.length < 20) {
    const waitingAction = replayState.position ? "hold_position" : "watch";
    return {
      score: null,
      side: replayState.position ? "sell" : "buy",
      sideLabel: replayState.position ? "卖出管理" : "买入观察",
      action: waitingAction,
      actionText: replayState.position ? "继续持有" : "建议观望",
      stage: "K线不足",
      model: "AI建议等待更多数据",
      matched: ["当前可用K线不足"],
      missing: ["需要更多历史K线确认结构"],
      plan: ["先补足行情数据，再判断支撑压力和交易计划。"],
    };
  }
  const recent = history.slice(-30);
  const prev = history.at(-2);
  const prev2 = history.at(-3);
  const last20 = history.slice(-20);
  const last60 = history.slice(-60);
  const last120 = history.slice(-120);
  const last250 = history.slice(-250);
  const ma5 = average(history.slice(-5), (item) => item.close);
  const ma10 = average(history.slice(-10), (item) => item.close);
  const ma20 = average(history.slice(-20), (item) => item.close);
  const ma60 = average(history.slice(-60), (item) => item.close);
  const ma120 = average(history.slice(-120), (item) => item.close);
  const weeklyHistory = dailyToWeeklyCandles(history);
  const weeklyMa10 = average(weeklyHistory.slice(-10), (item) => item.close);
  const weeklyMa30 = average(weeklyHistory.slice(-30), (item) => item.close);
  const weeklyMa30TenWeeksAgo = weeklyHistory.length >= 40
    ? average(weeklyHistory.slice(-40, -10), (item) => item.close)
    : weeklyMa30;
  const weeklyLastClose = weeklyHistory.at(-1)?.close || candle.close;
  const weeklyDownScore = [
    weeklyLastClose < weeklyMa30,
    weeklyMa10 < weeklyMa30,
    weeklyMa30TenWeeksAgo > 0 && (weeklyMa30 - weeklyMa30TenWeeksAgo) / weeklyMa30TenWeeksAgo < -0.01,
  ].filter(Boolean).length;
  const weeklyDowntrend = weeklyHistory.length >= 30 && weeklyDownScore >= 2;
  const high20 = Math.max(...last20.slice(0, -1).map((item) => item.high));
  const low20 = Math.min(...last20.map((item) => item.low));
  const high60 = Math.max(...last60.map((item) => item.high));
  const low60 = Math.min(...last60.map((item) => item.low));
  const high120 = Math.max(...last120.map((item) => item.high));
  const high250 = Math.max(...last250.map((item) => item.high));
  const nearest = nearestManualLevels();
  const support = nearest.support;
  const supportPrice = support?.price || null;
  const nearSupport = supportPrice ? Math.abs(candle.close - supportPrice) / candle.close <= 0.035 : false;
  const brokeSupport = supportPrice ? recent.slice(0, -1).some((item) => item.low < supportPrice * 0.995) : false;
  const reclaimedSupport = supportPrice ? candle.low < supportPrice && candle.close > supportPrice : false;
  const reclaimSpacePct = supportPrice ? (candle.close - supportPrice) / supportPrice : 0;
  const reclaimHasEnoughSpace = reclaimSpacePct >= 0.025;
  const bullish = candle.close > candle.open;
  const bearish = candle.close < candle.open;
  const candleRange = Math.max(candle.high - candle.low, 0.001);
  const bearishBodyPct = candle.open > 0 ? (candle.open - candle.close) / candle.open : 0;
  const closeLocationInRange = (candle.close - candle.low) / candleRange;
  const bearishConfirmationFailure = bearish && bearishBodyPct >= 0.03 && closeLocationInRange <= 0.35;
  const averageVolume20 = history.length >= 25 ? average(history.slice(-20), (item) => item.volume) : 0;
  const volumeRatio20 = averageVolume20 > 0 ? (Number(candle.volume) || 0) / averageVolume20 : 1;
  const shrinkVolume = averageVolume20 > 0 && candle.volume < averageVolume20;
  const supportTouched = supportPrice ? candle.low <= supportPrice * 1.015 : false;
  const supportVolumeTooHigh = supportTouched && (volumeRatio20 >= 2 || (volumeRatio20 >= 1.5 && !bullish));
  const breakout20 = candle.close > high20;
  const candleRisePct = prev && prev.close > 0 ? (candle.close - prev.close) / prev.close : 0;
  const prevRisePct = prev2 && prev2.close > 0 && prev ? (prev.close - prev2.close) / prev2.close : 0;
  const twoDayRisePct = prev2 && prev2.close > 0 ? (candle.close - prev2.close) / prev2.close : 0;
  const consecutiveSurge = Boolean(
    prev
      && prev2
      && bullish
      && prev.close > prev.open
      && (candleRisePct >= 0.04 || prevRisePct >= 0.04 || twoDayRisePct >= 0.08)
  );
  const bigDrop = high60 > 0 && (high60 - low20) / high60 >= 0.18;
  const uptrendAcuteDrop = bigDrop && high60 > ma60 && ma20 >= ma60 * 0.95 && candle.close >= ma120 * 0.9;
  const twoUp = prev && prev.close > prev.open && bullish && candle.close > prev.close;
  const upStructure = candle.close > ma20 && ma5 >= ma10 && ma10 >= ma20;
  const weakStructure = candle.close < ma20 && ma5 < ma10;
  const longUpper = candle.high > Math.max(candle.open, candle.close) * 1.04;
  const bigBear = bearish && (candle.open - candle.close) / candle.open >= 0.04;
  const supportDistancePct = supportPrice ? (candle.close - supportPrice) / candle.close : null;
  const tooFarFromSupport = supportDistancePct != null && supportDistancePct > 0.08;
  const longDrawdown = high120 > 0 && (high120 - candle.close) / high120 >= 0.25;
  const mediumLongDrawdown = high120 > 0 && (high120 - candle.close) / high120 >= 0.20;
  const longCycleDrawdown = high250 > 0 && (high250 - candle.close) / high250 >= 0.35;
  const longTermPressure = candle.close < ma60 || candle.close < ma120;
  const recoveryAttempt = candle.close > ma20 || twoUp || reclaimedSupport || breakout20;
  const longTrendFlat = Math.abs(ma20 - ma60) / Math.max(candle.close, 0.01) <= 0.08 || (ma5 >= ma10 && ma10 >= ma20);
  const longDowntrendContext = longTermPressure && (longDrawdown || mediumLongDrawdown || longCycleDrawdown);
  const longDowntrendRepair = longTermPressure && recoveryAttempt && candle.close >= ma20 && (longDrawdown || mediumLongDrawdown || longCycleDrawdown);
  const prior60 = history.slice(-81, -1).slice(-60);
  const priorHigh60 = prior60.length ? Math.max(...prior60.map((item) => item.high)) : 0;
  const priorHighIndex = prior60.findIndex((item) => item.high === priorHigh60);
  const beforePriorHigh = priorHighIndex >= 0 ? prior60.slice(Math.max(0, priorHighIndex - 44), priorHighIndex + 1) : [];
  const priorLowBeforeHigh = beforePriorHigh.length ? Math.min(...beforePriorHigh.map((item) => item.low)) : 0;
  const priorUpGainPct = priorLowBeforeHigh > 0 ? (priorHigh60 - priorLowBeforeHigh) / priorLowBeforeHigh : 0;
  const dropFromPriorHighPct = priorHigh60 > 0 ? (priorHigh60 - low20) / priorHigh60 : 0;
  const priorUpThenFastDrop = priorUpGainPct >= 0.18 && dropFromPriorHighPct >= 0.12;
  const recent45 = history.slice(-45);
  const recent45Low = recent45.length ? Math.min(...recent45.map((item) => item.low)) : 0;
  const earlier45Low = recent45.length > 10 ? Math.min(...recent45.slice(0, -10).slice(-35).map((item) => item.low)) : recent45Low;
  const lowNoLongerFalls = recent45Low >= earlier45Low * 0.97;
  const bottomTouchHits = recent45Low > 0
    ? recent45.filter((item) => item.low <= recent45Low * 1.03).length
    : 0;
  const previous5 = history.slice(-6, -1);
  const platformHigh5 = previous5.length ? Math.max(...previous5.map((item) => item.high)) : 0;
  const platformLow5 = previous5.length ? Math.min(...previous5.map((item) => item.low)) : 0;
  const smallPlatform = previous5.length >= 4 && platformLow5 > 0 && (platformHigh5 - platformLow5) / platformLow5 <= 0.08;
  const currentSupportConfirm = supportPrice && prev
    ? bullish && candle.low <= supportPrice * 1.005 && candle.close > supportPrice && candle.close > prev.close && reclaimSpacePct >= 0.012
    : false;
  const lastSupportBreachIndex = supportPrice
    ? recent.slice(0, -1).reduce((found, item, index) => item.low < supportPrice * 0.995 ? index : found, -1)
    : -1;
  const afterSupportBreach = lastSupportBreachIndex >= 0 ? recent.slice(lastSupportBreachIndex + 1) : [];
  const multiDayReclaimConfirm = supportPrice
    ? afterSupportBreach.length >= 2
      && afterSupportBreach.every((item) => item.close >= supportPrice * 0.995)
      && bullish
      && candle.close > supportPrice * 1.006
      && reclaimSpacePct >= 0.02
      && candle.close >= Math.max(...recent.slice(0, -1).slice(-10).map((item) => item.high)) * 0.995
      && volumeRatio20 <= 1.5
    : false;
  const previousSupportRetestHeld = supportPrice && lastSupportBreachIndex >= 0
    ? recent.slice(lastSupportBreachIndex + 1, -1)
      .some((item) => item.low <= supportPrice * 1.02 && item.close >= supportPrice * 0.995)
    : false;
  const currentSupportRetestHeld = supportPrice
    ? candle.low <= supportPrice * 1.02 && candle.close >= supportPrice * 0.995
    : false;
  const priorSupportReclaimConfirmed = supportPrice
    ? lastSupportBreachIndex >= 0
      && recent[lastSupportBreachIndex].close >= supportPrice * 0.995
      && recent[lastSupportBreachIndex].low < supportPrice * 0.995
    : false;
  const priorBreachThenReclaim = supportPrice
    ? recent.slice(0, -1).some((item, index, items) =>
      item.close < supportPrice * 0.995
      && items.slice(index + 1).some((later) => later.close >= supportPrice * 1.006))
    : false;
  const compositeReclaimConfirm = supportPrice
    ? bullish
      && candle.low < supportPrice
      && candle.close > supportPrice
      && recent.slice(0, -1).some((item) => item.low < supportPrice * 0.995)
      && previous5.some((item) => item.low <= supportPrice * 1.02 && item.close >= supportPrice * 0.98)
    : false;
  const supportRetestHeld = previousSupportRetestHeld || currentSupportRetestHeld || currentSupportConfirm || compositeReclaimConfirm || multiDayReclaimConfirm;
  const repairConfirmed = supportRetestHeld || (smallPlatform && bullish) || twoUp || (breakout20 && bullish);
  const supportPiercedAndReclaimed = supportPrice
    ? recent.slice(0, -1).some((item) => item.close < supportPrice * 0.995)
      && candle.close > supportPrice
    : false;
  const closeBelowThenReclaimed = supportPrice && prev
    ? prev.close < supportPrice * 0.995 && candle.close > supportPrice
    : false;
  const closeBelowReclaimThenRetestConfirm = supportPrice
    ? recent.slice(0, -1).some((item, index, items) => {
      const reclaim = items[index + 1];
      return item.close < supportPrice * 0.995
        && reclaim
        && reclaim.close > supportPrice
        && bullish
        && candle.low <= supportPrice * 1.02
        && candle.close > supportPrice
        && candle.close > prev.close;
    })
    : false;
  const reclaimNextCandleConfirmed = supportPrice && prev
    ? prev.low < supportPrice * 0.995
      && prev.close > supportPrice
      && bullish
      && candle.close > prev.close
      && candle.close > supportPrice
    : false;
  const priorReclaimNextCandleConfirmed = supportPrice
    ? recent.slice(0, -2).some((item, index, items) => {
      const next = items[index + 1];
      return item.close < supportPrice * 0.995
        && next
        && next.close > next.open
        && next.close > item.close
        && next.close > supportPrice;
    })
    : false;
  const supportBreachedDeep = supportPrice ? Math.min(...recent.slice(0, -1).map((item) => item.low)) <= supportPrice * 0.96 : false;
  const priorPullbackVolume = previous5.length ? average(previous5, (item) => item.volume) : 0;
  const priorBaseVolume = recent.length >= 12 ? average(recent.slice(0, -1).slice(-12), (item) => item.volume) : 0;
  const priorPullbackShrunk = priorBaseVolume > 0 && priorPullbackVolume <= priorBaseVolume * 1.05;
  const confirmationVolumeAccepted = shrinkVolume || (bullish && priorPullbackShrunk && volumeRatio20 < 2);
  const pullbackReclaimConfirm = Boolean(
    supportPrice
      && bullish
      && prev
      && candle.close > prev.close
      && candle.low < supportPrice
      && candle.close > supportPrice
      && (recent.slice(0, -1).some((item) => item.low < supportPrice * 0.995) || closeBelowThenReclaimed)
  );
  const shrinkBullishRetestConfirm = Boolean(
    supportPrice
      && bullish
      && currentSupportRetestHeld
      && confirmationVolumeAccepted
      && (!prev || candle.close > prev.close)
  );
  const stableAfterAcuteDrop = supportRetestHeld && (smallPlatform || currentSupportConfirm || confirmationVolumeAccepted);
  const volumeOkForBottomConfirm = volumeRatio20 <= 1.5;
  const volumeOkForMultiBottom = volumeRatio20 <= 2.0;
  const shortHighBreak = candle.high >= high20 * 0.995 || candle.close >= high20 * 0.995 || candle.high >= Math.max(...recent.slice(0, -1).slice(-10).map((item) => item.high)) * 0.995;
  const multiBottomConfirm = longDowntrendContext
    && bottomTouchHits >= 2
    && (longTrendFlat || ma20 <= ma60 * 1.01)
    && candle.close > ma20
    && ma5 > ma10
    && volumeOkForMultiBottom
    && shortHighBreak
    && lowNoLongerFalls;
  const longBottomReclaimConfirm = Boolean(
    longDowntrendContext
      && supportBreachedDeep
      && reclaimSpacePct >= 0.03
      && candle.close > ma20
      && ma5 > ma10
      && priorPullbackShrunk
      && volumeOkForBottomConfirm
      && shortHighBreak
  );
  const platformShrinkConfirm = smallPlatform && priorPullbackShrunk && volumeOkForBottomConfirm;
  const validationCountAfterUpDrop = [
    priorSupportReclaimConfirmed || supportPiercedAndReclaimed || (supportBreachedDeep && reclaimSpacePct >= 0.03),
    previousSupportRetestHeld || currentSupportRetestHeld,
    platformShrinkConfirm,
  ].filter(Boolean).length;
  const continuationStructureConfirmed = Boolean(
    priorSupportReclaimConfirmed
      && (previousSupportRetestHeld || currentSupportRetestHeld)
      && candle.close >= supportPrice
      && confirmationVolumeAccepted
      && !bearishConfirmationFailure
  );
  const longDowntrendSecondConfirm = longDowntrendContext
    && (multiBottomConfirm || !priorUpThenFastDrop || validationCountAfterUpDrop >= 2)
    && (
      longBottomReclaimConfirm
      || compositeReclaimConfirm
      || multiBottomConfirm
      || (supportPiercedAndReclaimed && supportRetestHeld && bullish && confirmationVolumeAccepted)
      || closeBelowReclaimThenRetestConfirm
      || (smallPlatform && confirmationVolumeAccepted && currentSupportConfirm)
    );
  const shortStructureUp = ma5 >= ma10 || twoUp || reclaimedSupport || supportRetestHeld || (breakout20 && bullish);
  const aboveMa5 = candle.close >= ma5;
  const shortTrendUp = aboveMa5 && shortStructureUp;
  const denseZonePullbackConfirm = supportRetestHeld && bullish && (confirmationVolumeAccepted || currentSupportConfirm || compositeReclaimConfirm || multiDayReclaimConfirm) && shortStructureUp;
  const allowBreakoutPressure = Boolean(nearest.breakoutTarget && shortStructureUp && (denseZonePullbackConfirm || (breakout20 && bullish && shrinkVolume) || (supportRetestHeld && shrinkVolume)));
  const pressurePlan = pressurePlanFromLevels(nearest, { allowBreakout: allowBreakoutPressure });
  const resistance = pressurePlan.level;
  const resistancePrice = pressurePlan.price;
  const breaksUpperPressureWithoutRetest = Boolean(
    resistancePrice
      && consecutiveSurge
      && (breakout20 || candle.close > resistancePrice)
      && prev
      && prev.close < resistancePrice
      && candle.close > resistancePrice
  );
  const conservativeResistancePrice = pressurePlan.conservative?.price || null;
  const nearResistancePrice = nearest.nearResistance?.price || nearest.resistance?.price || null;
  const nearResistance = nearResistancePrice ? Math.abs(nearResistancePrice - candle.close) / candle.close <= 0.04 : false;
  const buyStopCandidates = [];
  function addBuyStopCandidate(price, basis, priority = 50) {
    const stopPrice = Number(price) || 0;
    if (stopPrice > 0 && candle.close > stopPrice) {
      const riskPct = (candle.close - stopPrice) / candle.close;
      const candidateRisk = candle.close - stopPrice;
      const reward = resistancePrice ? resistancePrice - candle.close : null;
      const rr = reward != null && reward > 0 && candidateRisk > 0 ? reward / candidateRisk : null;
      buyStopCandidates.push({ price: stopPrice, basis, priority, riskPct, riskReward: rr });
    }
  }
  addBuyStopCandidate(supportPrice ? supportPrice * 0.99 : null, "支撑下沿", 20);
  addBuyStopCandidate(smallPlatform ? platformLow5 : null, "前期密集交易区下沿", 25);
  addBuyStopCandidate(smallPlatform && platformHigh5 < candle.close ? platformHigh5 : null, "前期密集交易区上沿", 30);
  const keyBullishWindow = history.slice(-11, -1);
  const keyBullishStart = history.length - keyBullishWindow.length - 1;
  keyBullishWindow.forEach((item, index) => {
    const previousItem = history[keyBullishStart + index - 1];
    const laterItems = history.slice(keyBullishStart + index + 1, -1);
    const isKeyBullish = item.close > item.open && (!previousItem || item.close > previousItem.close);
    const nearStructure = supportPrice
      ? item.low <= supportPrice * 1.025 && item.close >= supportPrice * 0.98
      : item.low <= low20 * 1.15;
    const laterHeld = !laterItems.length || laterItems.every((next) => next.close >= item.low * 0.995);
    if (isKeyBullish && nearStructure && laterHeld) {
      const labelDate = item.date ? `${item.date} ` : "";
      if (!supportPrice || item.open < supportPrice * 0.994) {
        addBuyStopCandidate(item.open, `${labelDate}关键阳线开盘价`, 10);
      }
      addBuyStopCandidate(item.low * 0.995, `${labelDate}关键阳线最低价下方`, 12);
    }
  });
  addBuyStopCandidate(Math.min(candle.open, candle.close), "拉回支撑关键K线实体下沿", 45);
  addBuyStopCandidate(candle.low, "拉回支撑关键K线最低价", 46);
  if (prev) {
    addBuyStopCandidate(Math.min(prev.open, prev.close), "前一根关键K线实体下沿", 40);
    addBuyStopCandidate(prev.low, "前一根关键K线最低价", 42);
  }
  const compareStopPlan = (a, b) => (a.priority - b.priority) || (b.riskPct - a.riskPct) || ((b.riskReward || 0) - (a.riskReward || 0));
  const buyReferenceStopPlan = buyStopCandidates
    .slice()
    .filter((item) => item.riskPct >= 0.03 && item.riskPct <= 0.08 && (!resistancePrice || item.riskReward >= 3))
    .sort(compareStopPlan)[0]
    || buyStopCandidates
      .slice()
      .filter((item) => item.riskPct >= 0.03 && item.riskPct <= 0.08)
      .sort(compareStopPlan)[0]
    || buyStopCandidates.slice().sort((a, b) => Math.abs(a.riskPct - 0.03) - Math.abs(b.riskPct - 0.03))[0]
    || null;
  const buyReferenceStop = buyReferenceStopPlan?.price || null;
  const buyStopBasis = buyReferenceStopPlan?.basis || "当前K线实体下沿";
  const buyRiskPct = buyReferenceStop > 0 && candle.close > buyReferenceStop ? (candle.close - buyReferenceStop) / candle.close : null;
  const buyRiskTooWide = buyRiskPct != null && buyRiskPct > 0.08;
  const buyRiskTooTight = buyRiskPct != null && buyRiskPct < 0.03;
  const riskReward = ruleRiskRewardLine(candle, supportPrice, resistancePrice, buyReferenceStop, levelRoleLabel(inferredLevelRole(resistance)));
  const riskRewardScore = riskReward?.ratio == null ? 0 : riskReward.ratio >= 3 ? 8 : -12;
  let stage = "盘整结构，等待区间边界确认";
  if (longDowntrendContext && (recoveryAttempt || nearSupport || bigDrop)) {
    stage = "长期下跌后尝试趋势扭转";
  } else if (bigDrop && !upStructure) {
    stage = "急跌后修复观察";
  } else if (weakStructure) {
    stage = "弱势结构，只做反弹模型";
  } else if (upStructure && high60 > 0 && (high60 - candle.close) / high60 >= 0.12) {
    stage = "上升趋势中的大调整，等待踩稳确认";
  } else if (upStructure) {
    stage = "上升趋势回调/延续观察";
  }
  const needsStabilityConfirmation = ["急跌", "下跌", "弱势", "大调整"].some((keyword) => stage.includes(keyword));
  const weakReboundStage = ["下跌", "弱势"].some((keyword) => stage.includes(keyword));

  const candidates = [];
  const side = replayState.position ? "sell" : "buy";
  const sideLabel = replayState.position ? "卖出管理" : "买入观察";
  function add(model, score, matched = [], missing = [], plan = [], candidateSide = "buy") {
    candidates.push({
      model,
      score: Math.max(0, Math.min(100, score)),
      matched: matched.filter(Boolean),
      missing: missing.filter(Boolean),
      plan: plan.filter(Boolean),
      side: candidateSide,
    });
  }

  if (replayState.position) {
    const entryPrice = Number(replayState.position.entryPrice) || 0;
    const positionReturn = entryPrice ? ((candle.close - entryPrice) / entryPrice) * 100 : null;
    if (!nearResistance && !longUpper && !bigBear && candle.close >= ma5) {
      add("持仓观察模型", 58, [
        "当前未出现明确卖出触发",
        positionReturn == null ? "" : `当前浮动收益 ${formatPercent(positionReturn)}`,
        resistancePrice ? `距离压力 ${formatPrice(resistancePrice)} 仍有观察空间` : "尚未画出上方压力，需要补充风险边界",
      ], [
        "需要继续观察是否跌破5日线或移动止盈位",
        supportPrice ? "" : "缺少下方支撑作为防守线",
      ], [
        "继续持有并观察下一根K线。",
        "若跌破5日线、买入依据或移动止盈位，转为卖出管理。",
        supportPrice ? `下方支撑 ${formatPrice(supportPrice)} 可作为防守参考。` : "先补充支撑线再判断防守位置。",
      ], "sell");
    }
  }
  if (nearSupport && bullish) {
    const supportValidationReady = repairConfirmed
      && (pullbackReclaimConfirm || shrinkBullishRetestConfirm || closeBelowReclaimThenRetestConfirm);
    add("支撑验证买入模型", 62 + (currentSupportConfirm ? 12 : 0) + (shrinkVolume ? 6 : 0) + (repairConfirmed ? 6 : 0) + riskRewardScore, [
      supportPrice ? `接近支撑 ${formatPrice(supportPrice)}` : "接近支撑",
      "当前K线收阳",
      currentSupportConfirm ? "当前K线触及支撑后收阳拉起，可视为确认K线" : "",
      pullbackReclaimConfirm ? "支撑附近出现跌破拉回阳线，完成回踩验证" : "",
      shrinkBullishRetestConfirm ? "回踩过程缩量后出现支撑上方阳线，完成回踩验证" : "",
      closeBelowReclaimThenRetestConfirm ? "有效跌破后首次拉回，后续再次在支撑上方收阳，完成二次回踩验证" : "",
      riskReward?.ratio >= 3 ? "上方压力空间满足3R要求" : "",
      repairConfirmed ? "已有回踩/平台/连续阳线确认" : "",
    ], [
      supportValidationReady ? "" : "仍需要支撑踩稳确认K线",
      repairConfirmed ? "" : "缺少结构修复确认",
      needsStabilityConfirmation && !repairConfirmed ? "当前结构偏弱，需要更多稳定确认" : "",
    ], [
      supportValidationReady ? "当前K线已完成回踩验证；若止损空间在3%-8%且满足3R，可考虑买入。" : "等待跌破拉回或缩量后的支撑阳线确认。",
      "止损向前找结构依据：支撑、密集交易区上下沿、确认K线实体下沿或最低价。",
      riskReward?.text || "",
    ], "buy");
  }
  if (supportPrice && (supportPiercedAndReclaimed || pullbackReclaimConfirm)) {
    const reclaimRetestConfirmed = supportRetestHeld || (smallPlatform && bullish);
    const reclaimSpaceSatisfied = reclaimHasEnoughSpace || compositeReclaimConfirm;
    const reclaimBuyConfirmed = reclaimRetestConfirmed && reclaimSpaceSatisfied && confirmationVolumeAccepted;
    const reclaimScore = 62
      + (reclaimSpaceSatisfied ? 8 : -12)
      + (reclaimRetestConfirmed ? 10 : 0)
      + (compositeReclaimConfirm ? 10 : 0)
      + (confirmationVolumeAccepted ? 4 : 0)
      + Math.min(riskRewardScore, 6);
    add("跌破支撑后快速拉回模型", reclaimScore, [
      `跌破关键支撑 ${formatPrice(supportPrice)} 后快速收回`,
      "收盘重新回到支撑上方",
      reclaimHasEnoughSpace ? `拉回距离支撑约 ${formatPercent(reclaimSpacePct * 100)}，不是只贴在支撑上方` : "",
      compositeReclaimConfirm ? "复合结构：此前已有跌破拉回背景，当前回踩中再次跌破支撑后立阳线收回" : "",
      reclaimRetestConfirmed ? "已有回踩不破或小平台确认" : "",
      priorPullbackShrunk ? "跌破拉回及回踩过程中曾缩量" : "",
      !shrinkVolume && confirmationVolumeAccepted ? `确认阳线允许放量，当前约为20日均量的 ${volumeRatio20.toFixed(2)} 倍` : "",
      riskReward?.ratio >= 3 ? "上方压力空间满足盈亏比要求" : "",
    ], [
      reclaimSpaceSatisfied ? "" : "拉回只在支撑上方一点点，空间不够，不直接买入",
      reclaimRetestConfirmed ? "" : "跌破拉回后大部分情况需要等待回踩确认，不能直接建议买入",
      confirmationVolumeAccepted ? "" : "跌破拉回及回踩过程中未见缩量，确认量能也不合格",
      "",
      needsStabilityConfirmation && !reclaimRetestConfirmed ? "当前结构偏弱，不能只凭单根拉回买入" : "",
    ], [
      reclaimBuyConfirmed ? "跌破拉回、过程缩量和确认阳线均已成立，可按当前计划买入。" : "先观察是否拉出空间，并等待再次回踩支撑不破。",
      "止损向前找结构依据：支撑、密集交易区上下沿、回踩确认K线实体下沿或最低价。",
      resistancePrice && riskReward?.ratio !== null && riskReward.ratio < 3 ? "上方压力空间不足，暂不追。" : "",
      riskReward?.text || "",
    ], "buy");
  }
  if (breakout20 && bullish) {
    const breakoutRisk = ruleRiskRewardLine(candle, supportPrice, resistancePrice, Math.min(candle.open, candle.close), levelRoleLabel(inferredLevelRole(resistance)));
    add("平台/交易密集区突破模型", 72 + (smallPlatform ? 6 : 0) + (breakoutRisk?.ratio >= 3 ? 6 : 0), [
      "突破近20日高点或交易密集区上沿",
      "突破K线收阳",
      smallPlatform ? "突破前有小平台整理" : "",
      `突破参考位 ${formatPrice(high20)}`,
    ], [
      smallPlatform ? "" : "缺少清晰平台整理",
      supportPrice ? "" : "缺少可执行止损支撑",
      "需要确认突破后能否站稳",
    ], [
      "等待突破后站稳或回踩不破。",
      "止损放在突破K线实体下沿或平台下沿。",
      "若突破后立刻回落，放弃追买。",
      breakoutRisk?.text || "",
    ], "buy");
  }
  if (denseZonePullbackConfirm) {
    add("交易密集区突破后回踩确认模型", 82 + (compositeReclaimConfirm ? 8 : 0) + (riskReward?.ratio >= 3 ? 6 : 0), [
      "突破交易密集区后回踩不破",
      shrinkVolume ? "回踩过程缩量" : "",
      compositeReclaimConfirm ? "回踩支撑过程中出现跌破拉回阳线，属于复合确认" : "再次出现小阳线确认",
      "小趋势保持向上",
      supportPrice ? `回踩支撑 ${formatPrice(supportPrice)}` : "",
    ], [
      "",
      resistancePrice && riskReward?.ratio < 3 ? "盈亏比仍需确认" : "",
    ], [
      "若下一根K线继续站稳回踩支撑，可考虑买入。",
      "止损放在回踩平台下沿或小阳线实体下沿。",
      "若回踩放量跌破平台，放弃。",
      riskReward?.text || "",
    ], "buy");
  }
  if (bigDrop && (twoUp || reclaimedSupport || breakout20 || currentSupportConfirm)) {
    const acuteRepairDirectBuy = longDowntrendContext
      && bullish
      && riskReward?.ratio >= 3
      && (twoUp || reclaimNextCandleConfirmed || priorReclaimNextCandleConfirmed || currentSupportConfirm || breakout20);
    const repairEntryConfirmed = shortStructureUp
      && (twoUp || currentSupportConfirm || denseZonePullbackConfirm)
      && (!uptrendAcuteDrop || stableAfterAcuteDrop);
    const farResistanceSpace = resistancePrice ? (resistancePrice - candle.close) / candle.close >= 0.12 : false;
    const longDowntrendPanicBottomBuy = longDowntrendContext
      && supportPiercedAndReclaimed
      && riskReward?.ratio >= 3;
    const repairSpeculationBuy = (repairEntryConfirmed || acuteRepairDirectBuy)
      && (!longDowntrendContext || longDowntrendPanicBottomBuy)
      && (!resistancePrice || farResistanceSpace || riskReward?.ratio >= 3);
    add("急跌后博弈修复模型", 74 + (twoUp ? 8 : 0) + (currentSupportConfirm ? 9 : 0) + (shortTrendUp ? 5 : 0) + (farResistanceSpace ? 6 : 0) + (riskReward?.ratio >= 3 ? 6 : 0), [
      "前期出现急跌",
      twoUp ? "连续阳线快速修复" : "出现修复信号",
      currentSupportConfirm ? "当前K线触及支撑后收阳拉起，可视为确认K线" : "",
      shortTrendUp ? "收盘站上5日线，小趋势转强" : "",
      farResistanceSpace ? "上方压力距离较远" : "",
      riskReward?.ratio >= 3 ? "按当前止损测算满足3R" : "",
      supportPrice ? `支撑 ${formatPrice(supportPrice)}` : "参考关键K线/平台作为防守",
    ], [
      repairSpeculationBuy ? "" : "需要连续阳线、支撑确认或回踩结构转强，并满足压力空间",
      uptrendAcuteDrop && !stableAfterAcuteDrop ? "上涨趋势出现急跌时先规避，等待缩量企稳、回踩不破或小平台确认后再考虑买点" : "",
      "",
      twoUp || breakout20 || currentSupportConfirm ? "" : "缺少连续阳线、突破或支撑确认K线",
    ], [
      repairSpeculationBuy ? "按急跌后修复试错处理；若止损空间在3%-8%且仍满足3R，可考虑买入。" : "上涨趋势急跌后先规避，等待缩量企稳、回踩不破或小平台后再评估。",
      supportPrice ? "止损向前寻找支撑或拉回关键K线下沿/最低价。" : "止损参考关键K线或小平台下沿。",
      resistancePrice
        ? (farResistanceSpace || riskReward?.ratio >= 3 ? riskReward?.text || `压力 ${formatPrice(resistancePrice)}，空间较远` : "上方压力空间不足，暂不追。")
        : "未画出上方压力，先按买入结构和止损空间判断，暂不计算固定盈亏比。",
    ], "buy");
  }
  const buyStopLoss = Number(replayState.position?.stopLoss) || 0;
  const entryForRisk = Number(replayState.position?.entryPrice) || 0;
  const plannedRisk = entryForRisk > 0 && buyStopLoss > 0 ? entryForRisk - buyStopLoss : 0;
  const hasStopLossPlan = Boolean(replayState.position && buyStopLoss > 0 && plannedRisk > 0);
  const positionRiskMultiple = hasStopLossPlan ? (candle.close - entryForRisk) / plannedRisk : null;
  const entryDate = replayState.position?.entryDate || "";
  const entryIndex = entryDate ? history.findIndex((item) => item.date >= entryDate) : -1;
  const holdingHistory = entryIndex >= 0 ? history.slice(entryIndex) : [];
  const highestSinceEntry = holdingHistory.length ? Math.max(...holdingHistory.map((item) => item.high)) : candle.high;
  const positionMaxRiskMultiple = hasStopLossPlan ? (highestSinceEntry - entryForRisk) / plannedRisk : null;
  const effectivePressurePrice = nearest.effectiveResistance?.price || null;
  const upperEffectivePressurePrice = effectivePressurePrice && entryForRisk > 0 && effectivePressurePrice > entryForRisk
    ? effectivePressurePrice
    : null;
  const touchedEffectivePressureSinceEntry = Boolean(
    upperEffectivePressurePrice
      && holdingHistory.some((item) => item.high >= upperEffectivePressurePrice * 0.995)
  );
  const breaksStopLoss = hasStopLossPlan && candle.close < buyStopLoss;
  const breaksSupport = supportPrice ? candle.close < supportPrice * 0.995 : false;
  const strongWeakening = bigBear || (longUpper && candle.close < ma5) || (prev && prev.close < prev.open && candle.close < prev.close && candle.close < ma5);
  const resistanceFailure = Boolean(upperEffectivePressurePrice && Math.abs(upperEffectivePressurePrice - candle.close) / candle.close <= 0.04)
    && (longUpper || bigBear || candle.close < ma5);
  const pressureFailureAfterTouch = touchedEffectivePressureSinceEntry
    && candle.close < ma5
    && candle.close < upperEffectivePressurePrice;
  const everReachedTakeProfitZone = !hasStopLossPlan || (positionMaxRiskMultiple != null && positionMaxRiskMultiple >= 3);

  if (replayState.position && hasStopLossPlan && !breaksStopLoss && !everReachedTakeProfitZone) {
    add("止损持仓等待模型", 64, [
      `已设置止损 ${formatPrice(buyStopLoss)}`,
      positionRiskMultiple == null ? "" : `当前约 ${positionRiskMultiple.toFixed(2)}R`,
      positionMaxRiskMultiple == null ? "" : `最高曾到 ${positionMaxRiskMultiple.toFixed(2)}R`,
      "规则要求先等待止损触发，或曾经盈利达到3R以上后再考虑止盈",
    ], [
      "盈利尚未曾达到3R以上，不进入止盈判断",
      "未触发止损，暂不因普通波动卖出",
    ], [
      "继续持有，优先等待止损触发。",
      "当盈利曾经达到3R以上后，再结合趋势转弱、压力位、上引线、阴线或跌破5日线考虑止盈。",
      `止损触发价：${formatPrice(buyStopLoss)}`,
    ], "sell");
  }

  const pressureFailureSell = pressureFailureAfterTouch && candle.close < ma5;
  const canEvaluateSell = !hasStopLossPlan || breaksStopLoss || everReachedTakeProfitZone || pressureFailureSell;
  if (replayState.position && canEvaluateSell && (touchedEffectivePressureSinceEntry || longUpper || bigBear || candle.close < ma5 || breaksStopLoss || (!hasStopLossPlan && breaksSupport))) {
    const trendWeakAfter3R = everReachedTakeProfitZone && (strongWeakening || resistanceFailure || pressureFailureAfterTouch || candle.close < ma5);
    const immediateSell = breaksStopLoss || pressureFailureSell || (!hasStopLossPlan && (breaksSupport || strongWeakening || resistanceFailure || pressureFailureAfterTouch)) || trendWeakAfter3R;
    add("卖出/止盈风险模型", immediateSell ? 86 : 68, [
      breaksStopLoss ? `跌破止损位 ${formatPrice(buyStopLoss)}` : "",
      hasStopLossPlan && positionRiskMultiple != null ? `当前约 ${positionRiskMultiple.toFixed(2)}R` : "",
      hasStopLossPlan && positionMaxRiskMultiple != null ? `最高曾到 ${positionMaxRiskMultiple.toFixed(2)}R` : "",
      everReachedTakeProfitZone && !breaksStopLoss ? "盈亏比曾经达到3R以上" : "",
      nearResistance && resistancePrice ? `价格接近压力 ${formatPrice(resistancePrice)}` : "",
      touchedEffectivePressureSinceEntry && upperEffectivePressurePrice ? `持仓期间已打到上方有效压力 ${formatPrice(upperEffectivePressurePrice)}` : "",
      pressureFailureAfterTouch ? "打到压力后未能继续突破，并跌破5日线" : "",
      pressureFailureSell ? "压力失败后趋势走坏，跌破5日线" : "",
      candle.close < ma5 ? "跌破5日线" : "",
      longUpper || bigBear ? "出现上引线或阴线转弱" : "",
      !hasStopLossPlan && breaksSupport ? "跌破关键支撑" : "",
    ], [
      immediateSell ? "" : "目前更像止盈预警，需要确认趋势是否继续转弱",
    ], [
      breaksStopLoss ? "止损已触发，按计划卖出。" : pressureFailureSell ? "价格曾触及或突破压力但未能站稳，当前跌破5日线，执行卖出。" : "盈亏比曾经达到3R以上，现在可以根据趋势转弱考虑止盈。",
      pressureFailureAfterTouch ? "已触压但上不去，跌破5日线按移动止盈执行。" : "",
      immediateSell && !breaksStopLoss ? "若下一根继续转弱，可执行止盈或减仓。" : "先作为止盈预警，观察是否继续转弱。",
      upperEffectivePressurePrice && Math.abs(upperEffectivePressurePrice - candle.close) / candle.close <= 0.04 ? `接近上方有效压力：${formatPrice(upperEffectivePressurePrice)}` : "",
    ], "sell");
  }
  if (continuationStructureConfirmed) {
    add("上升趋势延续：跌破拉回后缩量回踩确认", 86 + (riskReward?.ratio >= 3 ? 8 : 0), [
      "上升趋势仍保持",
      "先跌破支撑后收回",
      "后续回踩支撑不破",
      shrinkVolume ? "回踩过程缩量" : "确认日量能未明显放大",
      riskReward?.ratio >= 3 ? "止损与有效压力满足3R" : "",
    ], [
      riskReward?.ratio >= 3 ? "" : "盈亏比仍需确认",
    ], [
      "该结构已完成两次验证，可按趋势延续买点处理。",
      "止损放在支撑区下沿或跌破拉回低点下方。",
    ], "buy");
  }

  const sideCandidates = candidates.filter((candidate) => candidate.side === side);
  if (!sideCandidates.length) {
    return {
      score: 38,
      side,
      sideLabel,
      action: replayState.position ? "hold_position" : "watch",
      actionText: replayState.position ? "继续持有" : "建议观望",
      stage,
      model: replayState.position ? "持仓观察模型" : "等待确认模型",
      matched: [
        replayState.position ? "暂未出现明确卖出信号" : "暂未出现体系内买点",
        supportPrice ? `支撑 ${formatPrice(supportPrice)}` : "缺少支撑线",
        resistancePrice ? `压力 ${formatPrice(resistancePrice)}` : "缺少压力线",
      ].filter(Boolean),
      missing: [
        replayState.position ? "需要继续观察是否跌破买入依据" : "需要更多结构确认",
        supportPrice ? "" : "需要补充支撑线",
        resistancePrice ? "" : "需要补充压力线",
      ].filter(Boolean),
      plan: [
        replayState.position ? "继续按持仓计划观察。" : "暂不买入，等待支撑/突破/修复确认。",
        replayState.position ? "跌破5日线、支撑或移动止盈位再考虑卖出。" : riskReward?.text || "",
        replayState.position ? "" : "优先寻找止损小、压力空间大的位置。",
      ].filter(Boolean),
    };
  }
  sideCandidates.sort((a, b) => b.score - a.score);
  const best = sideCandidates[0];
  const weeklyDowntrendBuyAllowed = Boolean(
    (best.model.includes("急跌后") && (reclaimNextCandleConfirmed || priorReclaimNextCandleConfirmed) && bullish)
      || (best.model.includes("跌破支撑后快速拉回") && longDowntrendSecondConfirm && supportPiercedAndReclaimed && bullish)
      || closeBelowReclaimThenRetestConfirm
      || (denseZonePullbackConfirm && breakout20)
  );
  if (side === "buy" && bearishConfirmationFailure) {
    const text = "确认日出现明显阴线且收盘接近最低价，缩量不能替代转强确认";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["当前回踩K线明显转弱，只观察支撑是否继续有效；等待阳线收回、再次回踩不破或平台突破后再评估。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && !bullish) {
    const text = "买入确认K线必须收阳，当前K线未形成阳线确认";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["等待当前或下一交易日形成收盘高于开盘的阳线，再重新评估买入。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  const fakeBullishRetest = side === "buy"
    && bullish
    && prev
    && candle.close <= prev.close
    && currentSupportRetestHeld;
  if (fakeBullishRetest) {
    const text = "支撑附近虽收盘略高于开盘，但收盘未高于前一根K线，属于假阳线，不构成向上确认";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["当前阳线力度不足，等待收盘高于前一根K线并形成向上结构后再评估。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && closeBelowThenReclaimed && !reclaimNextCandleConfirmed) {
    const text = "跌破拉回当天只作为候选，必须等待下一根K线收阳且收盘高于前一根，形成向上结构后再买入";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["当前是跌破拉回当天，等待下一根K线收阳、收盘高于当前K线后再确认买入。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && closeBelowThenReclaimed) {
    const text = "前一根K线收盘仍在支撑下方，次日拉回只视为重新夺回支撑，需要重新评估新的向上结构";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["前一根K线已经收盘跌破支撑，当前拉回不能直接视为确认；重新观察后续阳线、回踩不破或小平台结构。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && weeklyDowntrend && !weeklyDowntrendBuyAllowed) {
    const text = "周线仍处于下跌趋势，普通趋势延续结构不能直接建议买入";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["周线下跌只做急跌后的结构性反弹，或等待筑底完成并突破/回踩确认；当前继续观望。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  const belowMa5ForBuy = side === "buy" && !aboveMa5;
  if (belowMa5ForBuy) {
    const ma5GapPct = ma5 > 0 ? ((ma5 - candle.close) / ma5) * 100 : 0;
    best.plan = [`收盘低于5日线约 ${formatPercent(ma5GapPct)}，作为扣分项处理，不单独否决已确认的买入结构。`, ...best.plan];
    best.score = Math.max(0, best.score - 8);
  }
  const shortTrendNotUpForBuy = side === "buy" && !shortStructureUp && !continuationStructureConfirmed;
  if (shortTrendNotUpForBuy) {
    if (!best.missing.includes("小趋势尚未向上，暂不建议买入")) {
      best.missing = ["小趋势尚未向上，暂不建议买入", ...best.missing];
    }
    best.plan = ["先等待收盘站上5日线，或出现连续阳线/跌破拉回确认后再评估买点。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && uptrendAcuteDrop && !stableAfterAcuteDrop && !continuationStructureConfirmed) {
    const text = "上涨趋势出现急跌，先规避；等待缩量企稳、回踩不破或小平台确认后再考虑买点";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["当前属于上涨趋势急跌后的初步修复，不直接追买；先等企稳结构成立后再重新计算止损和盈亏比。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && priorUpThenFastDrop && validationCountAfterUpDrop < 2 && !multiBottomConfirm) {
    const text = "上涨后一波后的快速/深度下跌，当前属于第一次反弹，至少需要两次结构验证后再买入";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["第一次反弹只观察，等待后续回踩不破、缩量平台或再次支撑确认后再评估买点。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  const acuteRepairBottomAllowed = best.model.includes("急跌后")
    && (supportPiercedAndReclaimed || priorBreachThenReclaim)
    && bullish
    && riskReward?.ratio >= 3;
  if (side === "buy" && longDowntrendContext && !longDowntrendSecondConfirm && !acuteRepairBottomAllowed) {
    const text = "\u957f\u671f\u4e0b\u8dcc\u8d8b\u52bf\u4e0d\u5c5e\u4e8e\u77ed\u671f\u6025\u8dcc\u4fee\u590d\u6a21\u578b\uff1b\u7b2c\u4e00\u6b21\u5e95\u90e8\u62c9\u56de\u4e0d\u76f4\u63a5\u4e70\u5165";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["\u957f\u671f\u4e0b\u8dcc\u540e\u5148\u770b\u8d8b\u52bf\u662f\u5426\u8d70\u5e73\uff0c\u518d\u7b49\u4e8c\u6b21\u6216\u591a\u6b21\u5e95\u90e8\u786e\u8ba4\u3001\u652f\u6491\u8dcc\u7834\u62c9\u56de\u6216\u5c0f\u5e73\u53f0\u786e\u8ba4\u540e\u91cd\u65b0\u8bc4\u4f30\u4e70\u70b9\u3002", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && weakReboundStage && !supportPiercedAndReclaimed) {
    const text = "下跌趋势反弹必须先打穿关键支撑后快速拉回，不能只因靠近支撑或缩量小阳买入";
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["下跌趋势只做支撑跌破后的拉回反弹；等待打穿支撑后快速收回、再站稳支撑上方。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && supportVolumeTooHigh) {
    const text = `支撑附近成交量放大到近20日均量约 ${volumeRatio20.toFixed(2)} 倍，抛压未释放完，不直接买入`;
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["支撑附近放量过大时先观望，等待后续缩量企稳、回踩不破或再次小阳线确认后再评估。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && breaksUpperPressureWithoutRetest) {
    const text = `连续大涨突破上方压力/突破位 ${formatPrice(supportPrice)}，尚未完成突破后的回踩验证，不直接买入`;
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = [
      "连续大涨突破压力后先观望，等待回踩突破位不破、缩量企稳或形成新平台后，再重新评估买入。",
      "回踩验证成立前，不把突破当日的强阳线直接作为买入确认。",
      ...best.plan,
    ];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && tooFarFromSupport) {
    const text = `买入价距离支撑 ${formatPrice(supportPrice)} 约 ${formatPercent(supportDistancePct * 100)}，超过8%，不允许建议买入`;
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["当前离支撑太远，止损成本过高；等待回踩支撑/突破位确认后再评估。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && buyRiskTooWide) {
    const text = `按${buyStopBasis}测算止损空间约 ${formatPercent(buyRiskPct * 100)}，超过8%，不允许建议买入`;
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["重新比较关键阳线开盘价/最低价、支撑和密集交易区上下沿；若按更稳位置测算超过8%，先观望。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && buyRiskTooTight) {
    const text = `按${buyStopBasis}测算止损空间约 ${formatPercent(buyRiskPct * 100)}，低于3%，止损过紧，容易被普通波动触发`;
    if (!best.missing.includes(text)) best.missing = [text, ...best.missing];
    best.plan = ["继续向前寻找结构止损依据：关键阳线开盘价或最低价、支撑、密集交易区上下沿；优先选择止损空间3%-8%且仍满足约3R的位置。", ...best.plan];
    best.score = Math.min(best.score, 67);
  }
  if (side === "buy" && !resistancePrice) {
    best.plan = ["未画出上方压力时，不用盈亏比拦截买点；只按买入结构、5日线、支撑确认和3%-8%止损空间判断。", ...best.plan];
  }
  let action = "watch";
  let actionText = "建议观望";
  if (side === "buy") {
    const hasBlockingRiskReward = best.plan.some((item) => item.includes("压力空间不足") || item.includes("暂未达到 3"));
    const confirmationMissing = best.missing.length > 0;
    if (best.score >= 80 && !hasBlockingRiskReward && !confirmationMissing) {
      action = "buy";
      actionText = "建议买入";
    } else if (best.score >= 68 && !hasBlockingRiskReward) {
      action = "watch";
      actionText = "建议观望";
      best.plan = ["信号接近买点，但仍需要下一根K线或结构确认。", ...best.plan];
    }
  } else {
    if (best.model.includes("卖出") && best.score >= 80 && !best.missing.length) {
      action = "sell";
      actionText = "建议卖出";
    } else {
      action = "hold_position";
      actionText = "继续持有";
      if (best.model.includes("卖出") && best.score >= 65) {
        best.plan = ["当前先作为卖出预警，不直接执行。", ...best.plan];
      }
    }
  }
  return {
    side,
    sideLabel,
    action,
    actionText,
    stage,
    pressurePlan,
    stopLoss: buyReferenceStop,
    stopBasis: buyStopBasis,
    stopRiskPct: buyRiskPct == null ? null : buyRiskPct * 100,
    ...best,
  };
}

function evaluateSupportPathValidation(history = [], price, meta = {}) {
  const levelPrice = Number(price);
  const bars = (Array.isArray(history) ? history : []).filter((bar) => bar && Number(bar.close) > 0 && Number(bar.high) > 0 && Number(bar.low) > 0);
  const asOfDate = bars.at(-1)?.date || "";
  const pathLabels = {
    fast_drop_repair: "急跌修复",
    reclaim_retest_bullish: "跌破后回踩确认",
    bottom_pattern: "底部形态",
    platform_break_retest: "平台突破回踩",
  };
  const statusLabels = {
    candidate: "待验证",
    testing: "验证中",
    validated: "真实支撑",
    invalidated: "失效",
  };
  const fallbackReason = `${asOfDate || "当前"} 支撑仍为待验证候选，尚未出现路径确认。`;
  if (!(levelPrice > 0) || bars.length < 5) {
    return {
      status: "candidate",
      label: "待验证",
      pathId: "",
      pathLabel: "",
      price: levelPrice > 0 ? Number(levelPrice.toFixed(4)) : null,
      validationReason: fallbackReason,
      supportValidationReason: fallbackReason,
      validationHistory: [{ date: asOfDate, status: "candidate", pathId: "", validationReason: fallbackReason }],
      participatesInScoring: false,
      asOfDate,
      source: meta.source || "",
    };
  }

  let status = "candidate";
  let pathId = "";
  let reason = `${bars[0].date || "起始"} 支撑 ${levelPrice.toFixed(2)} 画出后为待验证候选。`;
  const validationHistory = [{ date: bars[0].date || "", status, pathId, validationReason: reason }];
  const commit = (nextStatus, nextPath, bar, text) => {
    const safeText = String(text || "").trim() || `${bar?.date || asOfDate} 支撑验证状态更新为${statusLabels[nextStatus] || nextStatus}。`;
    if (nextStatus === status && (nextPath || "") === pathId && safeText === reason) return;
    status = nextStatus;
    pathId = nextPath || "";
    reason = safeText;
    validationHistory.push({ date: bar?.date || "", status, pathId, validationReason: safeText });
  };

  let brokeIndex = -1;
  let reclaimIndex = -1;
  let consecutiveBull = 0;
  let platformHigh = null;
  let platformBreakIndex = -1;
  let neckline = null;
  let neckBreakIndex = -1;
  let secondBottomIndex = -1;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const open = Number(bar.open);
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);
    const prev = index ? bars[index - 1] : null;
    const date = bar.date || "";
    const bullish = close > open;
    const upCandle = prev ? close > Number(prev.close) : bullish;
    const confirming = bullish || upCandle;
    const confirmText = bullish ? "阳线" : "上涨K线";
    const near = low <= levelPrice * 1.025 && low >= levelPrice * 0.96;
    const held = close >= levelPrice * 0.995;
    const brokeClose = close < levelPrice * 0.985;

    if (brokeClose) {
      brokeIndex = index;
      reclaimIndex = -1;
      platformBreakIndex = -1;
      neckBreakIndex = -1;
      consecutiveBull = 0;
      commit("invalidated", pathId, bar, `${date} 收盘跌破支撑 ${levelPrice.toFixed(2)}，支撑验证状态改为失效。`);
      continue;
    }
    if (brokeIndex >= 0 && reclaimIndex < 0 && close >= levelPrice) {
      reclaimIndex = index;
      commit("testing", "reclaim_retest_bullish", bar, `${date} 跌破后收盘重新站回支撑 ${levelPrice.toFixed(2)} 上方，进入验证中，等待后续阳线回踩。`);
    }
    if (bullish && (!prev || close >= Number(prev.close))) consecutiveBull += 1;
    else consecutiveBull = bullish ? 1 : 0;

    if (status !== "validated") {
      const window = bars.slice(Math.max(0, index - 15), index + 1);
      let highOffset = 0;
      window.forEach((item, offset) => {
        if (Number(item.high) >= Number(window[highOffset].high)) highOffset = offset;
      });
      const afterHigh = window.slice(highOffset);
      const lowAfterHigh = Math.min(...afterHigh.map((item) => Number(item.low)));
      const dropFromHigh = Number(window[highOffset].high) > 0
        ? (Number(window[highOffset].high) - lowAfterHigh) / Number(window[highOffset].high)
        : 0;
      const fastDrop = highOffset < window.length - 1 && dropFromHigh >= 0.12 && lowAfterHigh <= levelPrice * 1.04;
      const box = index >= 5 ? bars.slice(Math.max(0, index - 6), index) : [];
      const boxHigh = box.length ? Math.max(...box.map((item) => Number(item.high))) : 0;
      const boxLow = box.length ? Math.min(...box.map((item) => Number(item.low))) : 0;
      const smallPlatform = box.length >= 4 && boxLow > 0 && (boxHigh - boxLow) / boxLow <= 0.08 && Math.abs(boxLow - levelPrice) / levelPrice <= 0.03;
      const nearRepair = low <= levelPrice * 1.03 && held;
      if (fastDrop && nearRepair && (consecutiveBull >= 2 || (bullish && near) || smallPlatform)) {
        const how = consecutiveBull >= 2 ? "急跌后连续阳线快速拉回" : smallPlatform ? "急跌后小平台确认" : "急跌后支撑踩稳阳线";
        commit("validated", "fast_drop_repair", bar, `${date} 急跌修复路径直接升级：${how}，收盘站上支撑 ${levelPrice.toFixed(2)}，无需额外回踩，确认为真实支撑。`);
        continue;
      }
    }

    if (status !== "validated" && index >= 6) {
      const box = bars.slice(index - 6, index);
      const boxHigh = Math.max(...box.map((item) => Number(item.high)));
      const boxLow = Math.min(...box.map((item) => Number(item.low)));
      const tight = boxLow > 0 && (boxHigh - boxLow) / boxLow <= 0.08;
      const matchesLevel = Math.abs(boxHigh - levelPrice) / levelPrice <= 0.03 || Math.abs(boxLow - levelPrice) / levelPrice <= 0.03;
      if (tight && matchesLevel && close > boxHigh && bullish) {
        platformHigh = boxHigh;
        platformBreakIndex = index;
        commit("testing", "platform_break_retest", bar, `${date} 平台突破路径：收盘突破平台上沿 ${boxHigh.toFixed(2)}，原上沿转为待验证支撑，等待回踩阳线。`);
      }
    }
    if (status !== "validated" && platformBreakIndex >= 0 && index > platformBreakIndex && platformHigh) {
      const retest = low <= Math.max(platformHigh, levelPrice) * 1.02 && held && confirming;
      if (retest) {
        const volumeNote = "";
        commit("validated", "platform_break_retest", bar, `${date} 平台突破回踩：回踩不破，出现${confirmText}确认${volumeNote}，升为真实支撑。`);
        continue;
      }
    }

    if (status !== "validated" && brokeIndex >= 0 && reclaimIndex >= 0 && index > reclaimIndex && near && held && confirming) {
      commit("validated", "reclaim_retest_bullish", bar, `${date} 跌破后回踩确认：${confirmText}回踩支撑 ${levelPrice.toFixed(2)} 不破，收盘回到支撑上方，升为真实支撑。`);
      continue;
    }

    if (status !== "validated" && index >= 8) {
      const confirmedLows = [];
      for (let pivot = 2; pivot <= index - 2; pivot += 1) {
        const sample = bars.slice(pivot - 2, pivot + 3);
        const pivotLow = Number(bars[pivot].low);
        if (pivotLow <= Math.min(...sample.map((item) => Number(item.low)))) confirmedLows.push({ index: pivot, price: pivotLow });
      }
      const nearLows = confirmedLows.filter((point) => Math.abs(point.price - levelPrice) / levelPrice <= 0.04);
      if (nearLows.length >= 2) {
        const left = nearLows[nearLows.length - 2];
        const right = nearLows[nearLows.length - 1];
        const similar = Math.abs(left.price - right.price) / Math.max(left.price, right.price) <= 0.06;
        if (similar && right.index > left.index) {
          const middle = bars.slice(left.index, right.index + 1);
          const neck = Math.max(...middle.map((item) => Number(item.high)));
          neckline = neck;
          secondBottomIndex = right.index;
          if (neckBreakIndex < 0 && index > right.index && close > neck) {
            neckBreakIndex = index;
            commit("testing", "bottom_pattern", bar, `${date} 底部形态路径：两次低点不再创新低，收盘突破颈线 ${neck.toFixed(2)}，等待回踩阳线。`);
          }
        }
      }
    }
    if (status !== "validated" && neckBreakIndex >= 0 && index > neckBreakIndex && neckline && low <= neckline * 1.02 && close >= neckline * 0.995 && confirming && held) {
      commit("validated", "bottom_pattern", bar, `${date} 底部形态回踩：回踩颈线 ${neckline.toFixed(2)} 不破，出现${confirmText}确认，支撑位按颈线或平台下沿 ${levelPrice.toFixed(2)} 升为真实支撑。`);
      continue;
    }

    if (status === "candidate" && (near || (held && low <= levelPrice * 1.03))) {
      commit("testing", pathId, bar, `${date} 价格触及支撑 ${levelPrice.toFixed(2)}，进入验证中，等待急跌连续阳线、阳线回踩或平台突破回踩确认。`);
    }
  }

  if (status === "validated" && !String(reason).trim()) {
    reason = `${asOfDate} 支撑 ${levelPrice.toFixed(2)} 已升为真实支撑。`;
  }
  if (!String(reason).trim()) reason = fallbackReason;
  return {
    status,
    label: statusLabels[status] || status,
    pathId,
    pathLabel: pathLabels[pathId] || "",
    price: Number(levelPrice.toFixed(4)),
    validationReason: reason,
    supportValidationReason: reason,
    validationHistory,
    participatesInScoring: false,
    asOfDate,
    source: meta.source || "",
  };
}

function buildBypassBuyGate(advice, validation, history) {
  const label = validation?.label || "待验证";
  const reason = String(validation?.validationReason || validation?.supportValidationReason || "").trim();
  const result = {
    bypassBuyEligible: false,
    bypassBuyReason: "",
    bypassRiskReward: null,
    bypassStopLossPct: null,
    bypassParticipatesInScoring: false,
  };
  if (!validation || validation.status !== "validated") {
    result.bypassBuyReason = `支撑验证状态：${label}。${reason || "尚未升为真实支撑。"} 旁路买入资格未开启，原买入评分不变。`.trim();
    return result;
  }
  if (!reason) {
    result.bypassBuyReason = "支撑已验证但缺少验证原因，旁路买入资格未开启，原买入评分不变。";
    return result;
  }
  const bars = Array.isArray(history) ? history : [];
  const close = Number(bars.at(-1)?.close || 0);
  const stop = Number(advice?.stopLoss || 0);
  const resistance = Number(advice?.pressurePlan?.price || advice?.pressurePlan?.level?.price || 0);
  let stopPct = null;
  if (advice && advice.stopRiskPct != null && advice.stopRiskPct !== "" && Number.isFinite(Number(advice.stopRiskPct))) {
    stopPct = Number(advice.stopRiskPct) / 100;
  } else if (close > stop && stop > 0) {
    stopPct = (close - stop) / close;
  }
  let riskReward = null;
  if (close > stop && stop > 0 && resistance > close) {
    riskReward = (resistance - close) / (close - stop);
  }
  result.bypassRiskReward = riskReward == null ? null : Number(riskReward.toFixed(2));
  result.bypassStopLossPct = stopPct == null ? null : Number((stopPct * 100).toFixed(2));
  const stopOk = stopPct != null && stopPct >= 0.03 - 1e-8 && stopPct <= 0.08 + 1e-8;
  const rewardOk = riskReward != null && riskReward >= 3;
  result.bypassBuyEligible = Boolean(stopOk && rewardOk);
  const rewardText = riskReward == null ? "缺少上方压力，未计算盈亏比" : `盈亏比 ${riskReward.toFixed(2)}`;
  const stopText = stopPct == null ? "缺少止损" : `止损空间 ${(stopPct * 100).toFixed(2)}%`;
  result.bypassBuyReason = result.bypassBuyEligible
    ? `支撑验证状态：真实支撑。验证原因：${reason} 旁路买入只看${rewardText}（需至少3）和${stopText}（约3%到8%），当前满足。不替换原买入模型评分。`
    : `支撑验证状态：真实支撑。验证原因：${reason} 旁路买入未通过：${rewardText}，${stopText}。需要盈亏比至少3且止损约3%到8%。原买入评分不变。`;
  return result;
}

function recognizeMarketStructure(history = []) {
  const STATUS_LABELS = {
    candidate: "候选",
    testing: "验证中",
    validated: "已验证",
    broken: "已失效",
    reclaimed: "跌破后收回",
    pending_retest: "突破后待回踩确认",
    expired: "已过期",
    none: "无",
  };
  const STAGE_LABELS = [
    "超跌反弹",
    "趋势修复",
    "震荡筑底",
    "突破确认",
    "回踩确认",
    "盘整区间",
    "上涨延续",
    "下跌延续",
    "K线不足",
  ];
  const bars = (Array.isArray(history) ? history : []).filter((bar) => {
    return bar && Number(bar.close) > 0 && Number(bar.high) > 0 && Number(bar.low) > 0;
  });
  const asOfDate = bars.at(-1)?.date || "";
  const blankValidation = (kind) => ({
    status: "none",
    label: kind === "support" ? "无支撑候选" : "无压力候选",
    price: null,
    zoneLow: null,
    zoneHigh: null,
    basis: "可用K线不足，未做结构判断。",
    validationReason: "可用K线不足，未做支撑验证。",
    supportValidationReason: "可用K线不足，未做支撑验证。",
    confirmedTouches: 0,
    source: "",
    asOfDate,
    participatesInScoring: false,
  });
  if (bars.length < 20) {
    const emptySupport = blankValidation("support");
    return {
      trendDirection: "",
      trendStage: "K线不足",
      trendConfidence: 0,
      supportCandidates: [],
      resistanceCandidates: [],
      supportValidation: emptySupport,
      resistanceValidation: blankValidation("resistance"),
      bypassSupportValidation: {
        status: "candidate",
        label: "待验证",
        pathId: "",
        pathLabel: "",
        price: null,
        validationReason: emptySupport.validationReason,
        supportValidationReason: emptySupport.supportValidationReason,
        validationHistory: [],
        participatesInScoring: false,
        asOfDate,
      },
      asOfDate,
      lookbackBars: bars.length,
      participatesInScoring: false,
      allowedStages: STAGE_LABELS,
    };
  }

  function roundPrice(value) {
    return Number(Number(value).toFixed(4));
  }

  function mean(items, selector) {
    return average(items, selector);
  }

  function confirmedSwings(series, windowSize) {
    const points = [];
    if (series.length < windowSize * 2 + 1) return points;
    for (let index = windowSize; index < series.length - windowSize; index += 1) {
      const slice = series.slice(index - windowSize, index + windowSize + 1);
      const bar = series[index];
      const high = Math.max(...slice.map((item) => Number(item.high)));
      const low = Math.min(...slice.map((item) => Number(item.low)));
      if (Number(bar.high) >= high) {
        points.push({
          price: Number(bar.high),
          date: bar.date || "",
          index,
          confirmedIndex: Math.min(series.length - 1, index + windowSize),
          kind: "swing_high",
        });
      }
      if (Number(bar.low) <= low) {
        points.push({
          price: Number(bar.low),
          date: bar.date || "",
          index,
          confirmedIndex: Math.min(series.length - 1, index + windowSize),
          kind: "swing_low",
        });
      }
    }
    return points;
  }

  function clusterPoints(points, mergePct) {
    const sorted = points.filter((point) => point.price > 0).sort((a, b) => a.price - b.price || a.index - b.index);
    const clusters = [];
    sorted.forEach((point) => {
      const last = clusters.at(-1);
      if (last && Math.abs(point.price - last.price) / last.price <= mergePct) {
        last.points.push(point);
        last.price = mean(last.points, (item) => item.price);
      } else {
        clusters.push({ price: point.price, points: [point] });
      }
    });
    return clusters;
  }

  function reactionAfter(index, side) {
    const windowBars = bars.slice(index + 1, index + 4);
    if (!windowBars.length) return null;
    const close = Number(bars[index].close);
    if (!(close > 0)) return null;
    if (side === "support") {
      const high = Math.max(...windowBars.map((item) => Number(item.high)));
      return (high - close) / close;
    }
    const low = Math.min(...windowBars.map((item) => Number(item.low)));
    return (close - low) / close;
  }

  function volumeNote(index, side) {
    const sample = bars.slice(Math.max(0, index - 20), index);
    if (sample.length < 5) return "";
    const base = mean(sample, (item) => Number(item.volume) || 0);
    const volume = Number(bars[index].volume) || 0;
    if (!(base > 0) || !(volume > 0)) return "";
    const ratio = volume / base;
    if (side === "support" && ratio <= 0.85) return "回踩缩量";
    if (side === "support" && ratio >= 1.8) return "触碰放量";
    if (side === "resistance" && ratio >= 1.8) return "触压放量";
    return "";
  }

  function maybeExpire(status, lastTouchIndex, price, close) {
    if (!["candidate", "testing", "validated"].includes(status)) return status;
    if (lastTouchIndex < 0) return status;
    const barsSince = bars.length - 1 - lastTouchIndex;
    const distance = Math.abs(close - price) / price;
    if (barsSince > 90 && distance > 0.12) return "expired";
    return status;
  }

  function evaluateSwingSupport(cluster) {
    const price = cluster.price;
    const firstPoint = cluster.points.slice().sort((a, b) => a.index - b.index)[0];
    const start = firstPoint?.confirmedIndex || 0;
    let status = "candidate";
    let touches = 0;
    let active = false;
    let lastTouchIndex = -1;
    let lastTouchDate = "";
    let reactions = [];
    let volumeNotes = [];
    let validationReason = `${bars[start]?.date || "起始"} 摆动低点 ${roundPrice(price)} 形成支撑候选，状态为候选。`;
    for (let index = start; index < bars.length; index += 1) {
      const bar = bars[index];
      const close = Number(bar.close);
      const low = Number(bar.low);
      const open = Number(bar.open);
      const broke = close < price * 0.99;
      const tagged = low <= price * 1.015 && low >= price * 0.96;
      const held = close >= price * 0.995;
      if (broke) {
        status = "broken";
        touches = 0;
        active = false;
        validationReason = `${bar.date || ""} 收盘跌破支撑 ${roundPrice(price)}，状态改为已失效。`;
        continue;
      }
      if (status === "broken" && close >= price) {
        status = "reclaimed";
        active = false;
        validationReason = `${bar.date || ""} 跌破后收盘收回支撑 ${roundPrice(price)}，尚未完成回踩确认。`;
        continue;
      }
      if (status === "broken" || !tagged || !held) {
        if (!tagged || close > price * 1.03) active = false;
        continue;
      }
      if (active) continue;
      active = true;
      touches += 1;
      lastTouchIndex = index;
      lastTouchDate = bar.date || "";
      const reaction = reactionAfter(index, "support");
      if (reaction != null) reactions.push(reaction);
      const note = volumeNote(index, "support");
      if (note) volumeNotes.push(note);
      const confirming = close >= open && close >= price * 0.995;
      if (status === "reclaimed") {
        status = touches >= 2 && confirming ? "validated" : "testing";
        validationReason = status === "validated"
          ? `${bar.date || ""} 跌破收回后再次守住，确认K线收在支撑上方，升为已验证支撑。`
          : `${bar.date || ""} 跌破收回后的回踩仍在验证中。`;
      } else if (touches >= 2 && confirming) {
        status = "validated";
        validationReason = `${bar.date || ""} 至少两次独立回踩守住，当日阳线收在支撑 ${roundPrice(price)} 上方，升为已验证支撑。`;
      } else if (status !== "validated") {
        status = "testing";
        validationReason = `${bar.date || ""} 价格触碰支撑 ${roundPrice(price)}，进入验证中，单次反弹不升为已验证。`;
      }
    }
    const close = Number(bars.at(-1).close);
    const statusBeforeExpire = status;
    status = maybeExpire(status, lastTouchIndex, price, close);
    if (status === "expired" && statusBeforeExpire !== "expired") {
      validationReason = `${asOfDate} 支撑距离当前价格较远且长时间未再验证，状态改为已过期。`;
    }
    if (status === "validated" && !String(validationReason).trim()) {
      validationReason = `${lastTouchDate || asOfDate} 支撑 ${roundPrice(price)} 已验证。`;
    }
    const basisByStatus = {
      candidate: "摆动低点形成的支撑候选，单次下探不会升级为已验证。",
      testing: "价格已触碰该支撑，仍需另一次守住，不能因一次反弹视为已验证。",
      validated: "至少两次独立回踩守住，且确认K线收在支撑上方。",
      broken: "收盘跌破该支撑，原候选失效。",
      reclaimed: "跌破后已经收回，但还没有完成回踩确认，不能直接视为已验证。",
      expired: "该支撑距离当前价格较远，且长时间没有再次被验证。",
    };
    return {
      price: roundPrice(price),
      zoneLow: roundPrice(price * 0.985),
      zoneHigh: roundPrice(price * 1.015),
      type: "support",
      status,
      statusLabel: STATUS_LABELS[status] || status,
      source: "swing_low",
      touches,
      reactionPct: reactions.length ? reactions.reduce((sum, item) => sum + item, 0) / reactions.length : null,
      volumeNote: volumeNotes.at(-1) || "",
      basis: basisByStatus[status] || "",
      validationReason,
      supportValidationReason: validationReason,
      firstDate: bars[start]?.date || firstPoint?.date || "",
      lastTouchDate,
      lastTouchIndex,
    };
  }

  function evaluateSwingResistance(cluster) {
    const price = cluster.price;
    const firstPoint = cluster.points.slice().sort((a, b) => a.index - b.index)[0];
    const start = firstPoint?.confirmedIndex || 0;
    let status = "candidate";
    let touches = 0;
    let active = false;
    let lastTouchIndex = -1;
    let lastTouchDate = "";
    let breakoutIndex = -1;
    let reactions = [];
    let volumeNotes = [];
    for (let index = start; index < bars.length; index += 1) {
      const bar = bars[index];
      const close = Number(bar.close);
      const high = Number(bar.high);
      const open = Number(bar.open);
      if (status !== "broken" && close > price * 1.01) {
        status = "broken";
        breakoutIndex = index;
        active = false;
        continue;
      }
      if (status === "broken") continue;
      const tagged = high >= price * 0.985 && high <= price * 1.04;
      const rejected = close <= price * 1.005;
      if (!tagged || !rejected) {
        if (!tagged || close < price * 0.97) active = false;
        continue;
      }
      if (active) continue;
      active = true;
      touches += 1;
      lastTouchIndex = index;
      lastTouchDate = bar.date || "";
      const reaction = reactionAfter(index, "resistance");
      if (reaction != null) reactions.push(reaction);
      const note = volumeNote(index, "resistance");
      if (note) volumeNotes.push(note);
      const confirming = close <= open && close <= price * 1.005;
      if (touches >= 2 && confirming) status = "validated";
      else if (status !== "validated") status = "testing";
    }
    const close = Number(bars.at(-1).close);
    if (status !== "broken") status = maybeExpire(status, lastTouchIndex, price, close);
    const basisByStatus = {
      candidate: "摆动高点形成的压力候选。",
      testing: "价格已触碰该压力，仍需更多拒绝确认。",
      validated: "至少两次独立触碰后收盘回落，记为已验证压力。",
      broken: "收盘已突破该压力。突破本身不会把它变成已验证支撑。",
      expired: "该压力距离当前价格较远，或已经过旧。",
    };
    const validationReason = `${lastTouchDate || bars[start]?.date || asOfDate} ${basisByStatus[status] || "压力状态更新。"}`;
    return {
      price: roundPrice(price),
      zoneLow: roundPrice(price * 0.985),
      zoneHigh: roundPrice(price * 1.015),
      type: "resistance",
      status,
      statusLabel: STATUS_LABELS[status] || status,
      source: "swing_high",
      touches,
      reactionPct: reactions.length ? reactions.reduce((sum, item) => sum + item, 0) / reactions.length : null,
      volumeNote: volumeNotes.at(-1) || "",
      basis: basisByStatus[status] || "",
      validationReason,
      firstDate: bars[start]?.date || firstPoint?.date || "",
      lastTouchDate,
      lastTouchIndex,
      breakoutIndex,
    };
  }

  function evaluatePressureBreakoutSupport(price, breakoutIndex) {
    let holds = 0;
    let active = false;
    let lastTouchIndex = -1;
    let lastTouchDate = "";
    let reactions = [];
    let status = "pending_retest";
    let validationReason = `${bars[breakoutIndex]?.date || asOfDate} 收盘突破压力 ${roundPrice(price)} 后只记为待回踩确认，突破当日不视为已验证支撑。`;
    for (let index = breakoutIndex + 1; index < bars.length; index += 1) {
      const bar = bars[index];
      const close = Number(bar.close);
      const low = Number(bar.low);
      const open = Number(bar.open);
      if (close < price * 0.99) {
        status = "broken";
        holds = 0;
        active = false;
        validationReason = `${bar.date || ""} 突破后的回踩没有守住 ${roundPrice(price)}，该支撑候选失效。`;
        continue;
      }
      if (status === "broken" && close >= price) {
        status = "reclaimed";
        active = false;
        validationReason = `${bar.date || ""} 跌破后收回 ${roundPrice(price)}，仍需后续回踩确认，不能直接视为已验证支撑。`;
        continue;
      }
      const tagged = low <= price * 1.02 && low >= price * 0.97;
      const held = close >= price * 0.995;
      if (!tagged || !held || status === "broken") {
        if (!tagged) active = false;
        continue;
      }
      if (active) continue;
      active = true;
      holds += 1;
      lastTouchIndex = index;
      lastTouchDate = bar.date || "";
      const reaction = reactionAfter(index, "support");
      if (reaction != null) reactions.push(reaction);
      const confirming = close >= open;
      if (status === "reclaimed") {
        status = holds >= 2 && confirming ? "validated" : "testing";
      } else if (holds >= 2 && confirming) {
        status = "validated";
      } else if (status !== "validated") {
        status = "testing";
      }
      validationReason = status === "validated"
        ? `${bar.date || ""} 平台突破回踩：第 ${holds} 次回踩守住，确认K线收阳，升为已验证支撑。`
        : status === "testing"
          ? `${bar.date || ""} 压力突破后的回踩仍在验证中，单次回踩不升为已验证支撑。`
          : validationReason;
    }
    const basisByStatus = {
      pending_retest: "收盘突破压力后只记为待回踩确认，突破当日不视为已验证支撑。",
      testing: "压力突破后的回踩还没有两次收阳守住，仍在验证中，不能升级为已验证支撑。",
      validated: "压力突破后至少两次回踩守住，才记为已验证支撑。",
      broken: "突破后的回踩没有守住，该支撑候选失效。",
      reclaimed: "跌破后收回，仍需后续回踩确认，不能直接视为已验证支撑。",
    };
    return {
      price: roundPrice(price),
      zoneLow: roundPrice(price * 0.985),
      zoneHigh: roundPrice(price * 1.015),
      type: "support",
      status,
      statusLabel: STATUS_LABELS[status] || status,
      source: "pressure_breakout",
      touches: holds,
      reactionPct: reactions.length ? reactions.reduce((sum, item) => sum + item, 0) / reactions.length : null,
      volumeNote: "",
      basis: basisByStatus[status] || "",
      validationReason: validationReason || basisByStatus[status] || `${asOfDate} 支撑状态更新。`,
      supportValidationReason: validationReason || basisByStatus[status] || `${asOfDate} 支撑状态更新。`,
      firstDate: bars[breakoutIndex]?.date || "",
      lastTouchDate,
      lastTouchIndex,
      breakoutIndex,
    };
  }

  const swingWindow = 3;
  const swings = confirmedSwings(bars, swingWindow);
  function fallbackPoint(kind) {
    const recent = bars.slice(0, -swingWindow).slice(-40);
    if (!recent.length) return null;
    let best = recent[0];
    recent.forEach((bar) => {
      if (kind === "swing_low" && Number(bar.low) <= Number(best.low)) best = bar;
      if (kind === "swing_high" && Number(bar.high) >= Number(best.high)) best = bar;
    });
    const index = bars.indexOf(best);
    if (index < 0) return null;
    return {
      price: kind === "swing_low" ? Number(best.low) : Number(best.high),
      date: best.date || "",
      index,
      confirmedIndex: Math.min(bars.length - 1, index + swingWindow),
      kind,
    };
  }
  const lowSwings = swings.filter((point) => point.kind === "swing_low");
  const highSwings = swings.filter((point) => point.kind === "swing_high");
  const fallbackLow = fallbackPoint("swing_low");
  const fallbackHigh = fallbackPoint("swing_high");
  if (fallbackLow && !lowSwings.some((point) => Math.abs(point.price - fallbackLow.price) / fallbackLow.price <= 0.015)) {
    lowSwings.push(fallbackLow);
  }
  if (fallbackHigh && !highSwings.some((point) => Math.abs(point.price - fallbackHigh.price) / fallbackHigh.price <= 0.015)) {
    highSwings.push(fallbackHigh);
  }
  const lowClusters = clusterPoints(lowSwings, 0.015);
  const highClusters = clusterPoints(highSwings, 0.015);
  const close = Number(bars.at(-1).close);
  let supportCandidates = lowClusters.map(evaluateSwingSupport);
  const resistanceEvaluations = highClusters.map(evaluateSwingResistance);
  const breakoutSupports = [];
  resistanceEvaluations.forEach((level) => {
    if (level.breakoutIndex >= 0) {
      breakoutSupports.push(evaluatePressureBreakoutSupport(level.price, level.breakoutIndex));
    }
  });
  supportCandidates = supportCandidates.filter((level) => {
    return !breakoutSupports.some((broken) => Math.abs(broken.price - level.price) / level.price <= 0.012);
  }).concat(breakoutSupports);

  function withScore(level) {
    const distance = Math.abs(level.price - close) / close;
    const statusScore = {
      validated: 8,
      testing: 5,
      pending_retest: 4,
      reclaimed: 4,
      candidate: 2,
      broken: 1,
      expired: 0,
    }[level.status] || 0;
    const reactionBoost = level.reactionPct > 0 ? Math.min(level.reactionPct, 0.08) * 20 : 0;
    return {
      ...level,
      score: Number((statusScore + level.touches * 1.5 + Math.max(0, 4 - distance * 25) + reactionBoost).toFixed(2)),
    };
  }

  supportCandidates = supportCandidates
    .map(withScore)
    .filter((level) => level.price <= close * 1.03 && level.price >= close * 0.6 && level.status !== "expired")
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close) || b.score - a.score || a.price - b.price)
    .slice(0, 4)
    .map((level) => {
      const copy = { ...level };
      delete copy.lastTouchIndex;
      delete copy.breakoutIndex;
      return copy;
    });
  const resistanceCandidates = resistanceEvaluations
    .filter((level) => level.status !== "broken")
    .map(withScore)
    .filter((level) => level.price >= close * 0.995 && level.price <= close * 1.35 && level.status !== "expired")
    .sort((a, b) => Math.abs(a.price - close) - Math.abs(b.price - close) || b.score - a.score || a.price - b.price)
    .slice(0, 4)
    .map((level) => {
      const copy = { ...level };
      delete copy.lastTouchIndex;
      delete copy.breakoutIndex;
      return copy;
    });

  function validationFrom(candidates, kind) {
    const selected = candidates[0] || null;
    if (!selected) {
      return {
        status: "none",
        label: kind === "support" ? "无支撑候选" : "无压力候选",
        price: null,
        zoneLow: null,
        zoneHigh: null,
        basis: kind === "support" ? "当前可见K线里没有可用的支撑候选。" : "当前可见K线里没有仍有效的压力候选。",
        validationReason: kind === "support" ? "当前可见K线里没有可用的支撑候选。" : "当前可见K线里没有仍有效的压力候选。",
        supportValidationReason: kind === "support" ? "当前可见K线里没有可用的支撑候选。" : "当前可见K线里没有仍有效的压力候选。",
        confirmedTouches: 0,
        source: "",
        asOfDate,
        participatesInScoring: false,
      };
    }
    const validationReason = selected.validationReason || selected.supportValidationReason || selected.basis || `${asOfDate} ${selected.statusLabel || selected.status || "状态更新"}。`;
    return {
      status: selected.status,
      label: selected.statusLabel,
      price: selected.price,
      zoneLow: selected.zoneLow,
      zoneHigh: selected.zoneHigh,
      basis: selected.basis,
      validationReason,
      supportValidationReason: selected.supportValidationReason || validationReason,
      confirmedTouches: selected.touches,
      source: selected.source,
      asOfDate,
      participatesInScoring: false,
    };
  }

  const supportValidation = validationFrom(supportCandidates, "support");
  const resistanceValidation = validationFrom(resistanceCandidates, "resistance");

  const maOf = (count) => mean(bars.slice(-count), (item) => Number(item.close));
  const ma20 = maOf(Math.min(20, bars.length));
  const ma60 = maOf(Math.min(60, bars.length));
  const ma20Prev = bars.length >= 30 ? mean(bars.slice(-30, -10), (item) => Number(item.close)) : ma20;
  const ma20Slope = ma20Prev > 0 ? (ma20 - ma20Prev) / ma20Prev : 0;
  const weekly = dailyToWeeklyCandles(bars);
  const weeklyClose = Number(weekly.at(-1)?.close || close);
  const weeklyMa10 = weekly.length >= 10 ? mean(weekly.slice(-10), (item) => Number(item.close)) : weeklyClose;
  const weeklyMa30 = weekly.length >= 30 ? mean(weekly.slice(-30), (item) => Number(item.close)) : weeklyMa10;
  const recentSwings = swings.filter((point) => point.index >= bars.length - 160);
  const swingLows = recentSwings.filter((point) => point.kind === "swing_low");
  const swingHighs = recentSwings.filter((point) => point.kind === "swing_high");
  const higherLows = swingLows.length >= 2 && swingLows.at(-1).price > swingLows.at(-2).price * 1.01;
  const lowerHighs = swingHighs.length >= 2 && swingHighs.at(-1).price < swingHighs.at(-2).price * 0.99;
  let upScore = 0;
  let downScore = 0;
  if (close > ma20) upScore += 1;
  if (close < ma20) downScore += 1;
  if (ma20 > ma60 * 1.005) upScore += 1;
  if (ma20 < ma60 * 0.995) downScore += 1;
  if (ma20Slope > 0.008) upScore += 1;
  if (ma20Slope < -0.008) downScore += 1;
  if (higherLows) upScore += 1;
  if (lowerHighs) downScore += 1;
  if (weekly.length >= 8 && weeklyClose > weeklyMa10 && weeklyMa10 >= weeklyMa30 * 0.998) upScore += 1;
  if (weekly.length >= 8 && weeklyClose < weeklyMa10 && weeklyMa10 <= weeklyMa30 * 1.002) downScore += 1;

  let trendDirection = "盘整";
  if (upScore >= 3 && downScore >= 3) trendDirection = "趋势转换中";
  else if (upScore >= 4 && upScore >= downScore + 2) trendDirection = "上涨";
  else if (downScore >= 4 && downScore >= upScore + 2) trendDirection = "下跌";
  else if (upScore >= 3 && downScore <= 1) trendDirection = "上涨";
  else if (downScore >= 3 && upScore <= 1) trendDirection = "下跌";
  else if (upScore >= downScore + 2 && upScore >= 3) trendDirection = "上涨";
  else if (downScore >= upScore + 2 && downScore >= 3) trendDirection = "下跌";

  const agreement = Math.abs(upScore - downScore);
  let trendConfidence = Math.round((agreement / 5) * 100);
  if (trendDirection === "趋势转换中") {
    trendConfidence = Math.max(trendConfidence, Math.round((Math.min(upScore, downScore) / 4) * 100));
  }
  if (trendDirection === "盘整") trendConfidence = Math.max(30, Math.min(65, 35 + agreement * 8));
  if (bars.length < 60) trendConfidence = Math.min(trendConfidence, 70);
  trendConfidence = Math.max(0, Math.min(100, trendConfidence));

  const highWindow = bars.slice(-Math.min(120, bars.length));
  const high120 = Math.max(...highWindow.map((item) => Number(item.high)));
  const drawdown = high120 > 0 ? (high120 - close) / high120 : 0;
  const low20 = Math.min(...bars.slice(-20).map((item) => Number(item.low)));
  const rebound = low20 > 0 ? (close - low20) / low20 : 0;
  const nearestSupport = supportCandidates[0] || null;
  const recentSupportTouch = Boolean(
    nearestSupport
      && nearestSupport.lastTouchDate
      && bars.slice(-12).some((item) => item.date === nearestSupport.lastTouchDate)
  );
  const heldBreakout = breakoutSupports
    .filter((level) => level.breakoutIndex >= 0 && level.breakoutIndex <= bars.length - 4)
    .filter((level) => ["pending_retest", "testing", "validated"].includes(level.status))
    .some((level) => bars.slice(level.breakoutIndex + 1).every((item) => Number(item.close) >= level.price * 0.995));

  let trendStage = "盘整区间";
  if (trendDirection === "下跌" && rebound >= 0.05 && close < ma60) {
    trendStage = "超跌反弹";
  } else if (drawdown >= 0.15 && close > ma20 && trendDirection !== "上涨") {
    trendStage = "趋势修复";
  } else if (nearestSupport && nearestSupport.status === "validated" && nearestSupport.source !== "pressure_breakout" && recentSupportTouch && trendDirection === "上涨") {
    trendStage = "回踩确认";
  } else if (nearestSupport && nearestSupport.source === "pressure_breakout" && nearestSupport.status === "validated") {
    trendStage = "回踩确认";
  } else if (heldBreakout && trendDirection !== "下跌") {
    trendStage = "突破确认";
  } else if (trendDirection === "盘整" && (nearestSupport?.touches || 0) >= 2) {
    trendStage = "震荡筑底";
  } else if (trendDirection === "上涨") {
    trendStage = "上涨延续";
  } else if (trendDirection === "下跌") {
    trendStage = "下跌延续";
  } else if (trendDirection === "趋势转换中") {
    trendStage = close > ma20 ? "趋势修复" : "震荡筑底";
  }

  const bypassSupportValidation = supportValidation.price
    ? evaluateSupportPathValidation(bars, supportValidation.price, { source: supportValidation.source || "structure" })
    : {
      status: "candidate",
      label: "待验证",
      pathId: "",
      pathLabel: "",
      price: null,
      validationReason: supportValidation.validationReason || "当前没有可验证的支撑。",
      supportValidationReason: supportValidation.supportValidationReason || supportValidation.validationReason || "当前没有可验证的支撑。",
      validationHistory: [],
      participatesInScoring: false,
      asOfDate,
    };
  if (bypassSupportValidation.status === "validated" && !String(bypassSupportValidation.validationReason || "").trim()) {
    bypassSupportValidation.validationReason = `${asOfDate} 支撑已升为真实支撑。`;
    bypassSupportValidation.supportValidationReason = bypassSupportValidation.validationReason;
  }
  return {
    trendDirection,
    trendStage,
    trendConfidence,
    supportCandidates,
    resistanceCandidates,
    supportValidation,
    resistanceValidation,
    bypassSupportValidation,
    asOfDate,
    lookbackBars: bars.length,
    participatesInScoring: false,
    allowedStages: STAGE_LABELS,
  };
}

function manualSupportPrice() {
  if (typeof nearestManualLevels !== "function") return null;
  try {
    const price = Number(nearestManualLevels()?.support?.price);
    return price > 0 ? price : null;
  } catch (error) {
    return null;
  }
}

function attachStructureRecognition(advice, history) {
  const structure = recognizeMarketStructure(history);
  const manualPrice = manualSupportPrice();
  const bypassSupportValidation = manualPrice
    ? evaluateSupportPathValidation(history, manualPrice, { source: "manual" })
    : structure.bypassSupportValidation;
  const gate = buildBypassBuyGate(advice, bypassSupportValidation, history);
  if (!advice || typeof advice !== "object") return advice;
  return {
    ...advice,
    trendDirection: structure.trendDirection,
    trendStage: structure.trendStage,
    trendConfidence: structure.trendConfidence,
    supportCandidates: structure.supportCandidates,
    resistanceCandidates: structure.resistanceCandidates,
    supportValidation: structure.supportValidation,
    resistanceValidation: structure.resistanceValidation,
    bypassSupportValidation,
    bypassBuyEligible: gate.bypassBuyEligible,
    bypassBuyReason: gate.bypassBuyReason,
    bypassRiskReward: gate.bypassRiskReward,
    bypassStopLossPct: gate.bypassStopLossPct,
    bypassParticipatesInScoring: false,
  };
}

function structureCandidateText(candidates) {
  if (!candidates?.length) return "无";
  return candidates.slice(0, 3).map((item) => {
    const bits = [formatPrice(item.price), item.statusLabel || item.status || ""];
    if (item.touches) bits.push(`${item.touches}次触碰`);
    if (item.volumeNote) bits.push(item.volumeNote);
    return bits.filter(Boolean).join(" ");
  }).join("；");
}

function structureStatusText(validation) {
  if (!validation || validation.status === "none" || validation.price == null) {
    return validation?.basis || validation?.label || "无";
  }
  return `${formatPrice(validation.price)} · ${validation.label || validation.status}${validation.basis ? `（${validation.basis}）` : ""}`;
}

function adviceHasStructureRecognition(advice) {
  return Boolean(advice && (advice.supportValidation || advice.resistanceValidation || advice.trendConfidence != null));
}

function supportValidationView(advice) {
  const bypass = advice?.bypassSupportValidation;
  if (bypass && (bypass.validationReason || bypass.supportValidationReason || bypass.status)) {
    return {
      statusText: bypass.label || bypass.status || "--",
      reason: bypass.validationReason || bypass.supportValidationReason || "",
      pathLabel: bypass.pathLabel || "",
      price: bypass.price,
    };
  }
  const legacy = advice?.supportValidation;
  return {
    statusText: legacy?.label || legacy?.status || "--",
    reason: legacy?.validationReason || legacy?.supportValidationReason || legacy?.basis || "",
    pathLabel: "",
    price: legacy?.price,
  };
}

function structureRecognitionSummaryLines(advice) {
  if (!adviceHasStructureRecognition(advice)) return [];
  const confidence = advice.trendConfidence == null || advice.trendConfidence === ""
    ? "--"
    : `${Math.round(Number(advice.trendConfidence))}`;
  const supportView = supportValidationView(advice);
  return [
    "结构识别（训练解释，不参与买卖评分）",
    `趋势方向：${advice.trendDirection || "--"}`,
    `趋势阶段：${advice.trendStage || "--"}`,
    `趋势置信度：${confidence}`,
    `支撑候选：${structureCandidateText(advice.supportCandidates)}`,
    `压力候选：${structureCandidateText(advice.resistanceCandidates)}`,
    `支撑验证：${structureStatusText(advice.supportValidation)}`,
    `压力验证：${structureStatusText(advice.resistanceValidation)}`,
    `支撑验证状态：${supportView.statusText}`,
    `验证原因：${supportView.reason || "--"}`,
    advice.bypassBuyReason ? `旁路买入：${advice.bypassBuyEligible ? "满足盈亏比和止损" : "未开启"}。${advice.bypassBuyReason}` : "",
  ].filter(Boolean);
}

function humanStructureSelections() {
  const humanDirection = document.querySelector("#replayTrendDirection")?.value || "";
  const humanStage = document.querySelector("#replayTrendStage")?.value || "";
  const humanSupportText = document.querySelector("#replaySupportStatus")?.selectedOptions?.[0]?.textContent || "";
  const humanEvidenceText = document.querySelector("#replaySupportEvidence")?.selectedOptions?.[0]?.textContent || "";
  return {
    humanDirection,
    humanStage,
    humanSupport: humanSupportText && humanSupportText !== "未填写" ? humanSupportText : "",
    humanEvidence: humanEvidenceText && humanEvidenceText !== "未填写" ? humanEvidenceText : "",
  };
}

function structureCompareNotes(advice, human = humanStructureSelections()) {
  const gaps = [];
  if (human.humanDirection && advice?.trendDirection && human.humanDirection !== advice.trendDirection) gaps.push("日线方向与人工不一致");
  if (human.humanStage && advice?.trendStage && human.humanStage !== advice.trendStage) {
    gaps.push("阶段与人工不一致");
  }
  const supportView = supportValidationView(advice);
  const supportAlign = {
    "候选": "待验证",
    "待验证": "待验证",
    "验证中": "验证中",
    "已验证": "真实支撑",
    "真实支撑": "真实支撑",
    "已失效": "失效",
    "失效": "失效",
  };
  const humanSupportKey = supportAlign[human.humanSupport] || "";
  if (humanSupportKey && supportView.statusText && humanSupportKey !== supportView.statusText) gaps.push("支撑验证状态与人工不一致");
  const evidenceAlign = {
    "急跌修复": "急跌修复",
    "跌破后回踩确认": "跌破后回踩确认",
    "底部形态": "底部形态",
    "平台突破回踩": "平台突破回踩",
    "突破回踩": "平台突破回踩",
    "头肩底": "底部形态",
  };
  const humanPath = evidenceAlign[human.humanEvidence] || "";
  if (humanPath && supportView.pathLabel && humanPath !== supportView.pathLabel) gaps.push("验证路径与人工依据不一致");
  return gaps;
}

function bypassStructureSectionHtml(advice, { includeHuman = false } = {}) {
  if (!advice) return "";
  const supportView = supportValidationView(advice);
  const human = includeHuman ? humanStructureSelections() : null;
  const gaps = includeHuman
    ? structureCompareNotes(advice, human).filter((item) => item.startsWith("支撑") || item.startsWith("验证"))
    : [];
  const eligibleText = advice.bypassBuyEligible ? "旁路资格：盈亏比和止损已满足（不改原评分）" : "旁路资格：未替换原买入评分";
  return `
    <div class="rule-advice-section structure-recognition-summary" data-structure-layer="support-bypass">
      <span>支撑验证状态</span>
      <p>状态：${escapeHtml(supportView.statusText || "--")}${supportView.pathLabel ? ` · ${escapeHtml(supportView.pathLabel)}` : ""}</p>
      <p>验证原因：${escapeHtml(supportView.reason || "尚无验证原因")}</p>
      <p>${escapeHtml(advice.bypassBuyReason || eligibleText)}</p>
    </div>
    ${includeHuman ? `<p class="muted">人工标注：方向 ${escapeHtml(human.humanDirection || "未填写")} / 阶段 ${escapeHtml(human.humanStage || "未填写")} / 支撑 ${escapeHtml(human.humanSupport || "未填写")} / 依据 ${escapeHtml(human.humanEvidence || "未填写")}</p>` : ""}
    ${gaps.length ? `<p class="muted">${escapeHtml(gaps.join("；"))}</p>` : ""}
  `;
}

function structureRecognitionSectionHtml(advice) {
  if (!currentReplayCandle()) return "";
  if (!adviceHasStructureRecognition(advice)) {
    return `<div class="rule-advice-section structure-recognition-summary" data-structure-layer="training-explanation"><span>结构识别（训练解释，不参与买卖评分）</span><p class="muted">这条建议没有结构识别结果。</p></div>`;
  }
  const human = humanStructureSelections();
  const gaps = structureCompareNotes(advice, human).filter((item) => item.startsWith("日线") || item.startsWith("阶段"));
  const confidence = advice.trendConfidence == null || advice.trendConfidence === ""
    ? "--"
    : `${Math.round(Number(advice.trendConfidence))}`;
  return `
    <div class="rule-advice-section structure-recognition-summary" data-structure-layer="training-explanation">
      <span>结构识别（训练解释，不参与买卖评分）</span>
      <p>趋势方向：${escapeHtml(advice.trendDirection || "--")}</p>
      <p>趋势阶段：${escapeHtml(advice.trendStage || "--")}</p>
      <p>趋势置信度：${escapeHtml(confidence)}</p>
      <p>支撑候选：${escapeHtml(structureCandidateText(advice.supportCandidates))}</p>
      <p>压力候选：${escapeHtml(structureCandidateText(advice.resistanceCandidates))}</p>
      <p>支撑验证：${escapeHtml(structureStatusText(advice.supportValidation))}</p>
      <p>压力验证：${escapeHtml(structureStatusText(advice.resistanceValidation))}</p>
      ${gaps.length ? `<p class="muted">${escapeHtml(gaps.join("；"))}</p>` : ""}
    </div>
    ${bypassStructureSectionHtml(advice, { includeHuman: true })}
  `;
}


function replayServerAdvicePlaceholder(message = "点击AI分析按钮获取当前交易建议") {
  const loading = replayState.serverAdviceStatus === "loading";
  return {
    side: replayState.position ? "sell" : "buy",
    sideLabel: replayState.position ? "卖出管理" : "买入观察",
    action: replayState.position ? "hold_position" : "watch",
    actionText: loading ? "分析中" : "等待AI分析",
    stage: loading ? "后端分析中" : "尚未分析",
    model: "后端统一决策模型",
    score: null,
    matched: [],
    missing: [message],
    plan: [loading ? "等待后端返回当前日期、画线和持仓对应的唯一决策。" : "确认当前画线后点击AI分析。"],
    pressurePlan: null,
    stopLoss: null,
    stopBasis: "",
    stopRiskPct: null,
  };
}

function replayServerAdviceRequestData() {
  const candle = currentReplayCandle();
  if (!candle || !replayState.data?.symbol) return null;
  const nearest = nearestManualLevels();
  return {
    symbol: replayState.data.symbol,
    market: replayState.data.market || "cn",
    date: candle.date,
    support: nearest.support?.price || null,
    resistance: nearest.effectiveResistance?.price || nearest.nearResistance?.price || nearest.resistance?.price || null,
    levels: (replayState.manualLevels || []).map((level) => ({
      price: Number(level.price),
      role: inferredLevelRole(level),
      reason: level.reason || "",
    })),
    history: replayDailyHistory().slice(-700),
    position: replayState.position || replayMarketPositionForAdvice() || null,
  };
}

async function requestReplayServerAdvice({ force = false } = {}) {
  const payload = replayServerAdviceRequestData();
  if (!payload) return null;
  const requestKey = JSON.stringify(payload);
  const previousAdvice = replayState.serverAdvice;
  if (!force && replayState.serverAdviceKey === requestKey && ["loading", "loaded"].includes(replayState.serverAdviceStatus)) {
    return replayState.serverAdvice;
  }
  replayState.serverAdviceKey = requestKey;
  replayState.serverAdviceStatus = "loading";
  renderRuleAdvice();
  try {
    const advice = await fetchReplayServerAdvice(payload);
    if (replayState.serverAdviceKey !== requestKey) return null;
    replayState.serverAdvice = advice;
    replayState.serverAdviceStatus = "loaded";
    renderRuleAdvice();
    return replayState.serverAdvice;
  } catch (error) {
    if (replayState.serverAdviceKey !== requestKey) return null;
    replayState.serverAdviceStatus = "error";
    replayState.serverAdvice = previousAdvice;
    if (!replayState.serverAdvice) {
      setStatus("#replayStatus", error.message || "后端交易建议请求失败", "negative");
    }
    renderRuleAdvice();
    return null;
  }
}

async function fetchReplayServerAdvice(payload) {
  if (!payload) throw new Error("缺少后端交易建议请求参数");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(apiUrl("/api/replay-advice"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "后端交易建议请求失败");
    return result.advice || null;
  } catch (error) {
    if (error.name === "AbortError") throw new Error("后端分析超过30秒，请重启8766服务后重试");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function frontendReplayAdvice() {
  if (!currentReplayCandle()) return null;
  const history = replayDailyHistory();
  const input = {
    history,
    levels: replayState.manualLevels || [],
    position: replayState.position || null,
  };
  if (window.StrategyCore?.analyze) return window.StrategyCore.analyze(input);
  return attachStructureRecognition(ruleLibraryAdvice(), history);
}

function withLiveStructure(advice, { frozen = false } = {}) {
  if (!advice || frozen || !currentReplayCandle()) return advice;
  return attachStructureRecognition(advice, replayDailyHistory());
}

function activeReplayAdvice() {
  const logged = loggedAdviceSnapshotForCurrentCandle();
  if (logged) return logged;
  return withLiveStructure(replayState.serverAdvice || frontendReplayAdvice() || replayServerAdvicePlaceholder());
}

function renderRuleAdvice() {
  const titleNode = document.querySelector("#ruleAdviceTitle");
  const stageNode = document.querySelector("#ruleAdviceStage");
  const scoreNode = document.querySelector("#ruleAdviceScore");
  const actionNode = document.querySelector("#ruleAdviceActionText");
  const bodyNode = document.querySelector("#ruleAdviceBody");
  const copyButton = document.querySelector("#copyRuleAdviceSummary");
  const executeButton = document.querySelector("#executeRuleAdvice");
  if (!stageNode || !scoreNode || !bodyNode) return;
  const loggedAdvice = loggedAdviceSnapshotForCurrentCandle();
  let advice = loggedAdvice || replayState.serverAdvice || frontendReplayAdvice() || replayServerAdvicePlaceholder();
  if (titleNode) {
    const data = replayState.data || {};
    const symbol = displaySecuritySymbol(data, data.symbol || document.querySelector("#replaySymbol")?.value?.trim() || "--");
    const name = data.name || document.querySelector("#replayStockSearch")?.dataset.name || "";
    titleNode.textContent = name ? `AI\u7b56\u7565 (${symbol} ${name})` : `AI\u7b56\u7565 (${symbol})`;
  }
  if (!loggedAdvice && !replayState.writeTraining && replayState.marketPosition?.status === "held" && !replayMarketPositionForAdvice()) {
    advice.side = "sell";
    advice.sideLabel = "\u5356\u51fa\u89c2\u5bdf";
    advice.action = "hold_position";
    advice.actionText = "\u8bf7\u5148\u586b\u5199\u4e70\u5165\u65e5\u671f\u3001\u4e70\u5165\u4ef7\u683c\u548c\u6b62\u635f\u4ef7\u683c";
    advice.stage = "\u6301\u4ed3\u4fe1\u606f\u4e0d\u5b8c\u6574";
    advice.model = "\u6301\u4ed3\u72b6\u6001\u8bb0\u5f55";
    advice.score = null;
    advice.matched = ["\u5f53\u524d\u72b6\u6001\u4e3a\u5df2\u6301\u4ed3"];
    advice.missing = ["\u9700\u8981\u4e70\u5165\u65e5\u671f", "\u9700\u8981\u4e70\u5165\u4ef7\u683c", "\u9700\u8981\u6b62\u635f\u4ef7\u683c"];
    advice.plan = ["\u8865\u5145\u6301\u4ed3\u4fe1\u606f\u540e\uff0cAI\u5c06\u6309\u5356\u51fa\u89c2\u5bdf\u65b9\u5411\u8bc4\u4f30\u3002"];
  }
  if (!loggedAdvice) advice = withLiveStructure(advice);
  else if (currentReplayCandle()) advice = attachStructureRecognition({ ...advice }, replayDailyHistory());
  const hasCandle = Boolean(currentReplayCandle());
  if (copyButton) copyButton.disabled = !hasCandle;
  if (executeButton) executeButton.disabled = !hasCandle;
  stageNode.textContent = advice.stage || "--";
  scoreNode.textContent = advice.score == null ? "--" : `${Math.round(advice.score)}分`;
  scoreNode.className = advice.score >= 75 ? "positive-text" : advice.score >= 60 ? "" : "negative-text";
  if (actionNode) {
    const marketMode = !replayState.writeTraining;
    actionNode.innerHTML = marketMode
      ? `<span>\u64cd\u4f5c\u5efa\u8bae</span><strong>${escapeHtml(advice.actionText || "--")}</strong>`
      : `<span>\u64cd\u4f5c\u5efa\u8bae</span><strong>${escapeHtml(advice.actionText || "\u5efa\u8bae\u89c2\u671b")}</strong>`;
    actionNode.className = `rule-advice-action-card ${advice.action || "watch"}`;
  }
  const listHtml = (items = []) => {
    if (!items.length) return `<p class="muted">暂无</p>`;
    return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
  };
  const pressureLevelText = (level) => level ? `${formatPrice(level.price)} - ${levelRoleLabel(inferredLevelRole(level))}` : "未画";
  const supportStatusLabel = (level) => {
    if (!level) return "未画";
    const role = inferredLevelRole(level);
    if (role === "pending_support") return "突破后待回踩确认";
    if (level.validationStatus === "validated") return "已验证";
    if (level.validationStatus === "broken") return "已失效";
    if (level.validationStatus === "testing") return "验证中";
    return "候选";
  };
  const pressurePlan = advice.pressurePlan || {};
  const planItems = [...(advice.plan || [])];
  if (advice.stopLoss != null && Number(advice.stopLoss) > 0) {
    planItems.push(`\u6b62\u635f\u4ef7\uff1a${formatPrice(advice.stopLoss)}${advice.stopBasis ? `\uff08${advice.stopBasis}\uff09` : ""}`);
  }
  const trainingPosition = replayState.writeTraining ? replayState.position : null;
  const positionEntryDate = trainingPosition?.entryDate || "--";
  const positionEntryPrice = Number(trainingPosition?.entryPrice) > 0 ? formatPrice(trainingPosition.entryPrice) : "--";
  const positionStopLoss = Number(trainingPosition?.stopLoss) > 0 ? formatPrice(trainingPosition.stopLoss) : "--";
  bodyNode.innerHTML = `
    ${loggedAdvice ? `<div class="rule-advice-section"><span>\u5386\u53f2\u5efa\u8bae</span><p>\u5f53\u524d\u663e\u793a\u7684\u662f\u8be5\u4ea4\u6613\u65e5\u6267\u884c\u65f6\u4fdd\u5b58\u7684AI\u5efa\u8bae\uff0c\u4e0d\u662f\u6309\u5f53\u524d\u6301\u4ed3\u72b6\u6001\u91cd\u65b0\u8ba1\u7b97\u7684\u5efa\u8bae\u3002</p></div>` : ""}
    <div class="rule-advice-section">
      <span>当前状态</span>
      <p>${!replayState.writeTraining ? (replayState.marketPosition?.status === "held" ? "\u5df2\u6301\u4ed3" : "\u672a\u6301\u4ed3") : escapeHtml(advice.sideLabel || "--")}</p>
    </div>
    ${trainingPosition ? `<div class="rule-advice-section"><span>买入信息</span><p>买入日期：${escapeHtml(positionEntryDate)}</p><p>买入价：${escapeHtml(positionEntryPrice)}</p><p>止损价：${escapeHtml(positionStopLoss)}</p></div>` : ""}
    <div class="rule-advice-section">
      <span>当前阶段</span>
      <p>${escapeHtml(advice.stage || "--")}</p>
    </div>
    ${structureRecognitionSectionHtml(advice)}
    <div class="rule-advice-section">
      <span>支撑验证状态</span>
      <p>当前支撑：${escapeHtml(pressureLevelText(nearestManualLevels().support))}</p>
      <p>状态：${escapeHtml(supportValidationView(advice).statusText || supportStatusLabel(nearestManualLevels().support))}</p>
      <p>验证原因：${escapeHtml(supportValidationView(advice).reason || "尚无验证原因")}</p>
      <p>人工依据：${escapeHtml(document.querySelector("#replaySupportEvidence")?.selectedOptions?.[0]?.textContent || "未填写")}</p>
    </div>
    <div class="rule-advice-section">
      <span>压力分层</span>
      <p>近端压力：${escapeHtml(pressureLevelText(pressurePlan.near))}</p>
      <p>有效压力：${escapeHtml(pressureLevelText(pressurePlan.effective))}</p>
      <p>突破目标：${escapeHtml(pressureLevelText(pressurePlan.breakoutTarget))}</p>
      <p>采用口径：${escapeHtml(pressurePlanSummary(pressurePlan))}</p>
    </div>
    <div class="rule-advice-section">
      <span>匹配模型</span>
      <p>${escapeHtml(advice.model || "--")}${advice.score == null ? "" : `，匹配度 ${Math.round(advice.score)} 分`}</p>
    </div>
    <div class="rule-advice-section">
      <span>符合特征</span>
      ${listHtml(advice.matched || [])}
    </div>
    <div class="rule-advice-section">
      <span>缺少确认</span>
      ${listHtml(advice.missing || [])}
    </div>
    <div class="rule-advice-section">
      <span>交易计划</span>
      ${listHtml(planItems)}
    </div>
  `;
}

function ruleAdviceSummaryText(advice = currentAiAdviceSnapshot()) {
  syncManualLevelInputs();
  const candle = currentReplayCandle();
  const nearest = nearestManualLevels();
  const symbol = replayState.data?.symbol || document.querySelector("#replaySymbol")?.value?.trim() || "--";
  const supportText = nearest.support ? formatPrice(nearest.support.price) : "未画";
  const pressurePlan = advice.pressurePlan || pressurePlanFromLevels(nearest, {});
  const adoptedPressureText = pressurePlan.level ? formatPrice(pressurePlan.level.price) : "未画";
  const nearPressureText = pressurePlan.near ? formatPrice(pressurePlan.near.price) : "未画";
  const effectivePressureText = pressurePlan.effective ? formatPrice(pressurePlan.effective.price) : "未画";
  const breakoutTargetText = pressurePlan.breakoutTarget ? formatPrice(pressurePlan.breakoutTarget.price) : "未画";
  const trainingPosition = replayState.writeTraining ? replayState.position : null;
  return [
    "AI建议摘要",
    `日期：${candle?.date || "--"}`,
    `股票代码：${symbol}`,
    `支撑：${supportText}`,
    `采用压力：${adoptedPressureText}`,
    `近端压力：${nearPressureText}`,
    `有效压力：${effectivePressureText}`,
    `突破目标：${breakoutTargetText}`,
    `盈亏比口径：${pressurePlanSummary(pressurePlan)}`,
    `操作建议：${advice.actionText || "建议观望"}`,
    trainingPosition ? `买入日期：${trainingPosition.entryDate || "--"}` : "",
    trainingPosition ? `买入价：${Number(trainingPosition.entryPrice) > 0 ? formatPrice(trainingPosition.entryPrice) : "--"}` : "",
    trainingPosition ? `止损价：${Number(trainingPosition.stopLoss) > 0 ? formatPrice(trainingPosition.stopLoss) : "--"}` : "",
    advice.stage ? `当前阶段：${advice.stage}` : "",
    ...structureRecognitionSummaryLines(advice),
    advice.model ? `匹配模型：${advice.model}` : "",
    advice.score == null ? "" : `匹配度：${advice.score}分`,
  ].filter(Boolean).join("\n");
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy command failed");
}

async function copyRuleAdviceSummary() {
  const candle = currentReplayCandle();
  if (!candle) {
    setStatus("#replayStatus", "当前没有K线数据，无法复制AI建议摘要。", "negative");
    return;
  }
  try {
    const text = ruleAdviceSummaryText();
    await writeClipboardText(text);
    setStatus("#replayStatus", "已复制AI建议摘要，可直接粘贴到 Codex。", "positive");
  } catch (error) {
    console.error(error);
    setStatus("#replayStatus", "复制失败，请检查浏览器剪切板权限。", "negative");
  }
}

function setAiAdviceFeedback() {
  replayState.aiAdviceFeedback = null;
  updateAiAdviceFeedbackUi();
}

function resetAiAdviceFeedback() {
  replayState.aiAdviceFeedback = null;
  const reasonInput = document.querySelector("#aiDisagreeReason");
  if (reasonInput) reasonInput.value = "";
  updateAiAdviceFeedbackUi();
}

function updateAiAdviceFeedbackUi() {
  const panel = document.querySelector("#aiFeedbackPanel");
  panel?.classList.add("hidden");
  document.querySelectorAll(".ai-feedback-button").forEach((button) => {
    button.classList.remove("active");
    button.setAttribute("aria-pressed", "false");
  });
  document.querySelector("#aiDisagreeReasonWrap")?.classList.add("hidden");
}

function isActionableAiAdvice(advice = currentAiAdviceSnapshot()) {
  return advice.action === "buy" || advice.action === "sell";
}

function aiAdviceReasonText(advice = currentAiAdviceSnapshot()) {
  const matched = (advice.matched || []).slice(0, 4).join("；");
  const missing = (advice.missing || []).slice(0, 3).join("；");
  const plan = (advice.plan || []).slice(0, 4).join("；");
  return [
    `AI认可：${advice.actionText || "操作建议"}`,
    advice.stage ? `阶段：${advice.stage}` : "",
    advice.model ? `模型：${advice.model}` : "",
    advice.score == null ? "" : `匹配度：${advice.score}分`,
    matched ? `符合：${matched}` : "",
    missing ? `缺少确认：${missing}` : "",
    plan ? `计划：${plan}` : "",
  ].filter(Boolean).join("；");
}

function aiStopLossSuggestion(advice = currentAiAdviceSnapshot()) {
  const adviceStop = Number(advice?.stopLoss);
  if (Number.isFinite(adviceStop) && adviceStop > 0) return adviceStop;
  const candle = currentReplayCandle();
  if (!candle) return 0;
  return Math.min(Number(candle.open) || 0, Number(candle.close) || 0) || 0;
}

function applyAiAdviceToDecisionFields(advice = currentAiAdviceSnapshot()) {
  const reasonText = aiAdviceReasonText(advice);
  if (advice.action === "buy") {
    const buyReason = document.querySelector("#replayBuyReason");
    const stopLoss = document.querySelector("#replayStopLoss");
    const stopLossReason = document.querySelector("#replayStopLossReason");
    const stop = aiStopLossSuggestion(advice);
    if (buyReason) {
      buyReason.value = reasonText;
      buyReason.focus();
    }
    if (stopLoss && stop) stopLoss.value = formatPrice(stop);
    if (stopLossReason) {
      stopLossReason.value = `AI建议：以${advice.stopBasis || "结构止损位"} ${stop ? formatPrice(stop) : "--"} 作为止损依据；模型：${advice.model || "--"}`;
    }
    updateBuyStopLossVisibility({ clearWhenHidden: false });
    return "buy";
  }
  if (advice.action === "sell") {
    const sellReason = document.querySelector("#replaySellReason");
    if (sellReason) {
      sellReason.value = reasonText;
      sellReason.focus();
    }
    return "sell";
  }
  const holdNote = document.querySelector("#replayHoldNote");
  if (holdNote) {
    holdNote.value = reasonText;
    holdNote.focus();
  }
  return "hold";
}

function executeRuleAdvice() {
  const candle = currentReplayCandle();
  if (!candle) {
    setStatus("#replayStatus", "当前没有K线数据，无法执行AI建议。", "negative");
    return;
  }
  const advice = currentAiAdviceSnapshot();
  if (!advice.action) {
    setStatus("#replayStatus", "AI暂无操作建议，请先画出支撑压力线。", "negative");
    return;
  }
  // 自动按AI建议执行，自动进入下一日
  const action = applyAiAdviceToDecisionFields(advice);
  replayState.aiAdviceFeedback = isActionableAiAdvice(advice) ? "accepted" : null;
  updateAiAdviceFeedbackUi();
  saveReplayDecision(action);
  // saveReplayDecision 内部已有 cursor+=1 的逻辑
}

function aiMismatchReason(action, advice = currentAiAdviceSnapshot()) {
  return `人工操作为${replayActionLabel(action)}，与AI建议${advice.actionText || advice.action || "--"}不一致，自动标记为不认可。`;
}

function inferAiAdviceFeedback(action, reason, note, advice = currentAiAdviceSnapshot()) {
  if (!isActionableAiAdvice(advice)) return { accepted: null, disagreeReason: "" };
  if (action === advice.action) return { accepted: true, disagreeReason: "" };
  const userReason = (action === "hold" ? note : reason) || aiMismatchReason(action, advice);
  return { accepted: false, disagreeReason: userReason };
}


function currentAiAdviceSnapshot() {
  const advice = activeReplayAdvice();
  return {
    trendDirection: advice.trendDirection || advice.trend?.direction || "",
    trendStage: advice.trendStage || advice.stage || "",
    trendConfidence: advice.trendConfidence ?? null,
    supportCandidates: advice.supportCandidates || [],
    resistanceCandidates: advice.resistanceCandidates || [],
    supportValidation: advice.supportValidation || null,
    resistanceValidation: advice.resistanceValidation || null,
    bypassSupportValidation: advice.bypassSupportValidation || null,
    bypassBuyEligible: advice.bypassBuyEligible === true,
    bypassBuyReason: advice.bypassBuyReason || "",
    side: advice.side || "",
    sideLabel: advice.sideLabel || "",
    action: advice.action || "",
    actionText: advice.actionText || "",
    reasonText: aiAdviceReasonText(advice),
    stage: advice.stage || "",
    model: advice.model || "",
    score: advice.score == null ? null : Math.round(advice.score),
    matched: advice.matched || [],
    missing: advice.missing || [],
    plan: advice.plan || [],
    pressurePlan: advice.pressurePlan || null,
    stopLoss: advice.stopLoss || null,
    stopBasis: advice.stopBasis || "",
    stopRiskPct: advice.stopRiskPct == null ? null : advice.stopRiskPct,
  };
}

function createReplayActionId(action, date) {
  return `${replayState.sessionId || "session"}-${date || "date"}-${action || "action"}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeLoggedAdviceSnapshot(record) {
  const snapshot = record?.aiAdviceSnapshot || null;
  const loggedAction = ["buy", "sell"].includes(record?.action) ? record.action : "";
  const action = snapshot?.action || record?.aiAdviceAction || loggedAction;
  const actionText = snapshot?.actionText || record?.aiAdviceText || (loggedAction ? replayActionLabel(loggedAction) : "");
  if (!snapshot && !action && !actionText) return null;
  return {
    side: snapshot?.side || record?.aiAdviceSide || "",
    sideLabel: snapshot?.sideLabel || "",
    action,
    actionText,
    reasonText: snapshot?.reasonText || record?.reason || record?.note || "",
    stage: snapshot?.stage || record?.aiAdviceStage || "",
    model: snapshot?.model || record?.aiAdviceModel || "",
    score: snapshot?.score ?? record?.aiAdviceScore ?? null,
    matched: snapshot?.matched || [],
    missing: snapshot?.missing || [],
    plan: snapshot?.plan || [],
    pressurePlan: snapshot?.pressurePlan || null,
    trendDirection: snapshot && (snapshot.supportValidation || snapshot.resistanceValidation || snapshot.trendConfidence != null) ? (snapshot.trendDirection || "") : "",
    trendStage: snapshot && (snapshot.supportValidation || snapshot.resistanceValidation || snapshot.trendConfidence != null) ? (snapshot.trendStage || "") : "",
    trendConfidence: snapshot?.trendConfidence ?? null,
    supportCandidates: snapshot?.supportCandidates || [],
    resistanceCandidates: snapshot?.resistanceCandidates || [],
    supportValidation: snapshot?.supportValidation || null,
    resistanceValidation: snapshot?.resistanceValidation || null,
    bypassSupportValidation: snapshot?.bypassSupportValidation || null,
    bypassBuyEligible: snapshot?.bypassBuyEligible === true,
    bypassBuyReason: snapshot?.bypassBuyReason || "",
    stopLoss: snapshot?.stopLoss || record?.stopLoss || null,
    stopBasis: snapshot?.stopBasis || record?.stopLossReason || "",
    stopRiskPct: snapshot?.stopRiskPct == null ? null : snapshot.stopRiskPct,
  };
}

function loggedAdviceSnapshotForCurrentCandle() {
  const candle = currentReplayCandle();
  if (!candle) return null;
  const entries = (replayState.log || []).filter((record) => record.date === candle.date);
  const withAdvice = entries.find((record) => normalizeLoggedAdviceSnapshot(record));
  return normalizeLoggedAdviceSnapshot(withAdvice);
}

function refreshReplayAdviceFromLevels({ resetFeedback = false } = {}) {
  syncManualLevelInputs();
  if (replayState.backtestMode) updateBacktestLevelUi();
  if (!replayState.backtestMode) requestReplayServerAdvice();
  drawReplayChart();
  if (resetFeedback && !replayState.backtestMode) resetAiAdviceFeedback();
}

function replayActionsThroughCursor(cursor = replayState.cursor) {
  const daily = replayState.data?.timeframes?.daily || [];
  const indexByDate = new Map(daily.map((item, index) => [item.date, index]));
  return (replayState.log || []).filter((record) => {
    const actionIndex = indexByDate.get(record.date);
    return actionIndex != null && actionIndex <= cursor;
  });
}

function syncReplayPositionFromLog() {
  if (!replayState.writeTraining) {
    applyReplayMarketPosition();
    return;
  }
  const restoredState = replayStateFromActions(replayActionsThroughCursor());
  replayState.equity = restoredState.equity;
  replayState.position = restoredState.position;
}

function deletePersistedReplayAction(record) {
  if (!record) return;
  const payload = record.id != null
    ? { id: record.id }
    : record.clientActionId
      ? { clientActionId: record.clientActionId }
      : {
          sessionId: replayState.sessionId,
          date: record.date,
          action: record.action,
        };
  fetch(apiUrl("/api/delete-trade-replay-record"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

function undoReplayActionsForDate(date) {
  if (!date) return [];
  const removed = [];
  replayState.log = (replayState.log || []).filter((record) => {
    const shouldUndo = record.date === date && (record.action === "buy" || record.action === "sell");
    if (shouldUndo) removed.push(record);
    return !shouldUndo;
  });
  removed.forEach(deletePersistedReplayAction);
  return removed;
}

function clearReplayDecisionInputs() {
  const buyReason = document.querySelector("#replayBuyReason");
  const stopLoss = document.querySelector("#replayStopLoss");
  const stopLossReason = document.querySelector("#replayStopLossReason");
  const sellReason = document.querySelector("#replaySellReason");
  const holdNote = document.querySelector("#replayHoldNote");
  if (buyReason) buyReason.value = "";
  if (stopLoss) stopLoss.value = "";
  if (stopLossReason) stopLossReason.value = "";
  if (sellReason) sellReason.value = "";
  if (holdNote) holdNote.value = "";
  updateBuyStopLossVisibility();
  resetAiAdviceFeedback();
}

function navigateReplayCandle(step) {
  if (!replayState.data) return;
  const daily = replayState.data.timeframes.daily || [];
  if (!daily.length) return;
  let undoMessage = "";

  // 前进到下一日时，自动按AI建议执行买入/卖出/观望
  if (step > 0) {
    const advice = currentAiAdviceSnapshot();
    const actionable = isActionableAiAdvice(advice);
    if (actionable) {
      const action = advice.action; // "buy" or "sell"
      // 直接用 AI 建议内容执行，不依赖 DOM
      const reasonText = aiAdviceReasonText(advice);
      const stopLossPrice = aiStopLossSuggestion(advice);
      const thisCandle = currentReplayCandle();
      const annotations = replayTrainingAnnotations(advice);
      const clientActionId = createReplayActionId(action, thisCandle?.date || "");
      const payload = {
        ...annotations,
        clientActionId,
        symbol: replayState.data.symbol,
        market: replayState.data.market || "cn",
        displaySymbol: displaySecuritySymbol(replayState.data, replayState.data.symbol),
        sessionId: replayState.sessionId,
        recordType: activeView === "simulation" ? "simulation" : "training",
        trainingStartDate: replayState.trainingStartDate || replayState.data.startDate,
        date: thisCandle?.date || "",
        action: action,
        reason: reasonText,
        price: thisCandle?.close || 0,
        stopLoss: stopLossPrice || 0,
        stopLossReason: stopLossPrice ? `AI建议止损：${formatPrice(stopLossPrice)}` : "",
        aiAdviceAction: advice.action,
        aiAdviceText: advice.actionText,
        aiAdviceScore: advice.score,
        aiAdviceModel: advice.model,
        aiAdviceStage: advice.stage,
        aiAdviceSide: advice.side,
        aiAdviceAccepted: true,
        aiAdviceSnapshot: advice,
      };
      replayState.aiAdviceFeedback = "accepted";
      updateAiAdviceFeedbackUi();
      // 保存决策（异步，不阻塞）
      fetch(apiUrl("/api/trade-replay-decision"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
      // 更新本地状态
      if (action === "buy") {
        replayState.position = { entryDate: payload.date, entryPrice: payload.price, reason: reasonText, stopLoss: stopLossPrice || 0 };
      } else if (action === "sell") {
        const entryPrice = Number(replayState.position?.entryPrice) || 0;
        if (entryPrice > 0) replayState.equity = (replayState.equity || 1) * (payload.price / entryPrice);
        replayState.position = null;
      }
      // 记录日志 - 确保在 navigateToNextCandle 之前有完整记录
      const logEntry = {
        action,
        label: replayActionLabel(action),
        clientActionId,
        date: payload.date,
        price: payload.price,
        reason: reasonText,
        note: "",
        stopLoss: action === "buy" ? (stopLossPrice || 0) : null,
        aiAdviceAction: advice.action,
        aiAdviceText: advice.actionText,
        aiAdviceScore: advice.score,
        aiAdviceModel: advice.model,
        aiAdviceStage: advice.stage,
        aiAdviceSide: advice.side,
        aiAdviceAccepted: true,
        aiAdviceSnapshot: advice,
      };
      replayState.log.push(logEntry);
      console.log("AI自动执行:", logEntry); // debug
    }
  } else if (step < 0) {
    const targetIndex = Math.max(0, Math.min(daily.length - 1, replayState.cursor + step));
    const targetDate = daily[targetIndex]?.date || "";
    const removed = undoReplayActionsForDate(targetDate);
    if (removed.length) {
      undoMessage = `已撤回 ${targetDate} 的${removed.map((record) => replayActionLabel(record.action)).join("、")}操作；再次点下一日会重新按AI建议执行。`;
    }
  }
  // 总是进入下一日
  navigateToNextCandle(daily, step);
  if (undoMessage) setStatus("#replayStatus", undoMessage, "neutral");
}

function logForDate(date) {
  return (replayState.log || []).filter((r) => r.date === date);
}

function navigateToNextCandle(daily, step) {
  const nextCursor = Math.max(0, Math.min(daily.length - 1, replayState.cursor + step));
  if (nextCursor === replayState.cursor) {
    setStatus("#replayStatus", step < 0 ? "已经是本次训练的最早K线。" : "已经是最后一根K线。", "neutral");
    return;
  }
  replayState.cursor = nextCursor;
  replayState.dragOffset = 0;
  replayState.hoverIndex = null;
  replayState.hoverY = null;
  const candle = currentReplayCandle();
  const previousCandle = step > 0 ? daily[nextCursor - 1] : null;
  const conversionMessage = step > 0 ? convertBrokenPressureToSupport(previousCandle, candle) : "";
  const validationMessage = step > 0 ? updateDynamicLevelValidation(previousCandle, candle) : "";
  const hasAnnotation = (replayState.log || []).some((record) => record.date === candle?.date);
  replayState.selectedNoteDate = hasAnnotation ? candle.date : null;
  clearReplayDecisionInputs();
  syncReplayPositionFromLog();
  invalidateReplayServerAdvice();
  updateReplayUi();
  // 显示该日交易信息（从log中查找）
  const logEntries = logForDate(candle?.date || "");
  if (logEntries.length > 0) {
    const entry = logEntries[0];
    const actionText = entry.action === "buy" ? "买入" : entry.action === "sell" ? "卖出" : "观望";
    const stopInfo = entry.stopLoss ? ` 止损:${formatPrice(entry.stopLoss)}` : "";
    const reasonText = entry.reason ? ` 理由:${entry.reason}` : "";
    setStatus("#replayStatus", `${candle?.date} ${actionText} ${formatPrice(entry.price)}${stopInfo}${reasonText}`);
  } else {
    const message = `${step < 0 ? "已回到" : "已进入"}${candle?.date || "--"}。`;
    const levelMessage = [conversionMessage, validationMessage].filter(Boolean).join("；");
    setStatus("#replayStatus", levelMessage ? `${message}${levelMessage}` : message, "neutral");
  }
}

function updateReplayUi() {
  const candle = currentReplayCandle();
  applyReplayMarketPosition();
  syncManualLevelInputs();
  const entryPrice = Number(replayState.position?.entryPrice) || null;
  const hasPosition = Boolean(entryPrice && replayState.position);
  const currentReturn = hasPosition && candle ? ((candle.close - entryPrice) / entryPrice) * 100 : null;
  const totalReturn = ((replayState.equity || 1) - 1) * 100;
  document.querySelector("#replayTitle").textContent = replayState.data
    ? `${replayState.blindMode ? "盲选样本" : displaySecuritySymbol(replayState.data)} 回放训练`
    : "等待开始";
  updateReplayCurrentDate();
  document.querySelector("#replayClose").textContent = candle ? formatPrice(candle.close) : "--";
  const quoteStatus = document.querySelector("#replayQuoteStatus");
  if (quoteStatus) {
    quoteStatus.textContent = replayQuoteStatusText(candle);
    quoteStatus.className = candle?.realtime ? "positive-text" : "";
  }
  document.querySelector("#replayEntryPrice").textContent = hasPosition ? formatPrice(entryPrice) : "空仓";
  const returnNode = document.querySelector("#replayReturn");
  returnNode.textContent = currentReturn === null ? "--" : `${currentReturn.toFixed(2)}%`;
  returnNode.className = currentReturn === null ? "" : currentReturn >= 0 ? "positive-text" : "negative-text";
  const totalReturnNode = document.querySelector("#replayTotalReturn");
  totalReturnNode.textContent = `${totalReturn.toFixed(2)}%`;
  totalReturnNode.className = totalReturn === 0 ? "" : totalReturn > 0 ? "positive-text" : "negative-text";
  updateReplayBlindUi();
  // 隐藏手动决策按钮（自动模式已替代）
  const buyBtn = document.querySelector("#replayBuy");
  const sellBtn = document.querySelector("#replaySell");
  const holdBtn = document.querySelector("#replayHold");
  if (buyBtn) buyBtn.style.display = "none";
  if (sellBtn) sellBtn.style.display = "none";
  if (holdBtn) holdBtn.style.display = "none";
  const decisionActions = document.querySelector(".decision-actions");
  if (decisionActions) decisionActions.style.display = "none";
  const daily = replayState.data?.timeframes?.daily || [];
  document.querySelector("#replayPrevCandle").disabled = !replayState.data || replayState.cursor <= 0;
  document.querySelector("#replayNextCandle").disabled = !replayState.data || replayState.cursor >= daily.length - 1;
  updateReplayWriteToggle();
  updateReplayPositionUi();
  updateReplayDecisionMode();
  updateAiAdviceFeedbackUi();
  updateBuyStopLossVisibility({ clearWhenHidden: false });
  document.querySelector("#replayLog").innerHTML = replayState.log
    .filter((item) => item.action !== "hold" || item.note)
    .slice(-8)
    .reverse()
    .map((item) => `
    <article class="level-row ${item.action === "sell" ? "resistance" : "support"}">
      <div><strong>${item.date} · ${item.label}</strong><p>${replayLogText(item)} · 收盘价 ${formatPrice(item.price)}</p></div>
      <span>${replayActionLabel(item.action)}</span>
    </article>
  `).join("");
  renderRuleAdvice();
  drawReplayChart();
  requestReplayServerAdvice();
}

function invalidateReplayServerAdvice() {
  replayState.serverAdvice = null;
  replayState.serverAdviceKey = "";
  replayState.serverAdviceStatus = "idle";
  renderRuleAdvice();
}

function replayTrainingAnnotations(advice = currentAiAdviceSnapshot()) {
  return {
    aiTrendDirection: advice.trendDirection || advice.trend?.direction || "",
    aiTrendStage: advice.trendStage || advice.stage || "",
    aiTrendConfidence: advice.trendConfidence ?? null,
    aiSupportValidation: advice.supportValidation || null,
    aiResistanceValidation: advice.resistanceValidation || null,
    aiSupportValidationReason: advice.bypassSupportValidation?.validationReason || advice.supportValidation?.validationReason || "",
    aiSupportPathId: advice.bypassSupportValidation?.pathId || "",
    humanTrendDirection: document.querySelector("#replayTrendDirection")?.value || "",
    humanTrendStage: document.querySelector("#replayTrendStage")?.value || "",
    supportStatus: document.querySelector("#replaySupportStatus")?.value || "",
    supportValidationEvidence: document.querySelector("#replaySupportEvidence")?.value || "",
    structure: document.querySelector("#replayStructure")?.value.trim() || "",
  };
}

function replayPayload(action, reason, note, shouldWrite = replayState.writeTraining) {
  const candle = currentReplayCandle();
  const clientActionId = createReplayActionId(action, candle?.date || "");
  const stopLoss = Number(document.querySelector("#replayStopLoss").value) || null;
  const stopLossReason = document.querySelector("#replayStopLossReason").value.trim();
  const aiAdviceSnapshot = currentAiAdviceSnapshot();
  const aiAdviceDecision = inferAiAdviceFeedback(action, reason, note, aiAdviceSnapshot);
  syncManualLevelInputs();
  const nearest = nearestManualLevels();
  const support = Number(document.querySelector("#replaySupport").value) || null;
  const resistance = Number(document.querySelector("#replayResistance").value) || null;
  const pressurePlan = aiAdviceSnapshot.pressurePlan || pressurePlanFromLevels(nearest, {});
  const annotations = replayTrainingAnnotations(aiAdviceSnapshot);
  return {
    clientActionId,
    symbol: replayState.data.symbol,
    market: replayState.data.market || "cn",
    displaySymbol: displaySecuritySymbol(replayState.data, replayState.data.symbol),
    sessionId: replayState.sessionId,
    recordType: activeView === "simulation" ? "simulation" : "training",
    trainingStartDate: replayState.trainingStartDate || replayState.data.startDate,
    action,
    date: candle.date,
    price: candle.close,
    timeframe: replayState.frame,
    ...annotations,
    support,
    resistance,
    supportEvidence: support ? "manual_line" : "",
    resistanceEvidence: resistance ? "manual_line" : "",
    supportReason: nearest.support?.reason || "",
    resistanceReason: nearest.resistance?.reason || "",
    nearResistance: nearest.nearResistance?.price || null,
    effectiveResistance: nearest.effectiveResistance?.price || null,
    breakoutTarget: nearest.breakoutTarget?.price || null,
    adoptedPressure: pressurePlan.level?.price || null,
    pressureMode: pressurePlan.mode || "",
    manualLevels: (replayState.manualLevels || []).map(serializeLevel),
    stopLoss,
    stopLossReason,
    reason,
    note,
    aiAdviceAction: aiAdviceSnapshot.action,
    aiAdviceText: aiAdviceSnapshot.actionText,
    aiAdviceScore: aiAdviceSnapshot.score,
    aiAdviceModel: aiAdviceSnapshot.model,
    aiAdviceStage: aiAdviceSnapshot.stage,
    aiAdviceSide: aiAdviceSnapshot.side,
    aiAdviceAccepted: aiAdviceDecision.accepted,
    aiAdviceDisagreeReason: aiAdviceDecision.disagreeReason,
    aiAdviceSnapshot,
    writeTraining: shouldWrite,
    trainingEquityBefore: replayState.equity || 1,
    trainingReturnBefore: ((replayState.equity || 1) - 1) * 100,
    positionBefore: replayState.position,
  };
}

async function saveReplayDecision(action) {
  if (!replayState.data) return;
  const candle = currentReplayCandle();
  if (!candle) return;
  const aiAdviceSnapshot = currentAiAdviceSnapshot();
  const actionableAiAdvice = isActionableAiAdvice(aiAdviceSnapshot);
  // 自动模式下，买入理由和止损由AI建议生成
  const buyReason = aiAdviceSnapshot.reasonText || "";
  const stopLoss = aiStopLossSuggestion(aiAdviceSnapshot) || 0;
  const stopLossReason = `AI建议止损：${formatPrice(stopLoss)}`;
  const sellReason = aiAdviceSnapshot.reasonText || "";
  const holdNote = "";
  if (action === "buy" && !buyReason) {
    setStatus("#replayStatus", "买入前需要填写买入理由。", "negative");
    return;
  }
  if (action === "buy" && (!stopLoss || stopLoss <= 0)) {
    setStatus("#replayStatus", "买入前需要填写止损价格。", "negative");
    return;
  }
  if (action === "sell" && !sellReason) {
    setStatus("#replayStatus", "卖出前需要填写卖出理由。", "negative");
    return;
  }
  const reason = action === "buy" ? buyReason : action === "sell" ? sellReason : "观望";
  let note = action === "hold" ? holdNote : reason;
  if (actionableAiAdvice && action !== aiAdviceSnapshot.action && !note) note = aiMismatchReason(action, aiAdviceSnapshot);
  const shouldWrite = shouldWriteReplayDecision(action, note);
  replayState.aiAdviceFeedback = actionableAiAdvice ? (action === aiAdviceSnapshot.action ? "accepted" : "rejected") : null;
  const payload = replayPayload(action, reason, note, shouldWrite);
  if (shouldWrite) {
    const response = await fetch(apiUrl("/api/trade-replay-decision"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus("#replayStatus", result.error || "保存决策失败。", "negative");
      return;
    }
    await loadTrainingRecords();
  }
  if (action === "buy") {
    replayState.position = { entryDate: candle.date, entryPrice: candle.close, reason: buyReason, stopLoss, stopLossReason };
  } else if (action === "sell") {
    const entryPrice = Number(replayState.position?.entryPrice) || 0;
    if (entryPrice > 0) replayState.equity = (replayState.equity || 1) * (candle.close / entryPrice);
    replayState.position = null;
  }
  replayState.log.push({
    action,
    label: replayActionLabel(action),
    clientActionId: payload.clientActionId,
    date: candle.date,
    price: candle.close,
    reason,
    note,
    stopLoss: action === "buy" ? stopLoss : null,
    stopLossReason: action === "buy" ? stopLossReason : "",
    equity: replayState.equity || 1,
    aiAdviceAction: aiAdviceSnapshot.action,
    aiAdviceText: aiAdviceSnapshot.actionText,
    aiAdviceScore: aiAdviceSnapshot.score,
    aiAdviceModel: aiAdviceSnapshot.model,
    aiAdviceStage: aiAdviceSnapshot.stage,
    aiAdviceSide: aiAdviceSnapshot.side,
    aiAdviceAccepted: actionableAiAdvice ? (action === aiAdviceSnapshot.action) : null,
    aiAdviceDisagreeReason: actionableAiAdvice && action !== aiAdviceSnapshot.action ? aiMismatchReason(action, aiAdviceSnapshot) : "",
    aiAdviceSnapshot,
  });
  replayState.selectedNoteDate = note ? candle.date : null;
  if (action === "buy") {
    document.querySelector("#replayBuyReason").value = "";
    document.querySelector("#replayStopLoss").value = "";
    document.querySelector("#replayStopLossReason").value = "";
    updateBuyStopLossVisibility();
  }
  if (action === "sell") document.querySelector("#replaySellReason").value = "";
  if (action === "hold") document.querySelector("#replayHoldNote").value = "";
  resetAiAdviceFeedback();
  const previousCandle = candle;
  replayState.cursor += 1;
  const daily = replayState.data.timeframes.daily;
  if (replayState.cursor >= daily.length) {
    replayState.cursor = daily.length - 1;
    setStatus("#replayStatus", "已经到达最后一根K线。", "neutral");
  } else {
    replayState.dragOffset = 0;
    const currentCandle = currentReplayCandle();
    const conversionMessage = convertBrokenPressureToSupport(previousCandle, currentCandle);
    const validationMessage = updateDynamicLevelValidation(previousCandle, currentCandle);
    const breakAutoMessage = autoDrawAfterLevelBreak(previousCandle, currentCandle);
    const actionText = action === "buy" ? "买入" : action === "sell" ? "卖出" : "观望";
    const message = replayState.writeTraining && action === "hold" && !note
      ? "空备注观望不写入训练集，已进入下一根K线。"
      : `${shouldWrite ? "已写入" : "测试记录"}${actionText}，进入下一根K线。`;
    const levelMessages = [conversionMessage, validationMessage, breakAutoMessage].filter(Boolean).join("");
    setStatus("#replayStatus", levelMessages ? `${message}${levelMessages}` : message, shouldWrite ? "positive" : "neutral");
  }
  updateReplayUi();
}

async function loadTradeReplay({ button, symbol, date, market = null, blind = false, loadingText = "正在加载...", sessionId = null, fresh = false, throwOnError = false }) {
  const previousText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = loadingText;
    setStatus("#replayStatus", "正在从本地行情数据库读取K线数据...", "neutral");
    const response = await fetch(apiUrl("/api/trade-replay"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        market,
        date,
        lookback: 700,
        fresh,
        includeRealtime: !replayState.writeTraining || isMarketWatchlisted(symbol, market),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "回放数据加载失败。");
    const displaySymbol = displaySecuritySymbol(data, symbol);
    const replayDateInput = document.querySelector("#replayDate");
    if (replayDateInput && !blind && data.startDate) {
      replayDateInput.value = data.startDate;
    }
    const searchInput = document.querySelector("#replayStockSearch");
    if (searchInput && !replayState.blindMode && !searchInput.value.trim()) {
      searchInput.value = data.name ? `${data.name} ${displaySymbol}` : displaySymbol;
    }
    const savedLevelStateExists = hasSavedReplayLevelState(data, data.startDate);
    const savedLevels = loadSavedReplayLevels(data, data.startDate);
    replayState = {
      data,
      frame: "daily",
      cursor: data.cursor,
      position: null,
      marketPosition: loadReplayMarketPosition(data),
      equity: 1,
      log: [],
      visibleCount: 700,
      dragOffset: 0,
      hoverIndex: null,
      hoverY: null,
      isDragging: false,
      dragStartX: 0,
      dragStartOffset: 0,
      dragMoved: false,
      selectedNoteDate: null,
      writeTraining: replayState.writeTraining,
      blindMode: blind,
      blindSymbol: displaySymbol,
      blindDate: date,
      drawingLevel: false,
      manualLevels: savedLevels,
      selectedLevelId: null,
      draggingLevelId: null,
      lastLevelHitId: null,
      suppressNextCanvasClick: false,
      trainingRecords: replayState.trainingRecords || [],
      sessionId: sessionId || createTrainingSessionId(`${data.market || "cn"}-${data.symbol || symbol}`, data.startDate),
      trainingStartDate: data.startDate,
      aiAdviceFeedback: null,
      autoBreakDrawKeys: [],
      autoLevelSnapshot: null,
      levelCorrections: [],
      dragLevelStart: null,
      serverAdvice: null,
      serverAdviceKey: "",
      serverAdviceStatus: "idle",
    };
    document.querySelectorAll(".timeframe-button:not(.market-timeframe-button)").forEach((item) => item.classList.toggle("active", item.dataset.frame === "daily"));
    const historyCount = data.availableHistory || data.cursor + 1;
    const requestedLookback = data.requestedLookback || 700;
    const historyMessage = historyCount >= requestedLookback
      ? `已加载当前日前${requestedLookback}根K线。`
      : `当前日期前只有${historyCount}根可用K线，已加载此前全部可用K线。`;
    updateReplayUi();
    startReplayRealtimePolling();
    const autoResult = savedLevelStateExists ? null : autoDrawLevelLines({ silent: true });
    const autoMessage = savedLevelStateExists
      ? `\u5df2\u8bfb\u53d6\u4e0a\u6b21\u4fdd\u5b58\u7684 ${savedLevels.length} \u6761\u652f\u6491\u538b\u529b\u7ebf\u3002`
      : (autoResult ? "\u5df2\u6309\u5468\u7ebf\u81ea\u52a8\u753b\u51fa\u5f53\u524d\u4e0a\u4e0b\u5173\u952e\u7ebf\u3002" : "\u5468\u7ebf\u81ea\u52a8\u753b\u7ebf\u672a\u627e\u5230\u8db3\u591f\u53ef\u9760\u7684\u4f4d\u7f6e\u3002");
    setStatus("#replayStatus", blind ? `随机盲训已开始，股票和日期已隐藏。${historyMessage}${autoMessage}` : `训练已开始。${historyMessage}${autoMessage}`, historyCount >= 700 ? "positive" : "neutral");
    updateReplayBlindUi();
  } catch (error) {
    setStatus("#replayStatus", error.message, "negative");
    if (throwOnError) throw error;
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function startTradeReplay() {
  if (activeView === "simulation") {
    await startSimulationTrading();
    return;
  }
  replayState.blindMode = false;
  const symbol = document.querySelector("#replaySymbol").value.trim();
  const date = document.querySelector("#replayDate").value;
  await loadTradeReplay({ button: document.querySelector("#startReplay"), symbol, date, blind: false });
}

let simulationRecordFilter = "open";

function renderSimulationRecords(records = []) {
  const list = document.querySelector("#simulationRecordList");
  if (!list) return;
  const positions = new Map();
  [...records].sort((a, b) => String(a.savedAt || a.date).localeCompare(String(b.savedAt || b.date))).forEach((record) => {
    const key = `${record.market || "cn"}:${record.symbol}`;
    if (record.action === "buy") positions.set(key, true);
    if (record.action === "sell") positions.delete(key);
  });
  const visible = records.filter((record) => simulationRecordFilter === "all" || positions.has(`${record.market || "cn"}:${record.symbol}`));
  list.innerHTML = visible.length ? visible.map((record) => `
    <article class="dataset-row">
      <div class="dataset-main">
        <div class="dataset-title-row"><strong>${escapeHtml(record.displaySymbol || record.symbol || "--")} ${escapeHtml(record.name || "")}</strong><span class="dataset-return">${record.action === "buy" ? "买入" : record.action === "sell" ? "卖出" : "观望"}</span></div>
        <p>${escapeHtml(record.date || "--")} · 价格 ${formatPrice(record.price)} · ${positions.has(`${record.market || "cn"}:${record.symbol}`) ? "持仓中" : "已完成"}</p>
        <small>${escapeHtml(record.reason || record.note || "无备注")} · ${record.savedAt ? new Date(record.savedAt).toLocaleString() : ""}</small>
      </div>
    </article>`).join("") : `<div class="dataset-empty">暂无模拟交易记录</div>`;
}

async function loadSimulationRecords() {
  const status = document.querySelector("#simulationRecordsStatus");
  try {
    if (status) status.textContent = "正在加载模拟交易记录...";
    const response = await fetch(apiUrl("/api/trade-replay-records?type=simulation"), { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "模拟交易记录加载失败");
    renderSimulationRecords(result.records || []);
    if (status) status.textContent = `共 ${result.count || 0} 笔模拟交易`;
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

async function startSimulationTrading() {
  const button = document.querySelector("#startReplay");
  replayState.writeTraining = true;
  replayState.blindMode = false;
  updateReplayWriteToggle();
  const symbol = document.querySelector("#replaySymbol").value.trim();
  const date = document.querySelector("#replayDate").value;
  await loadTradeReplay({ button, symbol, date, blind: false, loadingText: "正在加载行情..." });
  await addCurrentReplayToWatchlist();
}

function updateSimulationUi() {
  const simulation = activeView === "simulation";
  const title = document.querySelector("#replayTitle");
  const description = title?.parentElement?.querySelector("p");
  const startButton = document.querySelector("#startReplay");
  document.querySelector("#startBlindReplay")?.classList.toggle("hidden", simulation);
  document.querySelector("#replayWriteToggle")?.classList.toggle("hidden", simulation);
  if (title) title.textContent = simulation ? "模拟交易" : "交易思维训练";
  if (description) description.textContent = simulation ? "选择股票和日期，查看行情并加入股票池" : "只显示当前日期之前的K线，逐根推进并保存决策样本";
  if (startButton) startButton.textContent = simulation ? "加入股票池" : "开始训练";
}

async function startBlindTradeReplay() {
  const button = document.querySelector("#startBlindReplay");
  const previousText = button.textContent;
  try {
    button.disabled = true;
    const searchInput = document.querySelector("#replayStockSearch");
    if (searchInput) searchInput.value = "";
    hideStockSearchResults();
    let lastError = null;
    const maxAttempts = 20;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        button.textContent = `正在抽取 ${attempt}/${maxAttempts}`;
        setStatus("#replayStatus", `正在随机抽取股票和时间，第 ${attempt} 次...`, "neutral");
        const response = await fetch(apiUrl(`/api/random-training-sample?t=${Date.now()}-${attempt}`), { cache: "no-store" });
        const sample = await response.json();
        if (!response.ok) throw new Error(sample.error || "随机样本获取失败。");
        replayState.blindMode = true;
        replayState.blindSymbol = sample.displaySymbol || sample.symbol;
        replayState.blindDate = sample.date;
        updateReplayBlindUi();
        document.querySelector("#replaySymbol").value = sample.symbol;
        document.querySelector("#replayDate").value = sample.date;
        if (searchInput) searchInput.value = "";
        await loadTradeReplay({ button, symbol: sample.symbol, market: sample.market, date: sample.date, blind: true, loadingText: "正在加载...", fresh: Boolean(sample.fresh), throwOnError: true });
        return;
      } catch (error) {
        lastError = error;
        const retryable = /earlier than available market data|No daily data|Not enough|分批拉取日线失败|数据拉取失败|request failed|request failure|RemoteDisconnected|Connection aborted|closed connection|without response|Failed to fetch|Eastmoney daily data request failed|Tencent daily data request failed/i.test(error.message || "");
        if (!retryable) throw error;
        setStatus("#replayStatus", `本次随机样本数据源失败，正在换一组重试 ${attempt}/${maxAttempts}...`, "neutral");
      }
    }
    throw new Error(`随机盲训连续抽取失败：${lastError?.message || "没有可用样本"}`);
  } catch (error) {
    setStatus("#replayStatus", error.message === "Failed to fetch" ? "无法连接本地服务，请确认服务正在运行。" : error.message, "negative");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}



function backtestAutoLevelLines(history) {
  const candle = history.at(-1);
  if (!candle) return [];
  const currentPrice = candle.close;
  const candles = dailyToWeeklyCandles(history).slice(-180);
  if (candles.length < 30) return [];
  const points = [
    ...autoLevelSwings(candles, 3),
    ...autoLevelBodyZones(candles, 0.014),
  ];
  const clusters = clusterAutoLevels(points, currentPrice, 0.02)
    .filter((level) => Math.abs(level.price - currentPrice) / currentPrice <= 0.35);
  const support = clusters
    .filter((level) => level.price < currentPrice)
    .sort((a, b) => (currentPrice - a.price) - (currentPrice - b.price) || b.score - a.score)[0];
  const resistance = clusters
    .filter((level) => level.price > currentPrice)
    .sort((a, b) => (a.price - currentPrice) - (b.price - currentPrice) || b.score - a.score)[0];
  return [support, resistance].filter(Boolean).map((level, index) => ({
    id: `backtest-${candle.date}-${index}`,
    price: level.price,
    role: level.price < currentPrice ? "support" : "effective_resistance",
    reason: level.reason,
    auto: true,
  }));
}

function findLastIndexBy(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index], index)) return index;
  }
  return -1;
}

function setBacktestStatus(message, type = "neutral") {
  setStatus("#backtestStatus", message, type);
}

function setBacktestDefaults() {
  const endInput = document.querySelector("#backtestEnd");
  const startInput = document.querySelector("#backtestStart");
  if (endInput && !endInput.value) endInput.value = "";
  if (startInput && !startInput.value) {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    startInput.value = previousTradingDateString(date);
  }
}

function updateBacktestBlindUi() {
  const symbolInput = document.querySelector("#backtestSymbol");
  const startInput = document.querySelector("#backtestStart");
  const blindSymbol = document.querySelector("#blindBacktestSymbol");
  const blindDate = document.querySelector("#blindBacktestDate");
  const revealButton = document.querySelector("#revealBacktestIdentity");
  const hidden = Boolean(backtestState.blindMode);
  symbolInput?.classList.toggle("hidden", hidden);
  startInput?.classList.toggle("hidden", hidden);
  blindSymbol?.classList.toggle("hidden", !hidden);
  blindDate?.classList.toggle("hidden", !hidden);
  revealButton?.classList.toggle("hidden", !hidden);
  if (blindSymbol) blindSymbol.textContent = hidden ? "股票已隐藏" : "";
  if (blindDate) blindDate.textContent = hidden ? "日期已隐藏" : "";
}

function backtestDisplaySymbol() {
  if (backtestState.blindMode) return "盲选样本";
  return displaySecuritySymbol(backtestState.data, document.querySelector("#backtestSymbol")?.value.trim() || "--");
}

function backtestDisplayDate(date) {
  return backtestState.blindMode && date ? "日期已隐藏" : date || "--";
}

function revealBacktestIdentity() {
  backtestState.blindMode = false;
  replayState.blindMode = false;
  updateBacktestBlindUi();
  updateBacktestLevelUi();
  updateBacktestSummary(backtestState.currentIndex || backtestState.startIndex);
  drawReplayChart();
  setBacktestStatus(`已显示：${backtestState.blindSymbol || document.querySelector("#backtestSymbol")?.value} / ${backtestState.blindDate || document.querySelector("#backtestStart")?.value}`, "neutral");
}

function renderBacktestResult(result) {
  document.querySelector("#backtestTitle").textContent = `${backtestState.blindMode ? "盲选样本" : displaySecuritySymbol(result, result.symbol)}：${backtestDisplayDate(result.startDate)} 至 ${backtestDisplayDate(result.endDate)}`;
  const returnNode = document.querySelector("#backtestReturn");
  returnNode.textContent = formatPercent(result.totalReturnPct);
  returnNode.className = result.totalReturnPct === 0 ? "" : result.totalReturnPct > 0 ? "positive-text" : "negative-text";
  const drawdownNode = document.querySelector("#backtestDrawdown");
  drawdownNode.textContent = formatPercent(-result.maxDrawdownPct);
  drawdownNode.className = result.maxDrawdownPct > 10 ? "negative-text" : "";
  document.querySelector("#backtestTradesCount").textContent = `${result.trades.length} \u7b14`;
  document.querySelector("#backtestWinRate").textContent = result.trades.length ? formatPercent(result.winRatePct) : "--";
  document.querySelector("#backtestSignalCount").textContent = `${result.buySignals}/${result.sellSignals}`;
  document.querySelector("#backtestPositionState").textContent = result.openPosition ? `\u6301\u4ed3\u4e2d ${formatPercent(result.openReturnPct)}` : "\u7a7a\u4ed3";
  const rows = result.trades.map((trade) => {
    const cls = trade.returnPct >= 0 ? "support" : "resistance";
    const textCls = trade.returnPct >= 0 ? "positive-text" : "negative-text";
    return `
      <article class="level-row ${cls} backtest-trade-row">
        <strong>${trade.entryDate}<br/>${trade.exitDate}</strong>
        <div>
          <span>\u4e70\u5165 ${formatPrice(trade.entryPrice)} / \u5356\u51fa ${formatPrice(trade.exitPrice)} / \u6301\u4ed3 ${trade.holdDays} \u5929</span>
          <small>${escapeHtml(trade.model || "--")}\uff1b${escapeHtml(trade.stage || "--")}\uff1b${escapeHtml(trade.exitReason || "--")}</small>
        </div>
        <strong class="${textCls}">${formatPercent(trade.returnPct)}</strong>
      </article>
    `;
  }).join("");
  const signalRows = result.signals.slice(-12).reverse().map((signal) => `
    <article class="level-row ${signal.action === "sell" ? "resistance" : "support"}">
      <div><strong>${signal.date} \u00b7 ${escapeHtml(signal.actionText)}</strong><p>${escapeHtml(signal.model || "--")} \u00b7 ${Math.round(signal.score || 0)}\u5206 \u00b7 ${formatPrice(signal.close)}</p></div>
      <span>${signal.position ? "\u6301\u4ed3" : "\u7a7a\u4ed3"}</span>
    </article>
  `).join("");
  document.querySelector("#backtestTrades").innerHTML = `
    <h3>\u4ea4\u6613\u660e\u7ec6</h3>
    ${rows || '<div class="dataset-empty">\u56de\u6d4b\u533a\u95f4\u5185\u6ca1\u6709\u5b8c\u6210\u4ea4\u6613\u3002</div>'}
    <h3>AI\u4fe1\u53f7\u65e5\u5fd7</h3>
    ${signalRows || '<div class="dataset-empty">\u56de\u6d4b\u533a\u95f4\u5185\u6ca1\u6709\u51fa\u73b0\u660e\u786e\u4e70\u5165/\u5356\u51fa\u5efa\u8bae\u3002</div>'}
  `;
}

function currentBacktestCandle() {
  const daily = backtestState.simulationData?.timeframes?.daily || [];
  return daily[backtestState.currentIndex] || null;
}

function currentBacktestAdvice() {
  if (!replayState.backtestMode || !currentReplayCandle()) return null;
  return backtestState.serverAdvice || replayServerAdvicePlaceholder();
}

async function requestBacktestAdvice({ force = false } = {}) {
  if (!replayState.backtestMode || !currentReplayCandle()) return null;
  const payload = replayServerAdviceRequestData();
  const requestKey = JSON.stringify(payload);
  if (!force && backtestState.serverAdviceKey === requestKey && backtestState.serverAdvice) {
    return backtestState.serverAdvice;
  }
  backtestState.serverAdviceKey = requestKey;
  backtestState.serverAdvice = null;
  renderBacktestAdvice(replayServerAdvicePlaceholder());
  const advice = await fetchReplayServerAdvice(payload);
  if (backtestState.serverAdviceKey !== requestKey) return null;
  backtestState.serverAdvice = advice;
  renderBacktestAdvice(advice);
  return advice;
}

function renderBacktestAdvice(advice = currentBacktestAdvice()) {
  const actionNode = document.querySelector("#backtestAdviceAction");
  const stageNode = document.querySelector("#backtestAdviceStage");
  const modelNode = document.querySelector("#backtestAdviceModel");
  const scoreNode = document.querySelector("#backtestAdviceScore");
  if (!actionNode || !stageNode || !modelNode || !scoreNode) return;
  actionNode.textContent = advice?.actionText || "--";
  actionNode.className = advice?.action === "buy" ? "positive-text" : advice?.action === "sell" ? "negative-text" : "";
  stageNode.textContent = advice?.stage || "--";
  modelNode.textContent = advice?.model || "--";
  scoreNode.textContent = advice?.score == null ? "--" : `${Math.round(advice.score)}分`;
  scoreNode.className = advice?.score >= 75 ? "positive-text" : advice?.score >= 60 ? "" : "negative-text";
  const structureNode = document.querySelector("#backtestStructureSummary");
  if (structureNode) {
    const structure = currentReplayCandle() ? recognizeMarketStructure(replayDailyHistory()) : null;
    structureNode.textContent = structure?.trendDirection
      ? `${structure.trendDirection} / ${structure.trendStage} / 置信度 ${Math.round(structure.trendConfidence)}`
      : "--";
  }
}

function backtestActionLabel(action) {
  if (action === "buy") return "买入";
  if (action === "sell") return "卖出";
  if (action === "hold_position") return "继续持有";
  return "观望";
}

function backtestFinalResult(endIndex = backtestState.currentIndex) {
  const daily = backtestState.simulationData?.timeframes?.daily || [];
  const last = daily[Math.min(Math.max(endIndex, backtestState.startIndex), backtestState.endIndex)] || daily[backtestState.startIndex];
  const finalEquity = backtestState.position && last
    ? backtestState.equity * ((last.close * (1 - backtestState.feeRate)) / backtestState.position.entryCost)
    : backtestState.equity;
  const wins = backtestState.trades.filter((trade) => trade.returnPct > 0).length;
  return {
    symbol: backtestDisplaySymbol(),
    startDate: daily[backtestState.startIndex]?.date || "--",
    endDate: last?.date || "--",
    totalReturnPct: (finalEquity - 1) * 100,
    maxDrawdownPct: backtestState.maxDrawdown * 100,
    winRatePct: backtestState.trades.length ? (wins / backtestState.trades.length) * 100 : 0,
    trades: backtestState.trades,
    signals: backtestState.signals,
    buySignals: backtestState.buySignals,
    sellSignals: backtestState.sellSignals,
    openPosition: Boolean(backtestState.position),
    openReturnPct: backtestState.position && last ? (((last.close * (1 - backtestState.feeRate)) / backtestState.position.entryCost) - 1) * 100 : 0,
  };
}

function updateBacktestSummary(endIndex = backtestState.currentIndex) {
  if (!backtestState.simulationData) return;
  renderBacktestResult(backtestFinalResult(endIndex));
}

function updateBacktestStepControls() {
  const startButton = document.querySelector("#runAiBacktest");
  const executeButton = document.querySelector("#backtestExecuteAi");
  const nextButton = document.querySelector("#backtestNextDay");
  const active = ["setup", "paused", "running"].includes(backtestState.status);
  if (startButton) startButton.textContent = active ? "重新开始" : backtestState.status === "complete" ? "重新回测" : "开始回测";
  if (executeButton) executeButton.disabled = !active || backtestState.stepExecuted;
  if (nextButton) nextButton.disabled = !active || !backtestState.stepExecuted;
}

function completeBacktest(endIndex = backtestState.endIndex) {
  const daily = backtestState.simulationData?.timeframes?.daily || [];
  backtestState.status = "complete";
  backtestState.currentIndex = Math.min(endIndex, backtestState.endIndex);
  applyBacktestReplayState(backtestState.currentIndex);
  renderBacktestAdvice(currentBacktestAdvice());
  updateBacktestSummary(backtestState.currentIndex);
  updateBacktestStepControls();
  const startDate = backtestDisplayDate(daily[backtestState.startIndex]?.date);
  const endDate = backtestDisplayDate(daily[backtestState.currentIndex]?.date);
  setBacktestStatus(`回测完成：${startDate} 至 ${endDate}，共 ${backtestState.currentIndex - backtestState.startIndex + 1} 个交易日。`, "positive");
}

function syncBacktestManualLevels() {
  if (replayState.backtestMode) backtestState.manualLevels = replayState.manualLevels || [];
}

function backtestLevelGapReason(candle) {
  const price = Number(candle?.close) || 0;
  if (!price) return "";
  const levels = (backtestState.manualLevels || []).map(ensureLevelRole).filter((level) => Number(level.price) > 0);
  const support = levels
    .filter((level) => inferredLevelRole(level) === "support" && level.price <= price)
    .sort((a, b) => b.price - a.price)[0];
  const resistance = levels
    .filter((level) => inferredLevelRole(level) !== "support" && level.price >= price)
    .sort((a, b) => a.price - b.price)[0];
  if (!support && !resistance) return `当前价 ${formatPrice(price)} 不在已画线区间内，请补充上下关键线。`;
  if (!support) return `当前价 ${formatPrice(price)} 已跌破所有支撑，请补充新的下方支撑线。`;
  if (!resistance) return `当前价 ${formatPrice(price)} 已突破所有压力，请补充新的上方压力线。`;
  return "";
}

function updateBacktestLevelUi() {
  const candle = currentReplayCandle();
  const dateNode = document.querySelector("#backtestLevelDate");
  if (dateNode) dateNode.textContent = backtestDisplayDate(candle?.date);
  const selectedInfo = document.querySelector("#backtestSelectedLevelInfo");
  const selected = selectedManualLevel();
  if (selectedInfo) selectedInfo.value = selected ? `${manualLevelType(selected) === "support" ? "支撑" : "压力"} ${formatPrice(selected.price)}` : "";
  const prompt = document.querySelector("#backtestLevelPrompt");
  if (prompt && candle) {
    prompt.textContent = `${backtestDisplayDate(candle.date)} 收盘 ${formatPrice(candle.close)}。画完支撑压力后点击“执行AI建议”，执行后再点“下一日”；突破压力会自动转为支撑。`;
  }
  renderBacktestAdvice(currentBacktestAdvice());
  updateLevelToolUi();
}

function applyBacktestReplayState(index) {
  const data = backtestState.simulationData;
  if (!data) return;
  backtestState.serverAdvice = null;
  backtestState.serverAdviceKey = "";
  const previous = backtestState.previousReplayState || replayState;
  replayState = {
    ...previous,
    data,
    frame: "daily",
    cursor: index,
    position: backtestState.position,
    equity: backtestState.equity,
    log: [],
    visibleCount: 700,
    dragOffset: replayState.backtestMode ? replayState.dragOffset || 0 : 0,
    hoverIndex: null,
    hoverY: null,
    drawingLevel: false,
    manualLevels: backtestState.manualLevels,
    selectedLevelId: replayState.backtestMode ? replayState.selectedLevelId : null,
    draggingLevelId: null,
    lastLevelHitId: null,
    suppressNextCanvasClick: false,
    chartCanvasSelector: "#backtestChart",
    statusSelector: "#backtestStatus",
    backtestMode: true,
    blindMode: Boolean(backtestState.blindMode),
    blindSymbol: backtestState.blindSymbol || displaySecuritySymbol(data, data.symbol || ""),
    blindDate: backtestState.blindDate || data.startDate || "",
    levelCorrections: [],
  };
  updateBacktestLevelUi();
  drawReplayChart();
}

function resetBacktestResultShell() {
  document.querySelector("#backtestTitle").textContent = "等待回测";
  document.querySelector("#backtestReturn").textContent = "--";
  document.querySelector("#backtestDrawdown").textContent = "--";
  document.querySelector("#backtestTradesCount").textContent = "--";
  document.querySelector("#backtestWinRate").textContent = "--";
  document.querySelector("#backtestSignalCount").textContent = "--";
  document.querySelector("#backtestPositionState").textContent = "--";
  document.querySelector("#backtestTrades").innerHTML = "";
  renderBacktestAdvice(null);
  updateBacktestStepControls();
  updateBacktestBlindUi();
}

function restoreReplayAfterBacktest() {
  if (replayState.backtestMode && backtestState.previousReplayState) {
    replayState = backtestState.previousReplayState;
  }
}

async function startAiBacktestSetup(button, symbol, startDate, endDate, minBuyScore, feeRate, options = {}) {
  const previousText = button?.textContent || "开始回测";
  const blind = Boolean(options.blind);
  const fresh = options.fresh ?? true;
  if (button) {
    button.disabled = true;
    button.textContent = "读取数据...";
  }
  try {
    setBacktestStatus("正在读取本地行情，读取完成后先手工划定支撑压力。", "neutral");
    resetBacktestResultShell();
    const response = await fetch(apiUrl("/api/trade-replay"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, market: options.market || null, date: startDate, lookback: 700, fresh }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "回测数据读取失败。");
    const daily = data.timeframes?.daily || [];
    const startIndex = Math.max(Number(data.cursor) || 0, daily.findIndex((item) => item.date >= data.startDate));
    const endIndex = findLastIndexBy(daily, (item) => item.date <= endDate);
    if (startIndex < 0 || endIndex < startIndex) throw new Error("回测区间内没有可用交易日。");
    const simulationData = { ...data, timeframes: { ...data.timeframes, daily } };
    backtestState = {
      status: "setup",
      data,
      simulationData,
      startIndex,
      endIndex,
      currentIndex: startIndex,
      minBuyScore,
      feeRate,
      equity: 1,
      peakEquity: 1,
      maxDrawdown: 0,
      position: null,
      trades: [],
      signals: [],
      buySignals: 0,
      sellSignals: 0,
      manualLevels: [],
      previousReplayState: replayState.backtestMode ? backtestState.previousReplayState : replayState,
      stepExecuted: false,
      blindMode: blind,
      blindSymbol: blind ? displaySecuritySymbol(data, symbol) : "",
      blindDate: blind ? startDate : "",
    };
    applyBacktestReplayState(startIndex);
    const autoResult = autoDrawLevelLines({ silent: true });
    syncBacktestManualLevels();
    updateBacktestLevelUi();
    const autoText = autoResult ? "已先按周线自动画出候选线，你可以拖动、删除或继续补线。" : "请先手工画出当前上下支撑压力线，也可以点击周线自动画线。";
    renderBacktestAdvice(currentBacktestAdvice());
    updateBacktestSummary(startIndex);
    updateBacktestStepControls();
    updateBacktestBlindUi();
    setBacktestStatus(blind ? `随机盲测已开始，股票和日期已隐藏。${autoText}确认后点击“执行AI建议”。` : `${autoText}确认后点击“执行AI建议”。`, "neutral");
  } catch (error) {
    setBacktestStatus(error.message || "回测数据读取失败。", "negative");
    if (button) button.textContent = previousText;
    backtestState.status = "idle";
    updateBacktestStepControls();
  } finally {
    if (button) button.disabled = false;
  }
}

async function executeBacktestCurrentAi() {
  syncBacktestManualLevels();
  if (!backtestState.simulationData) {
    setBacktestStatus("请先开始回测。", "negative");
    return;
  }
  if (backtestState.stepExecuted) {
    setBacktestStatus("当前日期已经执行AI建议，请点击下一日。", "neutral");
    return;
  }
  try {
    const daily = backtestState.simulationData.timeframes?.daily || [];
    if (!(backtestState.manualLevels || []).length) {
      applyBacktestReplayState(backtestState.currentIndex);
      setBacktestStatus("请先在画布上画出支撑压力线，再执行AI建议。", "negative");
      return;
    }
    const index = backtestState.currentIndex;
    const candle = daily[index];
    if (!candle || index > backtestState.endIndex) {
      completeBacktest(backtestState.endIndex);
      return;
    }
    backtestState.status = "running";
    applyBacktestReplayState(index);
    const gapReason = backtestLevelGapReason(candle);
    if (gapReason) {
      backtestState.status = "paused";
      setBacktestStatus(`${backtestDisplayDate(candle.date)}：${gapReason}`, "negative");
      updateBacktestStepControls();
      return;
    }
    const advice = await requestBacktestAdvice({ force: true });
    if (!advice) throw new Error("后端没有返回交易建议");
    if (advice.action === "buy") backtestState.buySignals += 1;
    if (advice.action === "sell") backtestState.sellSignals += 1;
    if (advice.action === "buy" || advice.action === "sell") {
      backtestState.signals.push({ date: candle.date, close: candle.close, action: advice.action, actionText: advice.actionText, score: advice.score, model: advice.model, position: Boolean(backtestState.position) });
    }
    let executedText = backtestActionLabel(advice.action);
    if (backtestState.position) {
      let exitPrice = null;
      let exitReason = "";
      if (backtestState.position.stopLoss && index > backtestState.position.entryIndex && candle.low <= backtestState.position.stopLoss) {
        exitPrice = backtestState.position.stopLoss;
        exitReason = "止损触发";
        executedText = "止损卖出";
      } else if (advice.action === "sell") {
        exitPrice = candle.close;
        exitReason = advice.model || "AI建议卖出";
      }
      if (exitPrice) {
        const exitNet = exitPrice * (1 - backtestState.feeRate);
        const tradeReturn = exitNet / backtestState.position.entryCost - 1;
        backtestState.equity *= exitNet / backtestState.position.entryCost;
        backtestState.trades.push({ entryDate: backtestState.position.entryDate, exitDate: candle.date, entryPrice: backtestState.position.entryPrice, exitPrice, returnPct: tradeReturn * 100, holdDays: index - backtestState.position.entryIndex, model: backtestState.position.model, stage: backtestState.position.stage, exitReason });
        backtestState.position = null;
      }
    }
    if (!backtestState.position && advice.action === "buy") {
      const entryPrice = candle.close;
      backtestState.position = { entryDate: candle.date, entryIndex: index, entryPrice, entryCost: entryPrice * (1 + backtestState.feeRate), stopLoss: Math.min(candle.open, candle.close), model: advice.model, stage: advice.stage };
    }
    const markEquity = backtestState.position ? backtestState.equity * ((candle.close * (1 - backtestState.feeRate)) / backtestState.position.entryCost) : backtestState.equity;
    backtestState.peakEquity = Math.max(backtestState.peakEquity, markEquity);
    backtestState.maxDrawdown = Math.max(backtestState.maxDrawdown, backtestState.peakEquity > 0 ? (backtestState.peakEquity - markEquity) / backtestState.peakEquity : 0);
    replayState.position = backtestState.position;
    replayState.equity = backtestState.equity;
    backtestState.stepExecuted = true;
    backtestState.status = "paused";
    renderBacktestAdvice(advice);
    updateBacktestSummary(index);
    updateBacktestStepControls();
    setBacktestStatus(`${backtestDisplayDate(candle.date)}：已按AI建议执行“${executedText}”。请点击“下一日”继续。`, advice.action === "buy" || advice.action === "sell" ? "positive" : "neutral");
  } catch (error) {
    backtestState.status = "paused";
    setBacktestStatus(error.message || "回测失败。", "negative");
    updateBacktestStepControls();
  }
}

function moveBacktestNextDay() {
  syncBacktestManualLevels();
  if (!backtestState.simulationData) {
    setBacktestStatus("请先开始回测。", "negative");
    return;
  }
  if (!backtestState.stepExecuted) {
    setBacktestStatus("请先执行当天AI建议，再进入下一日。", "negative");
    return;
  }
  const daily = backtestState.simulationData.timeframes?.daily || [];
  if (backtestState.currentIndex >= backtestState.endIndex) {
    completeBacktest(backtestState.currentIndex);
    return;
  }
  const previousCandle = daily[backtestState.currentIndex];
  backtestState.currentIndex += 1;
  backtestState.stepExecuted = false;
  const candle = daily[backtestState.currentIndex];
  applyBacktestReplayState(backtestState.currentIndex);
  const conversionMessage = convertBrokenPressureToSupport(previousCandle, candle);
  if (conversionMessage) {
    syncBacktestManualLevels();
    updateBacktestLevelUi();
    drawReplayChart();
  }
  const gapReason = backtestLevelGapReason(candle);
  backtestState.status = "paused";
  renderBacktestAdvice(currentBacktestAdvice());
  updateBacktestSummary(backtestState.currentIndex);
  updateBacktestStepControls();
  if (gapReason) {
    setBacktestStatus(`${backtestDisplayDate(candle.date)}：${gapReason}`, "negative");
    return;
  }
  const prefix = conversionMessage ? `${conversionMessage}` : "";
  setBacktestStatus(`${prefix}${backtestDisplayDate(candle.date)}：请检查画线和AI建议，然后点击“执行AI建议”。`, "neutral");
}

async function runAiBacktest() {
  const button = document.querySelector("#runAiBacktest");
  const symbol = document.querySelector("#backtestSymbol")?.value.trim();
  const startDate = document.querySelector("#backtestStart")?.value;
  const endDate = document.querySelector("#backtestEnd")?.value || "9999-12-31";
  const minBuyScore = Number(document.querySelector("#backtestMinScore")?.value) || 0;
  const feeRate = Math.max(0, Number(document.querySelector("#backtestFeePct")?.value) || 0) / 100;
  if (!symbol || !startDate) {
    setBacktestStatus("请填写股票代码和开始日期。", "negative");
    return;
  }
  backtestState.blindMode = false;
  backtestState.blindSymbol = "";
  backtestState.blindDate = "";
  updateBacktestBlindUi();
  await startAiBacktestSetup(button, symbol, startDate, endDate, minBuyScore, feeRate);
}

async function startBlindAiBacktest() {
  const button = document.querySelector("#startBlindBacktest");
  const previousText = button?.textContent || "随机盲测";
  const endDate = document.querySelector("#backtestEnd")?.value || "9999-12-31";
  const minBuyScore = Number(document.querySelector("#backtestMinScore")?.value) || 0;
  const feeRate = Math.max(0, Number(document.querySelector("#backtestFeePct")?.value) || 0) / 100;
  try {
    if (button) button.disabled = true;
    let lastError = null;
    const maxAttempts = 20;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        if (button) button.textContent = `正在抽取 ${attempt}/${maxAttempts}`;
        setBacktestStatus(`正在随机抽取盲测股票和时间，第 ${attempt} 次...`, "neutral");
        const response = await fetch(apiUrl(`/api/random-training-sample?t=backtest-${Date.now()}-${attempt}`), { cache: "no-store" });
        const sample = await response.json();
        if (!response.ok) throw new Error(sample.error || "随机样本获取失败。");
        document.querySelector("#backtestSymbol").value = sample.symbol;
        document.querySelector("#backtestStart").value = sample.date;
        await startAiBacktestSetup(button, sample.symbol, sample.date, endDate, minBuyScore, feeRate, { blind: true, fresh: Boolean(sample.fresh), market: sample.market });
        return;
      } catch (error) {
        lastError = error;
        const retryable = /earlier than available market data|No daily data|Not enough|分批拉取日线失败|数据拉取失败|request failed|request failure|RemoteDisconnected|Connection aborted|closed connection|without response|Failed to fetch|Eastmoney daily data request failed|Tencent daily data request failed/i.test(error.message || "");
        if (!retryable) throw error;
        setBacktestStatus(`本次随机盲测样本数据源失败，正在换一组重试 ${attempt}/${maxAttempts}...`, "neutral");
      }
    }
    throw new Error(`随机盲测连续抽取失败：${lastError?.message || "没有可用样本"}`);
  } catch (error) {
    setBacktestStatus(error.message === "Failed to fetch" ? "无法连接本地服务，请确认服务正在运行。" : error.message, "negative");
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = previousText;
    }
  }
}

function render() {
  if (activeStrategy === "buy" && lastBuyAnalysis) {
    renderBuyAnalysis(lastBuyAnalysis);
    return;
  }
  const data = getInputs();
  const analysis = activeStrategy === "buy" ? evaluateBuy(data) : evaluateSell(data);
  const [level, text, type] = decisionFor(activeStrategy, analysis.score);
  const trendText = data.price > data.ma5 && data.ma5 > data.ma20 ? "趋势上行" : data.price < data.ma5 ? "短线转弱" : "震荡观察";
  output.strategyLabel.textContent = activeStrategy === "buy" ? "买入策略" : "卖出策略";
  output.stockTitle.textContent = data.stockName;
  output.scoreValue.textContent = analysis.score;
  output.decisionLevel.textContent = level;
  output.decisionText.textContent = text;
  output.entryRange.textContent = analysis.entryRange;
  output.stopLoss.textContent = analysis.stopLoss;
  output.targetPrice.textContent = analysis.targetPrice;
  output.marketState.textContent = `${activeStrategy === "buy" ? "买入" : "卖出"}评分 ${analysis.score}`;
  updateDecisionStyle(type);
  renderSignals(analysis.signals);
  drawChart(data);
}

function syncStrategyControls() {
  const isBuy = activeStrategy === "buy";
  document.querySelector("#buyRealPanel")?.classList.toggle("hidden", !isBuy);
  document.querySelector("#legacyFields")?.classList.toggle("hidden", isBuy);
  document.querySelector(".risk-row")?.classList.toggle("hidden", isBuy);
  document.querySelector("#loadSample")?.classList.toggle("hidden", isBuy);
}

function setView(view) {
  if (view !== "backtest") restoreReplayAfterBacktest();
  activeView = view;
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelector("#strategyView").classList.toggle("hidden", view === "market" || view === "training" || view === "replay" || view === "simulation" || view === "simulation-records" || view === "backtest" || view === "dataset");
  document.querySelector("#marketView")?.classList.toggle("hidden", view !== "market");
  document.querySelector("#trainingView").classList.toggle("hidden", view !== "training");
  document.querySelector("#replayView").classList.toggle("hidden", view !== "replay" && view !== "simulation");
  document.querySelector("#backtestView")?.classList.toggle("hidden", view !== "backtest");
  document.querySelector("#datasetView")?.classList.toggle("hidden", view !== "dataset");
  document.querySelector("#simulationRecordsView")?.classList.toggle("hidden", view !== "simulation-records");
  if (view === "buy" || view === "sell") {
    activeStrategy = view;
    syncStrategyControls();
    render();
  } else if (view === "training") {
    output.marketState.textContent = "支撑压力训练";
  } else if (view === "market") {
    output.marketState.textContent = "\u884c\u60c5\u6a21\u5757";
    renderMarketWatchlist();
    refreshMarketWatchlistSnapshot();
    drawMarketChart();
    refreshMarketRealtimeQuote({ redraw: true });
    startMarketRealtimePolling();
  } else if (view === "replay") {
    output.marketState.textContent = "交易思维训练";
    updateSimulationUi();
    updateReplayUi();
    startReplayRealtimePolling();
  } else if (view === "simulation") {
    output.marketState.textContent = "模拟交易";
    replayState.writeTraining = true;
    replayState.blindMode = false;
    updateSimulationUi();
    updateReplayUi();
    startReplayRealtimePolling();
  } else if (view === "simulation-records") {
    output.marketState.textContent = "模拟交易记录";
    loadSimulationRecords();
  } else if (view === "backtest") {
    output.marketState.textContent = "AI\u5efa\u8bae\u56de\u6d4b";
    setBacktestDefaults();
  } else if (view === "dataset") {
    output.marketState.textContent = "训练集管理";
    loadTrainingRecords();
  }
}

function loadSample(strategy = activeStrategy) {
  Object.entries(samples[strategy]).forEach(([key, value]) => {
    fields[key].value = value;
  });
  render();
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",").map((item) => item.trim().toLowerCase());
  return lines.map((line) => {
    const values = line.split(",").map((item) => item.trim());
    const row = {};
    headers.forEach((header, index) => {
      row[header] = header === "date" ? values[index] : Number(values[index]);
    });
    return row;
  }).filter((row) => row.date && Number.isFinite(row.open) && Number.isFinite(row.high) && Number.isFinite(row.low) && Number.isFinite(row.close));
}

function parseCorrections(text) {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [typeRaw, priceRaw] = line.split(":").map((item) => item.trim());
    const type = typeRaw.toLowerCase().includes("resistance") || typeRaw.includes("压力") ? "resistance" : "support";
    return { type, price: Number(priceRaw) };
  }).filter((item) => Number.isFinite(item.price));
}

function buildCorrectionsFromInputs() {
  const support = Number(document.querySelector("#manualSupport").value);
  const resistance = Number(document.querySelector("#manualResistance").value);
  return [
    Number.isFinite(support) && support > 0 ? { type: "support", price: support } : null,
    Number.isFinite(resistance) && resistance > 0 ? { type: "resistance", price: resistance } : null,
  ].filter(Boolean);
}

function getTrainingOptions() {
  return {
    symbol: document.querySelector("#trainSymbol").value.trim(),
    date: document.querySelector("#trainDate").value,
    years: 3,
    clusterPct: Number(document.querySelector("#clusterPct").value) / 100,
    bodyBinPct: Number(document.querySelector("#bodyBinPct").value) / 100,
    swingWindow: Number(document.querySelector("#swingWindow").value),
    reactionPct: Number(document.querySelector("#reactionPct").value) / 100,
    corrections: buildCorrectionsFromInputs(),
  };
}

function setTrainingStatus(message, type = "neutral") {
  const status = document.querySelector("#trainingStatus");
  if (!status) return;
  status.textContent = message;
  status.classList.remove("positive", "negative", "neutral");
  if (message) status.classList.add(type);
}

function setStatus(selector, message, type = "neutral") {
  const status = document.querySelector(selector);
  if (!status) return;
  status.textContent = message;
  status.classList.remove("positive", "negative", "neutral");
  if (message) status.classList.add(type);
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousTradingDateString(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - 1);
  while (date.getDay() === 0 || date.getDay() === 6) {
    date.setDate(date.getDate() - 1);
  }
  return formatDateInputValue(date);
}

function currentDateString(referenceDate = new Date()) {
  const date = new Date(referenceDate);
  date.setHours(0, 0, 0, 0);
  return formatDateInputValue(date);
}

function setDefaultTrainingDate() {
  const input = document.querySelector("#trainDate");
  if (input && !input.value) input.value = "";
}

function setDefaultBuyDate() {
  const input = document.querySelector("#buyDate");
  if (input && !input.value) input.value = "";
}

function setDefaultReplayDate() {
  const input = document.querySelector("#replayDate");
  if (input && !input.value) input.value = currentDateString();
}

function tolerance(price, pct) {
  return Math.max(price * pct, 0.01);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function findSwings(rows, window) {
  const points = [];
  for (let index = window; index < rows.length - window; index += 1) {
    const block = rows.slice(index - window, index + window + 1);
    const row = rows[index];
    if (row.high >= Math.max(...block.map((item) => item.high))) points.push({ type: "resistance", price: row.high, index, source: "波段高点" });
    if (row.low <= Math.min(...block.map((item) => item.low))) points.push({ type: "support", price: row.low, index, source: "波段低点" });
  }
  return points;
}

function clusterPoints(points, clusterPct) {
  const clusters = [];
  points.sort((a, b) => a.price - b.price).forEach((point) => {
    const cluster = clusters.find((item) => item.type === point.type && Math.abs(item.mid - point.price) <= tolerance(item.mid, clusterPct));
    if (cluster) {
      cluster.points.push(point);
      cluster.mid = mean(cluster.points.map((item) => item.price));
      cluster.low = Math.min(...cluster.points.map((item) => item.price));
      cluster.high = Math.max(...cluster.points.map((item) => item.price));
    } else {
      clusters.push({ type: point.type, mid: point.price, low: point.price, high: point.price, points: [point], sources: ["波段聚类"], bodyCount: 0 });
    }
  });
  return clusters;
}

function bodyZones(rows, binPct) {
  const bodies = rows.flatMap((row) => [Math.min(row.open, row.close), Math.max(row.open, row.close)]);
  const minPrice = Math.min(...bodies) * 0.98;
  const maxPrice = Math.max(...bodies) * 1.02;
  const step = Math.max(mean(rows.map((row) => row.close)) * binPct, 0.01);
  const bins = [];
  for (let low = minPrice; low < maxPrice; low += step) {
    const high = low + step;
    let count = 0;
    rows.forEach((row) => {
      const bodyLow = Math.min(row.open, row.close);
      const bodyHigh = Math.max(row.open, row.close);
      if (low <= bodyHigh && high >= bodyLow) count += 1;
    });
    if (count > 0) bins.push({ low, high, mid: (low + high) / 2, count });
  }
  const threshold = Math.max(2, bins.map((bin) => bin.count).sort((a, b) => a - b)[Math.floor(bins.length * 0.72)] || 2);
  const currentPrice = rows.at(-1).close;
  return bins.filter((bin) => bin.count >= threshold).sort((a, b) => b.count - a.count).slice(0, 12).map((bin) => ({
    type: bin.mid < currentPrice ? "support" : "resistance",
    low: bin.low,
    high: bin.high,
    mid: bin.mid,
    points: [],
    sources: ["实体密集区"],
    bodyCount: bin.count,
  }));
}

function mergeZones(zones, clusterPct) {
  const merged = [];
  zones.sort((a, b) => a.mid - b.mid).forEach((zone) => {
    const found = merged.find((item) => item.type === zone.type && Math.abs(item.mid - zone.mid) <= tolerance(item.mid, clusterPct));
    if (found) {
      found.low = Math.min(found.low, zone.low);
      found.high = Math.max(found.high, zone.high);
      found.mid = (found.low + found.high) / 2;
      found.points.push(...zone.points);
      found.sources.push(...zone.sources);
      found.bodyCount += zone.bodyCount;
    } else {
      merged.push({ ...zone, sources: [...zone.sources], points: [...zone.points] });
    }
  });
  return merged;
}

function recentValidation(rows, zone, reactionPct) {
  let score = 0;
  let touches = 0;
  for (let index = 0; index < rows.length - 3; index += 1) {
    const row = rows[index];
    if (!(row.low <= zone.high && row.high >= zone.low)) continue;
    touches += 1;
    const future = rows.slice(index + 1, index + 4);
    const reacted = zone.type === "support"
      ? Math.max(...future.map((item) => item.close)) >= zone.mid * (1 + reactionPct)
      : Math.min(...future.map((item) => item.close)) <= zone.mid * (1 - reactionPct);
    if (reacted) score += 1 + (index + 1) / rows.length;
  }
  return { score, touches };
}

function scoreZones(rows, zones, weights, reactionPct) {
  const maxSwing = Math.max(...zones.map((zone) => zone.points.length), 1);
  const maxBody = Math.max(...zones.map((zone) => zone.bodyCount), 1);
  return zones.map((zone) => {
    const recent = recentValidation(rows, zone, reactionPct);
    const newest = Math.max(...zone.points.map((point) => point.index), rows.length - 1);
    const swingScore = Math.min(zone.points.length / maxSwing, 1) * 100;
    const bodyScore = Math.min(zone.bodyCount / maxBody, 1) * 100;
    const recentScore = Math.min(recent.score / 5, 1) * 100;
    const recencyScore = ((newest + 1) / rows.length) * 100;
    const strength = swingScore * weights.swing + recentScore * weights.recent + bodyScore * weights.body + recencyScore * weights.recency;
    return {
      type: zone.type,
      low: zone.low,
      high: zone.high,
      mid: zone.mid,
      strength,
      swingScore,
      recentScore,
      bodyScore,
      recencyScore,
      touches: recent.touches,
      sources: [...new Set(zone.sources)],
    };
  }).sort((a, b) => b.strength - a.strength);
}

function distanceError(levels, corrections) {
  if (!corrections.length) return null;
  return mean(corrections.map((correction) => {
    const typed = levels.filter((level) => level.type === correction.type).slice(0, 8);
    if (!typed.length) return 1;
    const best = typed.reduce((winner, level) => Math.abs(level.mid - correction.price) < Math.abs(winner.mid - correction.price) ? level : winner, typed[0]);
    return Math.abs(best.mid - correction.price) / correction.price;
  }));
}

function fitWeights(rows, zones, corrections, reactionPct) {
  if (!corrections.length) return { swing: 0.3, recent: 0.3, body: 0.3, recency: 0.1 };
  const values = [0.1, 0.2, 0.3, 0.4, 0.5];
  let best = { error: Infinity, weights: { swing: 0.3, recent: 0.3, body: 0.3, recency: 0.1 } };
  values.forEach((swing) => values.forEach((recent) => values.forEach((body) => {
    const recency = 1 - swing - recent - body;
    if (recency < 0.05 || recency > 0.3) return;
    const weights = { swing, recent, body, recency };
    const levels = scoreZones(rows, zones, weights, reactionPct);
    const error = distanceError(levels, corrections);
    if (error < best.error) best = { error, weights };
  })));
  return best.weights;
}

function runTraining() {
  try {
    const rows = parseCsv(document.querySelector("#weeklyCsvInput").value);
    const options = getTrainingOptions();
    const analysisDate = new Date(options.date);
    const startDate = new Date(analysisDate);
    startDate.setFullYear(startDate.getFullYear() - 3);
    const filtered = rows.filter((row) => {
      const date = new Date(row.date);
      return date < analysisDate && date >= startDate;
    });
    if (filtered.length < 30) throw new Error("分析日期之前3年的周线数量不足，至少需要30根。");

    const clusterPct = options.clusterPct;
    const bodyBinPct = options.bodyBinPct;
    const reactionPct = options.reactionPct;
    const swingWindow = options.swingWindow;
    const corrections = options.corrections;
    const swingZones = clusterPoints(findSwings(filtered, swingWindow), clusterPct).map((zone) => ({
      ...zone,
      low: zone.low * (1 - clusterPct / 2),
      high: zone.high * (1 + clusterPct / 2),
    }));
    const zones = mergeZones([...swingZones, ...bodyZones(filtered, bodyBinPct)], clusterPct);
    const weights = fitWeights(filtered, zones, corrections, reactionPct);
    const levels = scoreZones(filtered, zones, weights, reactionPct);
    const currentPrice = filtered.at(-1).close;
    const nearestSupport = levels.filter((level) => level.type === "support" && level.high <= currentPrice).sort((a, b) => b.mid - a.mid)[0];
    const nearestResistance = levels.filter((level) => level.type === "resistance" && level.low >= currentPrice).sort((a, b) => a.mid - currentPrice - (b.mid - currentPrice))[0];
    renderTrainingResult({ filtered, currentPrice, nearestSupport, nearestResistance, levels, weights, error: distanceError(levels, corrections) });
  } catch (error) {
    document.querySelector("#trainingTitle").textContent = "训练失败";
    document.querySelector("#levelTable").innerHTML = `<div class="decision negative"><span class="decision-level">输入数据有问题</span><p>${error.message}</p></div>`;
  }
}

async function fetchRealTraining() {
  const button = document.querySelector("#fetchRealTraining");
  await requestTraining(getTrainingOptions(), button, "正在拉取真实数据...", "已按股票代码计算支撑压力");
}

async function requestTraining(options, button, loadingText, successText = "训练完成") {
  const previousText = button.textContent;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 60000);
  try {
    if (!options.symbol) throw new Error("\u8bf7\u586b\u5199\u80a1\u7968\u4ee3\u7801\u3002");
    button.disabled = true;
    button.textContent = loadingText;
    setTrainingStatus(loadingText, "neutral");
    document.querySelector("#trainingTitle").textContent = "正在拉取 AKShare 周线和日线数据";
    const response = await fetch(apiUrl("/api/train-support-resistance"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "真实数据训练失败。");
    lastTrainingResult = data;
    renderServerTrainingResult(data);
    setTrainingStatus(successText, "positive");
  } catch (error) {
    const message = error.name === "AbortError" ? "真实数据请求超过60秒，请稍后重试，或先用CSV拟合。" : error.message;
    document.querySelector("#trainingTitle").textContent = "训练失败";
    document.querySelector("#levelTable").innerHTML = `<div class="decision negative"><span class="decision-level">真实数据接口有问题</span><p>${message}</p></div>`;
    setTrainingStatus(message, "negative");
  } finally {
    window.clearTimeout(timeoutId);
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function randomTraining() {
  const button = document.querySelector("#randomTraining");
  const previousText = button.textContent;
  try {
    button.disabled = true;
    button.textContent = "正在抽取样本...";
    setTrainingStatus("正在抽取随机股票和时间", "neutral");
    document.querySelector("#trainingTitle").textContent = "正在抽取随机股票和时间";
    const response = await fetch(apiUrl("/api/random-training-sample"));
    const sample = await response.json();
    if (!response.ok) throw new Error(sample.error || "随机样本获取失败。");
    document.querySelector("#trainSymbol").value = sample.symbol;
    document.querySelector("#trainDate").value = sample.date || previousTradingDateString();
    document.querySelector("#manualSupport").value = "";
    document.querySelector("#manualResistance").value = "";
    document.querySelector("#trainingTitle").textContent = `${sample.displaySymbol || sample.symbol}：${sample.date}，正在计算支撑压力`;
    await requestTraining(getTrainingOptions(), button, "正在训练样本...", "随机训练完成");
  } catch (error) {
    const message = error.message === "Failed to fetch" ? "无法连接本地服务，请确认页面地址是 http://127.0.0.1:8765/ 且服务正在运行。" : error.message;
    document.querySelector("#trainingTitle").textContent = "训练失败";
    document.querySelector("#levelTable").innerHTML = `<div class="decision negative"><span class="decision-level">随机训练有问题</span><p>${message}</p></div>`;
    setTrainingStatus(message, "negative");
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
}

async function refitTraining() {
  const button = document.querySelector("#refitTraining");
  await requestTraining(getTrainingOptions(), button, "正在按修正重新拟合...", "已按人工修正重新拟合");
}

function renderTrainingResult(result) {
  document.querySelector("#trainingTitle").textContent = `${document.querySelector("#trainSymbol").value}：${result.filtered[0].date} 至 ${result.filtered.at(-1).date}`;
  document.querySelector("#trainCurrentPrice").textContent = formatPrice(result.currentPrice);
  document.querySelector("#trainSupport").textContent = result.nearestSupport ? `${formatPrice(result.nearestSupport.low)} - ${formatPrice(result.nearestSupport.high)}` : "--";
  document.querySelector("#trainResistance").textContent = result.nearestResistance ? `${formatPrice(result.nearestResistance.low)} - ${formatPrice(result.nearestResistance.high)}` : "--";
  document.querySelector("#fitError").textContent = result.error === null ? "未输入纠正价格" : `拟合误差 ${(result.error * 100).toFixed(2)}%`;
  document.querySelector("#weightGrid").innerHTML = Object.entries(result.weights).map(([key, value]) => {
    const label = { swing: "历史高低点", recent: "近期验证", body: "实体密集区", recency: "时间近度" }[key];
    return `<div><span>${label}</span><strong>${Math.round(value * 100)}%</strong></div>`;
  }).join("");
  document.querySelector("#levelTable").innerHTML = result.levels.slice(0, 10).map((level) => `
    <article class="level-row ${level.type}">
      <div><strong>${level.type === "support" ? "支撑" : "压力"} ${formatPrice(level.low)} - ${formatPrice(level.high)}</strong><p>${level.sources.join(" / ")}，触碰 ${level.touches} 次</p></div>
      <span>${level.strength.toFixed(1)} 分</span>
    </article>
  `).join("");
}

function renderServerTrainingResult(result) {
  const levels = result.levels || [];
  const sourceLabel = (source) => ({
    body_cluster: "实体密集区",
    swing_cluster: "周线波段",
    daily_refine: "日线精修",
    daily_swing_cluster: "日线波段",
  }[source] || source);
  document.querySelector("#trainingTitle").textContent = `${document.querySelector("#trainSymbol").value}：${result.trainingStart} 至 ${result.trainingEnd}，共 ${result.weeks} 周`;
  document.querySelector("#trainCurrentPrice").textContent = formatPrice(result.currentPrice);
  document.querySelector("#trainSupport").textContent = result.nearest?.support ? `${formatPrice(result.nearest.support.low)} - ${formatPrice(result.nearest.support.high)}` : "--";
  document.querySelector("#trainResistance").textContent = result.nearest?.resistance ? `${formatPrice(result.nearest.resistance.low)} - ${formatPrice(result.nearest.resistance.high)}` : "--";
  document.querySelector("#correctionPanel").classList.remove("hidden");
  if (!document.querySelector("#manualSupport").value && result.nearest?.support) {
    document.querySelector("#manualSupport").value = formatPrice(result.nearest.support.mid);
  }
  if (!document.querySelector("#manualResistance").value && result.nearest?.resistance) {
    document.querySelector("#manualResistance").value = formatPrice(result.nearest.resistance.mid);
  }
  const precisionText = result.pricePrecision === "daily_refined" ? "日线精修" : "周线范围";
  const fitText = result.fitError === null ? "未输入纠正价格" : `拟合误差 ${(result.fitError * 100).toFixed(2)}%`;
  document.querySelector("#fitError").textContent = `${precisionText} · ${fitText}`;
  document.querySelector("#weightGrid").innerHTML = Object.entries(result.weights || {}).map(([key, value]) => {
    const label = { swing: "历史高低点", recent: "近期验证", body: "实体密集区", recency: "时间近度" }[key] || key;
    return `<div><span>${label}</span><strong>${Math.round(value * 100)}%</strong></div>`;
  }).join("");
  document.querySelector("#levelTable").innerHTML = levels.slice(0, 10).map((level) => `
    <article class="level-row ${level.type}">
      <div><strong>${level.type === "support" ? "支撑" : "压力"} ${formatPrice(level.low)} - ${formatPrice(level.high)}</strong><p>${level.sources.map(sourceLabel).join(" / ")}，触碰 ${level.touches} 次${level.weekly_zone ? `，周线范围 ${formatPrice(level.weekly_zone.low)} - ${formatPrice(level.weekly_zone.high)}` : ""}</p></div>
      <span>${level.strength.toFixed(1)} 分</span>
    </article>
  `).join("");
}

document.querySelectorAll("input").forEach((input) => {
  input.addEventListener("input", render);
  input.addEventListener("change", render);
});

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelector("#loadSample")?.addEventListener("click", () => loadSample());
document.querySelector("#fetchBuyAnalysis")?.addEventListener("click", () => requestBuyAnalysis());
document.querySelector("#recalcBuyRisk")?.addEventListener("click", recalcBuyRisk);
document.querySelector("#startReplay")?.addEventListener("click", startTradeReplay);
document.querySelector("#startBlindReplay")?.addEventListener("click", startBlindTradeReplay);
document.querySelector("#revealReplayIdentity")?.addEventListener("click", revealReplayIdentity);
document.querySelector("#replayWriteToggle")?.addEventListener("click", toggleReplayWriteMode);
document.querySelector("#replayStockSearch")?.addEventListener("input", scheduleReplayStockSearch);
document.querySelector("#replayStockSearch")?.addEventListener("keyup", scheduleReplayStockSearch);
document.querySelector("#replayStockSearch")?.addEventListener("change", searchReplayStock);
document.querySelector("#replayStockSearch")?.addEventListener("focus", () => {
  if (document.querySelector("#replayStockSearch")?.value.trim()) scheduleReplayStockSearch();
});
document.querySelector("#stockSearchResults")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  selectStockSearchResult({
    symbol: button.dataset.symbol,
    name: button.dataset.name,
    initials: button.dataset.initials,
    market: button.dataset.market,
    displaySymbol: button.dataset.displaySymbol,
  });
});
document.querySelector("#stockSearchResults")?.addEventListener("mousedown", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  event.preventDefault();
  selectStockSearchResult({
    symbol: button.dataset.symbol,
    name: button.dataset.name,
    initials: button.dataset.initials,
    market: button.dataset.market,
    displaySymbol: button.dataset.displaySymbol,
  });
});
document.querySelector("#marketStockSearch")?.addEventListener("input", scheduleMarketStockSearch);
document.querySelector("#marketStockSearch")?.addEventListener("keyup", scheduleMarketStockSearch);
document.querySelector("#marketStockSearch")?.addEventListener("change", searchMarketStock);
document.querySelector("#marketStockSearch")?.addEventListener("focus", () => {
  if (document.querySelector("#marketStockSearch")?.value.trim()) scheduleMarketStockSearch();
});
document.querySelector("#marketStockSearch")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  hideMarketStockSearchResults();
  loadMarketFromInput().catch((error) => setStatus("#marketStatus", error.message, "negative"));
});
document.querySelector("#marketStockSearchResults")?.addEventListener("mousedown", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  event.preventDefault();
  const match = {
    symbol: button.dataset.symbol,
    name: button.dataset.name,
    initials: button.dataset.initials,
    market: button.dataset.market,
    displaySymbol: button.dataset.displaySymbol,
  };
  setMarketSearchSelection(match);
  hideMarketStockSearchResults();
  loadMarketSymbol(match.symbol, match.market, match).catch((error) => setStatus("#marketStatus", error.message, "negative"));
});
document.querySelector("#marketStockSearchResults")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-symbol]");
  if (!button) return;
  const match = {
    symbol: button.dataset.symbol,
    name: button.dataset.name,
    initials: button.dataset.initials,
    market: button.dataset.market,
    displaySymbol: button.dataset.displaySymbol,
  };
  setMarketSearchSelection(match);
  hideMarketStockSearchResults();
  loadMarketSymbol(match.symbol, match.market, match).catch((error) => setStatus("#marketStatus", error.message, "negative"));
});
document.querySelector("#marketLoadStock")?.addEventListener("click", () => {
  loadMarketFromInput().catch((error) => setStatus("#marketStatus", error.message, "negative"));
});
document.querySelector("#marketAutoLevelLines")?.addEventListener("click", autoDrawMarketLevelLines);
document.querySelector("#marketDrawLevelLine")?.addEventListener("click", toggleMarketDrawing);
document.querySelector("#marketClearLevelLines")?.addEventListener("click", clearMarketLevels);
document.querySelector("#marketSaveSelectedLevelReason")?.addEventListener("click", saveMarketSelectedLevelReason);
document.querySelector("#marketDeleteSelectedLevel")?.addEventListener("click", deleteMarketSelectedLevel);
document.querySelector("#marketAddWatch")?.addEventListener("click", addCurrentMarketToWatchlist);
document.querySelector("#marketAddWatchOverlay")?.addEventListener("click", addCurrentMarketToWatchlist);
document.querySelector("#replayAddWatch")?.addEventListener("click", addCurrentReplayToWatchlist);
document.querySelector("#marketRefresh")?.addEventListener("click", () => {
  if (marketState.symbol) {
    loadMarketSymbol(marketState.symbol, marketState.market, { displaySymbol: marketState.displaySymbol })
      .catch((error) => setStatus("#marketStatus", error.message, "negative"));
  }
});
document.querySelector("#marketAiAdvice")?.addEventListener("click", async () => {
  try {
    await requestMarketAiAdvice();
    setStatus("#marketStatus", "AI\u5efa\u8bae\u5df2\u66f4\u65b0\u3002", "positive");
  } catch (error) {
    setStatus("#marketStatus", error.message, "negative");
  }
});
document.querySelectorAll("input[name='marketPositionStatus']").forEach((input) => {
  input.addEventListener("change", () => syncMarketPositionFromUi({ refreshAdvice: true }));
});
document.querySelector("#marketEntryDate")?.addEventListener("change", () => syncMarketPositionFromUi({ refreshAdvice: true }));
document.querySelector("#marketEntryPrice")?.addEventListener("change", () => syncMarketPositionFromUi({ refreshAdvice: true }));
document.querySelector("#marketStopLoss")?.addEventListener("change", () => syncMarketPositionFromUi({ refreshAdvice: true }));
document.querySelectorAll("input[name='replayPositionStatus']").forEach((input) => {
  input.addEventListener("change", syncReplayPositionFromUi);
});
document.querySelector("#replayEntryDateInput")?.addEventListener("change", syncReplayPositionFromUi);
document.querySelector("#replayEntryPriceInput")?.addEventListener("change", syncReplayPositionFromUi);
document.querySelector("#replayStopLossInput")?.addEventListener("change", syncReplayPositionFromUi);
document.querySelector("#trainingWatchlist")?.addEventListener("click", async (event) => {
  if (marketState.watchSuppressClick) {
    marketState.watchSuppressClick = false;
    event.preventDefault();
    return;
  }
  const remove = event.target.closest(".watchlist-remove");
  if (remove) {
    const key = `${remove.dataset.market || "cn"}:${remove.dataset.symbol}`;
    marketState.watchlist = marketState.watchlist.filter((item) => `${item.market || "cn"}:${item.symbol}` !== key);
    saveMarketWatchlist();
    renderMarketWatchlist();
    await syncMarketRealtimeWatchlist();
    setStatus("#replayStatus", "\u5df2\u4ece\u81ea\u9009\u80a1\u5220\u9664\uff0cQMT\u6865\u63a5\u4f1a\u540c\u6b65\u9000\u8ba2\u3002", "neutral");
    return;
  }
  const button = event.target.closest(".watchlist-main");
  if (!button) return;
  const symbolInput = document.querySelector("#replaySymbol");
  if (symbolInput) symbolInput.value = button.dataset.symbol || "";
  await loadTradeReplay({
    button: document.querySelector("#startReplay"),
    symbol: button.dataset.symbol,
    market: button.dataset.market || null,
    date: "",
    blind: false,
    loadingText: "\u6b63\u5728\u52a0\u8f7d\u884c\u60c5...",
  });
});

document.querySelector("#toggleTrainingWatchlist")?.addEventListener("click", toggleTrainingWatchlist);
document.querySelector("#refreshTrainingWatchlist")?.addEventListener("click", refreshWatchlistQuotes);
document.querySelector("#getTrainingWatchlist")?.addEventListener("click", fillWatchlistHistory);
document.querySelector("#expandTrainingWatchlist")?.addEventListener("click", () => setTrainingWatchlistCollapsed(false));
document.querySelector("#trainingWatchlist")?.addEventListener("pointerdown", startWatchlistLongPress);
document.querySelector("#trainingWatchlist")?.addEventListener("pointermove", dragWatchlistItem);
document.querySelector("#trainingWatchlist")?.addEventListener("pointerup", endWatchlistDrag);
document.querySelector("#trainingWatchlist")?.addEventListener("pointercancel", endWatchlistDrag);
document.querySelector("#watchlist")?.addEventListener("click", async (event) => {
  if (marketState.watchSuppressClick) {
    marketState.watchSuppressClick = false;
    event.preventDefault();
    return;
  }
  const remove = event.target.closest(".watchlist-remove");
  if (remove) {
    const key = `${remove.dataset.market || "cn"}:${remove.dataset.symbol}`;
    marketState.watchlist = marketState.watchlist.filter((item) => `${item.market || "cn"}:${item.symbol}` !== key);
    saveMarketWatchlist();
    renderMarketWatchlist();
    await syncMarketRealtimeWatchlist();
    if (!isMarketWatchlisted()) {
      marketState.realtimeQuote = null;
      window.clearInterval(marketRealtimeTimer);
    }
    updateMarketHeader();
    setStatus("#marketStatus", "\u5df2\u5220\u9664\u81ea\u9009\u80a1\uff0cQMT\u6865\u63a5\u5c06\u505c\u6b62\u8ba2\u9605\u8be5\u80a1\u3002", "neutral");
    return;
  }
  const button = event.target.closest(".watchlist-main");
  if (!button) return;
  loadMarketSymbol(button.dataset.symbol, button.dataset.market)
    .catch((error) => setStatus("#marketStatus", error.message, "negative"));
});
document.querySelector("#watchlist")?.addEventListener("pointerdown", startWatchlistLongPress);
document.querySelector("#watchlist")?.addEventListener("pointermove", dragWatchlistItem);
document.querySelector("#watchlist")?.addEventListener("pointerup", endWatchlistDrag);
document.querySelector("#watchlist")?.addEventListener("pointercancel", endWatchlistDrag);
document.querySelector("#marketChart")?.addEventListener("mousedown", startMarketLevelDrag);
document.querySelector("#marketChart")?.addEventListener("mousemove", updateMarketHover);
document.querySelector("#marketChart")?.addEventListener("click", handleMarketChartClick);
document.querySelector("#marketChart")?.addEventListener("mouseleave", clearMarketHover);
document.querySelector("#marketChart")?.addEventListener("wheel", handleMarketWheel, { passive: false });
document.querySelectorAll(".market-timeframe-button").forEach((button) => {
  button.addEventListener("click", () => selectMarketTimeframe(button.dataset.frame));
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".stock-search-label")) return;
  hideStockSearchResults();
  hideMarketStockSearchResults();
});
document.querySelector("#autoLevelLines")?.addEventListener("click", autoDrawLevelLines);
document.querySelector("#saveLevelTrainingSample")?.addEventListener("click", saveLevelTrainingSample);
document.querySelector("#drawLevelLine")?.addEventListener("click", () => {
  replayState.drawingLevel = !replayState.drawingLevel;
  updateLevelToolUi();
});
document.querySelector("#clearLevelLines")?.addEventListener("click", () => {
  (replayState.manualLevels || []).forEach((level) => {
    recordLevelCorrection("delete", level, {
      fromPrice: level.price,
      reason: level.reason || "",
      side: manualLevelType(level),
    });
  });
  replayState.manualLevels = [];
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  saveReplayLevels();
  updateLevelToolUi();
  refreshReplayAdviceFromLevels({ resetFeedback: true });
  setStatus("#replayStatus", "已清空画布上的支撑压力线。", "neutral");
});
document.querySelector("#deleteSelectedLevel")?.addEventListener("click", deleteSelectedLevel);
document.querySelector("#saveSelectedLevelReason")?.addEventListener("click", saveSelectedLevelReason);
["input", "change", "keyup"].forEach((eventName) => {
  document.querySelector("#replayBuyReason")?.addEventListener(eventName, () => updateBuyStopLossVisibility());
});
document.querySelector("#replayBuy")?.addEventListener("click", () => saveReplayDecision("buy"));
document.querySelector("#replaySell")?.addEventListener("click", () => saveReplayDecision("sell"));
document.querySelector("#replayHold")?.addEventListener("click", () => saveReplayDecision("hold"));
document.querySelector("#replayPrevCandle")?.addEventListener("click", () => navigateReplayCandle(-1));
document.querySelector("#replayNextCandle")?.addEventListener("click", () => navigateReplayCandle(1));
document.querySelector("#runAiBacktest")?.addEventListener("click", runAiBacktest);
document.querySelector("#startBlindBacktest")?.addEventListener("click", startBlindAiBacktest);
document.querySelector("#revealBacktestIdentity")?.addEventListener("click", revealBacktestIdentity);
document.querySelector("#backtestExecuteAi")?.addEventListener("click", executeBacktestCurrentAi);
document.querySelector("#backtestNextDay")?.addEventListener("click", moveBacktestNextDay);
document.querySelector("#backtestAutoLevelLines")?.addEventListener("click", () => {
  if (!replayState.backtestMode) {
    setBacktestStatus("请先点击开始回测，加载K线画布。", "negative");
    return;
  }
  autoDrawLevelLines();
  syncBacktestManualLevels();
  updateBacktestLevelUi();
});
document.querySelector("#backtestDrawLevelLine")?.addEventListener("click", () => {
  if (!replayState.backtestMode) {
    setBacktestStatus("请先点击开始回测，加载K线画布。", "negative");
    return;
  }
  replayState.drawingLevel = !replayState.drawingLevel;
  updateLevelToolUi();
});
document.querySelector("#backtestClearLevelLines")?.addEventListener("click", () => {
  if (!replayState.backtestMode) return;
  replayState.manualLevels = [];
  backtestState.manualLevels = replayState.manualLevels;
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  updateBacktestLevelUi();
  drawReplayChart();
  setBacktestStatus("已清空回测画布上的支撑压力线。", "neutral");
});
document.querySelector("#backtestDeleteSelectedLevel")?.addEventListener("click", () => {
  if (!replayState.backtestMode) return;
  deleteSelectedLevel();
  syncBacktestManualLevels();
  updateBacktestLevelUi();
});
["#replayTrendDirection", "#replayTrendStage", "#replaySupportStatus", "#replaySupportEvidence", "#replayStructure"].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("change", () => renderRuleAdvice());
});
document.querySelector("#copyRuleAdviceSummary")?.addEventListener("click", copyRuleAdviceSummary);
document.querySelector("#executeRuleAdvice")?.addEventListener("click", executeRuleAdvice);
document.querySelectorAll(".ai-feedback-button").forEach((button) => {
  button.addEventListener("click", () => setAiAdviceFeedback(button.dataset.aiFeedback));
});
document.querySelector("#analyzeTimingQuality")?.addEventListener("click", analyzeTimingQuality);
document.querySelector("#refreshTrainingRecords")?.addEventListener("click", loadTrainingRecords);
document.querySelector("#refreshSimulationRecords")?.addEventListener("click", loadSimulationRecords);
document.querySelectorAll(".simulation-record-filter").forEach((button) => {
  button.addEventListener("click", () => {
    simulationRecordFilter = button.dataset.simulationFilter || "open";
    document.querySelectorAll(".simulation-record-filter").forEach((item) => item.classList.toggle("active", item === button));
    loadSimulationRecords();
  });
});
document.querySelector("#trainingRecordList")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle-actions") toggleDatasetActions(button.dataset.id, button);
  if (button.dataset.action === "restore") restoreTrainingRecord(button.dataset.id);
  if (button.dataset.action === "delete") deleteTrainingRecord(button.dataset.id);
});
document.querySelectorAll(".timeframe-button:not(.market-timeframe-button)").forEach((button) => {
  button.addEventListener("click", () => {
    replayState.frame = button.dataset.frame;
    replayState.dragOffset = 0;
    replayState.hoverIndex = null;
    replayState.hoverY = null;
    replayState.selectedNoteDate = null;
    document.querySelectorAll(".timeframe-button:not(.market-timeframe-button)").forEach((item) => item.classList.toggle("active", item === button));
    updateReplayUi();
    if (replayState.data && !(replayState.data.timeframes?.[replayState.frame] || []).length) {
      const message = `${timeframeLabel()}\u884c\u60c5\u5c1a\u672a\u5bfc\u5165\uff0c\u540e\u7eed\u5bfc\u51655\u5206\u949f\u6570\u636e\u540e\u53ef\u7528\u3002`;
      if (replayState.backtestMode) setBacktestStatus(message, "neutral");
      else setStatus("#replayStatus", message, "neutral");
    }
  });
});
["#replaySupport", "#replayResistance"].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("input", () => refreshReplayAdviceFromLevels({ resetFeedback: true }));
});
document.querySelector("#replayChart")?.addEventListener("mousemove", updateReplayHover);
document.querySelector("#replayChart")?.addEventListener("mousedown", startReplayDrag);
document.querySelector("#backtestChart")?.addEventListener("mousemove", updateReplayHover);
document.querySelector("#backtestChart")?.addEventListener("mousedown", startReplayDrag);
document.addEventListener("mousemove", dragReplayChart);
document.addEventListener("mousemove", dragMarketLevel);
document.addEventListener("mouseup", endReplayDrag);
document.addEventListener("mouseup", endMarketLevelDrag);
window.addEventListener("blur", endReplayDrag);
window.addEventListener("blur", endMarketLevelDrag);
document.querySelector("#replayChart")?.addEventListener("click", selectReplayAnnotation);
document.querySelector("#replayChart")?.addEventListener("mouseleave", clearReplayHover);
document.querySelector("#backtestChart")?.addEventListener("click", selectReplayAnnotation);
document.querySelector("#backtestChart")?.addEventListener("mouseleave", clearReplayHover);
document.addEventListener("keydown", (event) => {
  if (activeView === "market") {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      zoomMarketChart(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      zoomMarketChart(1);
    }
    return;
  }
  if (activeView !== "replay" && activeView !== "backtest") return;
  if (event.key === "ArrowUp") {
    event.preventDefault();
    zoomReplayChart(-1);
  } else if (event.key === "ArrowDown") {
    event.preventDefault();
    zoomReplayChart(1);
  }
});
document.querySelector("#runTraining")?.addEventListener("click", runTraining);
document.querySelector("#fetchRealTraining")?.addEventListener("click", fetchRealTraining);
document.querySelector("#randomTraining")?.addEventListener("click", randomTraining);
document.querySelector("#refitTraining")?.addEventListener("click", refitTraining);
document.querySelector("#weeklyCsvInput").value = sampleWeeklyCsv;

setDefaultTrainingDate();
setDefaultBuyDate();
setDefaultReplayDate();
setBacktestDefaults();
syncStrategyControls();
loadMarketWatchlist();
renderMarketWatchlist();
updateMarketPositionUi();
refreshWatchlistQuotes();
drawMarketChart();
setView("replay");
updateLevelToolUi();
updateReplayUi();
loadTrainingRecords();
