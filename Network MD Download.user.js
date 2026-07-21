// ==UserScript==
// @name         Network MD Download
// @namespace    https://docs.scriptcat.org/
// @version      2.0.0
// @description  拦截XHR/Fetch，点击悬浮按钮直接导出MD文件
// @author       You
// @match        *://*.ctrip.com/*
// @match        *://*.ctripcorp.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
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

      // 更新悬浮按钮计数
      updateBadge();
    } catch (e) {}
  }

  // ─── 拦截 XHR ───────────────────────────────────────────

  const OriginalXHR = win.XMLHttpRequest;

  function NewXHR() {
    const xhr = new OriginalXHR();
    let _method = 'GET';
    let _url = '';
    let _requestBody = null;
    const _requestHeaders = {};

    const originalOpen = xhr.open.bind(xhr);
    xhr.open = function (method, url) {
      _method = method;
      _url = url;
      return originalOpen.apply(xhr, arguments);
    };

    const originalSetHeader = xhr.setRequestHeader.bind(xhr);
    xhr.setRequestHeader = function (name, value) {
      _requestHeaders[name] = value;
      return originalSetHeader(name, value);
    };

    const originalSend = xhr.send.bind(xhr);
    xhr.send = function (body) {
      _requestBody = safeParse(body);

      xhr.addEventListener('load', function () {
        try {
          const urlObj = new URL(_url, location.origin);
          const queryParams = {};
          urlObj.searchParams.forEach(function (v, k) { queryParams[k] = v; });

          const responseHeaders = {};
          const rawHeaders = xhr.getAllResponseHeaders() || '';
          rawHeaders.trim().split(/[\r\n]+/).forEach(function (line) {
            const idx = line.indexOf(': ');
            if (idx > -1) {
              responseHeaders[line.substring(0, idx)] = line.substring(idx + 2);
            }
          });

          storeRequest({
            url: _url,
            method: _method,
            requestHeaders: Object.assign({}, _requestHeaders),
            queryParams: queryParams,
            requestBody: _requestBody,
            response: safeParse(xhr.responseText),
            responseHeaders: responseHeaders,
          });
        } catch (e) {}
      });

      return originalSend(body);
    };

    return xhr;
  }

  NewXHR.prototype = OriginalXHR.prototype;
  win.XMLHttpRequest = NewXHR;

  // ─── 拦截 Fetch ──────────────────────────────────────────

  const originalFetch = win.fetch.bind(win);

  win.fetch = async function (input, init) {
    init = init || {};
    const url = typeof input === 'string'
      ? input
      : (input && input.url ? input.url : String(input));
    const method = (
      init.method ||
      (input && typeof input === 'object' ? input.method : null) ||
      'GET'
    ).toUpperCase();

    const mergedHeaders = normalizeHeaders(
      init.headers || (input && typeof input === 'object' ? input.headers : null)
    );

    const rawBody = init.body !== undefined
      ? init.body
      : (input && typeof input === 'object' ? input.body : null);
    const requestBody = safeParse(rawBody);

    let response;
    try {
      response = await originalFetch(input, init);
    } catch (e) {
      throw e;
    }

    const cloned = response.clone();

    (async function () {
      try {
        const responseHeaders = normalizeHeaders(response.headers);
        const urlObj = new URL(url, location.origin);
        const queryParams = {};
        urlObj.searchParams.forEach(function (v, k) { queryParams[k] = v; });

        let resData;
        const contentType = response.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') > -1) {
          resData = await cloned.json();
        } else {
          resData = await cloned.text();
        }

        storeRequest({
          url: url,
          method: method,
          requestHeaders: mergedHeaders,
          queryParams: queryParams,
          requestBody: requestBody,
          response: resData,
          responseHeaders: responseHeaders,
        });
      } catch (e) {}
    })();

    return response;
  };

  // ─── 生成单条 MD ─────────────────────────────────────────

  function generateItemMd(item, index) {
    const ticket = item.requestHeaders['ticket']
      || item.requestHeaders['Ticket']
      || item.requestHeaders['x-ticket']
      || item.requestHeaders['X-Ticket']
      || '未找到';

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

  // ─── 生成完整 MD ─────────────────────────────────────────

  function generateFullMd() {
    const lines = [];
    lines.push('# Network 请求导出');
    lines.push('');
    lines.push('| 字段 | 值 |');
    lines.push('|------|-----|');
    lines.push('| 导出时间 | ' + new Date().toLocaleString() + ' |');
    lines.push('| 页面URL | `' + win.location.href + '` |');
    lines.push('| 请求总数 | ' + requests.size + ' 条 |');
    lines.push('');
    lines.push('---');
    lines.push('');

    // 生成目录
    lines.push('## 目录');
    lines.push('');
    let idx = 1;
    requests.forEach(function (item) {
      lines.push(idx + '. [' + item.name + '](#' + idx + '-' + item.name.toLowerCase() + ')  `' + item.method + '`');
      idx++;
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    // 生成详情
    idx = 1;
    requests.forEach(function (item) {
      lines.push(generateItemMd(item, idx));
      lines.push('---');
      lines.push('');
      idx++;
    });

    return lines.join('\n');
  }

  // ─── 下载 MD 文件 ────────────────────────────────────────

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

  // ─── 悬浮按钮 UI ─────────────────────────────────────────

  let badge = null;

  function updateBadge() {
    if (badge) {
      badge.textContent = requests.size;
      badge.style.display = 'flex';
    }
  }

  function createFloatUI() {
    // 容器
    const container = document.createElement('div');
    container.id = '__network_md_panel';
    container.style.cssText = [
      'position: fixed',
      'bottom: 24px',
      'right: 24px',
      'z-index: 2147483647',
      'display: flex',
      'flex-direction: column',
      'align-items: flex-end',
      'gap: 8px',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ].join(';');

    // 菜单面板（默认隐藏）
    const menu = document.createElement('div');
    menu.style.cssText = [
      'background: #1e1e2e',
      'border: 1px solid #313244',
      'border-radius: 12px',
      'padding: 12px',
      'display: none',
      'flex-direction: column',
      'gap: 8px',
      'min-width: 200px',
      'box-shadow: 0 8px 32px rgba(0,0,0,0.4)',
    ].join(';');

    // 菜单标题
    const menuTitle = document.createElement('div');
    menuTitle.style.cssText = 'color:#cdd6f4;font-size:12px;font-weight:600;padding:0 4px 6px;border-bottom:1px solid #313244;margin-bottom:2px;';
    menuTitle.textContent = '🚀 Network MD 导出工具';
    menu.appendChild(menuTitle);

    // 按钮配置
    const buttons = [
      {
        icon: '📥',
        label: '导出全部为 .md',
        color: '#a6e3a1',
        action: function () {
          if (!requests.size) {
            showToast('❌ 暂无请求数据');
            return;
          }
          downloadMd(generateFullMd());
          showToast('✅ 已导出 ' + requests.size + ' 条请求');
          toggleMenu(false);
        }
      },
      {
        icon: '📋',
        label: '复制最新一条',
        color: '#89b4fa',
        action: function () {
          const vals = Array.from(requests.values());
          const last = vals[vals.length - 1];
          if (!last) { showToast('❌ 暂无请求数据'); return; }
          copyToClipboard(generateItemMd(last));
          showToast('✅ 已复制：' + last.name);
          toggleMenu(false);
        }
      },
      {
        icon: '📊',
        label: '列出所有请求',
        color: '#f9e2af',
        action: function () {
          const list = Array.from(requests.values()).map(function (r, i) {
            return {
              '#': i + 1,
              name: r.name,
              method: r.method,
              time: r.time,
              ticket: r.requestHeaders['ticket'] || r.requestHeaders['Ticket'] || '-',
            };
          });
          console.table(list);
          showToast('📊 已在控制台打印，共 ' + list.length + ' 条');
          toggleMenu(false);
        }
      },
      {
        icon: '🗑️',
        label: '清空记录',
        color: '#f38ba8',
        action: function () {
          requests.clear();
          updateBadge();
          if (badge) badge.style.display = 'none';
          showToast('🗑️ 已清空');
          toggleMenu(false);
        }
      },
    ];

    buttons.forEach(function (cfg) {
      const btn = document.createElement('button');
      btn.style.cssText = [
        'background: #313244',
        'border: none',
        'border-radius: 8px',
        'color: ' + cfg.color,
        'cursor: pointer',
        'font-size: 13px',
        'padding: 8px 12px',
        'text-align: left',
        'transition: background 0.15s',
        'width: 100%',
      ].join(';');
      btn.textContent = cfg.icon + '  ' + cfg.label;
      btn.onmouseover = function () { btn.style.background = '#45475a'; };
      btn.onmouseout = function () { btn.style.background = '#313244'; };
      btn.onclick = cfg.action;
      menu.appendChild(btn);
    });

    // 主按钮
    const mainBtn = document.createElement('button');
    mainBtn.style.cssText = [
      'width: 52px',
      'height: 52px',
      'border-radius: 50%',
      'background: linear-gradient(135deg, #89b4fa, #cba6f7)',
      'border: none',
      'cursor: pointer',
      'font-size: 22px',
      'box-shadow: 0 4px 16px rgba(137,180,250,0.4)',
      'transition: transform 0.2s, box-shadow 0.2s',
      'position: relative',
      'display: flex',
      'align-items: center',
      'justify-content: center',
    ].join(';');
    mainBtn.textContent = '📡';
    mainBtn.title = 'Network MD 导出工具';

    mainBtn.onmouseover = function () {
      mainBtn.style.transform = 'scale(1.1)';
      mainBtn.style.boxShadow = '0 6px 20px rgba(137,180,250,0.6)';
    };
    mainBtn.onmouseout = function () {
      mainBtn.style.transform = 'scale(1)';
      mainBtn.style.boxShadow = '0 4px 16px rgba(137,180,250,0.4)';
    };

    // 计数徽章
    badge = document.createElement('span');
    badge.style.cssText = [
      'position: absolute',
      'top: -4px',
      'right: -4px',
      'background: #f38ba8',
      'color: #1e1e2e',
      'border-radius: 10px',
      'font-size: 10px',
      'font-weight: 700',
      'min-width: 18px',
      'height: 18px',
      'display: none',
      'align-items: center',
      'justify-content: center',
      'padding: 0 4px',
    ].join(';');
    badge.textContent = '0';
    mainBtn.appendChild(badge);

    let menuVisible = false;

    function toggleMenu(forceState) {
      menuVisible = forceState !== undefined ? forceState : !menuVisible;
      menu.style.display = menuVisible ? 'flex' : 'none';
    }

    mainBtn.onclick = function () { toggleMenu(); };

    // 点击外部关闭菜单
    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) {
        toggleMenu(false);
      }
    });

    container.appendChild(menu);
    container.appendChild(mainBtn);
    document.body.appendChild(container);
  }

  // ─── Toast 提示 ──────────────────────────────────────────

  function showToast(msg) {
    const existing = document.getElementById('__network_md_toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '__network_md_toast';
    toast.style.cssText = [
      'position: fixed',
      'bottom: 90px',
      'right: 24px',
      'background: #1e1e2e',
      'color: #cdd6f4',
      'border: 1px solid #313244',
      'border-radius: 8px',
      'padding: 10px 16px',
      'font-size: 13px',
      'z-index: 2147483647',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.3)',
      'animation: __fadeIn 0.2s ease',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    ].join(';');
    toast.textContent = msg;

    // 注入动画
    if (!document.getElementById('__network_md_style')) {
      const style = document.createElement('style');
      style.id = '__network_md_style';
      style.textContent = '@keyframes __fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(function () {
      if (toast.parentNode) toast.remove();
    }, 2500);
  }

  // ─── 复制到剪贴板 ────────────────────────────────────────

  function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }
    if (win.navigator && win.navigator.clipboard) {
      win.navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ─── 控制台命令（保留兼容） ──────────────────────────────

  win.__copyRequest = function (keyword) {
    if (!keyword) { console.warn('请传入关键字'); return; }
    const matched = Array.from(requests.entries())
      .filter(function (e) { return e[0].indexOf(keyword) > -1; })
      .map(function (e) { return e[1]; });
    if (!matched.length) { console.warn('未找到：' + keyword); return; }
    const item = matched[matched.length - 1];
    copyToClipboard(generateItemMd(item));
    console.log('%c✅ 已复制：' + item.name, 'color:#4caf50;font-weight:bold');
  };

  win.__exportAllRequests = function () {
    if (!requests.size) { console.warn('暂无数据'); return; }
    downloadMd(generateFullMd());
    console.log('%c✅ 已导出 ' + requests.size + ' 条', 'color:#4caf50;font-weight:bold');
  };

  win.__listRequests = function () {
    console.table(Array.from(requests.values()).map(function (r, i) {
      return { '#': i + 1, name: r.name, method: r.method, time: r.time };
    }));
  };

  win.__clearRequests = function () {
    requests.clear();
    console.log('🗑️ 已清空');
  };

  // ─── 初始化 ──────────────────────────────────────────────

  function init() {
    createFloatUI();
    console.log('%c🚀 Network MD 拦截器 v2.0 已启动', 'color:#89b4fa;font-size:13px;font-weight:bold');
    console.log('%c点击页面右下角 📡 按钮，或使用控制台命令：\n__exportAllRequests() / __copyRequest(\'关键字\') / __listRequests()', 'color:#888;font-size:11px');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
