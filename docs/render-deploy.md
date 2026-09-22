# GitHub + Render 单服务部署

ForgeFlow 的 Node 服务同时提供静态前端、`/api/generate`、`/api/auth` 和 `/api/sync`，因此在 Render 上只需一个 Web Service，不需要拆分前后端，也没有跨域配置。

## 1. 发布前门禁

```bash
npm ci
npm run test:unit
npm run test:e2e
npm run test:e2e:llm
```

前三组本地回归必须全绿。`test:e2e:llm` 会产生真实 DeepSeek 用量，必须使用有效 Key；它会实际验证计算器 `7 + 5 = 12` 和贪吃蛇启动/方向键，不是 mock。

## 2. 推送 GitHub

确认 `.env.local` 未被 Git 跟踪：

```bash
git check-ignore .env.local
git status --short
```

提交并推送源码；只能提交 `.env.example`，不能提交 `.env.local`。

## 3. 创建 Render Blueprint

1. 登录 Render，选择 **New → Blueprint**。
2. 连接 `https://github.com/liuli1221/forgeflow-atoms-demo`。
3. Render 自动读取仓库根目录的 `render.yaml`。
4. 创建时填写 `DEEPSEEK_API_KEY`；它在 Blueprint 中是 `sync: false`，不会进入 Git。
5. 确认服务名、Singapore 区域和 Free 计划后创建。

Blueprint 已配置：

- Node Web Service；
- `npm ci --omit=dev` 构建、`npm start` 启动；
- `HOST=0.0.0.0`，端口使用 Render 自动提供的 `PORT`；
- `/api/health` 健康检查；
- 每次推送自动部署；
- `FORGEFLOW_SESSION_SECRET` 自动生成；
- 每客户端每小时 5 次、全站每天 30 次、最多 2 个并发生成。

## 4. 持久化边界

浏览器项目、版本和生成应用数据写在用户自己的 `localStorage`，刷新后保留，不依赖 Render 磁盘。

账号跨设备同步当前写入服务端 JSON。Render Free 文件系统是临时的，重新部署或实例重启后该 JSON 可能丢失。面试只演示浏览器刷新持久化时可以保留 Free 方案；若要承诺跨设备长期恢复，需要升级到支持持久化磁盘的计划：

1. 挂载磁盘到 `/opt/render/project/src/storage`；
2. 新增环境变量：

```text
FORGEFLOW_DATA_FILE=/opt/render/project/src/storage/sync.json
```

不要把“浏览器刷新仍在”和“服务端跨设备永久恢复”混为一谈。

## 5. 公网验收

部署成功后，按以下顺序验证 Render 的 `onrender.com` 地址：

1. `GET /api/health` 返回 `ok: true`、`llm.configured: true`；
2. 计算器生成后点击 `7 + 5 =`，显示 `12`；
3. 贪吃蛇生成后点击开始，状态变成 `running`，方向键可控制；
4. 刷新页面，项目、源码和 READY 版本仍在；
5. 生成失败不会覆盖当前版本；
6. 同一客户端超过每小时额度后收到 429，而不是继续消耗模型余额；
7. Render 日志中没有 API Key 和完整敏感请求体。

## 6. 提交给面试官

提供三项：

- Render 完整 AI Demo 地址；
- GitHub 源码地址；
- `WORKBUDDY_PROCESS.md` 和 `docs/test-report.md`。

GitHub Pages 地址只能标为静态降级版；完整验收应使用 Render 地址。
