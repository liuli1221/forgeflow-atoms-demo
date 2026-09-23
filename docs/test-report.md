# 测试报告

- 项目：ForgeFlow（`w/atomlite-workbuddy`）
- 更新日期：2026-09-23
- 环境：macOS (darwin-arm64) · Node v26.0.0 · Chrome
- 命令：`npm run test:unit` / `npm run test:e2e` / `npm run test:e2e:llm`

> **口径说明**：本报告只记录**实际执行过**的验证。Node 回归与 Playwright Chrome E2E 均可重复运行；跨浏览器与真实移动设备仍未覆盖。

---

## 1. 汇总

```
$ npm run test:unit
# tests 85
# suites 0
# pass 85
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms ≈ 196

$ npm run test:e2e
2 passed
```

| 测试文件 | 用例 | 结果 | 覆盖对象 |
|----------|------|------|----------|
| `test/parser.test.mjs` | 13 | ✅ | `core/parser.js`（8 类蓝图 + 显式 Schema → AppSpec） |
| `test/mutator.test.mjs` | 10 | ✅ | `core/mutator.js`（增量修改） |
| `test/generator.test.mjs` | 9 | ✅ | `core/generator/*` + `core/validator.js` |
| `test/versions.test.mjs` | 6 | ✅ | `core/versions.js`（版本/恢复） |
| `test/storage.test.mjs` | 8 | ✅ | `core/storage.js`（持久化/导入导出） |
| `test/preview-bridge.test.mjs` | 1 | ✅ | iframe 只能按当前 appId 读取/写入业务数据 |
| `test/agent.test.mjs` | 11 | ✅ | `core/agent.js`（状态机/六阶段/取消） |
| `test/hidden-visibility.test.mjs` | 9 | ✅ | **hidden 显隐回归（本次 P0 bugfix）** |
| `test/sync-store.test.mjs` | 1 | ✅ | 注册/登录/密码哈希/快照/revision 冲突 |
| `test/llm-plan.test.mjs` | 2 | ✅ | 创建/修改均统一走 DeepSeek，并保留 appId |
| `test/llm-validator.test.mjs` | 4 | ✅ | 计算器/贪吃蛇/CRUD 持久化契约与危险 API 门禁 |
| `test/deepseek-generator.test.mjs` | 4 | ✅ | 契约修复、无效 JSON 修复、缺 Key、认证失败立即停止 |
| `test/generation-guard.test.mjs` | 4 | ✅ | 每客户端时窗、全站每日预算、并发令牌、环境配置 |
| `test/vercel-api.test.mjs` | 3 | ✅ | Vercel health、方法门禁、prompt 前置校验 |
| 单元与服务端合计 | **85** | **85 pass / 0 fail** | |
| `e2e/forgeflow.spec.js` | 2 | ✅ | 真实 Chrome + 确定性 API 替身：普通任务确实请求 `/api/generate`、CRUD、刷新、账号同步、页面错误 |
| `e2e-live/llm-apps.spec.js` | 3 | ⚠️ | 真实 DeepSeek：三个用例分别通过；最近一次合并运行第三个请求发生外部超时 |
| `playwright.production.config.js` + `e2e-live/llm-apps.spec.js` | 3 | ✅ | Vercel Production：计算器、贪吃蛇、任务 CRUD/刷新，3/3 通过 |

`core` 层完全 DOM-free，Node 可直接 `import`，不需要 jsdom。

---

## 2. 用例清单

### 2.1 `parser.test.mjs`（13）

1. 面试任务管理器 → task 领域，含优先级/分类筛选/统计
2. 习惯打卡 → habit 领域，识别连续天数
3. 记账 → budget 领域，含金额与结余指标
4. 反馈收集 → feedback 领域，识别评分字段
5. inventory / crm / event / library 四类新增蓝图可生成合法 AppSpec
6. 未知领域的“字段包括…”被解析为 custom Schema，而非 generic 固定字段
7. 未命中领域且无显式字段 → generic 兜底并标记 fallback
8. 否定句式：不需要统计 → `showStats=false`
9. 暗色主题与表格视图可以从描述中识别
10. 非法输入降级：非字符串 / 过短 / 空白
11. 超长输入被截断但不崩溃
12. 应用名抽取会去掉引导动词与尾部噪声
13. `detectDomain` 在多领域词共存时取分数最高者

### 2.2 `mutator.test.mjs`（10）

增加优先级字段并派生指标 / 新增字段后示例数据补默认值 / 暗色-亮色切换 / 卡片-表格视图切换 /
改名与主题色 / 移除字段与移除统计模块 / 自定义字段与新增下拉选项 /
无法识别指令时不改任何东西 / 非法输入（空 spec、过短指令）/ 连续多轮修改可叠加。

### 2.3 `generator.test.mjs`（9）

1. 生成三个非空源文件（`index.html` / `styles.css` / `app.js`）
2. 生成的 `app.js` 语法合法（`new Function` 静态语法检查）
3. **恶意 prompt 无法逃逸出脚本或 HTML**（`</script>` / `<img onerror>` 均被转义）
4. 生成代码不使用 `innerHTML` / `eval` / `document.write`
5. 预览文档把 CSS/JS 内联，不再引用外部文件
6. `validateBundle` 对正常产物全部通过
7. `validateBundle` 能挡住损坏的产物（缺文件 / 语法错 / 用了 innerHTML）
8. `validateBundle` 对非法 AppSpec 直接失败
9. 不同领域产出不同字段与指标（不是只换标题）

### 2.4 `versions.test.mjs`（6）

版本序号递增追加 / 上限 30 滚动淘汰 / `restoreVersion` 回到历史版本且不破坏历史 /
对不存在或非 READY 版本返回错误而不抛异常 / 指针缺失时回落最新版本 / `findVersion` 返回 `null`。

### 2.5 `storage.test.mjs`（8）

状态往返（projects/messages/versions/runEvents）/ 损坏 JSON 降级空状态 /
`activeProjectId` 指向已删项目时自动修正 / 业务数据只能写 `forgeflow.appdata.*` 前缀 /
导出导入往返带走业务数据 / 导入非法文件给出明确原因 / 导入 id 冲突重新分配 /
`clearAll` 只清自己的 key。

### 2.6 `agent.test.mjs`（11）

`prepareRequest` 五种分支（create / 过短拒绝 / modify / 换领域但保留 `appId` / 无法识别不产计划）/
`applyPlanOverrides` 生效 / `executeRun` 六阶段 running→done 产出 READY 版本 /
**校验失败时不产生版本（当前版本得以保留）** / 可取消 / 版本号基于已有版本递增 /
预置演示项目跑通完整管线。

### 2.7 `hidden-visibility.test.mjs`（9，本次新增）

1. 级联求解器能复现这个 bug：类规则的 `display` 会压掉 `[hidden]`（**元测试：先证明检查器本身有效**）
2. 生成的 `styles.css` 带 `[hidden]` 全局兜底
3. **P0：`#overlay` 在 `hidden=true` 时 computed display 必须是 `none`**
4. 生成 HTML 里所有 hidden 元素都真的不可见（`#stats` / `.search-box` / `#filters` / `#empty` / `#overlay` / `#form-error` / `#toast`）
5. JS 运行时切换的元素（overlay / toast / empty / form-error）同样可隐藏
6. `validateBundle` 会拦住丢掉 `[hidden]` 兜底的 CSS
7. Builder `base.css` 带 `[hidden]` 全局兜底
8. `index.html` 里所有 hidden 元素都真的不可见（含同步面板状态）
9. Builder 运行时切换的 `.preview-empty` 仍可隐藏（全局兜底替代了逐个补丁）

### 2.8 `sync-store.test.mjs`（1）

覆盖注册、重复用户名冲突、错误密码、scrypt 密码哈希、登录、快照写入/读取、revision 409 冲突与磁盘持久化。

### 2.9 `e2e/forgeflow.spec.js`（2）

真实 Chrome 拦截 `/api/generate` 并返回确定性 DeepSeek 协议替身，覆盖普通任务需求确实进入 API、计划审批、
预览 CRUD、整页刷新恢复、账号注册上传、第二浏览器登录下载恢复，以及首屏 `pageerror` 冒烟检查。这里验证的是
浏览器到 API 再到 UI/持久化的稳定回归，不冒充真实模型调用；真实模型由单独的 live 套件验证。

### 2.10 LLM 生成与修复（10）

- task CRUD、计算器、贪吃蛇以及修改请求全部走 DeepSeek，不存在 generic CRUD 或本地模板分流。
- 三文件生成包必须通过 HTML、JS 语法、安全、专项交互与数据持久化契约。
- fake transport 首轮返回缺少计算器契约的代码，第二轮断言修复 prompt 包含确定性校验错误，并成功产出 READY 结果。
- fake transport 返回代码围栏/无效 JSON 时，确定性提取器会尝试去围栏与截取对象；仍失败则把原始响应带入下一轮修复。
- 没有 Key 时不请求模型；401 认证失败只请求一次，不进入无意义的代码修复。

### 2.11 公网生成保护（4）

- 同一匿名客户端达到小时额度后返回 429，窗口结束后恢复；
- 并发上限返回 503，任务结束释放令牌，重复释放不会破坏计数；
- 每日预算跨客户端生效，并在 UTC 次日重置；
- Vercel/本地环境变量可调整三类限制，异常值回落到安全默认值。

### 2.12 Vercel Production 验收（2026-09-23）

- `GET https://forgeflow-atoms-demo.vercel.app/api/health` 返回 `runtime=vercel-function`、`storage=browser`、`llm.configured=true`；
- 线上 `POST /api/generate` 真实调用 DeepSeek，计算器首轮通过确定性校验并返回三个源码文件；
- 统一 DeepSeek 路由发布后，`npm run test:e2e:production` **3/3 通过**：计算器实际点击 `7 + 5 =` 得到
  `12`；贪吃蛇启动后状态为 `running` 并响应方向键；任务管理器新增“复习 Agent 工程护栏”后整页刷新，
  项目、版本和业务数据均恢复。三条请求都访问线上 `/api/generate`，不使用 mock。

---

## 3. P0 Bug 修复记录：`hidden` 失效

### 3.1 现象

生成应用里 `#overlay`（新增/编辑表单弹层，内含 `#form-fields`）的 DOM 属性是 `hidden = true`，
但 computed `display` 仍然是 `flex` —— 半透明遮罩和表单永久盖在页面上，应用无法正常使用。

### 3.2 根因

不是 JS 没执行，而是 **CSS 级联**：

```
UA 样式表   [hidden] { display: none }      特异性 (0,1,0)
项目样式    .overlay { display: flex }      特异性 (0,1,0) 但源码顺序更后 → 胜出
```

`[hidden]` 只是 UA 默认样式，任何**显式声明了 `display`** 的类规则都会把它覆盖掉。
`node.hidden = true` 本身是生效的（属性确实在），只是不再意味着「不可见」。

### 3.3 影响面盘查

按「元素是否被 hidden 切换」× 「其类规则是否声明 display」逐个核对：

| 位置 | 元素 | 类规则的 display | 修复前 |
|------|------|------------------|--------|
| 生成应用 | `#overlay.overlay` | `flex` | ❌ **P0：弹层永久可见** |
| 生成应用 | `#stats.stats` | `grid` | ❌ `showStats=false` 时统计区仍显示 |
| 生成应用 | `#filters.filters` | `flex` | ❌ `showFilters=false` 时筛选区仍显示 |
| 生成应用 | `.search-box` | 未声明 | ✅ 正常（只有 `flex: 1 1 220px`） |
| 生成应用 | `#toast.toast` | 未声明 | ✅ 正常（仅 `position: fixed`） |
| 生成应用 | `#empty.empty` | 未声明 | ✅ 正常 |
| 生成应用 | `#form-error.form-error` | 未声明 | ✅ 正常 |
| Builder | `#welcome.welcome` | `flex` | ❌ 欢迎页关不掉，和工作台叠在一起 |
| Builder | `#workbench.workbench` | `flex` | ❌ 首屏工作台提前露出 |
| Builder | `#import-file` | 未声明 | ✅ 正常 |
| Builder | `.preview-empty` | `grid` | ⚠️ 已有单点补丁 `.preview-empty[hidden]` |

`toast` / `empty` / `form-error` 当前碰巧是对的——因为它们没写 `display`，属于**偶然正确**，
任何人后续给它们加一句 `display: flex` 就会静默复现同一个 bug。所以修复方式选全局兜底，不做逐个补丁。

### 3.4 修复

| 文件 | 改动 |
|------|------|
| `src/styles/base.css` | 新增全局 `[hidden] { display: none !important; }`（带原因注释） |
| `src/core/generator/css.js` | 生成的 `styles.css` 同样内置该兜底规则 |
| `src/styles/workbench.css` | 删除冗余的 `.preview-empty[hidden] { display: none }` 单点补丁 |
| `src/core/validator.js` | 新增确定性校验项 `css-hidden`：产物 CSS 必须含该兜底，否则 **validate 失败 → 不保存 READY 版本** |
| `test/hidden-visibility.test.mjs` | 新增 9 个回归用例（见 2.7） |

`!important` 在这里是有意为之：「hidden 必须不可见」是不可协商的约束。
需要淡入淡出动画的元素应改用 `.is-open` 之类状态类，而不是依赖 `hidden`。

### 3.5 回归验证方式

首轮修复时尚未建立浏览器自动化，因此测试里实现了一个**最小 CSS 级联求解器**（`!important` > 特异性 > 源码顺序，
把 UA 的 `[hidden]` 规则也纳入参与竞争），对每个 hidden 元素求解 `display`：

- 先用元测试证明求解器能在「修复前」的 CSS 上算出 `flex`（即这套检查确实抓得住这个 bug）；
- 再断言修复后的 Builder CSS 与生成 CSS 上，所有 hidden 元素都算出 `none`；
- 另外断言 `validateBundle` 在兜底规则被删除时会 fail。

这项静态门禁继续保留，同时新增的 Playwright E2E 提供真实渲染与完整交互回归。

---

## 4. 浏览器验收与未覆盖项（如实说明）

### 4.1 已执行：连接 Chrome 的真实交互验收

- 新建项目 → 输入需求 → 检查并批准计划 → v1 生成，15/15 校验通过。
- 新增「验证持久化任务」，总数 4→5；整页刷新后项目、版本和 5 条业务数据仍在。
- 输入「切换暗色主题并改成表格视图」→ 批准 → v2；数据仍为 5 条。
- 恢复 v1；Console 显示 `版本恢复：v1` 和 `app ready with 5 items`，预览回到卡片视图。
- 检查源码三文件入口；执行项目 JSON 导出；内置 Console 未出现 error。

### 4.2 已执行：可重复 Playwright Chrome E2E

`npm run test:e2e` 实际完成 2/2：

1. 新建普通“面试任务管理器”，断言请求实际到达 `/api/generate`，且 mode 为 `create`；
2. 使用符合 DeepSeek 返回协议的确定性 fixture 生成 v1，在 sandbox 预览中新增任务，整页刷新后项目与业务数据仍在；
3. 注册账号并上传；创建第二个独立浏览器上下文，登录同一账号并下载；项目、版本及新增任务均恢复；
4. 独立冒烟用例检查页面标题、首屏关键按钮和 `pageerror`；
5. Playwright 启动真实本机 Chrome，失败保留 trace 与截图。

### 4.3 未覆盖

- 没有真实移动端视口验证；移动端只有 CSS 断点静态审查。
- 没有跨浏览器兼容性验证。
- `src/ui/*` 没有细粒度单元测试；核心 UI 主链由 E2E 覆盖。
- 无可访问性专项审计、无跨浏览器兼容性测试。

### 4.4 已执行：真实 DeepSeek E2E

`npm run test:e2e:llm` 现在从自然语言分别创建计算器、贪吃蛇和任务管理器。三个用例都进入
`DeepSeek LLM` 计划与 `/api/generate`：计算器实际点击 `7 + 5 =` 并断言 `12`；贪吃蛇启动、断言状态为
`running` 并发送方向键；任务管理器新增数据后整页刷新并断言恢复。

三个用例都已在最终代码上分别通过。最近一次三条合并执行时，计算器和贪吃蛇通过，第三个 DeepSeek 请求在
210 秒内没有返回，页面仍停在 generate running，因此该次结果不是 3/3。服务端单次模型调用上限随后从
120 秒收紧到 60 秒，避免无限等待；没有用重试结果掩盖外部模型延迟。该 live 套件会产生真实 API 用量，
不包含在 `npm run test:all` 中。

## 5. 已执行的非单测验证

```
$ node server.mjs
ForgeFlow dev server running at http://127.0.0.1:4173

$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/                        → 200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/src/styles/base.css     → 200
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:4173/src/styles/workbench.css → 200
$ curl -s http://127.0.0.1:4173/src/styles/base.css | grep hidden
  → [hidden] { display: none !important; }        # 修复后的规则确实被服务出去了
```

即：静态资源可访问、修复进入本地产物；随后真实 Chrome 也验证了初始弹层隐藏、点击后表单字段出现以及保存成功。CSS 级联求解器负责把这次人工发现固化成可重复回归。

## 6. 公网部署验证

- GitHub：`https://github.com/liuli1221/forgeflow-atoms-demo`
- Pages：`https://liuli1221.github.io/forgeflow-atoms-demo/`
- `pages-build-deployment` 成功完成；公开 URL 返回 ForgeFlow 页面而非 404。
- 在公开 URL 上点击「直接看预置演示」，预置项目、15 项校验结果、预览 iframe 与示例数据均成功加载。

公网 Pages 只能体验预置项目，不能创建或修改应用；完整生成链路使用 Vercel。账号同步 E2E 针对本地 Node 服务模式。Playwright 配置现已进入仓库，可在具备 Chrome 的 CI 环境重复运行。
