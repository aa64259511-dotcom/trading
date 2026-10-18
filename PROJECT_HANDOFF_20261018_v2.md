# AI交易工作台交接文档 v2

更新时间：2026-10-18（Asia/Shanghai）  
项目目录：`C:\Users\admin\Documents\trading advice`  
仓库：https://github.com/aa64259511-dotcom/trading  
本文件：`PROJECT_HANDOFF_20261018_v2.md`（相对上午版 `PROJECT_HANDOFF_20261018.md` 的当日状态补丁）

---

## 1. 项目目的与原则

### 1.1 目的

本地 Web 工作台，用于：

- 行情查看与画线（支撑/压力）
- 交易回放训练与人工标注
- 规则库研究与旁路结构识别
- QMT / 通达信等数据导入与实时桥（历史能力，非本日改动重点）

本日改造主线：在**不改锁定买卖评分**的前提下，旁路接入「周线结构 + 支撑验证状态」，并评估性能；后续再决定是否去周线、是否合并云端 PR。

### 1.2 硬原则（继续遵守）

1. **旁路（bypass）优先**  
   新结构识别、周线、支撑验证、旁路买入资格，先挂在既有规则结果旁边解释/过滤展示，**不要直接改写** `ruleLibraryAdvice` 的锁定分数、模型与动作权重。

2. **禁止未来数据**  
   任意分析日的判断只能用该日及之前可见的 K 线（含周线聚合时的已收盘周）。不得用之后高低点、未来收益参与当日趋势/支撑压力判定。

3. **禁止用 git 清掉本地脏工作**  
   工作区长期有大量未提交修改与未跟踪文件。  
   **禁止** `git reset --hard`、`git checkout -- <file>`、`git clean -fd` 等会丢掉本地改动的命令。  
   需要回退某一批实验时：先拷贝到 `backups/`，再按文件覆盖；不要整库 reset。

4. **人工修正是标签，不是立刻改正式规则**  
   训练标注先入库，结合后续真实行情再统计规则候选；正式改 `trading_rule_library.*` 前需人工确认。

---

## 2. 路径与启动 / 校验命令

### 2.1 关键路径

| 用途 | 路径 |
|------|------|
| 项目根 | `C:\Users\admin\Documents\trading advice` |
| 服务入口 | `server.py`（默认端口 **8765**，`PORT` 环境变量可改） |
| 前端 | `index.html`、`app.js`、`styles.css` |
| 共享策略核 | `strategy-core.js`（由 `build_strategy_core.js` 从 `app.js` 规则源生成） |
| Node 回放 runner | `strategy_node_runner.js`（`server.py` 的 `/api/replay-advice` 每次冷启动调用） |
| 结构回归 | `structure_recognition_check.js` |
| 规则库 | `trading_rule_library.json` / `trading_rule_library.md`（当前 **v2.7**） |
| 行情库 | `market_data.sqlite`（已 gitignore） |
| 备份 | `backups\` |
| Python | `C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` |
| Node | `C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe` |

浏览器：`http://127.0.0.1:8765/`

说明：`restart_server.ps1` 里仍写着 **8766** 与旧校验逻辑，与当前默认不一致；日常请直接用下面的 8765 启动方式，或先核对脚本再改。

### 2.2 启动服务

在项目根目录：

```powershell
cd "C:\Users\admin\Documents\trading advice"
& "C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" server.py
```

或：

```powershell
.\start_server.cmd
```

监听检查：

```powershell
Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq 'Listen' } |
  Select-Object LocalAddress,LocalPort,State,OwningProcess
```

### 2.3 Node 语法检查与重建策略核

修改 `app.js` 中的规则源 / 结构识别函数后，必须同步生成 `strategy-core.js`：

```powershell
$node = "C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
& $node --check app.js
& $node --check strategy-core.js
& $node build_strategy_core.js
& $node structure_recognition_check.js
```

Python 侧（可选）：

```powershell
$py = "C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
& $py -m py_compile server.py support_resistance_trainer.py
```

### 2.4 Git 现状（接手时先看）

```powershell
git status --short
git diff --stat
```

- 分支：`master`（相对 `origin/master` 曾 ahead 1；工作区大量 `M` / `??`）
- 远程：`origin` → `https://github.com/aa64259511-dotcom/trading.git`
- 本地**没有**检出 `cursor/weekly-trend-support-bypass-3f4a`；策略相关文件是手工合并/回滚后的脏树，不是干净 cherry-pick。

---

## 3. 规则库 v2.7 与代码对齐状态

### 3.1 规则库（文档/JSON）

- 版本：**v2.7**（`trading_rule_library.json` 的 `version` 字段；md 标题同）
- 仍包含完整的 **周线趋势结构** 专章（约 md §4「周线趋势结构判断」）、§6.5「与周线结构的关系」、训练字段里的 `weeklyTrend` 等。
- 旁路表述：周线下跌时只允许急跌反弹/筑底类路径；周线偏多时真实支撑 + 盈亏比 ≥ 3R 可作为旁路买入依据——与代码旁路门一致，但**规则库尚未按「去周线」改版**。

### 3.2 本地代码（当前工作区）

已回滚到 **PR#2 第一版能力**：周线结构 + 支撑验证旁路。

文件指纹对齐：`app.js` / `strategy-core.js` / `index.html` / `build_strategy_core.js` / `structure_recognition_check.js` **与** `backups\pr2_followup_20261018_1632\` **一致**。

当前代码里有：

- `evaluateWeeklyTrendStructure` / `dailyToWeeklyCandles`
- `recognizeMarketStructure` 内调用周线评估 + 支撑验证
- `buildBypassBuyGate` / `bypassBuyEligible` / `bypassBuyReason`
- 训练/建议卡展示周线方向、阶段、依据，以及支撑验证状态

当前代码里**没有**（已从工作树拿掉）：

- 人工支撑状态覆盖买入动作的 human gate（如 `humanSupportPath` / `bottomHumanSupportFields`）
- 前端建议缓存（如 `replayAdviceCache`）；训练翻日仍会 **POST `/api/replay-advice`**

### 3.3 云端 PR#2（未合并进本地）

- URL：https://github.com/aa64259511-dotcom/trading/pull/2  
- 分支：`cursor/weekly-trend-support-bypass-3f4a`  
- 状态：open、**draft**；base 为 `cursor/structure-recognition-eb9e`（PR#1），不是 `master`
- HEAD（撰写时）：`ce01f7d7…` — 提交信息为 **Remove the weekly structure bypass**  
  即：云端已在分支上**去掉周线结构**，保留支撑验证旁路；分支上还叠了 human gate 与前端 advice cache（见 PR body），但这些也**没有**合进当前本地树。

PR#2 提交顺序（便于对照备份）：

| 顺序 | 摘要 | 本地对应 |
|------|------|----------|
| 1 | 加周线 + 支撑验证旁路 | ≈ 当前 / `pr2_followup` |
| 2 | 人工支撑状态覆盖买入 | 已回滚；曾在 `pr2_perf` / `pre_rollback*` |
| 3 | 前端缓存，少打 `/api/replay-advice` | 已回滚；曾在 `pre_rollback_20261018_1711`（含 `replayAdviceCache`） |
| 4 | **去掉周线** | 仅在云端 HEAD；**未合入本地** |

相关 PR#1：https://github.com/aa64259511-dotcom/trading/pull/1（结构识别训练层，draft）。

---

## 4. 本地现在能用什么 / 已拿掉 / 待定

### 4.1 本地现在可用

- 原规则库评分与回放训练主流程（`server.py` + 前端）
- 日线结构识别旁路字段（方向/阶段/置信度、支撑压力候选与验证）
- **周线**方向/阶段/强度/依据 + 偏空卖出备注（旁路展示）
- **支撑验证旁路买入门**：真实支撑 + 止损约 3%–8% + 盈亏比 ≥ 3；不改锁定分数
- `node build_strategy_core.js` / `structure_recognition_check.js` 回归路径
- 规则库 v2.7 文档与 JSON（仍写周线）

### 4.2 已从本地拿掉（备份里仍有）

- 人工支撑下拉覆盖「展示/可执行买入」的 human gate
- 前端翻日/换周期建议缓存（避免反复打后端）
- 云端「去周线」那一版代码

### 4.3 待定 / 未做完（含上午交接仍有效的项）

- 是否只合并云端「去周线、留支撑验证」的最小 diff（见 §7）
- 性能方案选型（见 §6–§7）
- 规则库是否出一版「去周线」说明（与代码同步）
- 头肩底自动识别、候选线/当前线分离与冷却、未来收益回填、旁路评估看板等（见旧版 `PROJECT_HANDOFF_20261018.md` §6–§7）

---

## 5. 备份目录（名称与用途）

均在 `backups\`。回滚实验时**先拷后盖**，不要 reset。

| 目录 | 用途 |
|------|------|
| `pr2_merge_20261018_1556` | PR#2 首次合入窗口前后的基线快照（约 15:56）。此包内 `app.js` **尚无** `evaluateWeeklyTrendStructure` / `buildBypassBuyGate`，相当于周线旁路落地前的结构识别树。 |
| `pr2_followup_20261018_1632` | **第一版 PR#2：周线 + 支撑验证旁路**。与**当前工作区策略相关文件一致**；回滚 human/perf 后的恢复点。 |
| `pr2_perf_20261018_1655` | 叠了 human gate 等后续改动后的快照；子目录 `pr_head\` 另存过云端/实验头文件片段。用于对比 perf/人工门实验。 |
| `pre_rollback_20261018_1711` | 执行回滚**之前**的工作树备份（含 human gate + `replayAdviceCache`）。若要捡回前端缓存或人工门，从这里按文件取。 |
| `pre_rollback_to_pr2merge_20261018_1712` | 另一次回滚前快照（特征接近 `pr2_perf`：有 human gate、无 `replayAdviceCache`）。防误覆盖用。 |
| `rule_library_v2.1_20261018_1354` | 规则库旧版（v2.1）md/json 备份，与本日 v2.7 无关时可忽略。 |
| `_parse_002050_*.json` | 当日调试解析样例，非策略版本。 |

恢复示例（只恢复策略五件套到 followup，**不要**整库 reset）：

```powershell
cd "C:\Users\admin\Documents\trading advice"
$src = "backups\pr2_followup_20261018_1632"
Copy-Item "$src\app.js","$src\index.html","$src\build_strategy_core.js","$src\strategy-core.js","$src\structure_recognition_check.js" -Destination . -Force
```

---

## 6. 已知性能问题

两处叠在一起，训练翻日会感觉卡：

1. **`recognizeMarketStructure` 内同步做重活**  
   - 周线聚合 + `evaluateWeeklyTrendStructure`  
   - 支撑/压力聚类与验证路径  
   每次结构识别都跑，成本随历史 K 线长度上升。

2. **强制走 `/api/replay-advice` → 冷启动 Node**  
   - `server.py` 对每次请求 `subprocess.run([node, strategy_node_runner.js], …)`  
   - 无常驻 Node 进程；前端当前仍 `fetch(apiUrl("/api/replay-advice"))`，`cache: "no-store"`  
   - 前端缓存方案曾在 `pre_rollback_20261018_1711` 出现过，但已回滚，故冷启动成本仍在。

排查时注意：慢可能是「周线+验证」算法，也可能是「每次起 Node」；两者要分开测（例如只跑 `node strategy_node_runner.js` 计时 vs 只跑浏览器内 `StrategyCore.analyze`）。

---

## 7. 未决事项（接手优先对齐）

1. **是否只合并「去周线」**  
   云端 PR#2 HEAD 已去掉周线、保留支撑验证。本地若采纳，建议：  
   - 不要整 PR 盲合（分支还含 human gate / 前端 cache，且 base 不是 master）  
   - 从 `ce01f7d7` 或等价 diff **只抽去周线相关 hunk**，在当前 `pr2_followup` 树上手工打补丁  
   - 打完后跑 §2.3 全套检查

2. **下一版性能怎么做**  
   候选（需产品拍板，勿并行乱加）：  
   - 只去周线（减 CPU，仍可能每次冷 Node）  
   - 恢复/重做前端 advice cache（减 HTTP+Node 次数）  
   - 后端常驻 Node 或进程内复用 `strategy-core`（改 `server.py`，影响面更大）  
   - 结构识别懒计算 / 按 symbol+date+levels 缓存

3. **规则库是否改「去周线」版**  
   若代码去周线，v2.7 的周线专章、§6.5、字段 `weeklyTrend`、旁路文案需出一版修订（建议新小版本号），避免文档教周线、UI 已不显示。

---

## 8. GitHub 指针（复制用）

- 仓库：https://github.com/aa64259511-dotcom/trading  
- PR #2：https://github.com/aa64259511-dotcom/trading/pull/2  
- 分支：`cursor/weekly-trend-support-bypass-3f4a`  
- PR #1（结构识别）：https://github.com/aa64259511-dotcom/trading/pull/1  
- 远程分支名（本地曾见）：`remotes/origin/cursor/structure-recognition-eb9e`

---

## 9. 主要文件速查

| 文件 | 说明 |
|------|------|
| `server.py` | HTTP；`PORT` 默认 8765；`/api/replay-advice` 冷起 Node |
| `app.js` | 规则源 + UI；当前含周线与 `buildBypassBuyGate` |
| `build_strategy_core.js` | 从 `app.js` 抽出共享核 → `strategy-core.js` |
| `strategy-core.js` | 浏览器与 Node runner 共用 |
| `strategy_node_runner.js` | stdin JSON → analyze → stdout |
| `structure_recognition_check.js` | 冻结决策与无前瞻回归 |
| `trading_rule_library.md` / `.json` | 规则库 v2.7（仍含周线） |
| `PROJECT_HANDOFF_20261018.md` | 同日上午版（训练/画线/后续步骤更全） |
| `PROJECT_HANDOFF_20261018_v2.md` | **本文件**（PR#2 / 回滚 / 性能 / 未决） |

---

## 10. 接手检查清单

1. `git status --short` —— 确认脏树，**不要 reset**  
2. 按 §2.2 起 8765，打开训练回放页  
3. 确认 AI 建议区仍有：支撑验证状态；以及（当前）周线结构块  
4. `$node build_strategy_core.js` 与 `structure_recognition_check.js` 是否绿  
5. 与 demir 确认 §7 三个未决后再改代码  
6. 任何回滚先写入 `backups\` 新时间戳目录

---

*文档性质：工程交接，非产品宣传。以磁盘文件与 GitHub PR 实际状态为准；若与口述冲突，以 `pr2_followup` 五件套哈希及本机 `app.js` 特征函数为准。*
