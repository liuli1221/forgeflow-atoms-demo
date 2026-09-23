# GitHub + Vercel 部署

ForgeFlow 在 Vercel 上使用一个 Project：仓库根目录作为静态前端，`api/health.mjs` 和
`api/generate.mjs` 作为 Node.js Serverless Functions。浏览器与 API 同域，不需要 CORS；DeepSeek Key
只存在于 Vercel 服务端环境变量。

当前 Production：<https://forgeflow-atoms-demo.vercel.app/>

## 1. 部署前验证

```bash
npm ci
npm run test:unit
npm run test:e2e
npm run test:e2e:llm
npm run test:e2e:production
```

当前本地结果：85/85 unit/service/function、2/2 离线 Chrome E2E。真实 DeepSeek 套件包含计算器、贪吃蛇和
任务管理器三条：三条分别通过；最近一次合并运行的第三条遇到外部请求超时，未记作 3/3。统一路由版本发布后
再执行 3 条 Vercel Production E2E。live 套件会产生真实 API 用量。

## 2. 导入 GitHub 仓库

1. Vercel 选择 **Add New → Project**。
2. 导入 `liuli1221/forgeflow-atoms-demo`。
3. Framework Preset 选择 **Other**，Root Directory 保持仓库根目录。
4. 不需要 Build Command 或 Output Directory；Vercel 直接托管静态文件并识别 `api/` Functions。

## 3. 服务端环境变量

至少配置：

```text
DEEPSEEK_API_KEY=<只填写在 Vercel Secret 中>
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_TIMEOUT_MS=60000
FORGEFLOW_GENERATE_PER_HOUR=5
FORGEFLOW_GENERATE_DAILY=30
FORGEFLOW_GENERATE_CONCURRENCY=2
```

`DEEPSEEK_API_KEY` 应作用于 Production 和 Preview，不得使用 `NEXT_PUBLIC_` 前缀，不得写入 Git、前端或日志。

## 4. 持久化边界

Vercel 线上版本的项目、版本、生成源码和应用业务数据都保存在用户浏览器 `localStorage`，刷新后恢复。
本地 `node server.mjs` 的账号/JSON 同步 API 不部署到 Vercel，因为 Serverless 本地文件不是持久存储。
需要跨设备恢复时，应先接入数据库，再开放账号同步。

## 5. 公网限流边界

Function 在调用 DeepSeek 前执行匿名客户端时窗、每日次数和并发保护，原始 IP 只参与 SHA-256 摘要且不写日志。
这些计数保存在热实例内存中；Vercel 横向扩容或冷启动后并非严格的全局预算。面试 Demo 可用，公开长期运行应
迁移到共享 Redis/KV，并在 DeepSeek 账户侧配置余额与用量告警。

## 6. 部署后验收

1. `GET /api/health` 返回 `ok: true`、`runtime: vercel-function`、`storage: browser` 和
   `llm.configured: true`。
2. 新建计算器并实际点击 `7 + 5 =`，显示 `12`。
3. 新建贪吃蛇，点击开始后状态为 `running`，方向键可控制。
4. 新建普通任务管理器，新增一条任务后刷新，项目、版本和任务数据仍存在。
5. 对任务管理器发送修改指令，确认仍请求同源 `/api/generate`，没有切换到本地模板。
6. 查看 Network，浏览器只请求同源 `/api/generate`，响应和日志中没有 API Key。

GitHub Pages 只能标注为静态降级版；交给面试官的完整验收链接使用 Vercel Production URL。
