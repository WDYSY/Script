// ==UserScript==
// @name         __copyRequest
// @namespace    https://docs.scriptcat.org/
// @version      0.1.0
// @description  try to take over the world!
// @author       You
// @match        *://*.ctrip.com/*
// @match        *://*.ctripcorp.com/*
// @grant        none
// @noframes
// ==/UserScript==

(function() {
  const requests = new Map();

  // 拦截 XHR
  const OriginalXHR = window.XMLHttpRequest;
  function NewXHR() {
    const xhr = new OriginalXHR();
    let requestBody = null;
    let requestUrl = '';

    const originalOpen = xhr.open.bind(xhr);
    const originalSend = xhr.send.bind(xhr);

    xhr.open = function(method, url, ...args) {
      requestUrl = url;
      return originalOpen(method, url, ...args);
    };

    xhr.send = function(body) {
      requestBody = body;
      xhr.addEventListener('load', function() {
        try {
          const urlObj = new URL(requestUrl, location.origin);
          const apiName = urlObj.pathname.split('/').pop();

          let reqData = null;
          try { reqData = JSON.parse(body); } catch { reqData = body; }

          let resData = null;
          try { resData = JSON.parse(xhr.responseText); } catch { resData = xhr.responseText; }

          const queryParams = {};
          urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });

          requests.set(requestUrl, {
            name: apiName,
            url: requestUrl,
            queryParams,
            requestBody: reqData,
            response: resData,
            time: new Date().toLocaleTimeString()
          });

          console.log(`✅ 已捕获: ${apiName} → __copyRequest('${apiName}')`);
        } catch(e) {}
      });
      return originalSend(body);
    };
    return xhr;
  }
  NewXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = NewXHR;

  // 拦截 fetch
  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    let requestBody = null;
    try { requestBody = init.body ? JSON.parse(init.body) : null; } catch { requestBody = init.body; }

    const response = await originalFetch(input, init);
    const cloned = response.clone();

    try {
      const resData = await cloned.json();
      const urlObj = new URL(url, location.origin);
      const apiName = urlObj.pathname.split('/').pop();
      const queryParams = {};
      urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });

      requests.set(url, {
        name: apiName,
        url,
        queryParams,
        requestBody,
        response: resData,
        time: new Date().toLocaleTimeString()
      });

      console.log(`✅ 已捕获: ${apiName} → __copyRequest('${apiName}')`);
    } catch(e) {}

    return response;
  };

  // 复制最新一条
  window.__copyLastRequest = function() {
    const last = [...requests.values()].pop();
    if (!last) { console.warn('❌ 没有捕获到请求，请先触发接口'); return; }
    window.__copyRequest(last.name);
  };

  // 按关键字复制指定接口
  window.__copyRequest = function(keyword) {
    const matched = [...requests.entries()]
      .filter(([url]) => url.includes(keyword))
      .map(([, v]) => v);

    if (!matched.length) {
      console.warn(`❌ 未找到包含 "${keyword}" 的请求`);
      console.log('已捕获的接口：', [...requests.keys()].map(u => {
        try { return new URL(u, location.origin).pathname.split('/').pop(); } catch { return u; }
      }));
      return;
    }

    const item = matched[matched.length - 1];

    const md = `## 接口：${item.name}

> 时间：${item.time}
> 页面URL：\`${window.location.href}\`
> 接口URL：\`${item.url}\`


### Query Params

\`\`\`json
${JSON.stringify(item.queryParams, null, 2)}
\`\`\`

### Request Payload

\`\`\`json
${JSON.stringify(item.requestBody, null, 2)}
\`\`\`

### Response

\`\`\`json
${JSON.stringify(item.response, null, 2)}
\`\`\`
`;

    copy(md);
    console.log(`✅ 已复制到剪贴板：${item.name}`);
    console.log(md);
  };

  // 列出所有已捕获的请求
  window.__listRequests = function() {
    console.table([...requests.values()].map(r => ({
      name: r.name,
      time: r.time,
      url: r.url.substring(0, 80)
    })));
  };

  console.log(`
🚀 Network MD 拦截器已启动

可用命令：
  __listRequests()                    → 列出所有已捕获的请求
  __copyLastRequest()                 → 复制最新一条请求
  __copyRequest('接口名关键字')         → 复制指定接口（注意加引号）

示例：
  __copyRequest('queryResourceSubTypeInfo')
  __copyRequest('getUserInfo')
  `);
})();