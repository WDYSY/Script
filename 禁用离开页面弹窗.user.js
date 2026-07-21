// ==UserScript==
// @name         禁用离开页面弹窗
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  禁止 beforeunload 离开提示
// @match        *://你的网站域名/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function() {
  // 方法一：直接覆盖 addEventListener，拦截 beforeunload 注册
  const _addEventListener = window.addEventListener.bind(window)
  window.addEventListener = function(type, listener, options) {
    if (type === 'beforeunload') {
      console.log('[脚本猫] 已拦截 beforeunload 注册')
      return  // 直接丢弃，不注册
    }
    return _addEventListener(type, listener, options)
  }

  // 方法二：防止 onbeforeunload 赋值生效
  Object.defineProperty(window, 'onbeforeunload', {
    set: function(fn) {
      console.log('[脚本猫] 已拦截 onbeforeunload 赋值')
      // 什么都不做，赋值无效
    },
    get: function() {
      return null
    }
  })
})()
