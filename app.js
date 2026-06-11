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
  trendLabel: document.querySelector("#trendLabel"),
  marketState: document.querySelector("#marketState"),
};

const canvas = document.querySelector("#signalChart");
const ctx = canvas.getContext("2d");
let activeStrategy = "buy";
let activeView = "buy";

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

function render() {
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
  output.trendLabel.textContent = trendText;
  output.marketState.textContent = `${activeStrategy === "buy" ? "买入" : "卖出"}评分 ${analysis.score}`;
  updateDecisionStyle(type);
  renderSignals(analysis.signals);
  drawChart(data);
}

function setView(view) {
  activeView = view;
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.view === view;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });
  document.querySelector("#strategyView").classList.toggle("hidden", view === "training");
  document.querySelector("#trainingView").classList.toggle("hidden", view !== "training");
  if (view === "buy" || view === "sell") {
    activeStrategy = view;
    render();
  } else {
    output.marketState.textContent = "支撑压力训练";
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

function getTrainingOptions() {
  return {
    symbol: document.querySelector("#trainSymbol").value.trim(),
    date: document.querySelector("#trainDate").value,
    years: 3,
    clusterPct: Number(document.querySelector("#clusterPct").value) / 100,
    bodyBinPct: Number(document.querySelector("#bodyBinPct").value) / 100,
    swingWindow: Number(document.querySelector("#swingWindow").value),
    reactionPct: Number(document.querySelector("#reactionPct").value) / 100,
    corrections: parseCorrections(document.querySelector("#correctionsInput").value),
  };
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
  const previousText = button.textContent;
  try {
    const options = getTrainingOptions();
    if (!options.symbol || !options.date) throw new Error("请填写股票代码和分析日期。");
    button.disabled = true;
    button.textContent = "正在拉取真实数据...";
    document.querySelector("#trainingTitle").textContent = "正在拉取 AKShare 周线数据";
    const response = await fetch("/api/train-support-resistance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "真实数据训练失败。");
    renderServerTrainingResult(data);
  } catch (error) {
    document.querySelector("#trainingTitle").textContent = "训练失败";
    document.querySelector("#levelTable").innerHTML = `<div class="decision negative"><span class="decision-level">真实数据接口有问题</span><p>${error.message}</p></div>`;
  } finally {
    button.disabled = false;
    button.textContent = previousText;
  }
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
  const sourceLabel = (source) => ({ body_cluster: "实体密集区", swing_cluster: "波段聚类" }[source] || source);
  document.querySelector("#trainingTitle").textContent = `${document.querySelector("#trainSymbol").value}：${result.trainingStart} 至 ${result.trainingEnd}，共 ${result.weeks} 周`;
  document.querySelector("#trainCurrentPrice").textContent = formatPrice(result.currentPrice);
  document.querySelector("#trainSupport").textContent = result.nearest?.support ? `${formatPrice(result.nearest.support.low)} - ${formatPrice(result.nearest.support.high)}` : "--";
  document.querySelector("#trainResistance").textContent = result.nearest?.resistance ? `${formatPrice(result.nearest.resistance.low)} - ${formatPrice(result.nearest.resistance.high)}` : "--";
  document.querySelector("#fitError").textContent = result.fitError === null ? "未输入纠正价格" : `拟合误差 ${(result.fitError * 100).toFixed(2)}%`;
  document.querySelector("#weightGrid").innerHTML = Object.entries(result.weights || {}).map(([key, value]) => {
    const label = { swing: "历史高低点", recent: "近期验证", body: "实体密集区", recency: "时间近度" }[key] || key;
    return `<div><span>${label}</span><strong>${Math.round(value * 100)}%</strong></div>`;
  }).join("");
  document.querySelector("#levelTable").innerHTML = levels.slice(0, 10).map((level) => `
    <article class="level-row ${level.type}">
      <div><strong>${level.type === "support" ? "支撑" : "压力"} ${formatPrice(level.low)} - ${formatPrice(level.high)}</strong><p>${level.sources.map(sourceLabel).join(" / ")}，触碰 ${level.touches} 次</p></div>
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

document.querySelector("#loadSample").addEventListener("click", () => loadSample());
document.querySelector("#trainingSample").addEventListener("click", () => {
  document.querySelector("#trainSymbol").value = "000001";
  document.querySelector("#trainDate").value = "2025-06-11";
  document.querySelector("#weeklyCsvInput").value = sampleWeeklyCsv;
  document.querySelector("#correctionsInput").value = "support: 29.6\nresistance: 31.8";
  runTraining();
});
document.querySelector("#runTraining").addEventListener("click", runTraining);
document.querySelector("#fetchRealTraining").addEventListener("click", fetchRealTraining);
document.querySelector("#weeklyCsvInput").value = sampleWeeklyCsv;

render();
