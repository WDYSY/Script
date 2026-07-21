// ==UserScript==
// @name         __copyRequest - Network MD导出工具
// @namespace    https://docs.scriptcat.org/
// @version      1.0.2
// @description  拦截XHR/Fetch请求，导出为Markdown格式（含headers/ticket/params/response）
// @author       You
// @match        *://*.ctrip.com/*
// @match        *://*.ctripcorp.com/*
// @grant        GM_setClipboard
// @grant        unsafeWindow
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  // ⚠️ 关键：脚本猫沙箱环境需用 unsafeWindow 才能暴露到页面全局
  const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

  const requests = new Map();

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

      console.log(
        '%c✅ 已捕获: ' + apiName,
        'color:#4caf50;font-weight:bold',
        "→ __copyRequest('" + apiName + "')"
      );
    } catch (e) {}
  }

  // ─────────────────────────────────────────
  // 拦截 XHR（挂在 unsafeWindow 上）
  // ─────────────────────────────────────────
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

  // ─────────────────────────────────────────
  // 拦截 Fetch（挂在 unsafeWindow 上）
  // ─────────────────────────────────────────
  const originalFetch = win.fetch.bind(win);

  win.fetch = async function (input, init) {
    init = init || {};
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : String(input));
    const method = (init.method || (input && typeof input === 'object' ? input.method : null) || 'GET').toUpperCase();

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
        const contentType = (response.headers.get('content-type') || '');
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

  // ─────────────────────────────────────────
  // 生成 Markdown
  // ─────────────────────────────────────────
  function generateMd(item) {
    const ticket = item.requestHeaders['ticket']
      || item.requestHeaders['Ticket']
      || item.requestHeaders['x-ticket']
      || '未找到';

    const lines = [];
    lines.push('## 接口：' + item.name);
    lines.push('');
    lines.push('> 🕐 时间：' + item.time);
    lines.push('> 🌐 页面URL：`' + win.location.href + '`');
    lines.push('> 🔗 接口URL：`' + item.url + '`');
    lines.push('> 📡 Method：`' + item.method + '`');
    lines.push('> 🎫 ticket：`' + ticket + '`');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 📤 Request Headers');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.requestHeaders, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 🔍 Query Params');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.queryParams, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 📦 Request Body');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.requestBody, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 📥 Response Headers');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.responseHeaders, null, 2));
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('### 💬 Response');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(item.response, null, 2));
    lines.push('```');
    lines.push('');

    return lines.join('\n');
  }

  // ─────────────────────────────────────────
  // 复制到剪贴板
  // ─────────────────────────────────────────
  function copyToClipboard(text) {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }
    // DevTools 环境下的 copy()
    if (typeof win.copy === 'function') {
      win.copy(text);
      return;
    }
    if (win.navigator && win.navigator.clipboard) {
      win.navigator.clipboard.writeText(text).catch(function () {});
      return;
    }
    // 终极降级
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  // ─────────────────────────────────────────
  // 全局命令（挂到 unsafeWindow）
  // ─────────────────────────────────────────
  win.__listRequests = function () {
    const list = Array.from(requests.values()).map(function (r, i) {
      return {
        '#': i + 1,
        name: r.name,
        method: r.method,
        time: r.time,
        ticket: r.requestHeaders['ticket'] || r.requestHeaders['Ticket'] || '-',
        url: r.url.substring(0, 80) + (r.url.length > 80 ? '...' : ''),
      };
    });
    console.table(list);
    console.log('共捕获 ' + list.length + " 条，使用 __copyRequest('关键字') 复制");
  };

  win.__copyLastRequest = function () {
    const vals = Array.from(requests.values());
    const last = vals[vals.length - 1];
    if (!last) {
      console.warn('❌ 没有捕获到请求，请先触发接口');
      return;
    }
    const md = generateMd(last);
    copyToClipboard(md);
    console.log('%c✅ 已复制最新请求：' + last.name, 'color:#4caf50;font-weight:bold');
    console.log(md);
  };

  win.__copyRequest = function (keyword) {
    if (!keyword) {
      console.warn('❌ 请传入接口名关键字，例如：__copyRequest("getUserInfo")');
      return;
    }
    const matched = Array.from(requests.entries())
      .filter(function (entry) { return entry[0].indexOf(keyword) > -1; })
      .map(function (entry) { return entry[1]; });

    if (!matched.length) {
      console.warn('❌ 未找到包含 "' + keyword + '" 的请求');
      win.__listRequests();
      return;
    }

    const item = matched[matched.length - 1];
    const md = generateMd(item);
    copyToClipboard(md);
    console.log('%c✅ 已复制到剪贴板：' + item.name, 'color:#4caf50;font-weight:bold');
    console.log(md);
  };

  win.__exportAllRequests = function () {
    if (!requests.size) {
      console.warn('❌ 没有捕获到任何请求');
      return;
    }

    const lines = [];
    lines.push('# Network 请求导出');
    lines.push('');
    lines.push('> 导出时间：' + new Date().toLocaleString());
    lines.push('> 页面URL：' + win.location.href);
    lines.push('> 共 ' + requests.size + ' 条请求');
    lines.push('');
    lines.push('---');
    lines.push('');

    let i = 0;
    requests.forEach(function (item) {
      i++;
      lines.push('<!-- 第 ' + i + ' 条 -->');
      lines.push(generateMd(item));
      lines.push('---');
      lines.push('');
    });

    const fullMd = lines.join('\n');
    const blob = new Blob([fullMd], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'network-export-' + Date.now() + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);

    console.log('%c✅ 已下载 network-export.md，共 ' + requests.size + ' 条', 'color:#4caf50;font-weight:bold');
  };

  win.__clearRequests = function () {
    requests.clear();
    console.log('🗑️ 已清空所有捕获的请求');
  };

  // ─────────────────────────────────────────
  // 启动提示
  // ─────────────────────────────────────────
  console.log('%c🚀 Network MD 拦截器 v1.0.2 已启动', 'color:#2196f3;font-size:14px;font-weight:bold');
  console.log(
    '%c可用命令：\n' +
    "  __listRequests()           → 列出所有已捕获的请求\n" +
    "  __copyLastRequest()        → 复制最新一条\n" +
    "  __copyRequest('关键字')    → 复制指定接口\n" +
    "  __exportAllRequests()      → 下载全部为 .md\n" +
    "  __clearRequests()          → 清空记录\n\n" +
    "示例：\n" +
    "  __copyRequest('CheckPermission')\n" +
    "  __exportAllRequests()",
    'color:#888;font-size:12px'
  );

})();
