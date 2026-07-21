// ==UserScript==
// @name         __downloadAllMD
// @namespace    https://docs.scriptcat.org/
// @version      0.3.0
// @description  汇总所有控制台请求到一个MD文件，同名接口多次请求加序号区分，支持URL过滤
// @author       You
// @match        *://*.ctrip.com/*
// @match        *://*.ctripcorp.com/*
// @grant        none
// @noframes
// ==/UserScript==

(function() {

  // ═══════════════════════════════════════════════════════
  // ⚙️  过滤配置：满足任意一条规则即会被捕获并导出（OR 关系）
  //    支持字符串（包含匹配）和正则表达式两种写法
  //    留空数组 [] 表示捕获全部请求
  // ═══════════════════════════════════════════════════════
  const EXPORT_FILTERS = [
    //'.ctripcorp.com',
    'tour/vacationflightservice',
    // '/api/v',                      // 字符串：包含路径前缀
    // /\/product\/input\/.+/,        // 正则：匹配特定路径
    // 'getUserInfo',                 // 字符串：包含接口名
  ];

  // ═══════════════════════════════════════════════════════
  // 过滤判断函数
  // ═══════════════════════════════════════════════════════
  function shouldCapture(url) {
    // 空数组 → 全部捕获
    if (!EXPORT_FILTERS.length) return true;

    return EXPORT_FILTERS.some(rule => {
      if (rule instanceof RegExp) return rule.test(url);
      if (typeof rule === 'string') return url.includes(rule);
      return false;
    });
  }

  // ─────────────────────────────────────────
  // 存储结构
  // ─────────────────────────────────────────
  const requests = [];
  const nameCountMap = new Map();

  // ─────────────────────────────────────────
  // 工具：解析 URL
  // ─────────────────────────────────────────
  function parseUrl(url) {
    try {
      const urlObj = new URL(url, location.origin);
      const apiName = urlObj.pathname.split('/').filter(Boolean).pop() || 'unknown';
      const queryParams = {};
      urlObj.searchParams.forEach((v, k) => { queryParams[k] = v; });
      return { urlObj, apiName, queryParams };
    } catch {
      return { urlObj: null, apiName: 'unknown', queryParams: {} };
    }
  }

  // ─────────────────────────────────────────
  // 工具：记录一条请求，同名自动加序号
  // ─────────────────────────────────────────
  function recordRequest(entry) {
    // ✅ 过滤检查
    if (!shouldCapture(entry.url)) return;

    const baseName = entry.name;
    const count = (nameCountMap.get(baseName) || 0) + 1;
    nameCountMap.set(baseName, count);

    entry.displayName = count === 1 ? baseName : `${baseName} (${count})`;
    entry.index = requests.length + 1;

    requests.push(entry);
    console.log(`✅ [${entry.index}] 已捕获: ${entry.displayName}`);
  }

  // ─────────────────────────────────────────
  // 拦截 XHR
  // ─────────────────────────────────────────
  const OriginalXHR = window.XMLHttpRequest;
  function NewXHR() {
    const xhr = new OriginalXHR();
    let requestUrl = '';
    let requestBody = null;

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
          const { apiName, queryParams } = parseUrl(requestUrl);
          let reqData = null;
          try { reqData = JSON.parse(body); } catch { reqData = body || null; }
          let resData = null;
          try { resData = JSON.parse(xhr.responseText); } catch { resData = xhr.responseText; }

          recordRequest({
            name: apiName,
            url: requestUrl,
            method: 'XHR',
            queryParams,
            requestBody: reqData,
            response: resData,
            status: xhr.status,
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
          });
        } catch(e) {}
      });
      return originalSend(body);
    };
    return xhr;
  }
  NewXHR.prototype = OriginalXHR.prototype;
  window.XMLHttpRequest = NewXHR;

  // ─────────────────────────────────────────
  // 拦截 Fetch
  // ─────────────────────────────────────────
  const originalFetch = window.fetch;
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url;
    let requestBody = null;
    try { requestBody = init.body ? JSON.parse(init.body) : null; } catch { requestBody = init.body || null; }

    const response = await originalFetch(input, init);
    const cloned = response.clone();

    try {
      const { apiName, queryParams } = parseUrl(url);
      let resData = null;
      try { resData = await cloned.json(); } catch { resData = await cloned.text().catch(() => null); }

      recordRequest({
        name: apiName,
        url,
        method: 'Fetch',
        queryParams,
        requestBody,
        response: resData,
        status: response.status,
        time: new Date().toLocaleTimeString(),
        timestamp: Date.now()
      });
    } catch(e) {}

    return response;
  };

  // ─────────────────────────────────────────
  // 构建单条 MD
  // ─────────────────────────────────────────
  function buildSingleMd(item) {
    return `## [${item.index}] ${item.displayName}

| 字段 | 值 |
|------|----|
| 时间 | \`${item.time}\` |
| 方式 | \`${item.method}\` |
| 状态 | \`${item.status}\` |
| 页面 | \`${window.location.href}\` |
| 接口 | \`${item.url}\` |

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

---
`;
  }

  // ─────────────────────────────────────────
  // 构建汇总 MD
  // ─────────────────────────────────────────
  function buildAllMd(list) {
    const now = new Date().toLocaleString();
    const pageUrl = window.location.href;

    // 当前生效的过滤规则描述
    const filterDesc = EXPORT_FILTERS.length
      ? EXPORT_FILTERS.map(r => `\`${r}\``).join(' 或 ')
      : '`全部`';

    const tocLines = list.map(item =>
      `- [${item.index}. ${item.displayName}](#${item.index}-${item.displayName.replace(/\s/g, '-').replace(/[()]/g, '')})`
    ).join('\n');

    const body = list.map(buildSingleMd).join('\n');

    return `# Network 请求汇总

| 项目 | 值 |
|------|----|
| 生成时间 | ${now} |
| 页面地址 | \`${pageUrl}\` |
| 捕获条数 | **${list.length}** 条 |
| 过滤规则 | ${filterDesc} |

## 目录

${tocLines}

---

${body}`;
  }

  // ─────────────────────────────────────────
  // 下载 MD 文件
  // ─────────────────────────────────────────
  function downloadMd(content, filename) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────
  // 对外暴露的命令
  // ─────────────────────────────────────────

  /** 下载全部请求汇总 MD（可选：额外关键字二次过滤） */
  window.__downloadAllMD = function(keyword) {
    let list = [...requests];

    if (keyword) {
      list = list.filter(r => r.url.includes(keyword) || r.name.includes(keyword));
      if (!list.length) {
        console.warn(`❌ 未找到包含 "${keyword}" 的请求`);
        return;
      }
    }

    if (!list.length) {
      console.warn('❌ 没有捕获到任何请求，请先触发接口');
      return;
    }

    const filename = `network_all_${new Date().toLocaleString().replace(/[/:, ]/g, '-')}.md`;
    downloadMd(buildAllMd(list), filename);
    console.log(`✅ 已下载汇总文件：${filename}，共 ${list.length} 条`);
  };

  /** 下载单条（按关键字匹配最后一条） */
  window.__downloadRequest = function(keyword) {
    const matched = requests.filter(r => r.url.includes(keyword) || r.name.includes(keyword));
    if (!matched.length) {
      console.warn(`❌ 未找到包含 "${keyword}" 的请求`);
      return;
    }
    const item = matched[matched.length - 1];
    downloadMd(`# ${item.displayName}\n\n` + buildSingleMd(item), `${item.name}_${item.time.replace(/:/g, '-')}.md`);
    console.log(`✅ 已下载：${item.displayName}`);
  };

  /** 下载最后一条 */
  window.__downloadLastRequest = function() {
    if (!requests.length) { console.warn('❌ 没有捕获到请求'); return; }
    window.__downloadRequest(requests[requests.length - 1].name);
  };

  /** 列出所有已捕获请求 */
  window.__listRequests = function() {
    if (!requests.length) { console.warn('❌ 暂无捕获记录'); return; }
    console.table(requests.map(r => ({
      '#': r.index,
      displayName: r.displayName,
      method: r.method,
      status: r.status,
      time: r.time,
      url: r.url.substring(0, 80)
    })));
    console.log(`共 ${requests.length} 条`);
  };

  /** 查看当前过滤规则 */
  window.__listFilters = function() {
    if (!EXPORT_FILTERS.length) {
      console.log('📋 当前过滤规则：全部捕获（无过滤）');
      return;
    }
    console.log('📋 当前过滤规则（满足任意一条即捕获）：');
    EXPORT_FILTERS.forEach((r, i) => console.log(`  ${i + 1}. ${r}`));
  };

  /** 清空记录 */
  window.__clearRequests = function() {
    requests.length = 0;
    nameCountMap.clear();
    console.log('🗑️ 已清空所有捕获记录');
  };

  // ─────────────────────────────────────────
  // 启动提示
  // ─────────────────────────────────────────
  const filterTip = EXPORT_FILTERS.length
    ? `过滤规则：${EXPORT_FILTERS.map(r => String(r)).join(' | ')}`
    : '过滤规则：全部捕获';

  console.log(`
🚀 __downloadAllMD 已启动  （${filterTip}）

可用命令：
  __listFilters()                 → 查看当前过滤规则
  __listRequests()                → 列出所有已捕获请求
  __downloadAllMD()               → ⬇️ 下载全部请求汇总 MD
  __downloadAllMD('keyword')      → ⬇️ 额外按关键字过滤后下载
  __downloadRequest('接口名')      → ⬇️ 下载指定接口最后一条
  __downloadLastRequest()         → ⬇️ 下载最新一条
  __clearRequests()               → 🗑️ 清空记录重新开始
  `);
})();
