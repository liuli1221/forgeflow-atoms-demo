# ForgeFlow

> 用一句话描述需求，在同一个工作台里看到 **计划 → 执行轨迹 → 源码 → 预览 → 版本**。
> 完全运行在浏览器里的 **Local Agent**，**无需任何 API Key**，零 npm 依赖、零 CDN。

ForgeFlow 是一个 Atoms-like 的「自然语言生成小型网页应用」工作台 Demo。
它不调用任何外部大模型，而是用一条**确定性流水线**真实完成工作：

- **在线 Demo**：https://liuli1221.github.io/forgeflow-atoms-demo/
- **GitHub 源码**：https://github.com/liuli1221/forgeflow-atoms-demo

```
自然语言 → 规则解析器 → AppSpec（结构化契约） → 人工批准 → 代码生成器 → 确定性校验 → READY 版本 → sandbox 预览
```

---

## 1. 运行

```bash
# 需要 Node >= 18，无需 npm install（本项目没有任何依赖）
node server.mjs
# 打开 http://127.0.0.1:4173

# 换端口
PORT=8080 node server.mjs
```

也可以直接用任意静态服务器托管仓库根目录（必须走 http，`file://` 下 ES Modules 会被 CORS 拦截）。

## 2. 测试

```bash
node --test          # 或 npm test
```

当前：**64 个用例全部通过**，覆盖 prompt→AppSpec、增量修改、版本恢复、非法输入降级、生成器安全性、存储导入导出，以及 `[hidden]` CSS 级联回归。
详见 [docs/test-report.md](docs/test-report.md)。

---

## 3. 功能（P0 全量实现）

| # | 能力 | 说明 |
|---|------|------|
| 1 | 欢迎页 / 初始化 | 首次访问展示产品价值与诚实说明，可「创建第一个项目」或「直接看预置演示」；之后直接进入工作台 |
| 2 | 三栏工作台 | 左：项目 + 对话；中：Agent 计划 + 运行轨迹；右：预览 / 代码 / Console / 版本。桌面优先，≤760px 变单栏 + 底部导航 |
| 3 | 真实需求解析 | 关键词打分 + 否定识别 + 句式抽取，支持 **task / habit / budget / feedback** 四类领域与 **generic 兜底**；识别「面试」语境会切换分类预设 |
| 4 | 先计划后执行 | 计划卡可改应用名、视图、主题、搜索/筛选/统计开关，点「批准并执行」才动手；轨迹含 analyze → plan → generate → validate → save → ready 六阶段真实状态切换 |
| 5 | 真实可交互应用 | 生成的应用支持新增 / 编辑 / 删除 / 搜索 / 筛选 / 统计 / 视图切换；不同领域使用不同字段与指标（如记账有「结余」，反馈有「平均评分」） |
| 6 | Sandbox 预览 + 数据持久化 | `sandbox="allow-scripts allow-forms ..."`（**不含** `allow-same-origin`），业务数据经 postMessage 由宿主写入 `localStorage`，刷新后仍在 |
| 7 | Builder 持久化 | projects / messages / AppSpec / run events / versions / 生成文件全部写入 `localStorage`，刷新自动恢复 |
| 8 | 增量修改 + 版本 | 「增加优先级」「切换暗色主题」「改成表格视图」「改名为 X」等生成新版本；版本列表支持预览、查看代码、一键恢复 |
| 9 | 预置演示项目 | 首次打开自带「面试准备计划器」，由真实流水线跑出来（不是硬编码 fixture）；也可新建空项目 |
| 10 | 完整状态处理 | 空状态、校验错误、运行中禁用、取消/重试、保存成功反馈、项目 JSON 导入导出（含业务数据） |

### 关于「Agent」的诚实说明

这里的 Agent 是**运行在你浏览器里的确定性规则引擎**：解析器 + 规划器 + 代码生成器 + 校验器。
它**不调用任何大模型，不发送任何网络请求**，所以线上 Demo 不需要 API Key，也不会泄露你的输入。
产品界面（欢迎页 badge、顶栏 chip）与文档都明确标注 `Local Agent · 无需 API Key`。

---

## 4. 架构

```
自然语言
   │
   ▼
parser.js ──(关键词打分/否定/句式)──▶ AppSpec ◀── mutator.js（增量修改，纯函数、不可变）
   │                                   │
   │                              spec-schema.js（字段级校验）
   ▼                                   │
planner.js（可编辑实施计划）            │
   │   ← 用户点击「批准」               │
   ▼                                   ▼
agent.js（状态机 / 六阶段事件）──▶ generator/{html,css,js}.js ──▶ {index.html, styles.css, app.js}
                                            │
                                     validator.js（schema + 语法 + 安全约束）
                                            │  失败 → 不写版本，旧版本保持不变
                                            ▼
                                     versions.js（READY 版本 / 恢复）
                                            │
                                     storage.js（localStorage，可注入后端）
                                            │
                                     preview-bridge.js ──▶ sandbox iframe（srcdoc）
```

更详细的分层、数据结构与安全模型见 [docs/architecture.md](docs/architecture.md)。

---

## 5. 目录

```
atomlite-workbuddy/
├── index.html                  # Builder 外壳（欢迎页 + 三栏工作台）
├── server.mjs                  # Node 内置 http 静态服务器，零依赖
├── package.json                # 无 dependencies，仅 scripts
├── src/
│   ├── core/                   # 纯逻辑层：无 DOM，Node 可直接 import
│   │   ├── util.js             # id / 转义 / 安全 JSON 序列化
│   │   ├── spec-schema.js      # AppSpec schema 与字段级校验
│   │   ├── blueprints.js       # task/habit/budget/feedback/generic 领域蓝图
│   │   ├── parser.js           # 自然语言 → AppSpec
│   │   ├── mutator.js          # AppSpec + 修改指令 → 新 AppSpec
│   │   ├── planner.js          # AppSpec → 可审批的实施计划 + 六阶段定义
│   │   ├── generator/          # AppSpec → 源码
│   │   │   ├── index.js        # 入口 + 预览文档内联
│   │   │   ├── html.js  css.js  js.js
│   │   │   ├── validator.js    #（见 core/validator.js）
│   │   ├── validator.js        # 确定性校验（schema/结构/语法/安全）
│   │   ├── versions.js         # 版本创建、追加、恢复（纯函数）
│   │   ├── storage.js          # 持久化 + 导入导出（后端可注入）
│   │   └── seed.js             # 预置演示项目
│   ├── ui/                     # 视图层
│   │   ├── app.js              # 控制器：事件绑定 + 状态流转
│   │   ├── store.js            # 状态容器（订阅 + 自动持久化）
│   │   ├── preview-bridge.js   # iframe postMessage 宿主端
│   │   ├── sidebar.js  plan-view.js  viewer.js  dom.js  toast.js
│   └── styles/                 # base / workbench / responsive
├── test/                       # node:test，7 个测试文件
└── docs/                       # architecture.md / test-report.md
```

---

## 6. 部署到 GitHub Pages

项目是纯静态站点，**不需要构建步骤**。

```bash
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

然后在 GitHub 仓库 → **Settings → Pages**：

- **Source**: `Deploy from a branch`
- **Branch**: `main` / `(root)`

保存后访问 `https://<you>.github.io/<repo>/` 即可。

注意事项：
- 所有资源都是相对路径（`./src/...`），放在子路径下也能工作。
- 没有 `node_modules`、没有 CDN、没有外部请求，Pages 不会有跨域或 CSP 问题。
- `server.mjs` 只用于本地开发，Pages 不会执行它。

---

## 7. 演示步骤（建议按此顺序走）

1. **首屏**：打开站点 → 欢迎页 → 点「直接看预置演示」。
2. **看现成项目**：左栏选中「面试准备计划器」，右栏「预览」里直接新增/编辑/删除一条任务，观察统计卡片变化。
3. **刷新持久化**：按 F5，刚才改的业务数据仍在。
4. **新建项目**：左栏「+ 新建」→ 输入
   `做一个求职开销记账本，记录收支和分类` → 发送。
5. **审批计划**：中间栏出现计划卡，改一下应用名、勾掉「搜索」，点「批准并执行」→ 观察六阶段轨迹实时切换。
6. **看代码**：右栏「代码」标签，切换 `index.html / styles.css / app.js`，可复制、可下载。
7. **增量修改**：输入 `增加负责人字段，切换暗色主题` → 批准 → 生成 v2。
8. **版本恢复**：右栏「版本」→ 选 v1 →「恢复为当前版本」，预览立刻回到旧版。
9. **导出**：顶栏「导出 JSON」，得到包含版本与业务数据的项目文件；用「导入 JSON」可再导入一份。
10. **移动端**：把窗口拉窄到 <760px，底部出现「对话 / 计划 / 预览」导航。

---

## 8. 已知限制

- 解析器是**规则驱动**的，不是 LLM：超出关键词表的表达会落到 `generic` 兜底模板。
- 领域覆盖 4 类 + 兜底；更多领域需要补 `blueprints.js`。
- 生成的应用是单页 CRUD 工具，不支持关系型数据、图表、导入 CSV。
- 版本历史上限 30 条，超出后滚动淘汰最早的版本。
- 「下载全部」是逐个文件下载（不打包 zip），因为不引入任何依赖。
- 预览 iframe 没有 `allow-same-origin`，因此生成应用在预览中通过 postMessage 持久化；单独下载后独立打开时自动改用自己的 `localStorage`。
