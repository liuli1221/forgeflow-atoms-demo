/**
 * index.html generator.
 *
 * Emits a static shell only. Every piece of user-derived text goes through
 * escapeHtml; everything dynamic is rendered by app.js from the AppSpec.
 */
import { escapeHtml } from '../util.js';

export function generateHtml(spec) {
  const name = escapeHtml(spec.appName);
  const tagline = escapeHtml(spec.tagline);
  const entity = escapeHtml(spec.entityName);
  const showSearch = spec.layout.showSearch;
  const showStats = spec.layout.showStats;
  const showFilters = spec.layout.showFilters;

  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${escapeHtml(spec.theme.mode)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name}</title>
  <meta name="generator" content="ForgeFlow deterministic demo snapshot" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <div class="app-shell">
    <header class="app-header">
      <div class="app-title">
        <h1>${name}</h1>
        <p class="tagline">${tagline}</p>
      </div>
      <div class="header-actions">
        <button id="view-toggle" class="btn ghost" type="button" title="切换视图">切换视图</button>
        <button id="add-btn" class="btn primary" type="button">+ 新增${entity}</button>
      </div>
    </header>

    <section id="stats" class="stats"${showStats ? '' : ' hidden'} aria-label="统计指标"></section>

    <section class="toolbar">
      <div class="search-box"${showSearch ? '' : ' hidden'}>
        <input id="search" type="search" placeholder="搜索${entity}…" autocomplete="off" />
      </div>
      <div id="filters" class="filters"${showFilters ? '' : ' hidden'}></div>
      <span class="count" id="result-count"></span>
    </section>

    <main id="list" class="list" aria-live="polite"></main>

    <p id="empty" class="empty" hidden></p>

    <footer class="app-footer">
      <span>ForgeFlow 预置演示 · 数据保存在当前浏览器</span>
      <button id="reset-btn" class="btn link" type="button">重置为示例数据</button>
    </footer>
  </div>

  <div id="overlay" class="overlay" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">新增${entity}</h2>
      <form id="item-form" novalidate>
        <div id="form-fields" class="form-fields"></div>
        <p id="form-error" class="form-error" hidden></p>
        <div class="modal-actions">
          <button type="button" id="cancel-btn" class="btn ghost">取消</button>
          <button type="submit" class="btn primary">保存</button>
        </div>
      </form>
    </div>
  </div>

  <div id="toast" class="toast" hidden></div>

  <script type="module" src="./app.js"></script>
</body>
</html>
`;
}
