// ==UserScript==
// @name         本地短地址映射
// @namespace    http://tampermonkey.net/
// @version      1.0.3
// @description  在地址栏输入自定义短地址，自动跳转到映射的完整URL
// @updateURL    https://raw.githubusercontent.com/WDYSY/Script/main/本地短地址映射.user.js
// @downloadURL  https://raw.githubusercontent.com/WDYSY/Script/main/本地短地址映射.user.js
// @author       WY
// @match        *://*/*
// @match        http://tvbk*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // =============================================
  // 📌 在这里配置你的短地址映射表
  // 格式：'短地址关键词': '目标URL'
  // =============================================
  const URL_MAP = {
    'tvbk2902':   'https://tour.flight.fat29.qa.nt.ctripcorp.com/#/audit?module=2902',
    'wyscat': 'https://github.com/WDYSY/Script/edit/main/%E6%9C%AC%E5%9C%B0%E7%9F%AD%E5%9C%B0%E5%9D%80%E6%98%A0%E5%B0%84.user.js',
    // 继续添加你的映射...
  };

  // =============================================
  // ⚙️ 配置项
  // =============================================
  const CONFIG = {
    // 短地址后缀分隔符，输入 tvbk2834/ 或 tvbk2834 都能匹配
    trailingSlash: true,
    // 是否在控制台打印日志（调试用）
    debug: true,
  };

  // =============================================
  // 🔧 核心逻辑（无需修改）
  // =============================================
  function log(...args) {
    if (CONFIG.debug) console.log('[短地址映射]', ...args);
  }

  function matchAndRedirect() {
    const raw = window.location.href;

    // 获取当前访问的 host+path，去掉协议头
    // 例如：http://tvbk2834/ → tvbk2834
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    // 拼接完整路径用于匹配（去掉首尾斜杠）
    let key = (hostname + pathname).replace(/\/+$/, '').replace(/^\/+/, '');

    log('当前地址:', raw);
    log('匹配关键词:', key);

    // 精确匹配
    if (URL_MAP[key]) {
      log('命中映射:', key, '→', URL_MAP[key]);
      window.location.replace(URL_MAP[key]);
      return;
    }

    // 模糊匹配（支持带路径的短地址）
    for (const [shortKey, targetUrl] of Object.entries(URL_MAP)) {
      if (key.startsWith(shortKey)) {
        const restPath = key.slice(shortKey.length);
        const finalUrl = targetUrl + restPath;
        log('模糊命中:', key, '→', finalUrl);
        window.location.replace(finalUrl);
        return;
      }
    }

    log('无匹配映射，不跳转');
  }

  matchAndRedirect();

})();
