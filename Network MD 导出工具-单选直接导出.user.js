// ==UserScript==
// @name         Network MD 导出工具-单选直接导出
// @namespace    https://docs.scriptcat.org/
// @version      3.7.2
// @description  拦截XHR/Fetch，点击接口直接导出MD文件，悬浮按钮可拖动，最新请求置顶，支持导出Store State（自动剔除 lang 节点）
// @author       You
// @updateURL    https://raw.githubusercontent.com/WDYSY/Script/main/Network MD 导出工具-单选直接导出.user.js
// @downloadURL  https://raw.githubusercontent.com/WDYSY/Script/main/Network MD 导出工具-单选直接导出.user.js
// @match        *://*.ctrip.com/*
// @match        *://*.ctripcorp.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const requests = new Map();
  const STORAGE_KEY = '__nmd_btn_pos';

  function normalizeHeaders(headers) {
    if (!headers) return {};
    if (typeof headers.entries === 'function') {
      const obj = {};
      for (const [k, v] of headers.entries()) obj[k] = v;
      return obj;
    }
    if (typeof headers === 'object' && !Array.isArray(headers)) return Object.assign({}, headers);
    return {};
  }

  function safeParse(str) {
    if (str === null || str === undefined || str === '') return null;
    try { return JSON.parse(str); } catch (e) { return str; }
  }

  function safeStringify(obj) {
    try { return JSON.stringify(obj, null, 2); } catch (e) { return String(obj); }
  }

  function storeRequest(data) {
    try {
      const urlObj = new URL(data.url, location.origin);
      const apiName = urlObj.pathname.split('/').pop() || urlObj.pathname;
      if (requests.has(data.url)) requests.delete(data.url);
      requests.set(data.url, {
        name: apiName,
        url: data.url,
        method: data.method || 'GET',
        requestHeaders: data.requestHeaders || {},
        queryParams: data.queryParams || {},
        requestBody: data.requestBody !== undefined ? data.requestBody : null,
        response: data.response !== undefined ? data.response : null,
        responseHeaders: data.responseHeaders || {},
        time: new Date().toLocaleTimeString(),
      });
      updateBadge();
    } catch (e) {}
  }

  function getOrderedItems() {
    return Array.from(requests.values()).reverse();
  }

  // ─── 拦截 XHR ───────────────────────────────────────────

  // 改写原型方法而不是替换 window.XMLHttpRequest：
  // 模块联邦/微前端子应用里的 XHR 包装对象也能被识别，且不破坏 instanceof 与子类继承。
  // 拦截失败绝不能让业务抛错——页面里存在只实现 open/send 的轻量 XHR 占位对象。
  const XHRProto = win.XMLHttpRequest && win.XMLHttpRequest.prototype;
  if (XHRProto && !XHRProto.__nmdPatched) {
    const xhrMeta = new WeakMap();
    const origOpen = XHRProto.open;
    const origSetHeader = XHRProto.setRequestHeader;
    const origSend = XHRProto.send;

    XHRProto.open = function (method, url) {
      try { xhrMeta.set(this, { method: method, url: url, headers: {} }); } catch (e) {}
      return origOpen.apply(this, arguments);
    };

    XHRProto.setRequestHeader = function (name, value) {
      try {
        const meta = xhrMeta.get(this);
        if (meta) meta.headers[name] = value;
      } catch (e) {}
      return origSetHeader.apply(this, arguments);
    };

    XHRProto.send = function (body) {
      const xhr = this;
      try {
        const meta = xhrMeta.get(xhr);
        if (meta && typeof xhr.addEventListener === 'function') {
          const requestBody = safeParse(body);
          xhr.addEventListener('load', function () {
            try {
              const urlObj = new URL(meta.url, location.origin);
              const queryParams = {};
              urlObj.searchParams.forEach(function (v, k) { queryParams[k] = v; });
              const responseHeaders = {};
              (xhr.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).forEach(function (line) {
                const idx = line.indexOf(': ');
                if (idx > -1) responseHeaders[line.substring(0, idx)] = line.substring(idx + 2);
              });
              storeRequest({
                url: meta.url, method: meta.method,
                requestHeaders: Object.assign({}, meta.headers),
                queryParams, requestBody,
                response: safeParse(xhr.responseText), responseHeaders,
              });
            } catch (e) {}
          });
        }
      } catch (e) {}
      return origSend.apply(this, arguments);
    };

    try {
      Object.defineProperty(XHRProto, '__nmdPatched', { value: true, enumerable: false, configurable: true });
    } catch (e) { XHRProto.__nmdPatched = true; }
  }

  // ─── 拦截 Fetch ──────────────────────────────────────────

  const originalFetch = win.fetch.bind(win);
  win.fetch = async function (input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    const method = (init.method || (input && typeof input === 'object' ? input.method : null) || 'GET').toUpperCase();
    const mergedHeaders = normalizeHeaders(init.headers || (input && typeof input === 'object' ? input.headers : null));
    const rawBody = init.body !== undefined ? init.body : (input && typeof input === 'object' ? input.body : null);
    const requestBody = safeParse(rawBody);
    let response;
    try { response = await originalFetch(input, init); } catch (e) { throw e; }
    const cloned = response.clone();
    (async function () {
      try {
        const responseHeaders = normalizeHeaders(response.headers);
        const urlObj = new URL(url, location.origin);
        const queryParams = {};
        urlObj.searchParams.forEach(function (v, k) { queryParams[k] = v; });
        const ct = response.headers.get('content-type') || '';
        const resData = ct.indexOf('application/json') > -1 ? await cloned.json() : await cloned.text();
        storeRequest({ url, method, requestHeaders: mergedHeaders, queryParams, requestBody, response: resData, responseHeaders });
      } catch (e) {}
    })();
    return response;
  };

  // ─── 生成 MD ─────────────────────────────────────────────

  function generateItemMd(item, index) {
    const ticket = item.requestHeaders['ticket'] || item.requestHeaders['Ticket']
      || item.requestHeaders['x-ticket'] || item.requestHeaders['X-Ticket'] || '未找到';
    const lines = [];
    lines.push('## ' + (index !== undefined ? index + '. ' : '') + item.name);
    lines.push('');
    lines.push('| 字段 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 🕐 时间 | ' + item.time + ' |');
    lines.push('| 📡 Method | `' + item.method + '` |');
    lines.push('| 🎫 ticket | `' + ticket + '` |');
    lines.push('| 🔗 接口URL | `' + item.url + '` |');
    lines.push('| 🌐 页面URL | `' + win.location.href + '` |');
    lines.push('');
    lines.push('### Request Headers\n\n```json\n' + safeStringify(item.requestHeaders) + '\n```\n');
    lines.push('### Query Params\n\n```json\n' + safeStringify(item.queryParams) + '\n```\n');
    lines.push('### Request Body\n\n```json\n' + safeStringify(item.requestBody) + '\n```\n');
    lines.push('### Response Headers\n\n```json\n' + safeStringify(item.responseHeaders) + '\n```\n');
    lines.push('### Response Body\n\n```json\n' + safeStringify(item.response) + '\n```\n');
    return lines.join('\n');
  }

  function generateSingleMd(item) {
    const lines = [];
    lines.push('# Network 请求导出\n');
    lines.push('| 字段 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 导出时间 | ' + new Date().toLocaleString() + ' |');
    lines.push('| 页面URL | `' + win.location.href + '` |');
    lines.push('| 导出数量 | 1 条 |\n');
    lines.push('---\n');
    lines.push(generateItemMd(item, 1));
    lines.push('---\n');
    return lines.join('\n');
  }

  function generateMultiMd(items) {
    const lines = [];
    lines.push('# Network 请求导出\n');
    lines.push('| 字段 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 导出时间 | ' + new Date().toLocaleString() + ' |');
    lines.push('| 页面URL | `' + win.location.href + '` |');
    lines.push('| 导出数量 | ' + items.length + ' 条 |\n');
    lines.push('---\n');
    items.forEach(function (item, i) { lines.push(generateItemMd(item, i + 1)); lines.push('---\n'); });
    return lines.join('\n');
  }

  // ─── 生成文件名 ───────────────────────────────────────────

  function generateFilename(items) {
    const ts = new Date().toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);
    if (!Array.isArray(items)) {
      const name = (items.name || 'export').replace(/[\\/:*?"<>|]/g, '_');
      return name + '_' + ts + '.md';
    }
    const firstName = (items[0].name || 'export').replace(/[\\/:*?"<>|]/g, '_');
    return items.length === 1
      ? firstName + '_' + ts + '.md'
      : firstName + '_等' + items.length + '个接口_' + ts + '.md';
  }

  // ─── 下载 / 复制 ─────────────────────────────────────────

  function downloadMd(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || ('network-export-' + Date.now() + '.md');
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; }
    if (win.navigator && win.navigator.clipboard) { win.navigator.clipboard.writeText(text).catch(function () {}); return; }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
  }

  // ─── ✨ 新增：导出 Store State 为 JSON 文件（剔除 lang） ───

  // 需要从 state 中整体剔除的节点名，大小写不敏感
  const LANG_KEY = 'lang';

  /**
   * 深度剥离键名为 lang 的节点，返回 { value, count }
   * 只在命中路径上做浅拷贝，避免污染页面里真实的 store 状态
   */
  function stripLangNode(root) {
    const seen = new WeakMap();
    let count = 0;

    function walk(value, depth) {
      if (!value || typeof value !== 'object' || depth > 64) return value;
      if (seen.has(value)) return value;
      seen.set(value, true);

      if (Array.isArray(value)) {
        let copy = null;
        for (let i = 0; i < value.length; i++) {
          const child = walk(value[i], depth + 1);
          if (child !== value[i]) {
            if (!copy) copy = value.slice();
            copy[i] = child;
          }
        }
        return copy || value;
      }

      let copy = null;
      const keys = Object.keys(value);
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (k.toLowerCase() === LANG_KEY) {
          if (!copy) copy = Object.assign({}, value);
          delete copy[k];
          count++;
          continue;
        }
        let child;
        try { child = value[k]; } catch (e) { continue; }
        const stripped = walk(child, depth + 1);
        if (stripped !== child) {
          if (!copy) copy = Object.assign({}, value);
          copy[k] = stripped;
        }
      }
      return copy || value;
    }

    return { value: walk(root, 0), count };
  }

  /**
   * 尝试从页面上下文中找到 _$controller.store.getState()
   * 剔除 lang 节点后将结果下载为 state_nolang.json
   */
  function exportStoreState() {
    try {
      // 尝试直接访问（油猴脚本沙箱可能无法直接访问页面变量）
      let state = null;
      let source = '';

      // 方式一：通过 unsafeWindow 直接访问
      if (win._$controller && win._$controller.store && typeof win._$controller.store.getState === 'function') {
        state = win._$controller.store.getState();
        source = 'win._$controller.store';
      }
      // 方式二：通过 window 访问（备用）
      else if (window._$controller && window._$controller.store && typeof window._$controller.store.getState === 'function') {
        state = window._$controller.store.getState();
        source = 'window._$controller.store';
      }

      if (state === null && state === undefined) {
        showToast('❌ 未找到 _$controller.store，请确认页面已加载完毕');
        console.warn('[NMD] _$controller.store.getState() 不可访问，请在控制台手动执行：\ncopy(_$controller.store.getState())');
        return;
      }

      // 剔除 lang 节点（失败则原样导出，不阻断流程）
      let stateForExport = state;
      let langRemoved = 0;
      try {
        const stripped = stripLangNode(state);
        stateForExport = stripped.value;
        langRemoved = stripped.count;
      } catch (e) {
        console.warn('[NMD] 剔除 lang 节点失败，已回退为原始 state', e);
      }

      // 序列化
      let json;
      try {
        json = JSON.stringify(stateForExport, null, 2);
      } catch (e) {
        showToast('❌ State 序列化失败：' + e.message);
        console.error('[NMD] State 序列化失败', e);
        return;
      }

      // 生成文件名
      const ts = new Date().toISOString().replace('T', '_').replace(/:/g, '-').slice(0, 19);
      const filename = 'state_nolang_' + ts + '.json';

      // 下载
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);

      showToast('✅ ' + filename + ' 已导出（已移除 ' + langRemoved + ' 处 lang）');
      console.log('%c✅ [NMD] state_nolang.json 已导出，来源：' + source + '，移除 lang 节点 ' + langRemoved + ' 处', 'color:#a6e3a1;font-weight:bold');

    } catch (e) {
      showToast('❌ 导出失败：' + e.message);
      console.error('[NMD] exportStoreState 异常', e);
    }
  }

  // ─── Toast ───────────────────────────────────────────────

  function showToast(msg) {
    const old = document.getElementById('__nmd_toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = '__nmd_toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1e1e2e;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;padding:10px 16px;font-size:13px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;white-space:nowrap;';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, 2500);
  }

  // ─── 样式注入 ────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('__nmd_styles')) return;
    const s = document.createElement('style');
    s.id = '__nmd_styles';
    s.textContent = [
      '@keyframes __nmd_slideIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}',
      '#__nmd_modal *{box-sizing:border-box;margin:0;padding:0;}',
      '#__nmd_modal ::-webkit-scrollbar{width:5px;}',
      '#__nmd_modal ::-webkit-scrollbar-track{background:#181825;}',
      '#__nmd_modal ::-webkit-scrollbar-thumb{background:#45475a;border-radius:3px;}',
      '.__nmd_row{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;border-bottom:1px solid #181825;transition:background 0.1s;}',
      '.__nmd_row:hover{background:#2a2a3e !important;}',
      '.__nmd_row:hover .__nmd_actions{opacity:1 !important;pointer-events:auto !important;}',
      '.__nmd_row.sel{background:#1a2f4a !important;}',
      '.__nmd_actions{display:flex;gap:5px;flex-shrink:0;opacity:0;pointer-events:none;transition:opacity 0.15s;}',
      '.__nmd_badge_method{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;min-width:44px;text-align:center;flex-shrink:0;}',
      '.__nmd_cb{width:15px;height:15px;cursor:pointer;accent-color:#89b4fa;flex-shrink:0;}',
      '.__nmd_btn_sm{border:1px solid #45475a;border-radius:7px;color:#cdd6f4;cursor:pointer;font-size:12px;padding:6px 11px;transition:background 0.1s;white-space:nowrap;background:#313244;}',
      '.__nmd_btn_sm:hover{background:#45475a;}',
      '.__nmd_act_btn{border:none;border-radius:6px;cursor:pointer;font-size:11px;padding:4px 9px;white-space:nowrap;font-weight:600;transition:opacity 0.1s;}',
      '.__nmd_act_btn:hover{opacity:0.85;}',
      '.__nmd_dragging{user-select:none !important;}',
      '.__nmd_new_tag{display:inline-block;background:#2a3a1a;color:#a6e3a1;border-radius:3px;font-size:10px;font-weight:700;padding:1px 5px;flex-shrink:0;}',
      // ✨ 新增：分割线样式
      '.__nmd_divider{height:1px;background:#313244;margin:4px 0;}',
    ].join('');
    document.head.appendChild(s);
  }

  function getMethodStyle(m) {
    return ({ GET: '#1a3a1a/#a6e3a1', POST: '#1a2a3a/#89b4fa', PUT: '#3a2a1a/#fab387', DELETE: '#3a1a1a/#f38ba8', PATCH: '#2a1a3a/#cba6f7' }[m] || '#252535/#cdd6f4').split('/');
  }

  // ─── 位置持久化 ──────────────────────────────────────────

  function loadPos() {
    try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }
  function savePos(x, y) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ x, y })); } catch (e) {}
  }
  function clampPos(x, y, w, h) {
    const margin = 4;
    const vw = win.innerWidth  || document.documentElement.clientWidth;
    const vh = win.innerHeight || document.documentElement.clientHeight;
    return {
      x: Math.min(Math.max(x, margin), vw - w - margin),
      y: Math.min(Math.max(y, margin), vh - h - margin),
    };
  }

  // ─── 单击直接导出弹窗 ────────────────────────────────────

  function openListModal(mode) {
    const old = document.getElementById('__nmd_modal');
    if (old) old.remove();
    injectStyles();

    const allItems = getOrderedItems();
    if (!allItems.length) { showToast('❌ 暂无捕获的请求'); return; }

    let filteredItems = allItems.slice();

    const overlay = document.createElement('div');
    overlay.id = '__nmd_modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(3px);';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #313244;border-radius:14px;width:660px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.55);animation:__nmd_slideIn 0.18s ease;overflow:hidden;';

    const head = document.createElement('div');
    head.style.cssText = 'padding:14px 18px 12px;border-bottom:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    const headTitle = document.createElement('span');
    headTitle.style.cssText = 'color:#cdd6f4;font-size:14px;font-weight:600;';
    headTitle.textContent = mode === 'export' ? '📥 点击接口直接导出 .md' : '📋 点击接口直接复制';
    const headClose = document.createElement('button');
    headClose.style.cssText = 'background:none;border:none;color:#6c7086;cursor:pointer;font-size:20px;line-height:1;padding:0 2px;';
    headClose.textContent = '×';
    headClose.onmouseover = function () { headClose.style.color = '#f38ba8'; };
    headClose.onmouseout  = function () { headClose.style.color = '#6c7086'; };
    headClose.onclick = function () { overlay.remove(); };
    head.appendChild(headTitle); head.appendChild(headClose);

    const bar = document.createElement('div');
    bar.style.cssText = 'padding:9px 16px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:8px;flex-shrink:0;background:#181825;';
    const searchEl = document.createElement('input');
    searchEl.type = 'text'; searchEl.placeholder = '🔍 搜索接口名 / URL...';
    searchEl.style.cssText = 'flex:1;background:#2a2a3e;border:1px solid #45475a;border-radius:7px;color:#cdd6f4;font-size:12px;padding:6px 10px;outline:none;min-width:0;';
    searchEl.onfocus = function () { searchEl.style.borderColor = '#89b4fa'; };
    searchEl.onblur  = function () { searchEl.style.borderColor = '#45475a'; };
    const countEl = document.createElement('span');
    countEl.style.cssText = 'color:#6c7086;font-size:12px;white-space:nowrap;flex-shrink:0;';
    countEl.textContent = '共 ' + allItems.length + ' 个';
    bar.appendChild(searchEl); bar.appendChild(countEl);

    const tip = document.createElement('div');
    tip.style.cssText = 'padding:6px 16px;background:#181825;border-bottom:1px solid #313244;flex-shrink:0;';
    const tipText = document.createElement('span');
    tipText.style.cssText = 'color:#585b70;font-size:11px;';
    tipText.textContent = mode === 'export'
      ? '💡 点击任意行 → 立即下载该接口的 .md 文件　|　最新请求置顶'
      : '💡 点击任意行 → 立即复制该接口内容到剪贴板　|　最新请求置顶';
    tip.appendChild(tipText);

    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;';

    const foot = document.createElement('div');
    foot.style.cssText = 'padding:11px 16px;border-top:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#181825;';
    const footInfo = document.createElement('span');
    footInfo.style.cssText = 'color:#6c7086;font-size:12px;';
    footInfo.textContent = '共 ' + allItems.length + ' 个接口';
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = 'background:transparent;border:1px solid #45475a;border-radius:7px;color:#6c7086;cursor:pointer;font-size:13px;font-weight:500;padding:7px 18px;transition:all 0.15s;';
    closeBtn.textContent = '关闭';
    closeBtn.onmouseover = function () { closeBtn.style.borderColor = '#6c7086'; closeBtn.style.color = '#cdd6f4'; };
    closeBtn.onmouseout  = function () { closeBtn.style.borderColor = '#45475a'; closeBtn.style.color = '#6c7086'; };
    closeBtn.onclick = function () { overlay.remove(); };
    foot.appendChild(footInfo); foot.appendChild(closeBtn);

    function renderList() {
      listEl.innerHTML = '';
      if (!filteredItems.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#6c7086;text-align:center;padding:36px;font-size:13px;';
        empty.textContent = '没有匹配的接口'; listEl.appendChild(empty); return;
      }
      filteredItems.forEach(function (item, idx) {
        const row = document.createElement('div');
        row.className = '__nmd_row';

        if (idx === 0 && !searchEl.value.trim()) {
          const newTag = document.createElement('span');
          newTag.className = '__nmd_new_tag';
          newTag.textContent = 'NEW';
          row.appendChild(newTag);
        }

        const ms = getMethodStyle(item.method);
        const methodBadge = document.createElement('span');
        methodBadge.className = '__nmd_badge_method';
        methodBadge.style.cssText = 'background:' + ms[0] + ';color:' + ms[1] + ';';
        methodBadge.textContent = item.method;

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'color:#cdd6f4;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = item.name; nameEl.title = item.name;
        const urlEl = document.createElement('div');
        urlEl.style.cssText = 'color:#585b70;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;';
        urlEl.textContent = item.url; urlEl.title = item.url;
        info.appendChild(nameEl); info.appendChild(urlEl);

        const timeEl = document.createElement('span');
        timeEl.style.cssText = 'color:#45475a;font-size:11px;white-space:nowrap;flex-shrink:0;';
        timeEl.textContent = item.time;

        const actions = document.createElement('div');
        actions.className = '__nmd_actions';

        const exportBtn = document.createElement('button');
        exportBtn.className = '__nmd_act_btn';
        exportBtn.style.cssText += 'background:#1a3a2a;color:#a6e3a1;';
        exportBtn.textContent = '📥 导出';
        exportBtn.title = '下载 .md 文件';
        exportBtn.onclick = function (e) {
          e.stopPropagation();
          downloadMd(generateSingleMd(item), generateFilename(item));
          showToast('✅ 已导出：' + item.name);
          overlay.remove();
        };

        const copyBtn = document.createElement('button');
        copyBtn.className = '__nmd_act_btn';
        copyBtn.style.cssText += 'background:#1a2a3a;color:#89b4fa;';
        copyBtn.textContent = '📋 复制';
        copyBtn.title = '复制到剪贴板';
        copyBtn.onclick = function (e) {
          e.stopPropagation();
          copyToClipboard(generateSingleMd(item));
          showToast('✅ 已复制：' + item.name);
          overlay.remove();
        };

        actions.appendChild(exportBtn);
        actions.appendChild(copyBtn);
        row.appendChild(methodBadge);
        row.appendChild(info);
        row.appendChild(timeEl);
        row.appendChild(actions);

        row.onclick = function () {
          if (mode === 'export') {
            downloadMd(generateSingleMd(item), generateFilename(item));
            showToast('✅ 已导出：' + item.name);
          } else {
            copyToClipboard(generateSingleMd(item));
            showToast('✅ 已复制：' + item.name);
          }
          overlay.remove();
        };

        listEl.appendChild(row);
      });
    }

    searchEl.oninput = function () {
      const kw = searchEl.value.trim().toLowerCase();
      filteredItems = kw
        ? allItems.filter(function (i) { return i.name.toLowerCase().indexOf(kw) > -1 || i.url.toLowerCase().indexOf(kw) > -1; })
        : allItems.slice();
      countEl.textContent = '共 ' + filteredItems.length + ' 个';
      renderList();
    };

    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });

    box.appendChild(head); box.appendChild(bar); box.appendChild(tip); box.appendChild(listEl); box.appendChild(foot);
    overlay.appendChild(box); document.body.appendChild(overlay);
    renderList();
    setTimeout(function () { searchEl.focus(); }, 50);
  }

  // ─── 多选导出弹窗 ────────────────────────────────────────

  function openSelectModal() {
    const old = document.getElementById('__nmd_modal');
    if (old) old.remove();
    injectStyles();

    const allItems = getOrderedItems();
    if (!allItems.length) { showToast('❌ 暂无捕获的请求'); return; }

    let filteredItems = allItems.slice();
    const selectedUrls = new Set();

    const overlay = document.createElement('div');
    overlay.id = '__nmd_modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(3px);';

    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #313244;border-radius:14px;width:660px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.55);animation:__nmd_slideIn 0.18s ease;overflow:hidden;';

    const head = document.createElement('div');
    head.style.cssText = 'padding:14px 18px 12px;border-bottom:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    const headTitle = document.createElement('span');
    headTitle.style.cssText = 'color:#cdd6f4;font-size:14px;font-weight:600;';
    headTitle.textContent = '☑️ 勾选接口后批量导出 .md';
    const headClose = document.createElement('button');
    headClose.style.cssText = 'background:none;border:none;color:#6c7086;cursor:pointer;font-size:20px;line-height:1;padding:0 2px;';
    headClose.textContent = '×';
    headClose.onmouseover = function () { headClose.style.color = '#f38ba8'; };
    headClose.onmouseout  = function () { headClose.style.color = '#6c7086'; };
    headClose.onclick = function () { overlay.remove(); };
    head.appendChild(headTitle); head.appendChild(headClose);

    const bar = document.createElement('div');
    bar.style.cssText = 'padding:9px 16px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:8px;flex-shrink:0;background:#181825;';
    const searchEl = document.createElement('input');
    searchEl.type = 'text'; searchEl.placeholder = '🔍 搜索接口名 / URL...';
    searchEl.style.cssText = 'flex:1;background:#2a2a3e;border:1px solid #45475a;border-radius:7px;color:#cdd6f4;font-size:12px;padding:6px 10px;outline:none;min-width:0;';
    searchEl.onfocus = function () { searchEl.style.borderColor = '#89b4fa'; };
    searchEl.onblur  = function () { searchEl.style.borderColor = '#45475a'; };
    const selAllBtn = document.createElement('button'); selAllBtn.className = '__nmd_btn_sm'; selAllBtn.textContent = '全选';
    const invertBtn = document.createElement('button'); invertBtn.className = '__nmd_btn_sm'; invertBtn.textContent = '反选';
    const countEl = document.createElement('span');
    countEl.style.cssText = 'color:#6c7086;font-size:12px;white-space:nowrap;flex-shrink:0;';
    countEl.textContent = '已选 0 / ' + allItems.length;
    bar.appendChild(searchEl); bar.appendChild(selAllBtn); bar.appendChild(invertBtn); bar.appendChild(countEl);

    const tip = document.createElement('div');
    tip.style.cssText = 'padding:6px 16px;background:#181825;border-bottom:1px solid #313244;flex-shrink:0;';
    const tipText = document.createElement('span');
    tipText.style.cssText = 'color:#585b70;font-size:11px;';
    tipText.textContent = '💡 勾选需要的接口，点击「导出」按钮批量下载为一个 .md 文件　|　最新请求置顶';
    tip.appendChild(tipText);

    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;';

    const foot = document.createElement('div');
    foot.style.cssText = 'padding:11px 16px;border-top:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#181825;';
    const footInfo = document.createElement('span');
    footInfo.style.cssText = 'color:#6c7086;font-size:12px;';
    footInfo.textContent = '共 ' + allItems.length + ' 个接口';
    const footBtns = document.createElement('div'); footBtns.style.cssText = 'display:flex;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText = 'background:transparent;border:1px solid #45475a;border-radius:7px;color:#6c7086;cursor:pointer;font-size:13px;font-weight:500;padding:7px 18px;transition:all 0.15s;';
    cancelBtn.textContent = '取消';
    cancelBtn.onmouseover = function () { cancelBtn.style.borderColor = '#6c7086'; cancelBtn.style.color = '#cdd6f4'; };
    cancelBtn.onmouseout  = function () { cancelBtn.style.borderColor = '#45475a'; cancelBtn.style.color = '#6c7086'; };
    cancelBtn.onclick = function () { overlay.remove(); };

    const actionBtn = document.createElement('button');
    actionBtn.style.cssText = 'background:linear-gradient(135deg,#89b4fa,#cba6f7);border:none;border-radius:7px;color:#1e1e2e;cursor:not-allowed;font-size:13px;font-weight:600;padding:7px 18px;opacity:0.4;transition:opacity 0.15s;';
    actionBtn.textContent = '📥 导出 (0)';
    actionBtn.disabled = true;
    footBtns.appendChild(cancelBtn); footBtns.appendChild(actionBtn);
    foot.appendChild(footInfo); foot.appendChild(footBtns);

    function renderList() {
      listEl.innerHTML = '';
      if (!filteredItems.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#6c7086;text-align:center;padding:36px;font-size:13px;';
        empty.textContent = '没有匹配的接口'; listEl.appendChild(empty); return;
      }
      filteredItems.forEach(function (item, idx) {
        const isSel = selectedUrls.has(item.url);
        const row = document.createElement('div');
        row.className = '__nmd_row' + (isSel ? ' sel' : '');
        if (isSel) row.style.background = '#1a2f4a';

        if (idx === 0 && !searchEl.value.trim()) {
          const newTag = document.createElement('span');
          newTag.className = '__nmd_new_tag';
          newTag.textContent = 'NEW';
          row.appendChild(newTag);
        }

        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = '__nmd_cb'; cb.checked = isSel;
        cb.onclick = function (e) { e.stopPropagation(); };
        cb.onchange = function () {
          if (cb.checked) { selectedUrls.add(item.url); row.classList.add('sel'); row.style.background = '#1a2f4a'; }
          else { selectedUrls.delete(item.url); row.classList.remove('sel'); row.style.background = ''; }
          updateCount();
        };

        const ms = getMethodStyle(item.method);
        const methodBadge = document.createElement('span');
        methodBadge.className = '__nmd_badge_method';
        methodBadge.style.cssText = 'background:' + ms[0] + ';color:' + ms[1] + ';';
        methodBadge.textContent = item.method;

        const info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0;';
        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'color:#cdd6f4;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = item.name; nameEl.title = item.name;
        const urlEl = document.createElement('div');
        urlEl.style.cssText = 'color:#585b70;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;';
        urlEl.textContent = item.url; urlEl.title = item.url;
        info.appendChild(nameEl); info.appendChild(urlEl);

        const timeEl = document.createElement('span');
        timeEl.style.cssText = 'color:#45475a;font-size:11px;white-space:nowrap;flex-shrink:0;';
        timeEl.textContent = item.time;

        row.appendChild(cb); row.appendChild(methodBadge); row.appendChild(info); row.appendChild(timeEl);
        row.onclick = function () { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); };
        listEl.appendChild(row);
      });
    }

    function updateCount() {
      const n = selectedUrls.size;
      countEl.textContent = '已选 ' + n + ' / ' + allItems.length;
      actionBtn.textContent = '📥 导出 (' + n + ')';
      actionBtn.disabled = n === 0;
      actionBtn.style.opacity = n === 0 ? '0.4' : '1';
      actionBtn.style.cursor  = n === 0 ? 'not-allowed' : 'pointer';
    }

    searchEl.oninput = function () {
      const kw = searchEl.value.trim().toLowerCase();
      filteredItems = kw
        ? allItems.filter(function (i) { return i.name.toLowerCase().indexOf(kw) > -1 || i.url.toLowerCase().indexOf(kw) > -1; })
        : allItems.slice();
      renderList();
    };

    selAllBtn.onclick = function () { filteredItems.forEach(function (i) { selectedUrls.add(i.url); }); renderList(); updateCount(); };
    invertBtn.onclick = function () {
      filteredItems.forEach(function (i) { if (selectedUrls.has(i.url)) selectedUrls.delete(i.url); else selectedUrls.add(i.url); });
      renderList(); updateCount();
    };

    actionBtn.onclick = function () {
      if (!selectedUrls.size) return;
      const items = getOrderedItems().filter(function (i) { return selectedUrls.has(i.url); });
      downloadMd(generateMultiMd(items), generateFilename(items));
      showToast('✅ 已导出 ' + items.length + ' 个接口');
      overlay.remove();
    };

    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });

    box.appendChild(head); box.appendChild(bar); box.appendChild(tip); box.appendChild(listEl); box.appendChild(foot);
    overlay.appendChild(box); document.body.appendChild(overlay);
    renderList(); updateCount();
    setTimeout(function () { searchEl.focus(); }, 50);
  }

  // ─── 悬浮按钮 ────────────────────────────────────────────

  let badge = null;
  let menuVisible = false;

  function updateBadge() {
    if (badge) { badge.textContent = requests.size; badge.style.display = 'flex'; }
  }

  function createFloatUI() {
    if (document.getElementById('__nmd_panel')) return;
    injectStyles();

    const BTN_SIZE = 50;
    const MENU_W  = 230;
    const savedPos = loadPos();
    let posX = savedPos ? savedPos.x : 24;
    let posY = savedPos ? savedPos.y : 24;
    const clamped = clampPos(posX, posY, BTN_SIZE, BTN_SIZE);
    posX = clamped.x; posY = clamped.y;

    const panel = document.createElement('div');
    panel.id = '__nmd_panel';
    panel.style.cssText = 'position:fixed;left:' + posX + 'px;top:' + posY + 'px;width:' + BTN_SIZE + 'px;height:' + BTN_SIZE + 'px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    const menu = document.createElement('div');
    menu.id = '__nmd_menu';
    menu.style.cssText = 'position:fixed;z-index:2147483647;background:#1e1e2e;border:1px solid #313244;border-radius:12px;padding:8px;display:none;flex-direction:column;gap:3px;width:' + MENU_W + 'px;box-shadow:0 8px 32px rgba(0,0,0,0.55);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    const menuHead = document.createElement('div');
    menuHead.style.cssText = 'color:#45475a;font-size:10px;font-weight:700;padding:3px 8px 7px;border-bottom:1px solid #313244;margin-bottom:3px;letter-spacing:1px;';
    menuHead.textContent = 'NETWORK MD EXPORTER';
    menu.appendChild(menuHead);

    // ✨ 新增辅助函数：在菜单中插入分割线
    function addDivider() {
      const d = document.createElement('div');
      d.className = '__nmd_divider';
      menu.appendChild(d);
    }

    // ✨ 新增辅助函数：在菜单中插入分组标题
    function addGroupLabel(text) {
      const label = document.createElement('div');
      label.style.cssText = 'color:#45475a;font-size:10px;font-weight:700;padding:5px 10px 3px;letter-spacing:0.8px;';
      label.textContent = text;
      menu.appendChild(label);
    }

    const menuItemsCfg = [
      // ── 分组：MD 导出 ──
      {
        icon: '📥', label: '单击接口直接导出 .md', color: '#a6e3a1',
        action: function () { toggle(false); openListModal('export'); },
      },
      {
        icon: '📋', label: '单击接口直接复制', color: '#89b4fa',
        action: function () { toggle(false); openListModal('copy'); },
      },
      {
        icon: '⚡', label: '导出全部接口', color: '#f9e2af',
        action: function () {
          if (!requests.size) { showToast('❌ 暂无数据'); return; }
          const items = getOrderedItems();
          downloadMd(generateMultiMd(items), generateFilename(items));
          showToast('✅ 已导出 ' + items.length + ' 个接口');
          toggle(false);
        },
      },
      {
        icon: '☑️', label: '导出所选接口', color: '#cba6f7',
        action: function () { toggle(false); openSelectModal(); },
      },
      // ── 分隔符（用特殊标记） ──
      { divider: true },
      // ── 分组：Store State ──
      {
        icon: '💾', label: '导出 Store State JSON（去 lang）', color: '#f5c2e7',
        action: function () { toggle(false); exportStoreState(); },
      },
      // ── 分隔符 ──
      { divider: true },
      // ── 分组：工具 ──
      {
        icon: '📊', label: '控制台查看列表', color: '#94e2d5',
        action: function () {
          console.table(getOrderedItems().map(function (r, i) {
            return { '#': i + 1, name: r.name, method: r.method, time: r.time };
          }));
          showToast('📊 已打印到控制台'); toggle(false);
        },
      },
      {
        icon: '🗑️', label: '清空记录', color: '#f38ba8',
        action: function () {
          requests.clear();
          if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
          showToast('🗑️ 已清空'); toggle(false);
        },
      },
    ];

    // ✨ 渲染菜单项（支持分割线）
    menuItemsCfg.forEach(function (cfg) {
      if (cfg.divider) {
        addDivider();
        return;
      }
      const btn = document.createElement('button');
      btn.style.cssText = 'background:transparent;border:none;border-radius:7px;color:' + cfg.color + ';cursor:pointer;font-size:13px;padding:8px 10px;text-align:left;width:100%;display:flex;align-items:center;gap:8px;transition:background 0.1s;';
      btn.innerHTML = '<span style="font-size:14px;flex-shrink:0;">' + cfg.icon + '</span><span>' + cfg.label + '</span>';
      btn.onmouseover = function () { btn.style.background = '#2a2a3e'; };
      btn.onmouseout  = function () { btn.style.background = 'transparent'; };
      btn.onclick = cfg.action;
      menu.appendChild(btn);
    });

    const mainBtn = document.createElement('button');
    mainBtn.id = '__nmd_main_btn';
    mainBtn.style.cssText = 'width:' + BTN_SIZE + 'px;height:' + BTN_SIZE + 'px;border-radius:50%;background:linear-gradient(135deg,#89b4fa,#cba6f7);border:none;cursor:grab;font-size:21px;box-shadow:0 4px 14px rgba(137,180,250,0.4);transition:transform 0.2s,box-shadow 0.2s;position:relative;display:flex;align-items:center;justify-content:center;';
    mainBtn.textContent = '📡';
    mainBtn.title = 'Network MD 导出工具（可拖动）';
    mainBtn.onmouseover = function () { if (!isDragging) { mainBtn.style.transform = 'scale(1.08)'; mainBtn.style.boxShadow = '0 6px 18px rgba(137,180,250,0.6)'; } };
    mainBtn.onmouseout  = function () { if (!isDragging) { mainBtn.style.transform = ''; mainBtn.style.boxShadow = '0 4px 14px rgba(137,180,250,0.4)'; } };

    badge = document.createElement('span');
    badge.style.cssText = 'position:absolute;top:-3px;right:-3px;background:#f38ba8;color:#1e1e2e;border-radius:9px;font-size:10px;font-weight:700;min-width:17px;height:17px;display:none;align-items:center;justify-content:center;padding:0 3px;pointer-events:none;';
    badge.textContent = '0';
    mainBtn.appendChild(badge);

    function positionMenu() {
      const vw = win.innerWidth  || document.documentElement.clientWidth;
      const vh = win.innerHeight || document.documentElement.clientHeight;
      const GAP = 8;
      const isRight  = (posX + BTN_SIZE / 2) > vw / 2;
      const isBottom = (posY + BTN_SIZE / 2) > vh / 2;
      if (isRight) { menu.style.left = 'auto'; menu.style.right = (vw - posX - BTN_SIZE) + 'px'; }
      else          { menu.style.right = 'auto'; menu.style.left = posX + 'px'; }
      if (isBottom) { menu.style.bottom = (vh - posY + GAP) + 'px'; menu.style.top = 'auto'; }
      else           { menu.style.top = (posY + BTN_SIZE + GAP) + 'px'; menu.style.bottom = 'auto'; }
    }

    function toggle(forceState) {
      menuVisible = forceState !== undefined ? forceState : !menuVisible;
      if (menuVisible) { positionMenu(); menu.style.display = 'flex'; }
      else { menu.style.display = 'none'; }
    }

    let isDragging = false, dragStartX = 0, dragStartY = 0, originPanelX = 0, originPanelY = 0;
    const DRAG_THRESHOLD = 4;

    mainBtn.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      dragStartX = e.clientX; dragStartY = e.clientY;
      originPanelX = posX; originPanelY = posY;
      isDragging = false;
      mainBtn.style.cursor = 'grabbing';
      document.body.classList.add('__nmd_dragging');

      function onMouseMove(ev) {
        const dx = ev.clientX - dragStartX, dy = ev.clientY - dragStartY;
        if (!isDragging && Math.sqrt(dx * dx + dy * dy) < DRAG_THRESHOLD) return;
        isDragging = true;
        if (menuVisible) toggle(false);
        const np = clampPos(originPanelX + dx, originPanelY + dy, BTN_SIZE, BTN_SIZE);
        posX = np.x; posY = np.y;
        panel.style.left = posX + 'px'; panel.style.top = posY + 'px';
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup',   onMouseUp);
        document.body.classList.remove('__nmd_dragging');
        mainBtn.style.cursor = 'grab';
        mainBtn.style.transform = ''; mainBtn.style.boxShadow = '0 4px 14px rgba(137,180,250,0.4)';
        if (isDragging) savePos(posX, posY);
        setTimeout(function () { isDragging = false; }, 0);
      }

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup',   onMouseUp);
    });

    mainBtn.addEventListener('click', function (e) {
      if (isDragging) { e.stopPropagation(); return; }
      toggle();
    });

    document.addEventListener('click', function (e) {
      if (menuVisible && !panel.contains(e.target) && !menu.contains(e.target)) toggle(false);
    });

    win.addEventListener('resize', function () {
      const c = clampPos(posX, posY, BTN_SIZE, BTN_SIZE);
      posX = c.x; posY = c.y;
      panel.style.left = posX + 'px'; panel.style.top = posY + 'px';
      if (menuVisible) positionMenu();
      savePos(posX, posY);
    });

    panel.appendChild(mainBtn);
    document.body.appendChild(menu);
    document.body.appendChild(panel);

    console.log('%c🚀 Network MD v3.7.2 已启动 — 最新请求置顶，支持单选/多选导出，Store State 导出会剔除 lang 节点', 'color:#89b4fa;font-size:13px;font-weight:bold');
  }

  // ─── 控制台命令 ──────────────────────────────────────────

  win.__copyRequest = function (keyword) {
    if (!keyword) { console.warn('请传入关键字'); return; }
    const matched = Array.from(requests.entries()).filter(function (e) { return e[0].indexOf(keyword) > -1; }).map(function (e) { return e[1]; });
    if (!matched.length) { console.warn('未找到：' + keyword); return; }
    const item = matched[matched.length - 1];
    copyToClipboard(generateItemMd(item));
    console.log('%c✅ 已复制：' + item.name, 'color:#4caf50;font-weight:bold');
  };
  win.__exportAllRequests = function () {
    if (!requests.size) { console.warn('暂无数据'); return; }
    const items = getOrderedItems();
    downloadMd(generateMultiMd(items), generateFilename(items));
    console.log('%c✅ 已导出 ' + items.length + ' 条', 'color:#4caf50;font-weight:bold');
  };
  win.__listRequests = function () {
    console.table(getOrderedItems().map(function (r, i) { return { '#': i + 1, name: r.name, method: r.method, time: r.time }; }));
  };
  win.__clearRequests = function () { requests.clear(); console.log('🗑️ 已清空'); };
  // ✨ 新增控制台命令
  win.__exportStoreState = function () { exportStoreState(); };

  // ─── 初始化 ──────────────────────────────────────────────

  function waitForBody(cb) {
    if (document.body) { cb(); return; }
    const obs = new MutationObserver(function () { if (document.body) { obs.disconnect(); cb(); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('DOMContentLoaded', function () { obs.disconnect(); cb(); }, { once: true });
  }

  waitForBody(createFloatUI);

})();
