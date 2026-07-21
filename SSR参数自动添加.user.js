// ==UserScript==
// @name         SSR参数自动添加
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  检测URL中包含特定路径时，自动添加&ssr=0参数并跳转
// @author       WY
// @updateURL    https://raw.githubusercontent.com/WDYSY/Script/main/SSR参数自动添加.user.js
// @downloadURL  https://raw.githubusercontent.com/WDYSY/Script/main/SSR参数自动添加.user.js
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // =============================================
  // 🔧 配置区域 - 在这里添加/修改你的匹配规则
  // =============================================
  const CONFIG = {
    // 需要匹配的 URL 路径关键词列表（满足其中一个即触发）
    matchPatterns: [
      "ivbk/vendor",
      "product/input",
      // 在这里继续添加更多路径，例如：
      "operation/platform",
      // "another/route",
    ],

    // 要添加的参数
    paramKey: "ssr",
    paramValue: "0",
  };
  // =============================================

  /**
   * 检查当前 URL 是否包含目标路径
   */
  function isMatchedUrl(url) {
    return CONFIG.matchPatterns.some((pattern) => url.includes(pattern));
  }

  /**
   * 检查 URL 是否已包含目标参数
   */
  function hasTargetParam(url) {
    const param = `${CONFIG.paramKey}=${CONFIG.paramValue}`;
    // 检查 ?ssr=0 或 &ssr=0 的情况
    return new RegExp(`[?&]${CONFIG.paramKey}=${CONFIG.paramValue}`).test(url);
  }

  /**
   * 向 URL 添加参数
   */
  function addParamToUrl(url) {
    // 判断 URL 是否已有其他查询参数
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${CONFIG.paramKey}=${CONFIG.paramValue}`;
  }

  /**
   * 主逻辑
   */
  function main() {
    const currentUrl = window.location.href;

    console.log("[SSR脚本] 当前URL:", currentUrl);

    // 1. 检查是否匹配目标路径
    if (!isMatchedUrl(currentUrl)) {
      console.log("[SSR脚本] URL不匹配，跳过");
      return;
    }

    // 2. 检查是否已有目标参数（防止无限跳转）
    if (hasTargetParam(currentUrl)) {
      console.log("[SSR脚本] 已包含目标参数，无需跳转");
      return;
    }

    // 3. 添加参数并跳转
    const newUrl = addParamToUrl(currentUrl);
    console.log("[SSR脚本] 即将跳转到:", newUrl);

    // 使用 replace 避免产生额外的历史记录
    window.location.replace(newUrl);
  }

  main();
})();
