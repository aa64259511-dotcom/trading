# 交易思维训练项目交接文档

更新时间：2026-06-17
项目目录：C:\Users\admin\Documents\trading advice
本次交接重点：AI 建议/规则库、AI 回测流程、通达信行情导入、港股/期货独立行情表。

## 1. 当前项目目标

本项目用于训练和沉淀人工交易规则，并用规则库生成 AI 操作建议。核心流程是：

- 输入或盲选股票与历史日期。
- 在 K 线图上手动画支撑压力线，或使用自动画线辅助。
- 记录买入、卖出、观望、止损、止盈、保本止损等训练样本。
- 将用户纠正过的样本沉淀到规则库。
- 使用规则库给当前行情生成 AI 建议，并支持 AI 建议回测。

训练方向已调整：不是盲目增加执行 AI 建议的数据，而是重点收集“AI 与人工判断不一致、支撑压力需要修正、买卖点需要修正”的样本。

## 2. 运行方式

服务端入口：`server.py`

推荐启动命令：

```powershell
C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe server.py
```

浏览器访问：

```text
http://127.0.0.1:8765/
```

## 3. 关键文件

- `index.html`：页面结构。
- `styles.css`：页面样式。
- `app.js`：前端主逻辑，包含 K 线画布、训练交互、AI 建议、AI 回测、复制摘要、执行 AI 建议。
- `server.py`：本地 HTTP API，读取行情数据库、保存训练记录、生成 AI 建议。
- `market_data.sqlite`：本地行情数据库，已被 `.gitignore` 忽略，不提交到 Git。
- `trade_replay_samples.jsonl`：交易训练样本。
- `level_training_samples.jsonl`：阶段/级别训练样本。
- `trading_rule_library.json`：结构化规则库。
- `trading_rule_library.md`：规则库说明。
- `PROJECT_HANDOFF.md`：当前交接文档。

新增/更新的数据导入脚本：

- `import_tdx_day.py`：通达信 `.day` 日线导入脚本，支持 A 股、港股、期货/扩展市场。
- `qmt_market_update.py`：QMT 外部行情更新方案，因 QMT 内置 Python 缺依赖未作为主流程。
- `qmt_builtin_market_update.py`：QMT 内置 Python 方案，受 `pandas/sqlite3` 缺失限制。
- `qmt_builtin_export_csv.py`：QMT 内置导出 CSV 方案。
- `qmt_csv_import.py`：将 QMT CSV 导入 SQLite。
- `qmt_symbols.txt`：QMT 导出使用的股票代码列表。

## 4. 本地行情数据库状态

数据库文件：`market_data.sqlite`

该文件体积较大，当前不提交 Git。当前已验证：

- A 股表：`daily_prices`
  - 最新日期：`2026-06-16`
  - 股票数量：约 `5896`
  - 行数：约 `18063062`
- 港股表：`hk_daily_prices`
  - 来源：`C:\D\TDX\vipdoc\ds\lday` 中 `31#*.day`
  - 最新日期：`2026-06-17`
  - 港股数量：`2516`
  - 行数：`2159789`
- 期货/扩展市场表：`futures_daily_prices`
  - 来源：`C:\D\TDX\vipdoc\ds\lday`
  - 最新日期：`2026-06-17`
  - 注意：之前全量导入过 `ds`，其中仍包含 `31#` 港股重复数据；如果后续要清理，可删除 `futures_daily_prices` 中 `raw_code like '31#%'`。

验证数据库可用命令示例：

```powershell
C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe -c "import sqlite3; conn=sqlite3.connect('market_data.sqlite'); print(conn.execute('select max(trade_date), count(*) from daily_prices').fetchone()); print(conn.execute('select max(trade_date), count(*) from hk_daily_prices').fetchone()); print(conn.execute('select max(trade_date), count(*) from futures_daily_prices').fetchone()); conn.close()"
```

## 5. 通达信数据导入

通达信根目录：

```text
C:\D\TDX\vipdoc
```

A 股导入：

```powershell
C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe import_tdx_day.py --tdx-root "C:\D\TDX\vipdoc" --markets sh,sz,bj
```

港股导入：

```powershell
C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe import_tdx_day.py --tdx-root "C:\D\TDX\vipdoc" --markets ds --raw-prefix "31#"
```

期货/扩展市场导入：

```powershell
C:\Users\admin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe import_tdx_day.py --tdx-root "C:\D\TDX\vipdoc" --markets ds
```

重要说明：

- A 股 `.day` 价格字段是整数，需要除以 100。
- `ds` 扩展市场 `.day` 价格字段是 float，不能按 A 股方式除以 100。
- `31#` 基本判断为港股，脚本已自动把 `31#` 逻辑市场识别为 `hk`，写入 `hk_daily_prices`。
- `ds` 目录还包含外汇、期货、扩展市场等，不一定全是期货，后续如要精准分类需要增加前缀识别规则。

## 6. AI 建议与 UI 状态

已完成的前端/AI 建议改动：

- AI 建议标题、操作建议、复制摘要、打分区域固定在页面顶部，不随内容滚动。
- 分数旁边删除“买入观察”。
- 复制摘要为文字链样式，不是按钮框。
- 增加“执行AI建议”按钮，点击后把 AI 建议填入操作区。
- 操作建议增加 UI 强调。
- 买入时止损理由不再强制填写。
- AI 建议乱码问题已处理过，后续改文件时注意 UTF-8 编码。

AI 建议摘要包含：日期、股票代码、支撑、压力、操作建议、当前阶段、匹配模型、匹配度。

## 7. AI 回测状态

AI 策略回测已调整为接近交易训练：

- 开始回测时出现与交易训练类似的画布。
- 支持手动画支撑压力线和自动画线。
- 当回测数据超出支撑压力范围时，需要继续补充支撑压力。
- 页面操作重点保留“执行 AI 建议”和“下一日”。
- 原来的手动买入/卖出操作区在 AI 回测中弱化，主要按 AI 建议执行。
- 支持盲选回测，逻辑接近交易训练盲选。
- AI 买入建议可直接执行，持仓后止损优先。

## 8. 规则库关键原则

规则库文件：`trading_rule_library.json`、`trading_rule_library.md`

当前已经沉淀的重要规则：

- 低于 5 日线时，不建议买入。
- 买入需要小趋势向上。
- 跌破拉回不能只是回到支撑上方一点点，需要拉出一定空间。
- 跌破拉回后多数情况需要等待回踩确认，不是直接买入。
- 突破密集交易区后，回踩确认再出现小阳线，且回踩尽量缩量，可以作为买点。
- 急跌后可以博弈修复，但需要上方压力足够远，且盈亏比可接受。
- 突破压力后，压力自动转为支撑；但突破或跌破的支撑压力线不要自动补新线。
- 买入止损一般应在 3%-8% 区间，过小止损触发概率高。
- 止损依据向前寻找：支撑、密集交易区上下沿、拉回支撑的关键 K 线下沿或最低价。
- 持仓阶段如果已经设置止损，应等待止损触发。
- 盈利超过 3R 后，趋势转弱才开始考虑止盈。
- 卖出逻辑分为止损、止盈、保本止损。

## 9. 最近典型训练/规则案例

- `300011` / `2018-01-11`：阶段判断、支撑压力线补充逻辑。
- `603658` / `2021-05-10`：当前阶段判断。
- `000958` / `2024-02-07`：急跌后修复博弈买入逻辑。
- `300422` / `2024-02-19`：急跌后可博弈修复，上方压力远时如何从观望调整为买入。
- `300422` / `2024-10-21`：观望原因分析。
- `605058` / `2025-06-30`：支撑位 26.34 附近误买，已加入硬拦截规则。
- `002746` / `2024-10-25`：确认 K 线已经出现，不能机械等待再出一根阳线，否则可能导致盈亏比不足。
- `002120` / `2016-05-17`：止损过小问题，止损一般需要大于 2%，更合理为 3%-8%。
- `301536` / `2025-04-21`：止损位置过高，更合理参考 52.5；关键阳线低点/开盘价可作为止损依据，但要结合盈亏比。

## 10. Git 注意事项

当前项目可能没有远程仓库配置；如果 `git remote -v` 为空，则只能本地提交，无法 push。

项目 `.gitignore` 已忽略：`*.sqlite`、`data_cache/`、`qmt_export/`、`_qmt_import_test.*`、`thinktrader_stock_doc.html`。

不要把 `market_data.sqlite` 提交进 Git。

## 11. 新对话建议第一步

新 Codex 对话开始后，建议先说：

```text
请读取 C:\Users\admin\Documents\trading advice\PROJECT_HANDOFF.md，并检查 git status。
```

然后再继续指定任务，例如：

- 清理 `futures_daily_prices` 中重复的 `31#` 港股数据。
- 增加 `ds` 目录不同前缀的市场分类规则。
- 继续优化 AI 买入/卖出规则。
- 做前端回测页面验证。
- 打包项目给别人使用。
