// ==UserScript==
// @name         Network MD 导出工具
// @namespace    https://docs.scriptcat.org/
// @version      3.1.0
// @description  拦截XHR/Fetch，支持选择接口导出MD文件
// @author       You
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

  // ─── 工具函数 ───────────────────────────────────────────

  function normalizeHeaders(headers) {
    if (!headers) return {};
    if (typeof headers.entries === 'function') {
      const obj = {};
      for (const [k, v] of headers.entries()) obj[k] = v;
      return obj;
    }
    if (typeof headers === 'object' && !Array.isArray(headers)) {
      return Object.assign({}, headers);
    }
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

  // ─── 拦截 XHR ───────────────────────────────────────────

  const OriginalXHR = win.XMLHttpRequest;

  function NewXHR() {
    const xhr = new OriginalXHR();
    let _method = 'GET', _url = '', _requestBody = null;
    const _requestHeaders = {};

    const origOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url) {
      _method = method; _url = url;
      return origOpen.apply(xhr, arguments);
    };

    const origSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name, value) {
      _requestHeaders[name] = value;
      return origSetHeader(name, value);
    };

    const origSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _requestBody = safeParse(body);
      xhr.addEventListener('load', function () {
        try {
          const urlObj = new URL(_url, location.origin);
          const queryParams = {};
          urlObj.searchParams.forEach(function (v, k) { queryParams[k] = v; });
          const responseHeaders = {};
          (xhr.getAllResponseHeaders() || '').trim().split(/[\r\n]+/).forEach(function (line) {
            const idx = line.indexOf(': ');
            if (idx > -1) responseHeaders[line.substring(0, idx)] = line.substring(idx + 2);
          });
          storeRequest({
            url: _url, method: _method,
            requestHeaders: Object.assign({}, _requestHeaders),
            queryParams, requestBody: _requestBody,
            response: safeParse(xhr.responseText),
            responseHeaders,
          });
        } catch (e) {}
      });
      return origSend(body);
    };

    return xhr;
  }

  NewXHR.prototype = OriginalXHR.prototype;
  win.XMLHttpRequest = NewXHR;

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
        let resData;
        const ct = response.headers.get('content-type') || '';
        resData = ct.indexOf('application/json') > -1 ? await cloned.json() : await cloned.text();
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
    lines.push('### Request Headers');
    lines.push('');
    lines.push('```json');
    lines.push(safeStringify(item.requestHeaders));
    lines.push('```');
    lines.push('');
    lines.push('### Query Params');
    lines.push('');
    lines.push('```json');
    lines.push(safeStringify(item.queryParams));
    lines.push('```');
    lines.push('');
    lines.push('### Request Body');
    lines.push('');
    lines.push('```json');
    lines.push(safeStringify(item.requestBody));
    lines.push('```');
    lines.push('');
    lines.push('### Response Headers');
    lines.push('');
    lines.push('```json');
    lines.push(safeStringify(item.responseHeaders));
    lines.push('```');
    lines.push('');
    lines.push('### Response Body');
    lines.push('');
    lines.push('```json');
    lines.push(safeStringify(item.response));
    lines.push('```');
    lines.push('');
    return lines.join('\n');
  }

  function generateSelectedMd(selectedItems) {
    const lines = [];
    lines.push('# Network 请求导出');
    lines.push('');
    lines.push('| 字段 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 导出时间 | ' + new Date().toLocaleString() + ' |');
    lines.push('| 页面URL | `' + win.location.href + '` |');
    lines.push('| 导出数量 | ' + selectedItems.length + ' 条 |');
    lines.push('');
    lines.push('---');
    lines.push('');
    selectedItems.forEach(function (item, i) {
      lines.push(generateItemMd(item, i + 1));
      lines.push('---');
      lines.push('');
    });
    return lines.join('\n');
  }

  // ─── 下载 / 复制 ─────────────────────────────────────────

  function downloadMd(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || ('network-export-' + Date.now() + '.md');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') { GM_setClipboard(text, 'text'); return; }
    if (win.navigator && win.navigator.clipboard) { win.navigator.clipboard.writeText(text).catch(function () {}); return; }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ─── Toast ───────────────────────────────────────────────

  function showToast(msg) {
    const old = document.getElementById('__nmd_toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = '__nmd_toast';
    t.style.cssText = 'position:fixed;bottom:90px;right:24px;background:#1e1e2e;color:#cdd6f4;border:1px solid #45475a;border-radius:8px;padding:10px 16px;font-size:13px;z-index:2147483647;box-shadow:0 4px 16px rgba(0,0,0,0.4);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
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
      '@keyframes __nmd_fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes __nmd_slideIn{from{opacity:0;transform:scale(0.96)}to{opacity:1;transform:scale(1)}}',
      '#__nmd_modal *{box-sizing:border-box;margin:0;padding:0;}',
      '#__nmd_modal ::-webkit-scrollbar{width:5px;}',
      '#__nmd_modal ::-webkit-scrollbar-track{background:#181825;}',
      '#__nmd_modal ::-webkit-scrollbar-thumb{background:#45475a;border-radius:3px;}',
      '.__nmd_row{display:flex;align-items:center;gap:10px;padding:9px 16px;cursor:pointer;border-bottom:1px solid #181825;transition:background 0.1s;}',
      '.__nmd_row:hover{background:#2a2a3e !important;}',
      '.__nmd_row.sel{background:#1a2f4a !important;}',
      '.__nmd_cb{width:15px;height:15px;cursor:pointer;accent-color:#89b4fa;flex-shrink:0;}',
      '.__nmd_badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:700;min-width:44px;text-align:center;flex-shrink:0;}',
      '.__nmd_btn_sm{border:1px solid #45475a;border-radius:7px;color:#cdd6f4;cursor:pointer;font-size:12px;padding:6px 11px;transition:background 0.1s;white-space:nowrap;background:#313244;}',
      '.__nmd_btn_sm:hover{background:#45475a;}',
    ].join('');
    document.head.appendChild(s);
  }

  function getMethodStyle(m) {
    return { GET: '#1a3a1a/#a6e3a1', POST: '#1a2a3a/#89b4fa', PUT: '#3a2a1a/#fab387', DELETE: '#3a1a1a/#f38ba8', PATCH: '#2a1a3a/#cba6f7' }[m] || '#252535/#cdd6f4';
  }

  // ─── 选择弹窗 ────────────────────────────────────────────

  function openSelectModal(mode) {
    const old = document.getElementById('__nmd_modal');
    if (old) old.remove();

    injectStyles();

    const allItems = Array.from(requests.values());
    if (!allItems.length) { showToast('❌ 暂无捕获的请求'); return; }

    let filteredItems = allItems.slice();
    const selectedUrls = new Set();

    // 遮罩
    const overlay = document.createElement('div');
    overlay.id = '__nmd_modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:2147483646;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;backdrop-filter:blur(3px);';

    // 弹窗
    const box = document.createElement('div');
    box.style.cssText = 'background:#1e1e2e;border:1px solid #313244;border-radius:14px;width:660px;max-width:90vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.55);animation:__nmd_slideIn 0.18s ease;overflow:hidden;';

    // 头部
    const head = document.createElement('div');
    head.style.cssText = 'padding:14px 18px 12px;border-bottom:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    const headTitle = document.createElement('span');
    headTitle.style.cssText = 'color:#cdd6f4;font-size:14px;font-weight:600;';
    headTitle.textContent = mode === 'export' ? '📥 选择要导出的接口' : '📋 选择要复制的接口';
    const headClose = document.createElement('button');
    headClose.style.cssText = 'background:none;border:none;color:#6c7086;cursor:pointer;font-size:20px;line-height:1;padding:0 2px;';
    headClose.textContent = '×';
    headClose.onmouseover = function () { headClose.style.color = '#f38ba8'; };
    headClose.onmouseout = function () { headClose.style.color = '#6c7086'; };
    headClose.onclick = function () { overlay.remove(); };
    head.appendChild(headTitle);
    head.appendChild(headClose);

    // 工具栏
    const bar = document.createElement('div');
    bar.style.cssText = 'padding:9px 16px;border-bottom:1px solid #313244;display:flex;align-items:center;gap:8px;flex-shrink:0;background:#181825;';

    const searchEl = document.createElement('input');
    searchEl.type = 'text';
    searchEl.placeholder = '🔍 搜索接口名 / URL...';
    searchEl.style.cssText = 'flex:1;background:#2a2a3e;border:1px solid #45475a;border-radius:7px;color:#cdd6f4;font-size:12px;padding:6px 10px;outline:none;min-width:0;';
    searchEl.onfocus = function () { searchEl.style.borderColor = '#89b4fa'; };
    searchEl.onblur = function () { searchEl.style.borderColor = '#45475a'; };

    const selAllBtn = document.createElement('button');
    selAllBtn.className = '__nmd_btn_sm';
    selAllBtn.textContent = '全选';

    const invertBtn = document.createElement('button');
    invertBtn.className = '__nmd_btn_sm';
    invertBtn.textContent = '反选';

    const countEl = document.createElement('span');
    countEl.style.cssText = 'color:#6c7086;font-size:12px;white-space:nowrap;flex-shrink:0;';
    countEl.textContent = '已选 0 / ' + allItems.length;

    bar.appendChild(searchEl);
    bar.appendChild(selAllBtn);
    bar.appendChild(invertBtn);
    bar.appendChild(countEl);

    // 列表
    const listEl = document.createElement('div');
    listEl.style.cssText = 'flex:1;overflow-y:auto;';

    // 底部
    const foot = document.createElement('div');
    foot.style.cssText = 'padding:11px 16px;border-top:1px solid #313244;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#181825;';

    const footInfo = document.createElement('span');
    footInfo.style.cssText = 'color:#6c7086;font-size:12px;';
    footInfo.textContent = '共 ' + allItems.length + ' 个接口';

    const footBtns = document.createElement('div');
    footBtns.style.cssText = 'display:flex;gap:8px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = '__nmd_btn_sm';
    cancelBtn.textContent = '取消';
    cancelBtn.onclick = function () { overlay.remove(); };

    const actionBtn = document.createElement('button');
    actionBtn.style.cssText = 'background:linear-gradient(135deg,#89b4fa,#cba6f7);border:none;border-radius:7px;color:#1e1e2e;cursor:not-allowed;font-size:13px;font-weight:600;padding:7px 18px;opacity:0.4;transition:opacity 0.15s;';
    actionBtn.textContent = mode === 'export' ? '📥 导出 (0)' : '📋 复制 (0)';
    actionBtn.disabled = true;

    footBtns.appendChild(cancelBtn);
    footBtns.appendChild(actionBtn);
    foot.appendChild(footInfo);
    foot.appendChild(footBtns);

    // 渲染列表行
    function renderList() {
      listEl.innerHTML = '';
      if (!filteredItems.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'color:#6c7086;text-align:center;padding:36px;font-size:13px;';
        empty.textContent = '没有匹配的接口';
        listEl.appendChild(empty);
        return;
      }
      filteredItems.forEach(function (item) {
        const isSel = selectedUrls.has(item.url);
        const row = document.createElement('div');
        row.className = '__nmd_row' + (isSel ? ' sel' : '');
        if (isSel) row.style.background = '#1a2f4a';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = '__nmd_cb';
        cb.checked = isSel;
        cb.onclick = function (e) { e.stopPropagation(); };
        cb.onchange = function () {
          if (cb.checked) { selectedUrls.add(item.url); row.classList.add('sel'); row.style.background = '#1a2f4a'; }
          else { selectedUrls.delete(item.url); row.classList.remove('sel'); row.style.background = ''; }
          updateCount();
        };

        const ms = getMethodStyle(item.method).split('/');
        const badge = document.createElement('span');
        badge.className = '__nmd_badge';
        badge.style.cssText = 'background:' + ms[0] + ';color:' + ms[1] + ';';
        badge.textContent = item.method;

        const info = document.createElement('div');
        info.style.cssText = 'flex:1;min-width:0;';

        const nameEl = document.createElement('div');
        nameEl.style.cssText = 'color:#cdd6f4;font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        nameEl.textContent = item.name;
        nameEl.title = item.name;

        const urlEl = document.createElement('div');
        urlEl.style.cssText = 'color:#585b70;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:2px;';
        urlEl.textContent = item.url;
        urlEl.title = item.url;

        info.appendChild(nameEl);
        info.appendChild(urlEl);

        const timeEl = document.createElement('span');
        timeEl.style.cssText = 'color:#45475a;font-size:11px;white-space:nowrap;flex-shrink:0;';
        timeEl.textContent = item.time;

        row.appendChild(cb);
        row.appendChild(badge);
        row.appendChild(info);
        row.appendChild(timeEl);

        row.onclick = function () { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); };

        listEl.appendChild(row);
      });
    }

    function updateCount() {
      countEl.textContent = '已选 ' + selectedUrls.size + ' / ' + allItems.length;
      const n = selectedUrls.size;
      actionBtn.textContent = mode === 'export' ? '📥 导出 (' + n + ')' : '📋 复制 (' + n + ')';
      actionBtn.disabled = n === 0;
      actionBtn.style.opacity = n === 0 ? '0.4' : '1';
      actionBtn.style.cursor = n === 0 ? 'not-allowed' : 'pointer';
    }

    searchEl.oninput = function () {
      const kw = searchEl.value.trim().toLowerCase();
      filteredItems = kw
        ? allItems.filter(function (i) { return i.name.toLowerCase().indexOf(kw) > -1 || i.url.toLowerCase().indexOf(kw) > -1; })
        : allItems.slice();
      renderList();
    };

    selAllBtn.onclick = function () {
      filteredItems.forEach(function (i) { selectedUrls.add(i.url); });
      renderList(); updateCount();
    };

    invertBtn.onclick = function () {
      filteredItems.forEach(function (i) {
        if (selectedUrls.has(i.url)) selectedUrls.delete(i.url);
        else selectedUrls.add(i.url);
      });
      renderList(); updateCount();
    };

    actionBtn.onclick = function () {
      if (!selectedUrls.size) return;
      const items = Array.from(requests.values()).filter(function (i) { return selectedUrls.has(i.url); });
      if (mode === 'export') {
        downloadMd(generateSelectedMd(items));
        showToast('✅ 已导出 ' + items.length + ' 个接口');
      } else {
        copyToClipboard(generateSelectedMd(items));
        showToast('✅ 已复制 ' + items.length + ' 个接口');
      }
      overlay.remove();
    };

    overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    });

    box.appendChild(head);
    box.appendChild(bar);
    box.appendChild(listEl);
    box.appendChild(foot);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    renderList();
    updateCount();
    setTimeout(function () { searchEl.focus(); }, 50);
  }

  // ─── 悬浮按钮 ────────────────────────────────────────────

  let badge = null;
  let menuVisible = false;
  let menuEl = null;

  function updateBadge() {
    if (badge) {
      badge.textContent = requests.size;
      badge.style.display = 'flex';
    }
  }

  function createFloatUI() {
    // 防止重复创建
    if (document.getElementById('__nmd_panel')) return;

    injectStyles();

    const panel = document.createElement('div');
    panel.id = '__nmd_panel';
    panel.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    // 菜单
    const menu = document.createElement('div');
    menuEl = menu;
    menu.style.cssText = 'background:#1e1e2e;border:1px solid #313244;border-radius:12px;padding:8px;display:none;flex-direction:column;gap:3px;min-width:205px;box-shadow:0 8px 32px rgba(0,0,0,0.55);';

    const menuHead = document.createElement('div');
    menuHead.style.cssText = 'color:#45475a;font-size:10px;font-weight:700;padding:3px 8px 7px;border-bottom:1px solid #313244;margin-bottom:3px;letter-spacing:1px;';
    menuHead.textContent = 'NETWORK MD EXPORTER';
    menu.appendChild(menuHead);

    const items = [
      { icon: '📥', label: '选择接口导出 .md', color: '#a6e3a1', action: function () { toggle(false); openSelectModal('export'); } },
      { icon: '📋', label: '选择接口复制', color: '#89b4fa', action: function () { toggle(false); openSelectModal('copy'); } },
      { icon: '⚡', label: '导出全部接口', color: '#f9e2af', action: function () {
        if (!requests.size) { showToast('❌ 暂无数据'); return; }
        downloadMd(generateSelectedMd(Array.from(requests.values())));
        showToast('✅ 已导出 ' + requests.size + ' 个接口');
        toggle(false);
      }},
      { icon: '📊', label: '控制台查看列表', color: '#cba6f7', action: function () {
        console.table(Array.from(requests.values()).map(function (r, i) {
          return { '#': i + 1, name: r.name, method: r.method, time: r.time };
        }));
        showToast('📊 已打印到控制台');
        toggle(false);
      }},
      { icon: '🗑️', label: '清空记录', color: '#f38ba8', action: function () {
        requests.clear();
        if (badge) { badge.textContent = '0'; badge.style.display = 'none'; }
        showToast('🗑️ 已清空');
        toggle(false);
      }},
    ];

    items.forEach(function (cfg) {
      const btn = document.createElement('button');
      btn.style.cssText = 'background:transparent;border:none;border-radius:7px;color:' + cfg.color + ';cursor:pointer;font-size:13px;padding:8px 10px;text-align:left;width:100%;display:flex;align-items:center;gap:8px;transition:background 0.1s;';
      btn.innerHTML = '<span style="font-size:14px;flex-shrink:0;">' + cfg.icon + '</span><span>' + cfg.label + '</span>';
      btn.onmouseover = function () { btn.style.background = '#2a2a3e'; };
      btn.onmouseout = function () { btn.style.background = 'transparent'; };
      btn.onclick = cfg.action;
      menu.appendChild(btn);
    });

    // 主按钮
    const mainBtn = document.createElement('button');
    mainBtn.id = '__nmd_main_btn';
    mainBtn.style.cssText = 'width:50px;height:50px;border-radius:50%;background:linear-gradient(135deg,#89b4fa,#cba6f7);border:none;cursor:pointer;font-size:21px;box-shadow:0 4px 14px rgba(137,180,250,0.4);transition:transform 0.2s,box-shadow 0.2s;position:relative;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    mainBtn.textContent = '📡';
    mainBtn.title = 'Network MD 导出工具';
    mainBtn.onmouseover = function () { mainBtn.style.transform = 'scale(1.08)'; mainBtn.style.boxShadow = '0 6px 18px rgba(137,180,250,0.6)'; };
    mainBtn.onmouseout = function () { mainBtn.style.transform = ''; mainBtn.style.boxShadow = '0 4px 14px rgba(137,180,250,0.4)'; };

    // 徽章
    badge = document.createElement('span');
    badge.style.cssText = 'position:absolute;top:-3px;right:-3px;background:#f38ba8;color:#1e1e2e;border-radius:9px;font-size:10px;font-weight:700;min-width:17px;height:17px;display:none;align-items:center;justify-content:center;padding:0 3px;pointer-events:none;';
    badge.textContent = '0';
    mainBtn.appendChild(badge);

    function toggle(forceState) {
      menuVisible = forceState !== undefined ? forceState : !menuVisible;
      menu.style.display = menuVisible ? 'flex' : 'none';
    }

    mainBtn.onclick = function (e) { e.stopPropagation(); toggle(); };

    document.addEventListener('click', function (e) {
      if (menuVisible && !panel.contains(e.target)) toggle(false);
    });

    panel.appendChild(menu);
    panel.appendChild(mainBtn);
    document.body.appendChild(panel);

    console.log('%c🚀 Network MD v3.1 已启动 — 右下角 📡 按钮', 'color:#89b4fa;font-size:13px;font-weight:bold');
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
    downloadMd(generateSelectedMd(Array.from(requests.values())));
    console.log('%c✅ 已导出 ' + requests.size + ' 条', 'color:#4caf50;font-weight:bold');
  };

  win.__listRequests = function () {
    console.table(Array.from(requests.values()).map(function (r, i) {
      return { '#': i + 1, name: r.name, method: r.method, time: r.time };
    }));
  };

  win.__clearRequests = function () { requests.clear(); console.log('🗑️ 已清空'); };

  // ─── 初始化：等 body 可用再挂 UI ─────────────────────────

  function waitForBody(cb) {
    if (document.body) {
      cb();
    } else {
      // body 还没有，用 MutationObserver 等
      const obs = new MutationObserver(function () {
        if (document.body) {
          obs.disconnect();
          cb();
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      // 保底：DOMContentLoaded
      document.addEventListener('DOMContentLoaded', function () {
        obs.disconnect();
        cb();
      }, { once: true });
    }
  }

  waitForBody(createFloatUI);

})();
