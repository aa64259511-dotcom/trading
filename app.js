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
let replayState = {
  data: null,
  frame: "daily",
  cursor: 0,
  position: null,
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
  writeTraining: true,
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
};

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
  output.stockTitle.textContent = `${result.symbol} · ${result.analysisDate}`;
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
    if (!payload.symbol || !payload.date) throw new Error("请填写股票代码和分析日期。");
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

function replayVisibleCandles() {
  if (!replayState.data) return [];
  const candles = replayState.data.timeframes[replayState.frame] || [];
  const cursorDate = replayDailyCursorDate();
  const visible = candles.filter((item) => item.date <= cursorDate);
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
  const visible = candles.filter((item) => item.date <= cursorDate);
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
  button.textContent = replayState.writeTraining ? "真实训练" : "测试训练";
  button.setAttribute("aria-pressed", replayState.writeTraining ? "true" : "false");
  button.classList.toggle("active", replayState.writeTraining);
}

function updateReplayBlindUi() {
  const searchInput = document.querySelector("#replayStockSearch");
  const symbolInput = document.querySelector("#replaySymbol");
  const dateInput = document.querySelector("#replayDate");
  const blindSymbol = document.querySelector("#blindSymbol");
  const blindDate = document.querySelector("#blindDate");
  const revealButton = document.querySelector("#revealReplayIdentity");
  const hidden = replayState.blindMode;
  searchInput?.classList.toggle("hidden", hidden);
  symbolInput?.classList.toggle("hidden", hidden);
  dateInput?.classList.toggle("hidden", hidden);
  blindSymbol?.classList.toggle("hidden", !hidden);
  blindDate?.classList.toggle("hidden", !hidden);
  revealButton?.classList.toggle("hidden", !hidden);
  if (blindSymbol) blindSymbol.textContent = hidden ? "股票已隐藏" : "";
  if (blindDate) blindDate.textContent = hidden ? "日期已隐藏" : "";
  updateReplayCurrentDate();
}

function revealReplayIdentity() {
  replayState.blindMode = false;
  updateReplayBlindUi();
  setStatus("#replayStatus", `已显示：${replayState.blindSymbol || document.querySelector("#replaySymbol").value} / ${replayState.blindDate || document.querySelector("#replayDate").value}`, "neutral");
}

function toggleReplayWriteMode() {
  replayState.writeTraining = !replayState.writeTraining;
  updateReplayWriteToggle();
  setStatus("#replayStatus", replayState.writeTraining ? "已开启写入，本次操作会保存到训练集。" : "已切换为测试模式，本次操作不会写入训练集。", replayState.writeTraining ? "positive" : "neutral");
}

function updateReplayDecisionMode() {
  const hasPosition = Boolean(replayState.position);
  document.querySelector(".decision-buy-entry")?.classList.toggle("hidden", hasPosition);
  document.querySelector(".decision-sell-entry")?.classList.toggle("hidden", !hasPosition);
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
  if (searchInput) searchInput.value = match.name ? `${match.name} ${match.symbol}` : match.symbol;
  hideStockSearchResults();
  setStatus("#replayStatus", `已选择 ${match.name || "股票"} ${match.symbol}。`, "neutral");
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
    <button class="stock-search-option" type="button" data-symbol="${escapeHtml(match.symbol)}" data-name="${escapeHtml(match.name || "")}" data-initials="${escapeHtml(match.initials || "")}">
      <span>${escapeHtml(match.symbol)}</span>
      <strong>${escapeHtml(match.name || "名称未收录")}</strong>
      <small>${escapeHtml(match.initials || "")}</small>
    </button>
  `).join("");
  panel.classList.remove("hidden");
}

async function searchReplayStock() {
  const input = document.querySelector("#replayStockSearch");
  if (!input) return;
  const query = input.value.trim();
  if (!query) {
    hideStockSearchResults();
    return;
  }
  if (/^\d{6}$/.test(query)) {
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
          <strong>${dataset.symbol || "--"}</strong>
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
  updateReplayUi();
  setView("replay");
  setStatus("#replayStatus", `已复现训练集：${dataset.symbol || first.symbol} ${dataset.startDate || first.date}`, "positive");
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
  if (action === "hold") return Boolean(note);
  return true;
}

function replayChartScale() {
  const candles = replayVisibleCandles();
  if (!candles.length) return null;
  const levelPrices = replayState.manualLevels.map((level) => level.price).filter((price) => price > 0);
  const prices = candles.flatMap((item) => [item.high, item.low]).concat(levelPrices);
  const min = Math.min(...prices) * 0.98;
  const max = Math.max(...prices) * 1.02;
  const canvas = document.querySelector("#replayChart");
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

function nearestManualLevels() {
  const current = currentReplayCandle()?.close || 0;
  const supports = replayState.manualLevels
    .filter((level) => level.price <= current)
    .sort((a, b) => b.price - a.price);
  const resistances = replayState.manualLevels
    .filter((level) => level.price >= current)
    .sort((a, b) => a.price - b.price);
  return { support: supports[0] || null, resistance: resistances[0] || null };
}

function selectedManualLevel() {
  return replayState.manualLevels.find((level) => level.id === replayState.selectedLevelId) || null;
}

function createLevelId(prefix = "level") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function manualLevelType(level) {
  const current = currentReplayCandle()?.close || 0;
  return level && level.price <= current ? "support" : "resistance";
}

function syncManualLevelInputs() {
  const nearest = nearestManualLevels();
  const supportInput = document.querySelector("#replaySupport");
  const resistanceInput = document.querySelector("#replayResistance");
  const supportReason = document.querySelector("#replaySupportReason");
  const resistanceReason = document.querySelector("#replayResistanceReason");
  const selectedReason = document.querySelector("#selectedLevelReason");
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
}

function updateLevelToolUi() {
  document.querySelector("#drawLevelLine")?.classList.toggle("active", replayState.drawingLevel);
  const selected = selectedManualLevel();
  document.querySelector("#selectedLevelTools")?.classList.toggle("hidden", !selected);
  const info = document.querySelector("#activeLevelInfo");
  if (!info) return;
  if (replayState.drawingLevel) {
    info.textContent = "画线模式：点击价格区域添加一条线";
  } else if (selected) {
    const typeText = manualLevelType(selected) === "support" ? "支撑" : "压力";
    info.textContent = `已选中${typeText}线 ${formatPrice(selected.price)}，可删除或写入原因`;
  } else {
    info.textContent = "正常浏览：可拖动画布、上下键缩放";
  }
}

function updateReplayCurrentDate() {
  const node = document.querySelector("#replayCurrentDate");
  if (!node) return;
  const candle = currentReplayCandle();
  node.textContent = replayState.blindMode && candle ? "日期已隐藏" : candle?.date || "--";
}

function drawReplayChart() {
  const canvas = document.querySelector("#replayChart");
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
    ctx.fillText("等待加载K线数据", 24, 40);
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
    const boxX = 52;
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
  ctx.fillStyle = "#17202a";
  ctx.font = "12px Microsoft YaHei, sans-serif";
  ctx.fillText(`${last.date}  O:${formatPrice(last.open)} H:${formatPrice(last.high)} L:${formatPrice(last.low)} C:${formatPrice(last.close)}`, 48, height - 20);
  if (replayState.dragOffset > 0) {
    ctx.fillStyle = "#647284";
    ctx.textAlign = "right";
    ctx.fillText(`查看历史窗口：${candles[0].date} 至 ${last.date}`, width - 24, height - 20);
    ctx.textAlign = "left";
  }
}

function updateReplayHover(event) {
  if (!replayState.data) return;
  if (replayState.isDragging) return;
  const canvas = document.querySelector("#replayChart");
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
  const canvas = document.querySelector("#replayChart");
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
  document.querySelector("#replayChart")?.classList.add("dragging");
}

function dragReplayChart(event) {
  if (replayState.draggingLevelId) {
    const canvas = document.querySelector("#replayChart");
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
  const canvas = document.querySelector("#replayChart");
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
    }
    replayState.draggingLevelId = null;
    document.querySelector("#replayChart")?.classList.remove("dragging");
    return;
  }
  if (!replayState.isDragging) return;
  replayState.isDragging = false;
  document.querySelector("#replayChart")?.classList.remove("dragging");
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
  const canvas = document.querySelector("#replayChart");
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
      const level = {
        id: createLevelId("manual"),
        price: Math.max(0.01, scale.priceAtY(canvasY)),
        reason: "",
      };
      replayState.manualLevels.push(level);
      replayState.selectedLevelId = level.id;
      replayState.drawingLevel = false;
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
  replayState.manualLevels = replayState.manualLevels.filter((level) => level.id !== selected.id);
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  updateLevelToolUi();
  refreshReplayAdviceFromLevels({ resetFeedback: true });
  setStatus("#replayStatus", "已删除选中的支撑压力线。", "neutral");
}

function saveSelectedLevelReason() {
  const selected = selectedManualLevel();
  if (!selected) {
    setStatus("#replayStatus", "请先在画布上选中一条支撑压力线。", "negative");
    return;
  }
  const reasonInput = document.querySelector("#selectedLevelReason");
  selected.reason = reasonInput?.value.trim() || "";
  replayState.drawingLevel = false;
  replayState.selectedLevelId = null;
  updateLevelToolUi();
  refreshReplayAdviceFromLevels();
  setStatus("#replayStatus", selected.reason ? "已写入选中线的画线原因。" : "已清空选中线的画线原因。", "positive");
}

function autoLevelHistory() {
  const daily = replayState.data?.timeframes?.daily || [];
  if (!daily.length) return [];
  return daily.slice(0, replayState.cursor + 1).slice(-700);
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
  if (!candle || candles.length < 80) {
    if (!silent) setStatus("#replayStatus", "可用K线太少，暂时无法自动画线。", "negative");
    return;
  }
  const currentPrice = candle.close;
  const points = [
    ...autoLevelSwings(candles, 4),
    ...autoLevelBodyZones(candles, 0.012),
  ];
  const clusters = clusterAutoLevels(points, currentPrice, 0.018)
    .filter((level) => Math.abs(level.price - currentPrice) / currentPrice <= 0.35);
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
      reason: level.reason,
      auto: true,
    });
    addedCount += 1;
  });
  replayState.manualLevels = replayState.manualLevels.sort((a, b) => a.price - b.price);
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  syncManualLevelInputs();
  updateLevelToolUi();
  updateReplayUi();
  const supportText = supportLine ? `支撑 ${formatPrice(supportLine.price)}` : "下方支撑未找到";
  const resistanceText = resistanceLine ? `压力 ${formatPrice(resistanceLine.price)}` : "上方压力未找到";
  const message = `自动线已更新：${supportText}，${resistanceText}。${addedCount ? `本次补齐 ${addedCount} 条。` : "无需新增。"}可继续拖动、删除或写原因。`;
  if (!silent) setStatus("#replayStatus", message, "positive");
  return { addedCount, supportLine, resistanceLine, message };
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

function ruleRiskRewardLine(candle, supportPrice, resistancePrice, fallbackStop = null) {
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
    text: `止损 ${formatPrice(stopPrice)}，压力 ${formatPrice(resistancePrice)}，盈亏比 ${ratio.toFixed(2)}${ratio >= 3 ? "，满足规则库要求。" : "，暂未达到3以上。"}`
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
      stage: "等待更多K线",
      model: "AI建议",
      matched: ["开始训练后显示模型匹配。"],
      missing: ["需要先加载足够的K线。"],
      plan: ["继续推进训练，等待规则库形成可判断的价格结构。"],
    };
  }
  const recent = history.slice(-30);
  const prev = history.at(-2);
  const last20 = history.slice(-20);
  const last60 = history.slice(-60);
  const last120 = history.slice(-120);
  const ma5 = average(history.slice(-5), (item) => item.close);
  const ma10 = average(history.slice(-10), (item) => item.close);
  const ma20 = average(history.slice(-20), (item) => item.close);
  const ma60 = average(history.slice(-60), (item) => item.close);
  const ma120 = average(history.slice(-120), (item) => item.close);
  const high20 = Math.max(...last20.slice(0, -1).map((item) => item.high));
  const low20 = Math.min(...last20.map((item) => item.low));
  const high60 = Math.max(...last60.map((item) => item.high));
  const low60 = Math.min(...last60.map((item) => item.low));
  const high120 = Math.max(...last120.map((item) => item.high));
  const nearest = nearestManualLevels();
  const support = nearest.support;
  const resistance = nearest.resistance;
  const supportPrice = support?.price || null;
  const resistancePrice = resistance?.price || null;
  const nearSupport = supportPrice ? Math.abs(candle.close - supportPrice) / candle.close <= 0.035 : false;
  const brokeSupport = supportPrice ? recent.slice(0, -1).some((item) => item.low < supportPrice * 0.995) : false;
  const reclaimedSupport = supportPrice ? candle.low < supportPrice && candle.close > supportPrice : false;
  const bullish = candle.close > candle.open;
  const shrinkVolume = history.length >= 25 && candle.volume < average(history.slice(-20), (item) => item.volume);
  const breakout20 = candle.close > high20;
  const bigDrop = high60 > 0 && (high60 - low20) / high60 >= 0.18;
  const twoUp = prev && prev.close > prev.open && bullish && candle.close > prev.close;
  const upStructure = candle.close > ma20 && ma5 >= ma10 && ma10 >= ma20;
  const weakStructure = candle.close < ma20 && ma5 < ma10;
  const longUpper = candle.high > Math.max(candle.open, candle.close) * 1.04;
  const bigBear = candle.close < candle.open && (candle.open - candle.close) / candle.open >= 0.04;
  const nearResistance = resistancePrice ? Math.abs(resistancePrice - candle.close) / candle.close <= 0.04 : false;
  const riskReward = ruleRiskRewardLine(candle, supportPrice, resistancePrice);
  const riskRewardScore = riskReward?.ratio == null ? 0 : riskReward.ratio >= 3 ? 8 : -12;
  const longDrawdown = high120 > 0 && (high120 - candle.close) / high120 >= 0.25;
  const recoveryAttempt = candle.close > ma20 || twoUp || reclaimedSupport || breakout20;

  let stage = "盘整结构，等待区间边界确认";
  if (upStructure) stage = "上升趋势回调/延续观察";
  if (weakStructure) stage = "弱势结构，只做反弹模型";
  if (bigDrop && !upStructure) stage = "急跌后修复观察";
  if (longDrawdown && recoveryAttempt && candle.close >= ma20) stage = "长期下跌后尝试趋势扭转";
  if (upStructure && high60 > 0 && (high60 - candle.close) / high60 >= 0.12) stage = "上升趋势中的大调整，等待踩稳确认";

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
        positionReturn == null ? "" : `当前这笔收益率：${formatPercent(positionReturn)}`,
        resistancePrice ? `上方压力：${formatPrice(resistancePrice)}，接近后观察是否转弱。` : "未画出上方压力，可补充止盈观察位。",
      ], [
        "继续确认买入依据是否仍然有效",
        supportPrice ? "" : "缺少下方支撑或移动止盈依据",
      ], [
        "继续持仓观察，不主动加仓。",
        "若跌破5日线、买入依据或关键支撑，优先执行保护。",
        supportPrice ? `下方支撑：${formatPrice(supportPrice)}，跌破需重新评估持仓依据。` : "未画出下方支撑，可补充移动止盈依据。",
      ], "sell");
    }
  }
  if (nearSupport && bullish) {
    add("支撑验证买入模型", 62 + (shrinkVolume ? 10 : 0) + riskRewardScore, [
      supportPrice ? `价格接近关键支撑 ${formatPrice(supportPrice)}` : "价格接近手动画出的支撑区域",
      "支撑上方出现阳线或向上反应",
      riskReward?.ratio >= 3 ? "止损到上方压力的盈亏比满足3以上" : "",
    ], [
      shrinkVolume ? "" : "还需要回踩缩量",
      "还需要再次确认支撑不被有效跌破",
    ], [
      "若下一根K线继续站稳支撑上方，可考虑买入。",
      "止损放在支撑下沿或确认K线实体下沿。",
      riskReward?.text || "",
    ], "buy");
  }
  if (supportPrice && (reclaimedSupport || (brokeSupport && candle.close > supportPrice && bullish))) {
    add("跌破支撑后快速拉回模型", 78 + (shrinkVolume ? 8 : 0) + riskRewardScore, [
      `跌破关键支撑 ${formatPrice(supportPrice)} 后快速收回`,
      "收盘重新回到支撑上方",
      "止损距离相对较小",
      riskReward?.ratio >= 3 ? "上方压力空间满足盈亏比要求" : "",
    ], [
      shrinkVolume ? "" : "还需要再次回踩支撑不破，或出现缩量企稳",
      resistancePrice ? "" : "缺少上方压力，暂无法判断固定止盈空间",
    ], [
      "若下一根K线站稳支撑上方，可考虑买入。",
      "止损放在拉回K线实体下沿，或支撑下沿。",
      resistancePrice && riskReward?.ratio !== null && riskReward.ratio < 3 ? "若上方压力空间不足，放弃。" : "",
      riskReward?.text || "",
    ], "buy");
  }
  if (breakout20 && bullish) {
    const breakoutRisk = ruleRiskRewardLine(candle, supportPrice, resistancePrice, Math.min(candle.open, candle.close));
    add("平台/交易密集区突破模型", 72 + (breakoutRisk?.ratio >= 3 ? 6 : 0), [
      "当前突破近20日交易区间上沿",
      "突破K线收阳",
      `近期突破参考价：${formatPrice(high20)}`,
    ], [
      "还需要突破后回踩不破确认",
      supportPrice ? "" : "缺少可参考的下方支撑线",
    ], [
      "不追高，优先等待回踩平台上沿不破。",
      "止损参考平台下沿或突破K线实体下沿。",
      "若离支撑太远，先观望等待回踩。",
      breakoutRisk?.text || "",
    ], "buy");
  }
  if (bigDrop && twoUp) {
    add("急跌后快速修复模型", 70, [
      "前期出现快速急跌",
      "当前出现连续两天上涨或快速修复",
    ], [
      "还需要形成小平台或关键支撑",
      "反弹模型不能按趋势仓位处理",
    ], [
      "只按超跌反弹计划处理，仓位保持克制。",
      "止损必须贴近修复K线或小平台下沿。",
      "接近压力后要优先考虑止盈。",
    ], "buy");
  }
  if (replayState.position && (nearResistance || longUpper || bigBear || candle.close < ma5)) {
    add("卖出/止盈风险模型", 86, [
      nearResistance && resistancePrice ? `价格接近压力 ${formatPrice(resistancePrice)}` : "",
      candle.close < ma5 ? "跌破5日线" : "",
      longUpper || bigBear ? "出现上引线或阴线转弱" : "",
    ], [
      "需要确认是否跌破买入依据或移动止盈位",
    ], [
      "优先检查移动止盈，保护当前利润。",
      nearResistance && resistancePrice ? `接近压力：${formatPrice(resistancePrice)}` : "",
      longUpper || bigBear ? "若下一根继续转弱，可考虑卖出或减仓。" : "",
    ], "sell");
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
      model: replayState.position ? "暂无卖出触发模型" : "暂无买入触发模型",
      matched: [
        replayState.position ? "当前持仓中，尚未形成明确卖出触发。" : "当前空仓中，尚未形成完整买入触发。",
        supportPrice ? `下方支撑：${formatPrice(supportPrice)}` : "可先画出最近支撑线。",
        resistancePrice ? `上方压力：${formatPrice(resistancePrice)}` : "可补充上方压力线。",
      ].filter(Boolean),
      missing: [
        replayState.position ? "缺少跌破买入依据、压力转弱或移动止盈触发。" : "缺少支撑验证、跌破拉回或平台突破。",
        supportPrice ? "" : "缺少手动画出的关键支撑。",
        resistancePrice ? "" : "缺少手动画出的上方压力。",
      ].filter(Boolean),
      plan: [
        replayState.position ? "继续按持仓管理观察，不因买入模型再次加仓。" : "优先观望，等待结构更完整。",
        replayState.position ? "若出现跌破5日线、跌破买入依据或压力位转弱，再考虑卖出。" : riskReward?.text || "",
        replayState.position ? "" : "离支撑太远或压力太近时，不追。",
      ].filter(Boolean),
    };
  }
  sideCandidates.sort((a, b) => b.score - a.score);
  const best = sideCandidates[0];
  let action = "watch";
  let actionText = "建议观望";
  if (side === "buy") {
    const hasBlockingRiskReward = best.plan.some((item) => item.includes("空间不足") || item.includes("暂未达到3以上"));
    const confirmationMissing = best.missing.length > 0;
    if (best.score >= 80 && !hasBlockingRiskReward && !confirmationMissing) {
      action = "buy";
      actionText = "建议买入";
    } else if (best.score >= 72 && !hasBlockingRiskReward) {
      action = "watch";
      actionText = "建议观望";
      best.plan = ["接近买入模型，但仍需等待确认后再执行。", ...best.plan];
    }
  } else {
    if (best.model.includes("卖出") && best.score >= 75) {
      action = "sell";
      actionText = "建议卖出";
    } else {
      action = "hold_position";
      actionText = "继续持有";
    }
  }
  return { side, sideLabel, action, actionText, stage, ...best };
}

function renderRuleAdvice() {
  const stageNode = document.querySelector("#ruleAdviceStage");
  const scoreNode = document.querySelector("#ruleAdviceScore");
  const sideNode = document.querySelector("#ruleAdviceSide");
  const bodyNode = document.querySelector("#ruleAdviceBody");
  if (!stageNode || !scoreNode || !bodyNode) return;
  const advice = ruleLibraryAdvice();
  stageNode.textContent = advice.stage || "--";
  scoreNode.textContent = advice.score == null ? "--" : `${Math.round(advice.score)}分`;
  scoreNode.className = advice.score >= 75 ? "positive-text" : advice.score >= 60 ? "" : "negative-text";
  if (sideNode) {
    sideNode.textContent = advice.sideLabel || (advice.side === "sell" ? "卖出管理" : "买入观察");
    sideNode.classList.toggle("sell", advice.side === "sell");
  }
  const listHtml = (items = []) => {
    if (!items.length) return `<p class="muted">暂无</p>`;
    return `<ol>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`;
  };
  bodyNode.innerHTML = `
    <div class="rule-action-card ${escapeHtml(advice.action || "watch")}">
      <span>操作建议</span>
      <strong>${escapeHtml(advice.actionText || "建议观望")}</strong>
    </div>
    <div class="rule-advice-section">
      <span>当前状态</span>
      <p>${escapeHtml(advice.sideLabel || "--")}</p>
    </div>
    <div class="rule-advice-section">
      <span>当前阶段</span>
      <p>${escapeHtml(advice.stage || "--")}</p>
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
      ${listHtml(advice.plan || [])}
    </div>
  `;
}

function setAiAdviceFeedback(value) {
  replayState.aiAdviceFeedback = value;
  updateAiAdviceFeedbackUi();
}

function resetAiAdviceFeedback() {
  replayState.aiAdviceFeedback = null;
  const reasonInput = document.querySelector("#aiDisagreeReason");
  if (reasonInput) reasonInput.value = "";
  updateAiAdviceFeedbackUi();
}

function updateAiAdviceFeedbackUi() {
  const feedback = replayState.aiAdviceFeedback;
  document.querySelectorAll(".ai-feedback-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.aiFeedback === feedback);
    button.setAttribute("aria-pressed", String(button.dataset.aiFeedback === feedback));
  });
  document.querySelector("#aiDisagreeReasonWrap")?.classList.toggle("hidden", feedback !== "rejected");
}

function currentAiAdviceSnapshot() {
  const advice = ruleLibraryAdvice();
  return {
    side: advice.side || "",
    sideLabel: advice.sideLabel || "",
    action: advice.action || "",
    actionText: advice.actionText || "",
    stage: advice.stage || "",
    model: advice.model || "",
    score: advice.score == null ? null : Math.round(advice.score),
    matched: advice.matched || [],
    missing: advice.missing || [],
    plan: advice.plan || [],
  };
}

function refreshReplayAdviceFromLevels({ resetFeedback = false } = {}) {
  syncManualLevelInputs();
  renderRuleAdvice();
  drawReplayChart();
  if (resetFeedback) resetAiAdviceFeedback();
}

function updateReplayUi() {
  const candle = currentReplayCandle();
  syncManualLevelInputs();
  const entryPrice = Number(replayState.position?.entryPrice) || null;
  const hasPosition = Boolean(entryPrice && replayState.position);
  const currentReturn = hasPosition && candle ? ((candle.close - entryPrice) / entryPrice) * 100 : null;
  const totalReturn = ((replayState.equity || 1) - 1) * 100;
  document.querySelector("#replayTitle").textContent = replayState.data
    ? `${replayState.blindMode ? "盲选样本" : replayState.data.symbol} 回放训练`
    : "等待开始";
  updateReplayCurrentDate();
  document.querySelector("#replayClose").textContent = candle ? formatPrice(candle.close) : "--";
  document.querySelector("#replayEntryPrice").textContent = hasPosition ? formatPrice(entryPrice) : "空仓";
  const returnNode = document.querySelector("#replayReturn");
  returnNode.textContent = currentReturn === null ? "--" : `${currentReturn.toFixed(2)}%`;
  returnNode.className = currentReturn === null ? "" : currentReturn >= 0 ? "positive-text" : "negative-text";
  const totalReturnNode = document.querySelector("#replayTotalReturn");
  totalReturnNode.textContent = `${totalReturn.toFixed(2)}%`;
  totalReturnNode.className = totalReturn === 0 ? "" : totalReturn > 0 ? "positive-text" : "negative-text";
  updateReplayBlindUi();
  document.querySelector("#replayBuy").disabled = !replayState.data || Boolean(replayState.position);
  document.querySelector("#replaySell").disabled = !replayState.data || !replayState.position;
  document.querySelector("#replayHold").disabled = !replayState.data;
  updateReplayWriteToggle();
  updateReplayDecisionMode();
  updateAiAdviceFeedbackUi();
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
}

function replayPayload(action, reason, note, shouldWrite = replayState.writeTraining) {
  const candle = currentReplayCandle();
  const stopLoss = Number(document.querySelector("#replayStopLoss").value) || null;
  const stopLossReason = document.querySelector("#replayStopLossReason").value.trim();
  const aiAdviceSnapshot = currentAiAdviceSnapshot();
  const aiAdviceFeedback = replayState.aiAdviceFeedback;
  const aiAdviceDisagreeReason = document.querySelector("#aiDisagreeReason")?.value.trim() || "";
  syncManualLevelInputs();
  const nearest = nearestManualLevels();
  const support = Number(document.querySelector("#replaySupport").value) || null;
  const resistance = Number(document.querySelector("#replayResistance").value) || null;
  return {
    symbol: replayState.data.symbol,
    sessionId: replayState.sessionId,
    trainingStartDate: replayState.trainingStartDate || replayState.data.startDate,
    action,
    date: candle.date,
    price: candle.close,
    timeframe: replayState.frame,
    structure: document.querySelector("#replayStructure").value.trim(),
    support,
    resistance,
    supportEvidence: support ? "manual_line" : "",
    resistanceEvidence: resistance ? "manual_line" : "",
    supportReason: nearest.support?.reason || "",
    resistanceReason: nearest.resistance?.reason || "",
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
    aiAdviceAccepted: aiAdviceFeedback === "accepted" ? true : aiAdviceFeedback === "rejected" ? false : null,
    aiAdviceDisagreeReason,
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
  const buyReason = document.querySelector("#replayBuyReason").value.trim();
  const stopLoss = Number(document.querySelector("#replayStopLoss").value) || 0;
  const stopLossReason = document.querySelector("#replayStopLossReason").value.trim();
  const sellReason = document.querySelector("#replaySellReason").value.trim();
  const holdNote = document.querySelector("#replayHoldNote").value.trim();
  const aiAdviceFeedback = replayState.aiAdviceFeedback;
  const aiAdviceDisagreeReason = document.querySelector("#aiDisagreeReason")?.value.trim() || "";
  if (action === "buy" && !buyReason) {
    setStatus("#replayStatus", "买入前需要填写买入理由。", "negative");
    return;
  }
  if (action === "buy" && stopLoss <= 0) {
    setStatus("#replayStatus", "买入前需要填写止损价格。", "negative");
    return;
  }
  if (action === "buy" && !stopLossReason) {
    setStatus("#replayStatus", "买入前需要填写止损原因。", "negative");
    return;
  }
  if (action === "sell" && !sellReason) {
    setStatus("#replayStatus", "卖出前需要填写卖出理由。", "negative");
    return;
  }
  const reason = action === "buy" ? buyReason : action === "sell" ? sellReason : "观望";
  const note = action === "hold" ? holdNote : reason;
  const shouldWrite = shouldWriteReplayDecision(action, note);
  if (shouldWrite && !aiAdviceFeedback) {
    setStatus("#replayStatus", "写入真实训练前需要选择是否认可AI建议。", "negative");
    return;
  }
  if (shouldWrite && aiAdviceFeedback === "rejected" && !aiAdviceDisagreeReason) {
    setStatus("#replayStatus", "不认可AI建议时需要填写原因。", "negative");
    return;
  }
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
  replayState.log.push({ action, label: replayActionLabel(action), date: candle.date, price: candle.close, reason, note, stopLoss: action === "buy" ? stopLoss : null, stopLossReason: action === "buy" ? stopLossReason : "", equity: replayState.equity || 1 });
  replayState.selectedNoteDate = note ? candle.date : null;
  if (action === "buy") {
    document.querySelector("#replayBuyReason").value = "";
    document.querySelector("#replayStopLoss").value = "";
    document.querySelector("#replayStopLossReason").value = "";
  }
  if (action === "sell") document.querySelector("#replaySellReason").value = "";
  if (action === "hold") document.querySelector("#replayHoldNote").value = "";
  resetAiAdviceFeedback();
  replayState.cursor += 1;
  const daily = replayState.data.timeframes.daily;
  if (replayState.cursor >= daily.length) {
    replayState.cursor = daily.length - 1;
    setStatus("#replayStatus", "已经到达最后一根K线。", "neutral");
  } else {
    replayState.dragOffset = 0;
    const actionText = action === "buy" ? "买入" : action === "sell" ? "卖出" : "观望";
    const message = replayState.writeTraining && action === "hold" && !note
      ? "空备注观望不写入训练集，已进入下一根K线。"
      : `${shouldWrite ? "已写入" : "测试记录"}${actionText}，进入下一根K线。`;
    setStatus("#replayStatus", message, shouldWrite ? "positive" : "neutral");
  }
  updateReplayUi();
}

async function loadTradeReplay({ button, symbol, date, blind = false, loadingText = "正在加载...", sessionId = null, fresh = false, throwOnError = false }) {
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
        date,
        lookback: 700,
        fresh,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "回放数据加载失败。");
    replayState = {
      data,
      frame: "daily",
      cursor: data.cursor,
      position: null,
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
      blindSymbol: symbol,
      blindDate: date,
      drawingLevel: false,
      manualLevels: [],
      selectedLevelId: null,
      draggingLevelId: null,
      lastLevelHitId: null,
      suppressNextCanvasClick: false,
      trainingRecords: replayState.trainingRecords || [],
      sessionId: sessionId || createTrainingSessionId(symbol, data.startDate),
      trainingStartDate: data.startDate,
      aiAdviceFeedback: null,
    };
    document.querySelectorAll(".timeframe-button").forEach((item) => item.classList.toggle("active", item.dataset.frame === "daily"));
    const historyCount = data.availableHistory || data.cursor + 1;
    const requestedLookback = data.requestedLookback || 700;
    const historyMessage = historyCount >= requestedLookback
      ? `已加载当前日前${requestedLookback}根K线。`
      : `当前日期前只有${historyCount}根可用K线，已加载此前全部可用K线。`;
    updateReplayUi();
    const autoResult = autoDrawLevelLines({ silent: true });
    const autoMessage = autoResult ? "已自动画出当前上下关键线。" : "自动画线未找到足够可靠的位置。";
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
  replayState.blindMode = false;
  const symbol = document.querySelector("#replaySymbol").value.trim();
  const date = document.querySelector("#replayDate").value;
  await loadTradeReplay({ button: document.querySelector("#startReplay"), symbol, date, blind: false });
}

async function startBlindTradeReplay() {
  const button = document.querySelector("#startBlindReplay");
  const previousText = button.textContent;
  try {
    button.disabled = true;
    let lastError = null;
    const maxAttempts = 20;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        button.textContent = `正在抽取 ${attempt}/${maxAttempts}`;
        setStatus("#replayStatus", `正在随机抽取股票和时间，第 ${attempt} 次...`, "neutral");
        const response = await fetch(apiUrl("/api/random-training-sample"));
        const sample = await response.json();
        if (!response.ok) throw new Error(sample.error || "随机样本获取失败。");
        replayState.blindMode = true;
        replayState.blindSymbol = sample.symbol;
        replayState.blindDate = sample.date;
        updateReplayBlindUi();
        document.querySelector("#replaySymbol").value = sample.symbol;
        document.querySelector("#replayDate").value = sample.date;
        await loadTradeReplay({ button, symbol: sample.symbol, date: sample.date, blind: true, loadingText: "正在加载...", fresh: Boolean(sample.fresh), throwOnError: true });
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
  activeView = view;
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelector("#strategyView").classList.toggle("hidden", view === "training" || view === "replay" || view === "dataset");
  document.querySelector("#trainingView").classList.toggle("hidden", view !== "training");
  document.querySelector("#replayView").classList.toggle("hidden", view !== "replay");
  document.querySelector("#datasetView")?.classList.toggle("hidden", view !== "dataset");
  if (view === "buy" || view === "sell") {
    activeStrategy = view;
    syncStrategyControls();
    render();
  } else if (view === "training") {
    output.marketState.textContent = "支撑压力训练";
  } else if (view === "replay") {
    output.marketState.textContent = "交易思维训练";
    updateReplayUi();
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

function setDefaultTrainingDate() {
  const input = document.querySelector("#trainDate");
  if (input && !input.value) input.value = previousTradingDateString();
}

function setDefaultBuyDate() {
  const input = document.querySelector("#buyDate");
  if (input && !input.value) input.value = previousTradingDateString();
}

function setDefaultReplayDate() {
  const input = document.querySelector("#replayDate");
  if (input && !input.value) input.value = previousTradingDateString();
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
    if (!options.symbol || !options.date) throw new Error("请填写股票代码和分析日期。");
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
    document.querySelector("#trainingTitle").textContent = `${sample.symbol}：${sample.date}，正在计算支撑压力`;
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
  });
});
document.addEventListener("click", (event) => {
  if (event.target.closest(".stock-search-label")) return;
  hideStockSearchResults();
});
document.querySelector("#autoLevelLines")?.addEventListener("click", autoDrawLevelLines);
document.querySelector("#drawLevelLine")?.addEventListener("click", () => {
  replayState.drawingLevel = !replayState.drawingLevel;
  updateLevelToolUi();
});
document.querySelector("#clearLevelLines")?.addEventListener("click", () => {
  replayState.manualLevels = [];
  replayState.selectedLevelId = null;
  replayState.drawingLevel = false;
  updateLevelToolUi();
  refreshReplayAdviceFromLevels({ resetFeedback: true });
  setStatus("#replayStatus", "已清空画布上的支撑压力线。", "neutral");
});
document.querySelector("#deleteSelectedLevel")?.addEventListener("click", deleteSelectedLevel);
document.querySelector("#saveSelectedLevelReason")?.addEventListener("click", saveSelectedLevelReason);
document.querySelector("#replayBuy")?.addEventListener("click", () => saveReplayDecision("buy"));
document.querySelector("#replaySell")?.addEventListener("click", () => saveReplayDecision("sell"));
document.querySelector("#replayHold")?.addEventListener("click", () => saveReplayDecision("hold"));
document.querySelectorAll(".ai-feedback-button").forEach((button) => {
  button.addEventListener("click", () => setAiAdviceFeedback(button.dataset.aiFeedback));
});
document.querySelector("#refreshTrainingRecords")?.addEventListener("click", loadTrainingRecords);
document.querySelector("#trainingRecordList")?.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  if (button.dataset.action === "toggle-actions") toggleDatasetActions(button.dataset.id, button);
  if (button.dataset.action === "restore") restoreTrainingRecord(button.dataset.id);
  if (button.dataset.action === "delete") deleteTrainingRecord(button.dataset.id);
});
document.querySelectorAll(".timeframe-button").forEach((button) => {
  button.addEventListener("click", () => {
    replayState.frame = button.dataset.frame;
    replayState.dragOffset = 0;
    replayState.hoverIndex = null;
    replayState.hoverY = null;
    replayState.selectedNoteDate = null;
    document.querySelectorAll(".timeframe-button").forEach((item) => item.classList.toggle("active", item === button));
    updateReplayUi();
  });
});
["#replaySupport", "#replayResistance"].forEach((selector) => {
  document.querySelector(selector)?.addEventListener("input", () => refreshReplayAdviceFromLevels({ resetFeedback: true }));
});
document.querySelector("#replayChart")?.addEventListener("mousemove", updateReplayHover);
document.querySelector("#replayChart")?.addEventListener("mousedown", startReplayDrag);
document.addEventListener("mousemove", dragReplayChart);
document.addEventListener("mouseup", endReplayDrag);
window.addEventListener("blur", endReplayDrag);
document.querySelector("#replayChart")?.addEventListener("click", selectReplayAnnotation);
document.querySelector("#replayChart")?.addEventListener("mouseleave", clearReplayHover);
document.addEventListener("keydown", (event) => {
  if (activeView !== "replay") return;
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
syncStrategyControls();
setView("replay");
updateLevelToolUi();
updateReplayUi();
loadTrainingRecords();
