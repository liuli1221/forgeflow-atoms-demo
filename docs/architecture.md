# ForgeFlow 架构说明

## 1. 设计目标与约束

| 约束 | 决策 |
|------|------|
| Key 不能进入浏览器 | DeepSeek Key 只由 Node 服务从 `.env.local` / 部署环境变量读取，浏览器只请求同源 `/api/generate` |
| 不能让规则模板与 LLM 竞争 | 所有用户创建/修改统一走 DeepSeek；失败时明确报错，不回退成 generic CRUD 或本地模板 |
| 不能依赖 CDN / npm | 原生 HTML + CSS + ES Modules；`package.json` 无 `dependencies`；本地服务和 Vercel Functions 都只用 Node 内置能力 |
| 可直接部署 GitHub Pages | 纯静态、全相对路径、无构建步骤 |
| 可测试 | 所有业务逻辑放在 `src/core/`，**不引用任何 DOM/BOM 全局**，`node --test` 可以直接 import |

## 2. 分层

```
┌──────────────────────────── src/ui（视图层，唯一接触 DOM 的地方）─────────────────────────────┐
│ app.js（控制器）  store.js（状态容器+持久化）  preview-bridge.js（iframe 宿主）               │
│ sidebar.js / plan-view.js / viewer.js（纯渲染）  dom.js（el 工具）  toast.js                  │
└───────────────────────────────────────────┬──────────────────────────────────────────────────┘
                                            │ 只调用纯函数，不反向依赖
┌───────────────────────────────────────────▼──────────── src/core（纯逻辑层，DOM-free）───────┐
│ parser.js  mutator.js  blueprints.js  spec-schema.js  llm-plan.js                             │
│ planner.js  agent.js / llm-agent.js  generator/*  validator.js  versions.js  storage.js       │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                            │ 同源 JSON API
┌───────────────────────────────────────────▼──────────── server（可信服务端）──────────────────┐
│ Vercel /api/generate 或本地 Node → deepseek-generator.mjs → DeepSeek → llm-validator.mjs      │
│ 本地 Node 专属：/api/auth + /api/sync → sync-store.mjs                                        │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

依赖方向是单向的：`ui → core → server API`。用户请求主链为
`llm-plan → llm-agent → llm-client → /api/generate → deepseek-generator → llm-validator → versions → storage`。
`parser / mutator / blueprints / generator / validator` 是预置演示、历史兼容和纯函数回归使用的确定性模块，
不再参与用户提示词的生成路由。Node 服务模式还提供
`sync-client → /api/auth + /api/sync → sync-store`。

## 2.1 统一 DeepSeek 入口与确定性护栏

`src/ui/app.js` 对所有创建与修改都调用 `prepareLlmRequest()`，批准后只执行 `executeLlmRun()`。
代码中不再存在 `shouldUseLlm()` 或本地执行分支；任务管理、记账、计算器、贪吃蛇和未知领域使用同一入口。

```text
prompt → 计划审批 → POST /api/generate
                    → DeepSeek 输出三个文件 JSON
                    → JSON 提取（原文 / 去代码围栏 / 首尾大括号）
                    → llm-validator（结构/语法/安全/交互/持久化契约）
                    ├─ pass → READY 版本 → sandbox
                    └─ fail → 错误 + 上一版 bundle 或无效原文回送模型（最多 2 次）
```

自动修复同时处理“代码未通过契约”和“响应不是合法 JSON”。401/403 等认证配置错误立即返回；每次模型调用
默认 60 秒超时，限流、超时和服务端异常保留失败轨迹。任何失败都不创建版本、不覆盖当前 READY 版本。

对于数据类应用，护栏强制要求 `item-list/item-add/item-form/item-title/item-save` 稳定测试标识、关键创建控件
不能静态隐藏，并且必须实现带精确 `appId` 的 ForgeFlow postMessage 持久化协议。护栏限定结果的可用性与安全
边界，但不替模型决定领域、字段、页面结构或视觉方案。

公网部署时，`generation-guard.mjs` 在调用模型前发放内存令牌：默认每个匿名客户端每小时 5 次、每实例每天
每天 30 次、最多 2 个并发任务。客户端地址先做 SHA-256 摘要，服务不记录原始 IP。时窗/预算超限返回
429，并发超限返回 503；响应携带 `Retry-After`，任务在成功、失败或取消后都会释放并发令牌。该方案适合
单实例面试 Demo；Vercel Serverless 横向扩容后该限制是 best effort，不是严格全局预算，生产版应把计数器迁移到共享 Redis/Key Value。

## 3. 核心数据结构：运行元数据 AppSpec

当前 DeepSeek 主链把 AppSpec 用作项目身份、版本和持久化元数据；真正的应用结构与行为由模型生成的三文件源码
表达。`appId` 在修改时保持不变，从而让新版本继续读取同一业务数据命名空间。下面的丰富字段仍由预置演示与
历史确定性模块使用，不再作为用户请求的本地生成入口。

```jsonc
{
  "specVersion": 1,
  "appId": "app_xxx",              // 业务数据的存储命名空间，增量修改时保持不变
  "appName": "面试准备计划器",
  "tagline": "...",
  "domain": "task",                // task | habit | budget | feedback | generic
  "flavor": "interview",           // 命中「面试」语境时切换分类预设
  "entityName": "任务",
  "theme":  { "mode": "light", "accent": "#4f6bed", "density": "comfortable" },
  "layout": { "view": "cards", "showSearch": true, "showFilters": true, "showStats": true },
  "fields": [
    { "key": "title", "label": "任务名称", "type": "text", "primary": true, "required": true },
    { "key": "priority", "label": "优先级", "type": "select", "options": ["高","中","低"], "default": "中" }
  ],
  "filters": [ { "key": "filter_category", "field": "category", "label": "分类" } ],
  "metrics": [
    { "key": "done_rate", "label": "完成率", "type": "percent",
      "where": { "field": "status", "value": "已完成" }, "format": "percent" }
  ],
  "seedItems": [ { "title": "整理项目复盘文档", "...": "..." } ],
  "sourcePrompt": "做一个面试准备计划器，支持…",
  "createdAt": "2026-09-19T…"
}
```

`spec-schema.js` 对上述结构做字段级校验：
枚举合法性、`key` 正则 `^[a-z][a-z0-9_]{0,31}$`、key 唯一、必须有 `primary` 字段、
`select` 必须有 `options`、`filters/metrics` 引用的字段必须存在、`percent` 必须带 `where`、
`delta` 必须同时有 `plusWhere/minusWhere`。校验**永不抛异常**，只返回 `{ok, errors, warnings}`。

## 4. 历史确定性解析（parser.js，仅预置/回归）

该模块不再接收 UI 的新建/修改请求，保留用于预置应用、向后兼容和纯函数测试。它按以下四步分析：

1. **领域打分**：`DOMAIN_KEYWORDS` 八张关键词表逐个统计命中，按 `max(2, 关键词长度)` 加权求和，取最高分；
   全部为 0 时落 `generic` 并置 `analysis.fallback = true`。
2. **否定识别**：`negatedAt()` 回看关键词前 6 个字符，命中 `不需要/不要/无需/去掉/移除/取消/关闭/without` 时，
   该命中记入 `negated` 而不是 `hits`。因此「不需要统计」会关闭统计模块而不是打开它。
3. **特性抽取**：`FEATURE_KEYWORDS` 决定加载哪些**可选字段**（优先级、截止日期、评分、连续天数、支付方式…），
   `LAYOUT_KEYWORDS / VIEW_KEYWORDS / THEME_KEYWORDS` 决定搜索/筛选/统计开关、视图、明暗主题。
4. **名称抽取**：切到第一个分句 → 反复剥离引导动词（帮我/我想/做/搞/create/build…）与量词（一个/一款/a/an）
   → 去掉尾部噪声（的网页/的小程序…）→ 长度不合理时回落蓝图默认名。

领域蓝图 `blueprints.js` 提供 `baseFields`（必备）、`optionalFields`（按需）、`filterFields`、
`doneField`（完成语义），以及 `buildMetrics()` / `buildSeedItems()`——
指标只会引用**实际存在**的字段，所以「去掉优先级」之后不会残留悬空指标。

除八类蓝图外，`extractCustomFields()` 能解析“字段包括…”后的显式 Schema，识别 text / textarea /
select / number / date / checkbox，并从括号中提取下拉选项。未知领域只要给出至少两个字段就进入
`custom`，不会套用 generic 的固定字段；只有既未命中领域、又没有显式 Schema 时才兜底 generic。

## 5. 历史确定性修改（mutator.js，仅兼容/回归）

`applyModification(spec, instruction)` 返回 `{ok, spec, changes, notes}`，**输入对象不可变**。
识别 8 类操作：改名、明暗主题、主题色、视图、模块开关、已知可选字段增删、自定义字段、下拉新增选项。
`intentAround()` 用关键词前 8 字符判断是「增加」还是「去掉」。

任何字段变更后都会重跑 `rebuildFilters / rebuildMetrics / syncSeedItems`，保证 spec 始终自洽。
**一个都没识别出来时返回 `ok:false` 并原样返回旧 spec**——降级而不是乱改。

## 6. 执行状态机

当前用户主链由 `llm-agent.js` 驱动：分析 → 计划 → DeepSeek 生成 → 确定性校验/自动修复 → 保存 → READY。
下面的 `agent.js` 状态机只服务预置演示与历史回归：

```
idle ──prepareRequest()──▶ awaiting_approval ──approve()──▶ running ──┬─▶ ready
  ▲                              ▲                                    ├─▶ failed（旧版本保留）
  └──────── discard() ───────────┴──────── cancel() ───────────────────┘
```

- `prepareRequest()`：
  - 项目无 spec → `parsePrompt`（create）
  - 项目有 spec → 先试 `applyModification`（modify）；不认识就再试 `parsePrompt`，
    若命中明确领域则按「重建」处理但**沿用同一个 `appId`**（业务数据不丢）；否则返回失败。
- `executeRun()`：顺序发出六个阶段的 `running/done/failed/cancelled` 事件，
  每个阶段之间检查 `shouldCancel()`；`sleep`/`tick` 可注入，所以测试里是零延迟同步执行。
- **只有 validate 全部通过才创建 READY 版本**；失败时 `version = null`，
  控制器不会覆盖 `project.spec / project.files`，当前版本原封不动。

## 7. 历史确定性生成器（generator/）

`generator/` 用于预置演示和回归，不会根据用户的新提示词生成应用。DeepSeek 主链的源码由
`server/deepseek-generator.mjs` 返回，再由 `server/llm-validator.mjs` 校验。

| 文件 | 产出 |
|------|------|
| `html.js` | 静态外壳。所有来自用户的文本（应用名、tagline、实体名）走 `escapeHtml` |
| `css.js`  | 由 `theme.accent/mode/density` 派生 CSS 变量，含 `@media (max-width: 640px)` |
| `js.js`   | 运行时。AppSpec 经 `toSafeJson()` 注入 |
| `index.js`| 组装 + `buildPreviewDocument()` 把三件套内联成单文档 |

**安全模型**：
- `toSafeJson()` 把 `<` `>` `U+2028` `U+2029` 转成 `\u003c` 等转义序列 →
  用户就算输入 `</script><script>alert(1)</script>`，也无法从内联脚本里逃逸。
- 生成的运行时**只用 `createElement` / `textContent` / `createTextNode`**，
  完全不使用 `innerHTML`、`eval`、`new Function`、`document.write`；`validator.js` 会把这条当作硬性检查。
- 预览文档只允许出现 **1 个 `<script>` 标签**，也是一条校验项。

## 8. 确定性校验护栏

15 项确定性检查：AppSpec schema、三个文件存在且非空、doctype/结束标签、挂载点、viewport（warn）、
script 标签数量、CSS 主题变量、CSS 断点（warn）、`[hidden]` 强制隐藏门禁、`app.js` 语法（用 `new Function(source)` 只解析不执行）、
禁用 API、AppSpec 以数据形式注入、持久化通道存在、无未转义标签、预览文档可组装。

任何一项 `fail` → 整个 run 失败。`warn` 不阻断。

DeepSeek 主链由 `server/llm-validator.mjs` 校验：文件只能是 `index.html/styles.css/app.js`，HTML 只能引用这
两个本地资源，JS 必须通过语法检查，并禁止 `innerHTML/eval/fetch/WebSocket/localStorage` 等危险或越界
能力。计算器必须暴露可执行 `7 + 5 = 12` 的稳定测试标识；贪吃蛇必须有 Canvas、分数、启动状态、方向键
处理和游戏循环；数据应用必须暴露稳定 CRUD 测试标识并实现精确 appId 的 postMessage 持久化桥。
预览组装时再注入 CSP，禁止生成页面主动联网。

## 9. 预览与数据持久化

```
┌── Builder（正常同源页面）───────────────────────────────┐
│ preview-bridge.js                                       │
│   ├─ 收到 {source:'forgeflow-app', type:'ready'}        │
│   │     → 校验 appId 精确匹配当前项目后读取对应数据      │
│   │     → post {source:'forgeflow-host', type:'init'}   │
│   ├─ 收到 type:'save' → 校验 key 必须精确匹配当前 appId 后写入 localStorage │
│   └─ 收到 type:'log'  → 打到 Console 面板               │
└───────────────┬─────────────────────────────────────────┘
                │ postMessage
┌───────────────▼── iframe srcdoc ────────────────────────┐
│ sandbox="allow-scripts allow-forms allow-popups         │
│          allow-popups-to-escape-sandbox"                │
│ 注意：**没有 allow-same-origin** → 不可访问宿主 DOM/存储 │
│ 生成应用：embedded 时走 postMessage，独立打开时走自己的  │
│ localStorage（同一份 app.js 两种模式都能跑）             │
└──────────────────────────────────────────────────────────┘
```

为什么不加 `allow-same-origin`：`allow-scripts + allow-same-origin` 组合等于沙箱形同虚设
（脚本可以移除自身 sandbox 属性）。代价是 iframe 内没有可用的 `localStorage`，
所以用 postMessage 把持久化交给宿主——顺带也让 Builder 能统计、导出这些业务数据。

宿主侧还做了两道防护：`ev.source !== frame.contentWindow` 的来源检查，
以及写入 key 必须以 `forgeflow.appdata.` 开头。

## 10. 持久化与导入导出（storage.js）

| key | 内容 |
|-----|------|
| `forgeflow.v1.state` | 全部 Builder 状态：projects、messages、AppSpec、pendingPlan、runEvents、versions、生成文件、当前版本指针 |
| `forgeflow.appdata.<appId>` | 某个生成应用内部的业务数据 |

- `createStorage(backend)` 的 backend 可注入：浏览器用 `browserBackend(localStorage)`，
  测试用 `memoryBackend()`；隐私模式下探测失败会自动退回内存并提示用户。
- `loadState()` 对损坏 JSON 返回空状态而不是抛异常；`activeProjectId` 指向已删项目时自动修正。
- 导出格式 `{kind:'forgeflow.project', version:1, project, appData}`，
  `parseImport()` 逐项校验 kind/version/project 并给出中文原因；id 冲突时 `dedupeProjectId()` 重新分配。

### 10.1 可选账号与服务端同步

Node 服务模式提供同源 API：

```text
POST /api/auth/register  ─┐
POST /api/auth/login     ─┴─▶ scrypt 密码哈希 + HMAC 签名 token
GET  /api/sync          ────▶ 读取账号快照
PUT  /api/sync          ────▶ baseRevision 乐观锁 → 原子写 JSON 文件
```

- 浏览器只在 `sessionStorage` 保存短期会话，密码不会持久化；
- 上传必须携带当前 `baseRevision`，云端已更新时返回 409，避免静默覆盖；
- 服务端先写临时文件再 rename，减少半写入文件；
- 下载覆盖前把本地完整快照保存为 `forgeflow.v1.pre_sync_backup`；
- GitHub Pages 无服务端能力时，健康检查失败并明确显示“本地数据”，不伪装云同步；
- 当前 JSON 存储是 Demo 单机实现，多实例部署需换数据库并增加限流、找回密码与安全审计。

## 11. UI 与响应式

- 桌面：`grid-template-columns: 320px minmax(280px,1fr) minmax(360px,1.25fr)`。
- ≤1180px 收窄；≤1000px 变两列（左栏跨两行）；≤760px 变单栏 + 固定底部导航（对话/计划/预览）。
- `prefers-reduced-motion` 下关闭动画。
- 渲染函数全部是「清空 + 重建」的幂等函数，唯一的例外是预览 iframe：
  用 `loadedPreviewKey = projectId:versionId` 做守卫，只有版本真正变化时才重设 `srcdoc`，
  避免每次渲染都把用户正在操作的应用重置掉。
