# WORKBUDDY_PROCESS.md

使用 WorkBuddy 完成 ForgeFlow（Atoms-like Demo）的完整过程记录。
按时间/阶段推进，**只记录实际发生的事**；未执行的内容不写入。

- 日期：2026-09-19
- 工作目录：`/Users/lilianlliu/Documents/Codex/2026-09-19/w/atomlite-workbuddy`
- 运行环境：macOS (darwin-arm64) · Node v22.22.2 · git 2.48.1

> 说明：第 0–9 节记录 2026-09-19 至 2026-09-21 的原始本地 Agent 方案，属于历史决策记录。
> 面试官随后要求计算器/贪吃蛇必须按需求真实生成；2026-09-22 的 Hybrid Agent 改造见第 10 节。
> 2026-09-23 进一步统一为所有用户请求都走 DeepSeek，见第 11 节；当前 README 与架构文档以第 11 节为准。

---

## 0. 原始题目理解

题目要求做一个 Atoms-like 的产品 Demo：**用自然语言生成一个真实可交互的小型网页应用**，
并在同一个工作台中呈现计划、执行过程、代码、预览和版本。

关键约束的理解与拆解：

| 原始约束 | 我的理解 |
|----------|----------|
| 线上 Demo 无需 API Key | 不能依赖任何 LLM 服务。必须用**受约束的本地 Agent**：真实解析 → AppSpec → 等待确认 → 代码生成 → 确定性校验 → 预览。**并且要诚实标注**，不能伪装成在调大模型 |
| 「不是只在固定页面改标题」 | 解析器必须真的影响产出：不同领域 → 不同字段、不同筛选、不同指标、不同示例数据。这是本项目最核心的技术点 |
| 原生 HTML/CSS/JS ES Modules，无 CDN 无 npm | 所有逻辑自己写；`server.mjs` 只用 Node 内置模块；`package.json` 不能有 `dependencies` |
| 预览数据必须持久化 | 需要解决「sandbox iframe 无同源存储」这个真实工程问题 |
| 只有 validate 通过才保存 READY 版本 | 版本系统必须有明确的 READY 语义，失败时严禁覆盖当前版本 |
| 不允许用户 Prompt 直接拼接进可执行脚本 | AppSpec 必须以**数据**形式注入（转义 `<` 等），生成的运行时禁用 `innerHTML/eval` |

产品名：**ForgeFlow**。

---

## 1. 使用 WorkBuddy 的 Prompt 摘要

本次是**单轮长需求 + 自主执行**模式，没有多轮澄清。用户给出的 Prompt 要点（摘要）：

1. 作为本项目主开发者，**直接在本地完成**可运行/可测试/可部署的 Demo，不要只给建议；
   目录锁定 `w/atomlite-workbuddy`，不得修改目录外文件。
2. 产品名 ForgeFlow；采用「受约束的本地 Agent + AppSpec + 代码生成器」；
   诚实标注 Local Agent / 无需 API Key。
3. 技术栈：原生 HTML/CSS/JS ES Modules，无 CDN 无 npm，可部署 GitHub Pages；
   提供 `server.mjs`（Node 内置 http）和 `node:test` 测试。
4. P0 十条功能清单（欢迎页、三栏工作台、真实解析、计划审批、真实 CRUD、sandbox 预览 + 数据持久化、
   Builder 持久化、增量修改 + 版本恢复、预置演示项目、完整状态处理 + 导入导出）。
5. 工程要求：模块分离、AppSpec schema 校验、iframe 合理 sandbox、动态文本转义、
   自动化测试（prompt→AppSpec / 增量修改 / 版本恢复 / 非法输入降级）、
   README / WORKBUDDY_PROCESS / docs/architecture / docs/test-report、Git 初始化。
6. 验收：`node --test` 全绿；`node server.mjs` 浏览器验证完整链路；检查移动端与 console；
   如实汇报限制，**未部署就不要声称已部署**。

WorkBuddy 侧的执行策略：先建任务清单（4 个阶段），再按 core → ui → test → docs 顺序推进，
每个阶段用真实命令验证后再进入下一阶段。

---

## 2. 任务拆解

| 阶段 | 内容 | 状态 |
|------|------|------|
| S1 | 工程骨架（目录/git/package.json/server.mjs）+ core 纯函数层 | ✅ 完成 |
| S2 | Builder UI（欢迎页、三栏、计划审批、轨迹、预览/代码/Console/版本）+ Agent 运行时 | ✅ 完成 |
| S3 | 自动化测试，跑通 `node --test` | ✅ 完成（首轮 55 passed / 0 failed） |
| S4 | 首轮文档 + 本地 Git 提交 | ✅ 完成 |
| S5 | 真实浏览器发现 P0、修复 CSS 级联并增加发布门禁 | ✅ 完成（64 passed / 0 failed） |
| S6 | 连接 Chrome 完整验收：生成、CRUD、刷新、增量修改、恢复、导出 | ✅ 完成 |
| S7 | 发布公开 GitHub 仓库与 GitHub Pages，并做公网冒烟验收 | ✅ 完成 |
| S8 | 根据面试反馈扩展 8 类蓝图 + 自定义 Schema、账号同步服务端、Playwright E2E | ✅ 完成（67 unit + 2 E2E） |

---

## 3. 技术选型

| 决策点 | 选择 | 理由 / 被否决的方案 |
|--------|------|---------------------|
| Agent 实现 | **确定性规则引擎**（关键词打分 + 否定识别 + 句式抽取） | 唯一能做到「无 API Key 且真实可用」的方案。否决了「假装调 LLM」和「内置极小模型」（体积与依赖不可接受） |
| 中间表示 | **AppSpec**（JSON 契约） | 把「理解」和「生成」解耦：解析器/修改器只产出 spec，生成器只消费 spec。这样增量修改、版本恢复、校验都能落在同一个对象上 |
| 领域覆盖 | blueprint 模式：`baseFields + optionalFields + filterFields + doneField` | 加一个新领域 = 加一张表，不用改解析器主干 |
| 预览 | `iframe srcdoc` + `sandbox="allow-scripts allow-forms ..."`（**无 allow-same-origin**） | `allow-scripts + allow-same-origin` 会让沙箱形同虚设（脚本可自行摘掉 sandbox）。代价是 iframe 内无 localStorage |
| 预览数据持久化 | **postMessage 桥 + 宿主 localStorage** | 是上一条的直接后果。额外收益：Builder 能统计和导出业务数据。生成的 app.js 同时支持「嵌入模式」和「独立模式」，下载后单独打开也能存 |
| 生成代码的 DOM 构建 | 全量 `createElement/textContent` | 结构性地消灭 XSS，而不是靠转义函数「记得调用」。`validator.js` 把 `innerHTML/eval/document.write` 列为硬性失败项 |
| Prompt 注入 | `toSafeJson()`：`<` `>` `U+2028/9` 全部转义 | 保证内联 `<script>` 无法被用户文本提前闭合 |
| 预览脚本类型 | 预览用 **classic script**，下载版用 `type="module"` | 沙箱 iframe 是 opaque origin，模块脚本解析不稳定；生成代码本身不含 import/export，两种形式都合法 |
| 状态管理 | 自写 `store`（订阅 + 防抖持久化） | 不引依赖；规模也不需要框架 |
| 测试 | `node:test` + 纯函数层 | core 完全 DOM-free，Node 可直接 import，不需要 jsdom |
| 可注入点 | storage backend、`sleep`/`tick`、`shouldCancel` | 让「持久化」「六阶段动画」「取消」这些副作用在测试里可控 |

---

## 4. 关键取舍

1. **诚实 > 炫技**：没有做「打字机式假 LLM 输出」。欢迎页、顶栏、README 都写明这是本地规则引擎。
   代价是听起来没那么「AI」，收益是 Demo 经得起追问。
2. **解析深度 vs 稳定性**：选择关键词打分 + 否定窗口这种可解释方案，而不是复杂文法。
   命中不了就明确落 `generic` 兜底并在 UI 上说明，而不是强行猜一个领域。
3. **sandbox 安全 vs 实现简单**：拒绝 `allow-same-origin` 这条捷径，多写了一个 postMessage 桥。
4. **失败时的默认行为**：validate 失败 → `version = null` → 控制器不动 `project.spec/files`。
   宁可「这次没生成」，也不能把用户已有的可用版本改坏。
5. **增量修改沿用 `appId`**：否则每次改版都会换存储命名空间，用户在预览里录入的数据会「消失」。
   这条在 `agent.test.mjs` 里有专门断言。
6. **版本上限 30 条**：localStorage 有配额，每个版本都完整存三份源码。用滚动淘汰换取「不会写爆」。
7. **下载不打包 zip**：打包需要依赖或手写 zip 编码，性价比低，改为逐个文件下载。
8. **渲染幂等 + iframe 守卫**：整页重渲染最简单，但会把预览重置。用 `projectId:versionId` 做 key 守卫，
   只在版本真变化时才重设 `srcdoc`。

---

## 5. 实际完成项

### 文件清单（新增，均在 `w/atomlite-workbuddy` 内）

```
index.html                      Builder 外壳（欢迎页 + 三栏工作台 + 移动端底部导航）
server.mjs                      Node 内置 http 静态服务器（含路径穿越防护）
package.json                    无 dependencies；scripts: start / test
.gitignore
README.md                       运行/测试/功能/架构/目录/Pages 部署/演示步骤/限制
WORKBUDDY_PROCESS.md            本文件
docs/architecture.md            分层、AppSpec、解析算法、安全模型、预览桥、持久化
docs/test-report.md             测试清单与实际执行结果

src/core/util.js                uid / clone / escapeHtml / toSafeJson / slugKey / 时间格式化
src/core/spec-schema.js         AppSpec schema 字段级校验（永不抛异常）
src/core/blueprints.js          task/habit/budget/feedback/generic 蓝图 + 指标/示例数据派生
src/core/parser.js              自然语言 → AppSpec（领域打分/否定识别/特性抽取/名称抽取）
src/core/mutator.js             AppSpec + 修改指令 → 新 AppSpec（不可变，8 类操作）
src/core/planner.js             AppSpec → 可审批实施计划 + RUN_STAGES 六阶段定义
src/core/agent.js               状态机：prepareRequest / applyPlanOverrides / executeRun
src/core/generator/index.js     生成入口 + buildPreviewDocument 内联
src/core/generator/html.js      index.html 生成（用户文本全部 escapeHtml）
src/core/generator/css.js       styles.css 生成（主题 token + 响应式断点）
src/core/generator/js.js        app.js 生成（createElement/textContent，无 innerHTML）
src/core/validator.js           15 项确定性校验（含 hidden 门禁、语法检查、禁用 API）
src/core/versions.js            createVersion/appendVersion/restoreVersion/currentVersion
src/core/storage.js             状态持久化 + appdata 命名空间 + 导入导出 + 后端可注入
src/core/seed.js                预置「面试准备计划器」（跑真实流水线产出）

src/ui/app.js                   控制器：事件绑定、状态流转、导入导出、tab/移动端导航
src/ui/store.js                 状态容器（订阅 + 防抖保存 + 隐私模式降级）
src/ui/preview-bridge.js        iframe postMessage 宿主端（来源校验 + key 前缀校验）
src/ui/sidebar.js               项目列表 / 对话流 / 建议 chips
src/ui/plan-view.js             可编辑计划卡 + 运行轨迹 + 校验结果
src/ui/viewer.js                代码浏览 / Console / 版本列表
src/ui/dom.js                   el() 等工具（显式禁止 innerHTML）
src/ui/toast.js                 轻提示
src/styles/base.css             设计 token + 欢迎页 + toast
src/styles/workbench.css        三栏布局、计划卡、轨迹、代码/Console/版本面板
src/styles/responsive.css       1180 / 1000 / 760 三档断点 + reduced-motion

test/parser.test.mjs            11 用例
test/mutator.test.mjs           10 用例
test/generator.test.mjs          9 用例
test/versions.test.mjs           6 用例
test/storage.test.mjs            8 用例
test/agent.test.mjs             11 用例
test/hidden-visibility.test.mjs  9 用例
```

### P0 对照

| P0 | 实现位置 | 说明 |
|----|----------|------|
| 1 欢迎页 | `index.html#welcome` + `app.js` | `welcomeSeen` 持久化；「创建第一个项目」与「直接看预置演示」两个入口 |
| 2 三栏 + 移动端 | `workbench.css` / `responsive.css` | 1180/1000/760 三档；760 以下单栏 + 底部导航 |
| 3 真实解析 | `parser.js` + `blueprints.js` | 4 领域 + generic 兜底；否定识别；面试语境切换分类预设 |
| 4 计划审批 | `planner.js` + `plan-view.js` + `agent.js` | 计划可改名称/视图/主题/三个模块开关；六阶段 running→done 真实切换 |
| 5 真实 CRUD | `generator/js.js` | 新增/编辑/删除（两步确认）/搜索/筛选/统计/视图切换/一键完成/重置示例数据 |
| 6 sandbox 预览 + 数据持久化 | `preview-bridge.js` + 生成运行时 | 无 `allow-same-origin`；postMessage 桥；刷新后数据仍在 |
| 7 Builder 持久化 | `storage.js` + `store.js` | projects/messages/AppSpec/pendingPlan/runEvents/versions/files 全部入库 |
| 8 增量修改 + 版本 | `mutator.js` + `versions.js` + `viewer.js` | 新增字段/暗色/视图/改名/主题色/下拉选项；版本预览、查看代码、一键恢复 |
| 9 预置项目 | `seed.js` | 真实跑 parse→plan→generate→validate，校验不过就不入库 |
| 10 状态处理 | 各处 | 空状态文案、校验错误列表、运行中禁用输入、取消/重试按钮、保存 toast、项目 JSON 导入导出（含业务数据） |

---

## 6. 验证证据

### 6.1 单元测试

```
$ node --test
...
# tests 64
# pass 64
# fail 0
# duration_ms ≈ 488
```

（S3 时为 55 个用例；S5 修复 hidden bug 后新增 9 个，共 64 个。详细清单见 `docs/test-report.md`。）

### 6.2 静态服务器

```
$ node server.mjs
ForgeFlow dev server running at http://127.0.0.1:4173

$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/                 → 200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/src/ui/app.js    → 200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/src/styles/base.css → 200
```

### 6.3 真实浏览器验收（连接 Chrome，2026-09-19 18:12-18:14）

WorkBuddy 首轮声称的「Playwright 完整链路」不成立：它尝试下载可选浏览器，但下载被取消，且没有产生可核验的浏览器结果。之后由当前会话连接真实 Chrome 完成手动自动化验收，实际结果如下：

1. 新建空项目并输入「做一个面试任务管理器，支持优先级、分类筛选和进度统计」。
2. 确认先进入 `awaiting_approval`，计划中识别 `task`、5 字段、3 个筛选、4 个指标；批准后才生成 v1。
3. 运行轨迹六阶段全部完成；校验面板显示 **15/15 pass**，包含新增的 `css-hidden` 门禁。
4. 预览初始不显示弹窗；点击「+ 新增任务」后出现 5 个真实表单字段，保存「验证持久化任务」后总数由 4 变 5。
5. 整页刷新后，Builder 项目、v1、5 条业务数据及「验证持久化任务」均恢复。
6. 输入「切换暗色主题并改成表格视图」，计划识别两处修改；批准后生成 v2，预览为暗色表格且仍有 5 条数据。
7. 在版本页恢复 v1，Console 记录 `版本恢复：v1` 与 `app ready with 5 items`，预览回到亮色卡片并保留新增数据。
8. 代码页可查看 `index.html / styles.css / app.js`；点击导出后出现「项目 JSON 已导出」。
9. 内置 Console 全程只有 `info`，本次链路未出现 error。

当时仍未做：真实移动端视口调整、跨浏览器测试，以及可重复 E2E；其中 Chrome Playwright E2E 已在 S8 补齐。

### 6.4 公开交付验证

- GitHub 源码：https://github.com/liuli1221/forgeflow-atoms-demo
- 在线 Demo：https://liuli1221.github.io/forgeflow-atoms-demo/
- GitHub Actions 的 `pages-build-deployment` 实际运行成功（36 秒）。
- 在公网 Demo 中实际打开欢迎页、点击「直接看预置演示」，确认 Builder、预置版本、15 项校验结果和 sandbox 交互应用均能加载。
- 终端没有可用的 GitHub HTTPS/SSH 凭据，因此发布采用已登录 GitHub 网页上传发布包，再由一次性 Actions 工作流在仓库内解包并提交完整目录。首版工作流错误地在 job 级使用 `hashFiles`，运行失败；改为幂等 shell 检查后第二次运行成功，发布包已从仓库删除，源码目录完整展开。失败过程保留在 Actions 历史中，未伪装成一次成功。

### 6.5 面试反馈后的抢救修复（2026-09-21）

面试官指出三项主要风险：领域仅四类、无登录/服务端存储、无可重复浏览器 E2E。本轮实际修复：

1. 领域蓝图扩展为 task / habit / budget / feedback / inventory / crm / event / library 八类；
2. 新增 `extractCustomFields()`，未知领域只要显式写“字段包括…”，就会生成 custom AppSpec，支持 6 种字段类型与下拉选项，不再只能套 generic 固定字段；
3. Node 服务模式新增账号注册/登录、scrypt 密码哈希、HMAC 签名会话、服务端快照和 revision 乐观锁；第二个浏览器可以恢复项目、版本与业务数据；
4. 引入 `@playwright/test`，新增 2 条真实 Chrome E2E，完整跑通 custom Schema → 生成 → CRUD → 刷新 → 注册上传 → 第二浏览器登录下载；
5. 单元/服务端测试从 64 增至 67，Playwright 2/2 通过；agent-browser 额外确认首屏非空、无错误浮层、关键入口存在。

边界没有隐藏：GitHub Pages 不执行 Node API，因此当前 Pages 地址仍是浏览器本地模式；账号同步代码已完成并通过 E2E，但公开跨设备同步需要把 Node 服务部署到持久化运行环境。

---

## 7. 未完成项 / 明确不在范围内

- 已完成 GitHub 与 Pages 公开交付；本地仓库保留原始 WorkBuddy 提交历史，远端网页发布采用独立提交历史（原因见 6.4）。
- 没有真实移动端视口与跨浏览器验收；移动端目前是 CSS 断点静态审查。
- 没有做多语言（界面为简体中文）。
- 没有做可访问性专项审计（只做了基础 `aria-label` / `role` / 键盘 Esc 关闭）。
- 没有做 IE / 老浏览器兼容（依赖 ES2020+、`dialog`-free 自绘弹层、CSS 变量）。
- 生成的应用不支持图表、CSV 导入和关系型数据；账号同步当前是单机 JSON 存储，不是生产级多租户数据库。
- 解析器没有做分词/词向量，纯关键词与句式规则。
- `src/ui/*` 无单元测试覆盖。

---

## 8. 如果继续投入的扩展优先级

| 优先级 | 事项 | 价值 |
|--------|------|------|
| **P1** | 部署账号同步服务并替换为数据库 | 当前 Node 单机 JSON 方案已经可用，但 Pages 不能承载 API，多实例还需要数据库、限流和审计 |
| P1 | **AppSpec 版本 diff 视图**（v1→v2 字段/主题/布局变化高亮） | 版本多了以后「这次到底改了啥」是最高频问题 |
| P1 | **生成应用的数据导入/导出（CSV）** | 目前业务数据只能随项目 JSON 走，独立导出更实用 |
| P1 | Playwright 增加移动视口 + Firefox/WebKit | 当前 Chrome 主链已可重复，下一步补兼容性矩阵 |
| P2 | **解析器可解释面板**：显示命中了哪些关键词、得分多少、为什么落到某领域 | 强化「真实解析」的说服力，也方便调参 |
| P2 | **计划卡上直接编辑字段**（增删字段、改 label/类型/选项） | 现在只能改名称/视图/主题/模块开关 |
| P2 | **图表指标**（完成率趋势、分类分布），用原生 SVG 手绘 | 不引依赖也能做 |
| P3 | 可选的「LLM 增强模式」：用户自带 Key 时走模型解析，不填就用本地 Agent | 保持零 Key 可用的同时提升上限 |
| P3 | 版本快照压缩（只存 diff）+ 提高版本上限 | 解决 localStorage 配额 |
| P3 | 生成应用的主题编辑器（实时调 accent/圆角/密度） | 锦上添花 |

---

## 9. 阶段更新日志

- **S1 完成**：目录与 git 初始化；`package.json` / `.gitignore` / `server.mjs`；
  core 九个模块落地；用一次性脚本冒烟验证「seed 项目可完整跑通」，输出
  `domain=task, fields=title,category,status,priority,due,notes` 符合预期。
  发现并修复：应用名抽取漏了「搞/弄/整」这类口语动词。
- **S2 完成**：`index.html` 三栏骨架 + 三份样式；ui 八个模块；
  预览脚本从 `type="module"` 改为 classic script（opaque origin 下更稳），同步改了 `validator` 的对应检查项；
  运行中把计划卡切成只读，避免重渲染冲掉用户正在编辑的输入。
- **S3 完成**：6 个测试文件、55 个用例，一次修正（我写错了断言里的预期应用名，
  实际解析出的 `任务清单` 才是正确行为）后全绿。
- **S4 完成**：README / architecture / 本文件与首轮本地 Git 提交。WorkBuddy 随后尝试安装可选 Playwright 浏览器，但下载卡住后被取消；没有把这次尝试记成 E2E 结果。
- **S5 完成**：真实 Chrome 首次打开预置版本时发现 `#overlay.hidden=true` 但 computed `display=flex`；WorkBuddy 修复 Builder 与生成应用的全局 `[hidden]` 规则，在 validator 增加 `css-hidden` 硬门禁，并新增 9 个回归用例。第二个 WorkBuddy 收尾响应被客户端取消，但 7 个文件的改动已落盘。
- **S6 完成**：当前会话独立执行 `node --test`（64/64）并连接 Chrome 跑通新建项目、计划审批、生成、预览 CRUD、刷新持久化、增量修改、v1 恢复、代码查看与 JSON 导出；具体证据见 6.3。
- **S7 完成**：创建公开仓库 `liuli1221/forgeflow-atoms-demo`；在终端 HTTPS/SSH 凭据均不可用时，改用 GitHub 网页上传 + 一次性 Actions 解包，第二次工作流成功；启用 `main/(root)` Pages，`pages-build-deployment` 成功，并在公网地址完成欢迎页和预置演示冒烟验收。
- **S8 完成**：针对面试反馈，扩展 8 类蓝图与 custom Schema；增加账号/服务端同步及 revision 冲突保护；加入 Playwright devDependency 与 2 条 Chrome E2E。最终实际结果：67/67 unit、2/2 E2E。

---

## 10. 第二轮抢救：真实 DeepSeek 生成（2026-09-22）

面试官复测发现“生成计算器/贪吃蛇”仍落入 generic CRUD。本轮不再扩关键词模板，而是增加一条真实 LLM 路径：

1. `llm-plan.js` 把计算器、贪吃蛇、游戏/工具类和本地解析 fallback 路由到 DeepSeek；已知 CRUD 继续走原确定性链路；
2. `POST /api/generate` 在 Node 服务端读取 `DEEPSEEK_API_KEY`，浏览器与生成应用都看不到 Key；
3. DeepSeek 使用 JSON Schema 返回 `index.html/styles.css/app.js`，不是预写计算器或贪吃蛇模板；
4. `llm-validator.mjs` 校验三文件、JS 语法、外部网络/动态执行等安全约束，以及计算器/贪吃蛇专项交互契约；
5. 产物校验失败时，把错误与上一版 bundle 回送模型，最多 2 次自动修复；401/403 立即失败；
6. 只有校验通过才写 READY 版本；失败或取消保留当前版本；预览额外注入 CSP 禁止联网；
7. 新增真实 LLM Playwright：计算器必须点击 `7 + 5 =` 得到 `12`，贪吃蛇必须可启动并响应方向键。

本轮真实 LLM 基础改造最初执行结果：`npm run test:unit` **75/75**，`npm run test:e2e` **2/2**。首次
`npm run test:e2e:llm` 到达 DeepSeek 但旧凭证无效，因此当时如实记录为 **0/2**。2026-09-22 换用有效 Key
后重新执行，计算器 `7+5=12` 和贪吃蛇启动/方向键最终 **2/2 通过**。

新的部署边界：GitHub Pages 只能运行静态本地链路，不能承载 `/api/generate`。完整在线 Demo 必须部署 Node 服务并在服务端环境变量中配置 Key。

### 10.1 Render 方案评估与放弃

随后按公开 Demo 风险补齐部署层：新增 `render.yaml`，使用一个 Node Web Service 同时承载静态前端和三组 API；
绑定 `0.0.0.0`、使用 Render 的 `PORT`、配置 `/api/health`、自动生成会话密钥并把 DeepSeek Key 标为
`sync:false`。新增生成用量保护：每客户端小时额度、全站每日预算、并发上限、429/503 与 `Retry-After`，
原始 IP 只在内存中参与摘要、不写日志。新增 4 条限流测试后单元/服务端结果为 **79/79**。

账号同步的 JSON 在 Render Free 文件系统上不是持久存储；浏览器 localStorage 的刷新恢复仍有效。实际创建
Blueprint 时 Render 要求银行卡身份验证，因此没有把“准备完成”误写成“已部署”，并按用户决定改用 Vercel。

### 10.2 Vercel Serverless 发布改造

Vercel 版本新增 `api/health.mjs`、`api/generate.mjs` 和 `vercel.json`：仓库根目录直接托管静态前端，
行为型/开放需求调用同域 Serverless Function，Key 只放 Vercel Environment Variables。线上 health 明确返回
`storage: browser`，因此 UI 不会伪装账号同步可用；本地 `node server.mjs` 仍保留账号/JSON 同步用于工程演示。

新增 3 条 Vercel Function 回归后，实际结果为 **82/82 unit/service/function + 2/2 离线 Chrome E2E +
2/2 真实 DeepSeek E2E**。实例内限流在 Serverless 多实例环境只是 best effort，正式生产需要共享 Redis/KV；
完整步骤与验收口径见 `docs/vercel-deploy.md`。

### 10.3 Vercel Production 发布与线上验收

2026-09-23 将 `liuli1221/forgeflow-atoms-demo` 导入 Vercel。首次自动识别为 Node preset，线上 `/api/health`
仍命中旧 `server.mjs`；随后将 Framework Preset 修正为 `Other`、覆盖有效的服务端 DeepSeek Secret 并重新部署。
最终 Production URL 为 `https://forgeflow-atoms-demo.vercel.app/`，健康检查返回
`runtime: vercel-function`、`storage: browser`、`llm.configured: true`。

新增可重复运行的 `npm run test:e2e:production`。它直接访问 Production URL，真实生成并操作计算器与贪吃蛇；
实际结果为 **2/2 通过**：计算器 `7+5=12`，贪吃蛇可启动并响应方向键。该结果与本地离线 E2E、
本地真实 DeepSeek E2E 分开记录，没有把“部署 READY”误当成“功能验收通过”。

---

## 11. 第三轮迭代：统一 DeepSeek 生成入口（2026-09-23）

用户进一步指出：同一个产品里一部分需求直接调用 DeepSeek、另一部分走离线规则，会造成能力边界不一致，
也会让面试官怀疑 CRUD 仍是预写模板。因此本轮把“生成决策”和“工程护栏”彻底拆开：

1. `src/ui/app.js` 的创建和修改请求全部调用 `prepareLlmRequest()`；批准后只执行 `executeLlmRun()`；
2. 删除 `shouldUseLlm()` 和 UI 的本地执行分支。task、habit、budget、feedback、计算器、贪吃蛇和未知领域
   全部请求同源 `POST /api/generate`；
3. 原 `parser/blueprints/mutator/generator` 保留给预置演示、历史版本兼容和纯函数回归，不再参与用户提示词路由；
4. 确定性能力继续作为 LLM 外围护栏：三文件结构、HTML/JS 语法、危险 API、安全体积、计算器和贪吃蛇
   交互契约、CRUD 稳定测试标识、关键控件可见性、postMessage 持久化协议、READY 版本门禁；
5. iframe 宿主要求 `ready.appId` 和业务数据保存 key 都必须精确匹配当前 `appId`，防止生成应用越权读取或
   覆盖另一个项目的数据；
6. DeepSeek 返回无效 JSON 时，先尝试去代码围栏和提取首尾对象；仍失败则把原始响应与错误送入下一次修复，
   不再丢失模型输出上下文；
7. CRUD 指令新增可验收契约：`item-add` 打开表单，`item-title` 是主输入，`item-save` 必须是可见的新增提交按钮，
   每次数据变更都通过带精确 `appId` 的 postMessage 桥保存；
8. 单次 DeepSeek 调用默认超时从 120 秒收紧到 60 秒，避免外部请求异常时页面长时间停在 running。

本轮回归结果：`npm run test:unit` **85/85**，`npm run test:e2e` **2/2**。新增 preview bridge 单测，确认
错误 appId 不能读取或写入其他项目数据。离线浏览器用例不再直接验证
本地生成器，而是拦截 `/api/generate` 返回确定性协议 fixture，并断言普通任务需求确实请求了 API，再覆盖 CRUD、
刷新恢复和账号跨浏览器同步。

真实 DeepSeek 套件扩为三条：计算器、贪吃蛇、任务管理器。三条均在最终代码上分别通过，其中任务管理器完成
新增数据与整页刷新恢复。测试过程中实际发现并修复了三类问题：空列表容器没有尺寸导致错误的“不可见”断言；
DeepSeek 偶发返回无效 JSON 时修复轮缺少原始上下文；模型把 `item-save` 放在隐藏的编辑表单中。最近一次三条
合并运行时，计算器和贪吃蛇通过，第三个请求发生外部超时，因此如实保留该结果，不写成 3/3。

统一路由版本发布到 Vercel 后，再对 Production URL 执行完整三条套件，最终 **3/3 通过**：计算器
`7+5=12`，贪吃蛇可启动并响应方向键，任务管理器可新增“复习 Agent 工程护栏”且整页刷新后数据仍存在。
这次结果验证了浏览器 → Vercel `/api/generate` → DeepSeek → 确定性校验 → READY 版本 → postMessage
持久化的完整线上链路。
