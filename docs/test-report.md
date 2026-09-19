# 测试报告

- 项目：ForgeFlow（`w/atomlite-workbuddy`）
- 日期：2026-09-19
- 环境：macOS (darwin-arm64) · Node v22.22.2
- 命令：`node --test`（等价于 `npm test`）

> **口径说明**：本报告只记录**实际执行过**的验证。Node 回归可重复执行；浏览器部分是连接 Chrome 完成的一次真实交互验收，不等同于可在 CI 重跑的 Playwright E2E。

---

## 1. 汇总

```
$ node --test
# tests 64
# suites 0
# pass 64
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms ≈ 488
```

| 测试文件 | 用例 | 结果 | 覆盖对象 |
|----------|------|------|----------|
| `test/parser.test.mjs` | 11 | ✅ | `core/parser.js`（自然语言 → AppSpec） |
| `test/mutator.test.mjs` | 10 | ✅ | `core/mutator.js`（增量修改） |
| `test/generator.test.mjs` | 9 | ✅ | `core/generator/*` + `core/validator.js` |
| `test/versions.test.mjs` | 6 | ✅ | `core/versions.js`（版本/恢复） |
| `test/storage.test.mjs` | 8 | ✅ | `core/storage.js`（持久化/导入导出） |
| `test/agent.test.mjs` | 11 | ✅ | `core/agent.js`（状态机/六阶段/取消） |
| `test/hidden-visibility.test.mjs` | 9 | ✅ | **hidden 显隐回归（本次 P0 bugfix）** |
| 合计 | **64** | **64 pass / 0 fail** | |

`core` 层完全 DOM-free，Node 可直接 `import`，不需要 jsdom。

---

## 2. 用例清单

### 2.1 `parser.test.mjs`（11）

1. 面试任务管理器 → task 领域，含优先级/分类筛选/统计
2. 习惯打卡 → habit 领域，识别连续天数
3. 记账 → budget 领域，含金额与结余指标
4. 反馈收集 → feedback 领域，识别评分字段
5. 未命中领域 → generic 兜底且标记 fallback
6. 否定句式：不需要统计 → `showStats=false`
7. 暗色主题与表格视图可以从描述中识别
8. 非法输入降级：非字符串 / 过短 / 空白
9. 超长输入被截断但不崩溃
10. 应用名抽取会去掉引导动词与尾部噪声
11. `detectDomain` 在多领域词共存时取分数最高者

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
8. `index.html` 里所有 hidden 元素都真的不可见（`#welcome` / `#workbench` / `#import-file`）
9. Builder 运行时切换的 `.preview-empty` 仍可隐藏（全局兜底替代了逐个补丁）

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

由于没有浏览器自动化，测试里实现了一个**最小 CSS 级联求解器**（`!important` > 特异性 > 源码顺序，
把 UA 的 `[hidden]` 规则也纳入参与竞争），对每个 hidden 元素求解 `display`：

- 先用元测试证明求解器能在「修复前」的 CSS 上算出 `flex`（即这套检查确实抓得住这个 bug）；
- 再断言修复后的 Builder CSS 与生成 CSS 上，所有 hidden 元素都算出 `none`；
- 另外断言 `validateBundle` 在兜底规则被删除时会 fail。

这不是真实渲染，但它检查的正是本次出错的那一层（级联优先级），比「grep 一下有没有这行」强。

---

## 4. 浏览器验收与未覆盖项（如实说明）

### 4.1 已执行：连接 Chrome 的真实交互验收

- 新建项目 → 输入需求 → 检查并批准计划 → v1 生成，15/15 校验通过。
- 新增「验证持久化任务」，总数 4→5；整页刷新后项目、版本和 5 条业务数据仍在。
- 输入「切换暗色主题并改成表格视图」→ 批准 → v2；数据仍为 5 条。
- 恢复 v1；Console 显示 `版本恢复：v1` 和 `app ready with 5 items`，预览回到卡片视图。
- 检查源码三文件入口；执行项目 JSON 导出；内置 Console 未出现 error。

### 4.2 未覆盖

- **没有可重复运行的 Playwright/Puppeteer E2E。** WorkBuddy 曾尝试下载可选 Playwright 浏览器，但被取消；没有把该尝试计入测试结果。
- 没有真实移动端视口验证；移动端只有 CSS 断点静态审查。
- 没有跨浏览器兼容性验证。
- `src/ui/*`（DOM 控制器）没有单元测试覆盖，只靠 `core` 层测试 + 静态审查。
- postMessage 持久化桥已经过上述刷新场景验证，但尚无自动化 E2E 回归。
- 无可访问性专项审计、无跨浏览器兼容性测试。

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

公网验证是一次真实 Chrome 冒烟测试；它不替代尚未建立的 Playwright/Puppeteer CI E2E。
