// ==UserScript==
// @name         侧边抽屉打开idev2.0链接
// @namespace    http://tampermonkey.net/
// @version      1.4
// @description  拦截新标签跳转，改为右侧抽屉打开
// @author       You
// @match        https://idev2.ctripcorp.com/home/*
// @match        https://idev2.ctripcorp.com/filter/*
// @match        https://idev2.ctripcorp.com/issueDetail/*
// @match        https://idev2.ctrip-it.com/issueDetail/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  const _originalOpen = window.open.bind(window);
  window.open = function (url, target, features) {
    if (url && (target === '_blank' || target === undefined || target === '')) {
      openDrawer(url);
      return null;
    }
    return _originalOpen(url, target, features);
  };

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.href;
    const target = link.target;
    if (
      href &&
      !href.startsWith('javascript:') &&
      !href.startsWith('mailto:') &&
      href !== '#' &&
      target === '_blank'
    ) {
      e.preventDefault();
      e.stopPropagation();
      openDrawer(href);
    }
  }, true);

  let styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;

    const style = document.createElement('style');
    style.textContent = `
      #lm-drawer {
        position: fixed;
        top: 0;
        right: 0;
        width: 80%;
        height: 100%;
        background: #fff;
        z-index: 2147483645;
        display: flex;
        flex-direction: column;
        box-shadow: -6px 0 32px rgba(0,0,0,0.18);
        transform: translateX(100%);
        transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 12px 0 0 12px;
      }
      #lm-drawer.lm-open {
        transform: translateX(0);
      }

      #lm-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        width: 5px;
        height: 100%;
        cursor: ew-resize;
        z-index: 10;
        border-radius: 12px 0 0 12px;
        transition: background 0.15s;
      }
      #lm-resize-handle:hover {
        background: rgba(22, 119, 255, 0.25);
      }

      #lm-toolbar {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 10px 12px;
        background: #f7f8fa;
        border-bottom: 1px solid #e8e8e8;
        flex-shrink: 0;
        border-radius: 12px 0 0 0;
      }

      .lm-btn {
        border: none;
        background: #ebebeb;
        border-radius: 6px;
        padding: 5px 10px;
        cursor: pointer;
        font-size: 12px;
        color: #333;
        flex-shrink: 0;
        transition: background 0.15s;
        line-height: 1.5;
        white-space: nowrap;
      }
      .lm-btn:hover {
        background: #d8d8d8;
      }

      #lm-close-btn {
        background: #ff5f57;
        color: #fff;
        font-weight: 600;
      }
      #lm-close-btn:hover {
        background: #d94a42;
      }

      .lm-divider {
        width: 1px;
        height: 18px;
        background: #e0e0e0;
        flex-shrink: 0;
        margin: 0 2px;
      }

      /* 地址栏容器 */
      #lm-url-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 6px;
        min-width: 0;
        overflow: hidden;
        padding: 0 6px;
        gap: 4px;
        transition: border-color 0.15s;
      }
      #lm-url-wrap:hover {
        border-color: #1677ff;
      }

      /* 复制按钮 — 在地址栏左侧 */
      #lm-copy-btn {
        flex-shrink: 0;
        border: none;
        background: transparent;
        border-radius: 4px;
        padding: 3px 5px;
        cursor: pointer;
        font-size: 13px;
        color: #aaa;
        line-height: 1;
        transition: background 0.15s, color 0.15s;
        user-select: none;
      }
      #lm-copy-btn:hover {
        background: #f0f0f0;
        color: #1677ff;
      }
      #lm-copy-btn.lm-copied {
        color: #52c41a;
      }

      /* 地址栏文字 — 可点击复制 */
      #lm-url-bar {
        flex: 1;
        font-size: 11px;
        color: #666;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
        /* 点击提示 */
        cursor: pointer;
        user-select: text;
        padding: 4px 0;
        border: none;
        outline: none;
        background: transparent;
        transition: color 0.15s;
      }
      #lm-url-bar:hover {
        color: #1677ff;
      }
      /* 点击后短暂高亮 */
      #lm-url-bar.lm-flash {
        color: #52c41a;
      }

      #lm-iframe-wrap {
        flex: 1;
        position: relative;
        overflow: hidden;
      }

      #lm-iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
      }

      #lm-loading {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        color: #bbb;
        font-size: 13px;
        pointer-events: none;
      }
      .lm-spinner {
        width: 28px;
        height: 28px;
        border: 3px solid #eee;
        border-top-color: #1677ff;
        border-radius: 50%;
        animation: lmSpin 0.7s linear infinite;
      }
      @keyframes lmSpin {
        to { transform: rotate(360deg); }
      }

      #lm-error {
        flex: 1;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        color: #999;
        font-size: 13px;
        padding: 24px;
        text-align: center;
      }
      #lm-error-icon {
        font-size: 40px;
      }
      #lm-error-link {
        color: #1677ff;
        text-decoration: none;
        font-size: 13px;
        padding: 7px 20px;
        border: 1px solid #1677ff;
        border-radius: 6px;
        transition: all 0.15s;
        margin-top: 4px;
      }
      #lm-error-link:hover {
        background: #1677ff;
        color: #fff;
      }

      #lm-tab {
        position: fixed;
        right: 0;
        top: 50%;
        transform: translateY(-50%);
        z-index: 2147483644;
        background: #1677ff;
        color: #fff;
        writing-mode: vertical-rl;
        padding: 14px 6px;
        border-radius: 8px 0 0 8px;
        font-size: 12px;
        cursor: pointer;
        box-shadow: -3px 0 12px rgba(0,0,0,0.15);
        user-select: none;
        transition: background 0.15s, opacity 0.2s;
        letter-spacing: 2px;
        display: none;
      }
      #lm-tab:hover {
        background: #0958d9;
      }
    `;
    document.head.appendChild(style);
  }

  let drawerEl = null;
  let tabEl = null;
  let currentUrl = null;

  // 统一复制逻辑 + 视觉反馈
  function copyUrl() {
    const urlToCopy = currentUrl || document.getElementById('lm-url-bar').textContent;

    const doFeedback = () => {
      // 复制按钮变绿
      const btn = document.getElementById('lm-copy-btn');
      if (btn) {
        btn.textContent = '✓';
        btn.classList.add('lm-copied');
        setTimeout(() => {
          btn.textContent = '⎘';
          btn.classList.remove('lm-copied');
        }, 1500);
      }
      // 地址栏文字短暂变绿
      const bar = document.getElementById('lm-url-bar');
      if (bar) {
        bar.classList.add('lm-flash');
        setTimeout(() => bar.classList.remove('lm-flash'), 1500);
      }
    };

    navigator.clipboard.writeText(urlToCopy).then(doFeedback).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = urlToCopy;
      ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      doFeedback();
    });
  }

  function openDrawer(url) {
    injectStyle();
    currentUrl = url;

    if (drawerEl) {
      loadUrl(url);
      expandDrawer();
      return;
    }

    tabEl = document.createElement('div');
    tabEl.id = 'lm-tab';
    tabEl.textContent = '预览面板';
    tabEl.onclick = expandDrawer;
    document.body.appendChild(tabEl);

    drawerEl = document.createElement('div');
    drawerEl.id = 'lm-drawer';

    drawerEl.innerHTML = `
      <div id="lm-resize-handle"></div>
      <div id="lm-toolbar">

        <button class="lm-btn" id="lm-close-btn" title="关闭">✕</button>
        <button class="lm-btn" id="lm-newtab" title="在新标签页打开">↗ 新标签</button>
        <button class="lm-btn" id="lm-collapse-btn" title="收起">⇥</button>

        <div class="lm-divider"></div>

        <button class="lm-btn" id="lm-back"   title="后退">◀</button>
        <button class="lm-btn" id="lm-fwd"    title="前进">▶</button>
        <button class="lm-btn" id="lm-reload" title="刷新">↻</button>

        <div class="lm-divider"></div>

        <!-- 地址栏：复制按钮在左，URL文字在右，两者都能触发复制 -->
        <div id="lm-url-wrap">
          <button id="lm-copy-btn" title="复制链接">⎘</button>
          <span id="lm-url-bar" title="点击复制链接">${url}</span>
        </div>

      </div>
      <div id="lm-iframe-wrap">
        <div id="lm-loading">
          <div class="lm-spinner"></div>
          <span>加载中...</span>
        </div>
        <iframe
          id="lm-iframe"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
        ></iframe>
      </div>
      <div id="lm-error">
        <span id="lm-error-icon">🚫</span>
        <span>该页面禁止被嵌入显示<br><small style="color:#bbb">（X-Frame-Options 限制）</small></span>
        <a id="lm-error-link" href="${url}" target="_blank">在新标签页打开 ↗</a>
      </div>
    `;
    document.body.appendChild(drawerEl);

    document.getElementById('lm-close-btn').onclick = closeDrawer;
    document.getElementById('lm-collapse-btn').onclick = collapseDrawer;
    document.getElementById('lm-newtab').onclick = () => _originalOpen(currentUrl, '_blank');
    document.getElementById('lm-reload').onclick = () => {
      const iframe = document.getElementById('lm-iframe');
      document.getElementById('lm-loading').style.display = 'flex';
      iframe.src = iframe.src;
    };
    document.getElementById('lm-back').onclick = () => {
      try { document.getElementById('lm-iframe').contentWindow.history.back(); } catch (e) {}
    };
    document.getElementById('lm-fwd').onclick = () => {
      try { document.getElementById('lm-iframe').contentWindow.history.forward(); } catch (e) {}
    };

    // 复制按钮 + 点击地址栏 均触发复制
    document.getElementById('lm-copy-btn').onclick = copyUrl;
    document.getElementById('lm-url-bar').onclick = copyUrl;

    initResizeHandle();

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawerEl) collapseDrawer();
    });

    loadUrl(url);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        drawerEl.classList.add('lm-open');
      });
    });
  }

  function loadUrl(url) {
    currentUrl = url;
    const iframe     = document.getElementById('lm-iframe');
    const urlBar     = document.getElementById('lm-url-bar');
    const errorBox   = document.getElementById('lm-error');
    const iframeWrap = document.getElementById('lm-iframe-wrap');
    const loading    = document.getElementById('lm-loading');
    const errorLink  = document.getElementById('lm-error-link');

    errorBox.style.display = 'none';
    iframeWrap.style.display = 'block';
    loading.style.display = 'flex';

    urlBar.textContent = url;
    urlBar.title = '点击复制链接';
    errorLink.href = url;

    iframe.src = url;

    iframe.onload = () => {
      loading.style.display = 'none';
      try {
        const loc = iframe.contentWindow.location.href;
        if (loc && loc !== 'about:blank') {
          urlBar.textContent = loc;
          currentUrl = loc;
        }
      } catch (e) {}
    };

    iframe.onerror = () => {
      iframeWrap.style.display = 'none';
      errorBox.style.display = 'flex';
    };
  }

  function expandDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.add('lm-open');
    tabEl.style.display = 'none';
  }

  function collapseDrawer() {
    if (!drawerEl) return;
    drawerEl.classList.remove('lm-open');
    tabEl.style.display = 'block';
  }

  function closeDrawer() {
    if (drawerEl) { drawerEl.remove(); drawerEl = null; }
    if (tabEl)    { tabEl.remove();    tabEl = null;    }
    currentUrl = null;
  }

  function initResizeHandle() {
    const handle = document.getElementById('lm-resize-handle');
    handle.addEventListener('mousedown', (e) => {
      const startX = e.clientX;
      const startWidth = drawerEl.offsetWidth;
      e.preventDefault();

      const onMove = (ev) => {
        const newWidth = Math.min(
          Math.max(startWidth + (startX - ev.clientX), 320),
          window.innerWidth * 0.85
        );
        drawerEl.style.width = newWidth + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

})();
