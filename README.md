# ForgeFlow

> 用一句话描述需求，在同一个工作台里看到 **计划 → 执行轨迹 → 源码 → 预览 → 版本**。
> **Hybrid Agent**：结构化 CRUD 走确定性本地生成；计算器、贪吃蛇及开放式应用通过服务端 DeepSeek 真实生成。

ForgeFlow 是一个 Atoms-like 的「自然语言生成小型网页应用」工作台 Demo。
它不会把所有需求硬套成同一个 CRUD：

- **完整 AI Demo**：https://forgeflow-atoms-demo.vercel.app/
- **静态降级 Demo**：https://liuli1221.github.io/forgeflow-atoms-demo/
- **GitHub 源码**：https://github.com/liuli1221/forgeflow-atoms-demo

```
自然语言 → 路由 → 本地 AppSpec 生成 / POST /api/generate → 确定性校验 → 自动修复 → READY 版本 → sandbox 预览
```

---

## 1. 运行

```bash
# 真实 LLM 模式：Key 只放服务端，.env.local 已被 gitignore
cp .env.example .env.local
# 然后只在 .env.local 中替换占位值

# 需要 Node >= 18；运行时无第三方依赖
node server.mjs
# 打开 http://127.0.0.1:4173

# 换端口
PORT=8080 node server.mjs
```

也可以直接用任意静态服务器托管仓库根目录（必须走 http，`file://` 下 ES Modules 会被 CORS 拦截）。

本地 Node 服务模式提供 `/api/generate`、账号注册/登录和跨浏览器同步 API。Vercel 部署提供静态前端和 `/api/generate`，项目与应用数据仍写入浏览器 `localStorage`；GitHub Pages 无法执行真实 LLM，只保留本地确定性生成。

## 2. 测试

```bash
npm install
npm run test:unit    # 82 个纯函数/服务端/Vercel Function 测试
npm run test:e2e     # 2 个真实 Chrome E2E
npm run test:e2e:llm # 真实调用 DeepSeek，产生 API 用量，不纳入默认 test:all
npm run test:e2e:production # 直接验收 Vercel Production URL
npm run test:all
```

当前：**82 个单元/服务端用例 + 2 个离线 Playwright Chrome E2E + 2 个本地真实 DeepSeek Chrome E2E + 2 个 Vercel Production E2E 全部通过**。真实 LLM E2E 分别生成计算器与贪吃蛇并操作最终页面；它要求有效的 `DEEPSEEK_API_KEY`，不使用 mock，也不纳入默认回归。
详见 [docs/test-report.md](docs/test-report.md)。

---

## 3. 功能（P0 全量实现）

| # | 能力 | 说明 |
|---|------|------|
| 1 | 欢迎页 / 初始化 | 首次访问展示产品价值与诚实说明，可「创建第一个项目」或「直接看预置演示」；之后直接进入工作台 |
| 2 | 三栏工作台 | 左：项目 + 对话；中：Agent 计划 + 运行轨迹；右：预览 / 代码 / Console / 版本。桌面优先，≤760px 变单栏 + 底部导航 |
| 3 | 真实需求解析 | 支持 task / habit / budget / feedback / inventory / crm / event / library 八类蓝图；未知领域可从“字段包括…”提取自定义 Schema，最后才使用 generic 兜底 |
| 3a | 真实 LLM 生成 | 计算器、贪吃蛇、游戏/工具及本地解析器未命中的开放需求走 `/api/generate`；服务端调用 DeepSeek 返回三个源码文件 |
| 4 | 先计划后执行 | 计划卡可改应用名、视图、主题、搜索/筛选/统计开关，点「批准并执行」才动手；轨迹含 analyze → plan → generate → validate → save → ready 六阶段真实状态切换 |
| 5 | 真实可交互应用 | 生成的应用支持新增 / 编辑 / 删除 / 搜索 / 筛选 / 统计 / 视图切换；不同领域使用不同字段与指标（如记账有「结余」，反馈有「平均评分」） |
| 6 | Sandbox 预览 + 数据持久化 | `sandbox="allow-scripts allow-forms ..."`（**不含** `allow-same-origin`），业务数据经 postMessage 由宿主写入 `localStorage`，刷新后仍在 |
| 7 | Builder 持久化 | projects / messages / AppSpec / run events / versions / 生成文件全部写入 `localStorage`，刷新自动恢复 |
| 8 | 增量修改 + 版本 | 「增加优先级」「切换暗色主题」「改成表格视图」「改名为 X」等生成新版本；版本列表支持预览、查看代码、一键恢复 |
| 9 | 预置演示项目 | 首次打开自带「面试准备计划器」，由真实流水线跑出来（不是硬编码 fixture）；也可新建空项目 |
| 10 | 完整状态处理 | 空状态、校验错误、运行中禁用、取消/重试、保存成功反馈、项目 JSON 导入导出（含业务数据） |
| 11 | 可选账号同步 | 本地 Node 服务模式提供密码哈希、签名会话、服务端 JSON 持久化和 revision 冲突检测；Vercel/静态 Pages 明确使用浏览器本地模式 |
| 12 | 自动修复 | LLM 产物先过结构、语法、安全和应用专项契约；失败错误连同上一版代码反馈给模型，最多修复 2 次；认证错误立即失败 |
| 13 | 公网用量保护 | 服务端按匿名客户端限制每小时次数，并设置实例每日预算和并发上限；429/503 明确提示，不记录原始 IP |

### 关于「Agent」的诚实说明

这里是两条真实执行路径：已支持领域与 CRUD 修改使用浏览器里的确定性 Agent；行为型/开放式需求使用服务端 DeepSeek。浏览器从不接触 Key，只请求同源 `/api/generate`。模型结果不是直接保存：必须通过确定性校验，只有 READY 版本会覆盖当前预览。真实 LLM 不可用时明确报错，不回退成通用条目管理器。

---

## 4. 架构

```
自然语言 ──▶ llm-plan.js（意图路由）
   ├─ 已知 CRUD ──▶ parser.js / mutator.js ──▶ AppSpec ──▶ 本地 generator
   └─ 行为型/开放需求 ──▶ POST /api/generate ──▶ DeepSeek Responses API
                                                     │
                                         三文件 JSON + 专项契约校验
                                                     │ 失败 → 最多 2 次修复
                                                     ▼
                                               READY 版本

原本地链路：
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
├── api/                        # Vercel Functions：health + generate
├── server.mjs                  # 本地 Node 静态服务 + generate/auth/sync API
├── server/deepseek-generator.mjs # DeepSeek 调用、结构化输出、自动修复
├── server/llm-validator.mjs    # LLM 三文件安全与应用专项契约
├── server/generation-guard.mjs # 每客户端/每日/并发生成额度
├── server/env.mjs              # 服务端加载被忽略的 .env.local
├── server/sync-store.mjs       # scrypt 密码哈希、签名 token、revision 冲突检测
├── package.json                # runtime 无 dependencies；Playwright 为 devDependency
├── vercel.json                 # Vercel Function 时长与响应头配置
├── playwright.config.js        # Chrome E2E 配置与测试服务
├── playwright.live.config.js   # 真实 DeepSeek E2E（单独运行）
├── e2e/forgeflow.spec.js       # 生成/CRUD/刷新/跨浏览器同步完整链路
├── e2e-live/llm-apps.spec.js   # 计算器 7+5=12 / 贪吃蛇启动与方向键
├── src/
│   ├── core/                   # 纯逻辑层：无 DOM，Node 可直接 import
│   │   ├── util.js             # id / 转义 / 安全 JSON 序列化
│   │   ├── spec-schema.js      # AppSpec schema 与字段级校验
│   │   ├── blueprints.js       # 8 类领域蓝图 + custom/generic
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
│   │   ├── sync-client.js      # 登录会话与手动上传/下载
│   │   ├── sidebar.js  plan-view.js  viewer.js  dom.js  toast.js
│   └── styles/                 # base / workbench / responsive
├── test/                       # node:test（解析/生成/修复/限流/持久化）
└── docs/                       # architecture / test report / Vercel deploy
```

---

## 6. GitHub + Vercel 部署

完整 AI Demo 使用仓库根目录的 `vercel.json` 部署：同一域名提供静态前端、`/api/health` 和 `/api/generate` Serverless Functions。

1. 将已验证代码推送到 GitHub。
2. Vercel 选择 **Add New → Project** 并导入本仓库，Framework Preset 使用 `Other`。
3. 在 Environment Variables 中填写 `DEEPSEEK_API_KEY`，并设置 Production/Preview；Key 不进入 Git 或浏览器。
4. 部署后先检查 `/api/health` 的 `llm.configured: true`。
5. 用 Production URL 完成计算器、贪吃蛇和刷新恢复验收。

默认公网保护：每个热实例按匿名客户端每小时 5 次、每天 30 次、最多 2 个并发生成；可通过环境变量调整。Serverless 多实例下内存计数不是严格全局预算，正式生产应迁移到共享 Redis/KV。完整操作见 [docs/vercel-deploy.md](docs/vercel-deploy.md)。

### 静态降级版

现有 GitHub Pages 可继续作为不需要构建步骤的静态版本，但它没有真实 LLM 和账号同步。提交给面试官的完整验收链接应使用 Vercel Production URL。

---

## 7. 演示步骤（建议按此顺序走）

1. **首屏**：打开站点 → 欢迎页 → 点「直接看预置演示」。
2. **看现成项目**：左栏选中「面试准备计划器」，右栏「预览」里直接新增/编辑/删除一条任务，观察统计卡片变化。
3. **刷新持久化**：按 F5，刚才改的业务数据仍在。
4. **真实计算器**：左栏「+ 新建」→ 输入 `生成一个现代风格计算器，支持加减乘除、清空和连续计算` → 批准 → 实际点击 `7 + 5 =` 得到 `12`。
5. **真实贪吃蛇**：新建项目 → 输入 `生成一个贪吃蛇游戏，支持方向键控制、计分、碰撞结束和重新开始` → 批准 → 启动并用方向键操作。
6. **本地 CRUD**：左栏「+ 新建」→ 输入
   `做一个求职开销记账本，记录收支和分类` → 发送。
7. **审批计划**：中间栏出现计划卡，点「批准并执行」→ 观察生成、校验、修复、保存轨迹。
8. **看代码**：右栏「代码」标签，切换 `index.html / styles.css / app.js`，可复制、可下载。
9. **增量修改**：输入 `增加负责人字段，切换暗色主题` → 批准 → 生成 v2。
10. **版本恢复**：右栏「版本」→ 选 v1 →「恢复为当前版本」，预览立刻回到旧版。
11. **开放 Schema**：新建项目并输入 `做一个宠物档案，字段包括宠物名、品种(猫/狗/其他)、出生日期、是否绝育、体重`。
12. **账号同步（Node 服务模式）**：注册 → 上传；开一个无痕窗口登录同一账号 → 下载，项目与业务数据恢复。
13. **导出**：顶栏「导出 JSON」，得到包含版本与业务数据的项目文件；用「导入 JSON」可再导入一份。
14. **移动端**：把窗口拉窄到 <760px，底部出现「对话 / 计划 / 预览」导航。

---

## 8. 已知限制

- 本地路径仍是规则驱动；计算器、贪吃蛇、游戏/工具类和未命中需求改走 DeepSeek，不再回退成 generic CRUD。
- LLM 产物被限制为三个无外部依赖的单页文件，禁止自行联网、动态执行代码和直接访问浏览器存储。
- `.env.local` 只适合本机；部署时必须用托管平台的服务端环境变量，不能把 Key 放进前端或 Git。
- 版本历史上限 30 条，超出后滚动淘汰最早的版本。
- 「下载全部」是逐个文件下载（不打包 zip），因为不引入任何依赖。
- 预览 iframe 没有 `allow-same-origin`，因此生成应用在预览中通过 postMessage 持久化；单独下载后独立打开时自动改用自己的 `localStorage`。
- Vercel Serverless 不运行单机 JSON 账号同步；线上持久化依赖浏览器 `localStorage`。若要跨设备恢复，应接入数据库后再开放账号能力。
- 当前公网限流是实例内存级 best effort；Vercel 横向扩容后不是严格的全局日预算，生产版应接入共享 Redis/KV。
- E2E 当前固定验证本机 Chrome；尚未覆盖 Firefox、WebKit 和真实移动设备。
