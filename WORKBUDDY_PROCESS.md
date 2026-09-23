# PROCESS.md

本文记录完成 ForgeFlow（Atoms-like Demo）的最终实现过程。

- 在线 Demo：https://forgeflow-atoms-demo.vercel.app/
- GitHub：https://github.com/liuli1221/forgeflow-atoms-demo
- 技术栈：原生 HTML / CSS / JavaScript ES Modules、Node.js、Vercel Functions、Playwright

---

## 1. 题目理解与最终目标

题目要求实现一个类似 Atoms 的产品原型：用户输入自然语言，Agent 生成一个真实可运行的小型网页应用，并在同一个工作台中展示计划、执行过程、源码、预览和版本。

最终验收目标：

1. 生成结果包含完整的 `index.html`、`styles.css`、`app.js`，可以真实交互；
2. 生成结果必须经过确定性校验，不合格时自动修复，只有通过校验的版本才能成为 READY；
3. Builder 状态、生成源码、版本记录和生成应用的业务数据在刷新后仍然存在；
4. 在线地址可以直接体验，不要求访问者提供 API Key；


产品名为 **ForgeFlow**。

---

## 2. 任务约束

### 2.1 产品要求

- 提供欢迎页和初始化入口；
- 提供项目、对话、计划、运行轨迹、源码、预览、Console、版本等完整工作区；
- 必须先展示计划，由用户批准后才能生成；
- 生成应用必须可以操作，而不是静态设计稿；
- 支持增量修改、版本查看和版本恢复；
- 提供一个不消耗生成额度的预置项目，方便快速演示。

### 2.2 工程要求

- 所有创建和修改请求统一调用同源 `POST /api/generate`；
- Key 只存在于服务端环境变量；
- 模型输出不能直接进入预览，必须先经过结构、语法、安全和应用专项校验；
- 校验失败时将错误和上一轮产物送入下一轮修复，最多生成 3 次；
- 失败、取消或超时不能覆盖当前可用版本；
- iframe 不启用 `allow-same-origin`，生成应用通过受控 `postMessage` 桥持久化；
- 核心逻辑保持模块化、可测试，并提供可重复执行的浏览器 E2E。

### 2.3 交付要求

- 本地可运行；
- GitHub 公开源码；
- Vercel 提供静态前端和 Serverless API；
- 提供测试报告、架构说明和部署说明；
- 只把实际执行过的测试和部署结果写成“通过”。

---

## 3. 最终架构

```text
用户自然语言
    │
    ▼
prepareLlmRequest()
生成可审批计划，固定 appId 和 create / modify 模式
    │
    ▼ 用户批准
executeLlmRun()
    │
    ▼
POST /api/generate
    │
    ├─ 请求校验、限流、并发控制
    ├─ 服务端调用真实 AI 生成三个源码文件
    ├─ JSON 提取与结构化解析
    ├─ 确定性校验
    └─ 失败时携带错误和上一轮产物自动修复
    │
    ▼
READY 版本
    │
    ├─ versions.js 保存版本
    ├─ storage.js 保存 Builder 状态
    └─ preview-bridge.js 加载 sandbox 预览并保存业务数据
```

职责边界如下：

| 层 | 主要文件 | 职责 |
|---|---|---|
| 产品 UI | `index.html`、`src/ui/*`、`src/styles/*` | 欢迎页、三栏工作台、对话、计划、轨迹、源码、预览、版本和状态反馈 |
| 计划与执行 | `src/core/llm-plan.js`、`src/core/llm-agent.js` | 统一生成计划、审批后执行、运行事件、失败/取消处理、READY 版本创建 |
| 浏览器 API 客户端 | `src/ui/llm-client.js` | 请求同源 `/api/generate`，向上返回结构化结果 |
| 在线 API | `api/generate.mjs`、`api/health.mjs` | Vercel Function、请求校验、额度保护、健康状态和公开响应裁剪 |
| 本地服务 | `server.mjs` | 本地静态站、生成 API、账号和同步 API |
| AI 生成适配器 | `server/deepseek-generator.mjs` | 服务端模型请求、JSON Schema 输出、解析、重试与自动修复 |
| 确定性护栏 | `server/llm-validator.mjs` | 文件、HTML、JS、安全、体积、交互和持久化契约校验 |
| 版本与持久化 | `src/core/versions.js`、`src/core/storage.js` | READY 版本、版本恢复、Builder 状态、业务数据、导入导出 |
| 预览隔离 | `src/ui/preview-bridge.js` | sandbox iframe、appId/key 校验、业务数据注入与保存 |
| 公网保护 | `server/generation-guard.mjs` | 每客户端窗口额度、每日预算、并发上限和释放令牌 |

仓库中的 `parser.js`、`blueprints.js`、`mutator.js` 和 `core/generator/*` 只用于预置演示、历史数据兼容和纯函数回归，**不会参与用户提示词的创建或修改路由**。

---

## 4. 一次真实请求如何完成

以“生成一个贪吃蛇游戏，支持方向键、计分、碰撞结束和重新开始”为例：

### 4.1 计划

`src/core/llm-plan.js` 的 `prepareLlmRequest()`：

- 判断是创建还是修改；
- 为新项目生成稳定 `appId`，修改时沿用原 `appId`；
- 创建计划卡，说明输出文件、生成模式、校验和修复策略；
- 不根据需求类型切换到本地模板。

### 4.2 审批

用户点击“批准并执行”后，`src/ui/app.js` 调用 `executeLlmRun()`。未批准时不请求服务端。

### 4.3 服务端生成

浏览器向同源 `POST /api/generate` 发送：

```json
{
  "prompt": "生成一个贪吃蛇游戏，支持方向键、计分、碰撞结束和重新开始",
  "mode": "create",
  "appId": "app_xxx",
  "previousArtifact": null
}
```

修改已有应用时，`previousArtifact` 会包含当前应用的完整三文件和验收信息，服务端要求返回完整更新后的 bundle。

### 4.4 确定性校验

生成结果先通过 `validateGeneratedBundle()`，关键门禁包括：

- 必须且只能交付 `index.html`、`styles.css`、`app.js`；
- HTML 必须是完整文档，包含 viewport、应用根节点和固定的本地资源引用；
- JavaScript 必须语法正确；
- 禁止 `innerHTML`、`eval`、`new Function`、`document.write`；
- 禁止生成应用主动发起网络请求；
- 禁止生成应用直接访问 `localStorage/sessionStorage`；
- 禁止外部 URL、内联事件和嵌套 iframe；
- 生成包总大小不能超过 400,000 字符；
- 生成应用的可见内容不能暴露底层供应商或模型名称；
- 贪吃蛇必须具备 Canvas、方向键事件、游戏循环、分数、启动状态和重新开始；
- 计算器必须可以完成 `7 + 5 = 12`；
- CRUD 应用必须具备可见的新增入口、主输入、保存按钮和持久化桥。

### 4.5 自动修复

若校验失败：

1. 保存本次错误列表；
2. 将错误和上一轮完整产物加入修复请求；
3. 再次生成并重新校验；
4. 总尝试次数最多 3 次；
5. 401/403 等认证错误立即失败，不做无意义重试；
6. 非法 JSON 会保留原始输出作为下一轮修复上下文。

### 4.6 保存和预览

只有校验通过后才会：

- 创建 `status: "READY"` 的版本；
- 更新项目的 `spec/files/currentVersionId`；
- 把状态写入浏览器存储；
- 将三文件组装进 sandbox iframe；
- 在运行轨迹中记录 generate、repair、validate、save、ready 等真实状态。

任何失败结果都不会覆盖当前可用版本。

---

## 5. 数据持久化

ForgeFlow 有两类数据，保存位置和协议不同。

### 5.1 Builder 数据

`src/core/storage.js` 将以下数据写入 `forgeflow.v1.state`：

- 项目列表和当前项目；
- 对话消息；
- AppSpec 运行元数据；
- pending plan；
- 运行轨迹与校验结果；
- 三个生成源码文件；
- READY 版本列表和当前版本指针。

刷新页面后，`store.js` 会重新加载这些数据。

### 5.2 生成应用的业务数据

预览 iframe 没有 `allow-same-origin`，不能直接使用宿主页面的存储。生成应用通过以下协议与宿主通信：

```text
iframe ready(appId)
    → host 校验 appId
    → host 返回 init(data)

iframe save(key, data)
    → host 校验 key === forgeflow.appdata.<当前 appId>
    → host 写入 localStorage
```

`preview-bridge.js` 同时校验消息来源、当前 `appId` 和精确存储 key，因此一个生成应用不能读取或覆盖另一个项目的数据。

### 5.3 导入导出和版本

- 项目 JSON 导出同时包含项目、版本、源码和业务数据；
- 导入时校验 `kind/version`，项目 ID 冲突时自动分配新 ID；
- 每个项目最多保留 30 个完整版本；
- 恢复旧版本只移动当前指针并恢复对应 `spec/files`，不会删除后续历史。

线上 Vercel 版本的持久化边界是浏览器 `localStorage`，可以刷新恢复，但不能跨设备同步。本地 Node 模式保留账号和 JSON 快照同步能力，用于展示完整服务端方案。

---

## 6. 安全与稳定性设计

### 6.1 密钥

- API Key 只从服务端环境变量读取；
- `.env.local` 已被 `.gitignore` 忽略；
- 浏览器请求、健康接口、生成响应和导出 JSON 都不返回 Key；
- 公共 API 响应不返回供应商或模型字段。

### 6.2 预览隔离

- iframe 使用 `sandbox`，不包含 `allow-same-origin`；
- 生成代码不能联网、动态执行代码或直接访问浏览器存储；
- 预览文档注入 CSP；
- 动态文本使用 `textContent/createElement`，禁止 `innerHTML`。

### 6.3 生成保护

`generation-guard.mjs` 默认限制：

- 每个匿名客户端每小时 5 次；
- 每个实例每天 30 次；
- 同时最多 2 个生成任务；
- 超限返回 429，繁忙返回 503，并携带明确提示；
- 原始 IP 只用于生成内存摘要，不写入应用日志。

Vercel 多实例下这仍是 best effort；若进入正式生产，应迁移到共享 Redis/KV，并增加身份认证、审计和成本告警。

### 6.4 对外展示

产品 UI、历史消息、运行轨迹、Console 和公开 API 均使用中性的“AI Agent/智能生成”表述，不展示底层供应商和模型名称。生成结果也有对应的品牌暴露校验。

---

## 7.实际执行方式

本项目不是一次性生成整仓代码，而是按可验证的工程步骤推进：

1. 阅读题目与参考产品，明确交互主链和交付边界；
2. 建立目录、模块职责、数据契约和状态机；
3. 实现计划审批、生成 API、服务端生成适配器和确定性校验；
4. 实现 sandbox 预览、postMessage 持久化、版本和导入导出；
5. 使用终端执行静态检查、单元测试和 Playwright；
6. 用真实浏览器验证页面、生成应用和刷新恢复；
7. 通过 GitHub 发布源码，Vercel 自动部署生产地址；
8. 用 Production URL 验证浏览器 → API → AI 生成 → 校验 → 预览 → 持久化完整链路；
9. 每次修改后重新执行与风险对应的测试，不把未运行的检查写成通过。

使用的工具能力包括：

- 文件搜索和代码阅读：定位调用入口、存储 key、状态字段与测试断言；
- 代码编辑：模块化修改前端、服务端、测试和文档；
- 终端：运行 Node 测试、Playwright、Git、静态检查和 HTTP 冒烟；
- 浏览器自动化：完成 GitHub 发布、Vercel 在线页面和真实交互验证；
- GitHub Actions：解包网页上传的发布包并提交完整源码；
- Vercel：托管静态前端和 `/api/*` Serverless Functions。

---

## 8. 当前文件结构

```text
atomlite-workbuddy/
├── index.html                       # 欢迎页与三栏工作台
├── api/
│   ├── health.mjs                   # Vercel 健康接口
│   └── generate.mjs                 # Vercel 统一生成入口
├── server.mjs                       # 本地静态/API/账号同步服务
├── server/
│   ├── deepseek-generator.mjs       # 服务端 AI 生成、解析和自动修复
│   ├── llm-validator.mjs            # 生成产物确定性校验
│   ├── generation-guard.mjs         # 限流、预算和并发保护
│   ├── sync-store.mjs               # 本地账号和快照同步
│   └── env.mjs                      # 本地环境变量加载
├── src/
│   ├── core/
│   │   ├── llm-plan.js              # 统一计划
│   │   ├── llm-agent.js             # 统一执行和 READY 版本创建
│   │   ├── storage.js               # Builder/业务数据持久化与导入导出
│   │   ├── versions.js              # 版本追加和恢复
│   │   └── parser/blueprints/...    # 预置、兼容和纯函数回归
│   ├── ui/
│   │   ├── app.js                   # UI 控制器
│   │   ├── llm-client.js            # /api/generate 客户端
│   │   ├── preview-bridge.js        # iframe 持久化桥
│   │   └── sidebar/plan-view/viewer # 对话、计划、轨迹和查看器
│   └── styles/                      # 基础、工作台和响应式样式
├── test/                            # node:test 单元/服务端/API 测试
├── e2e/                             # 可重复离线浏览器主链
├── e2e-live/                        # 真实在线生成应用验收
├── docs/
│   ├── architecture.md
│   ├── test-report.md
│   └── vercel-deploy.md
├── playwright.config.js
├── playwright.live.config.js
├── playwright.production.config.js
└── vercel.json
```

---

## 9. 测试与验收证据

### 9.1 当前回归

```text
npm run test:unit  → 85/85 passed
npm run test:e2e   → 2/2 passed
```

85 个测试覆盖：

- 统一 AI 计划和 create/modify 模式；
- 三文件生成与安全校验；
- 非法 JSON、认证失败、校验失败和自动修复；
- 计算器、贪吃蛇和 CRUD 专项契约；
- appId 隔离与 postMessage 持久化协议；
- Builder 状态、业务数据、导入导出和版本恢复；
- 限流、每日预算和并发令牌；
- Vercel API 方法、参数和公开字段；
- CSS `[hidden]` 可见性回归。

2 条离线 Playwright E2E 覆盖：

- 普通任务请求确实调用 `/api/generate`；
- 计划审批 → 生成 → CRUD → 刷新恢复；
- 本地 Node 模式注册、上传和第二浏览器下载；
- 页面无脚本错误且关键操作可见。

### 9.2 生产链路验收

`npm run test:e2e:production` 直接访问 Vercel Production URL，不使用生成 fixture。统一生成链路的完整验收结果为 **3/3 通过**：

1. 计算器：点击 `7 + 5 =` 得到 `12`；
2. 贪吃蛇：可以启动、进入 running、响应方向键；
3. 任务管理器：可以新增“复习 Agent 工程护栏”，整页刷新后仍存在。

这三条验证的是完整链路：

```text
浏览器 → Vercel /api/generate → 服务端 AI → 确定性校验/修复
→ READY 版本 → sandbox 交互 → postMessage 持久化
```

最近一次产品文案去模型化修改没有改变生成链路；该修改重新通过 85/85 单元测试、2/2 离线 E2E，并完成线上 UI 与 `/api/health` 冒烟验证。没有把未重复执行的付费生成测试写成新一轮结果。

---

## 10. 部署结果

### 10.1 线上地址

- Production：https://forgeflow-atoms-demo.vercel.app/
- 源码：https://github.com/liuli1221/forgeflow-atoms-demo

### 10.2 部署形态

- 仓库根目录由 Vercel 以 `Other` Framework Preset 部署；
- 静态文件直接提供 Builder UI；
- `/api/health` 和 `/api/generate` 运行于 Vercel Functions；
- 服务端环境变量保存 API Key；
- 每次 GitHub `main` 更新触发新的 Production Deployment。

当前健康接口已经验证：

```json
{
  "ok": true,
  "service": "forgeflow",
  "runtime": "vercel-function",
  "storage": "browser",
  "llm": { "configured": true }
}
```

公开响应只说明生成服务是否配置，不展示供应商和模型名称。

---

## 11. 当前边界

- Vercel 在线版的数据保存在当前浏览器，刷新可恢复，但不能跨设备同步；
- 本地 Node 模式提供账号同步演示，但还不是生产级数据库方案；
- 生成应用限制为三个无外部依赖的单页文件；
- 公网额度是实例内存级 best effort，不是严格的全局计费系统；
- 自动化浏览器测试固定使用 Chrome，尚未覆盖 Firefox、WebKit 和真实移动设备；
- 版本保存完整源码，上限为 30 条；
- AI 输出存在延迟、超时或偶发格式错误，系统通过超时、自动修复和 READY 门禁降低影响，但不能承诺每次请求都成功。


面试时可以用一句话总结：

> ForgeFlow 不是按关键词挑模板，而是把所有创建和修改统一交给服务端 AI 生成；模型产物必须通过确定性契约并可自动修复，只有 READY 版本才会进入 sandbox 预览，业务数据再通过受控 postMessage 桥持久化。
