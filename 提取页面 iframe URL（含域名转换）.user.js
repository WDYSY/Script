// ==UserScript==
// @name         提取页面 iframe URL（含域名转换）
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  一键提取页面所有 iframe 的 src，支持复制原始URL或转换为m.ctrip.com域名
// @match        *://*/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {

  // ── 域名转换逻辑 ──────────────────────────────────────
  function convertUrl(url) {
    try {
      const u = new URL(url)
      const host = u.hostname

      // 匹配 xxx.fatXX.qa.nt.ctripcorp.com → m.ctrip.fatXX.qa.nt.ctripcorp.com
      // 匹配 xxx.ctripcorp.com → m.ctrip.com
      // 匹配 已经是 m.ctrip.com 的不变

      let newHost = null

      // 情况1：vendor.package.fatXX.qa.nt.ctripcorp.com
      const fatMatch = host.match(/^[\w.-]+\.(fat\d+\.qa\.nt\.ctripcorp\.com)$/)
      if (fatMatch) {
        newHost = `m.ctrip.${fatMatch[1]}`
      }

      // 情况2：vendor.package.ctripcorp.com（生产）
      const prodMatch = host.match(/^[\w.-]+\.ctripcorp\.com$/) && !host.includes('.qa.nt.')
      if (!newHost && prodMatch) {
        newHost = 'm.ctrip.com'
      }

      // 情况3：直接是 ctripcorp.com 一级
      if (!newHost && host === 'ctripcorp.com') {
        newHost = 'm.ctrip.com'
      }

      if (!newHost) {
        // 无法识别，直接替换为 m.ctrip.com
        newHost = 'm.ctrip.com'
      }

      // 拼接新 URL，追加 platform=feishu
      const search = u.search ? u.search + '&platform=feishu' : '?platform=feishu'
      return `https://${newHost}${u.pathname}${search}${u.hash}`
    } catch (e) {
      return null
    }
  }

  // ── 等 body 准备好 ────────────────────────────────────
  function init() {
    if (!document.body) {
      setTimeout(init, 300)
      return
    }
    injectStyle()
    mountBtn()
  }

  // ── 样式 ──────────────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('iframe-picker-style')) return
    const style = document.createElement('style')
    style.id = 'iframe-picker-style'
    style.textContent = `
      #iframe-picker-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;
        background: #1677ff;
        color: #fff;
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        font-size: 14px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }
      #iframe-picker-btn:hover { background: #4096ff; }

      #iframe-picker-mask {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 2147483646;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #iframe-picker-panel {
        background: #fff;
        border-radius: 12px;
        padding: 20px 24px 24px;
        width: 640px;
        max-width: 92vw;
        max-height: 75vh;
        overflow-y: auto;
        box-shadow: 0 8px 32px rgba(0,0,0,0.22);
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      }

      #iframe-picker-panel h3 {
        margin: 0 0 16px;
        font-size: 15px;
        color: #333;
      }

      #iframe-picker-panel ul {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* 每个 iframe 的卡片 */
      .ip-card {
        border: 1px solid #e5e5e5;
        border-radius: 10px;
        padding: 12px 14px;
        background: #fafafa;
      }

      .ip-card-index {
        font-size: 11px;
        color: #999;
        margin-bottom: 6px;
      }

      /* 每一行：label + 两个按钮 */
      .ip-row {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 7px 0;
        border-bottom: 1px dashed #eee;
      }
      .ip-row:last-child { border-bottom: none; padding-bottom: 0; }
      .ip-row:first-of-type { padding-top: 0; }

      .ip-row-label {
        width: 72px;
        flex-shrink: 0;
        font-size: 11px;
        font-weight: 600;
        padding-top: 2px;
        line-height: 1.4;
      }
      .ip-row-label.original { color: #888; }
      .ip-row-label.converted { color: #1677ff; }

      .ip-row-url {
        flex: 1;
        font-size: 11px;
        color: #444;
        word-break: break-all;
        line-height: 1.6;
        cursor: pointer;
        padding-top: 2px;
      }
      .ip-row-url:hover { color: #1677ff; text-decoration: underline; }

      .ip-copy-btn {
        flex-shrink: 0;
        border: none;
        border-radius: 6px;
        padding: 3px 12px;
        font-size: 12px;
        cursor: pointer;
        white-space: nowrap;
        height: 26px;
        line-height: 20px;
        transition: background 0.15s;
      }
      .ip-copy-btn.original {
        background: #f0f0f0;
        color: #555;
      }
      .ip-copy-btn.original:hover { background: #ddd; }
      .ip-copy-btn.converted {
        background: #1677ff;
        color: #fff;
      }
      .ip-copy-btn.converted:hover { background: #4096ff; }
      .ip-copy-btn.copied {
        background: #52c41a !important;
        color: #fff !important;
      }

      #iframe-picker-panel .close-btn {
        margin-top: 18px;
        width: 100%;
        background: #f5f5f5;
        border: none;
        border-radius: 8px;
        padding: 9px;
        font-size: 13px;
        cursor: pointer;
        color: #666;
      }
      #iframe-picker-panel .close-btn:hover { background: #e5e5e5; }

      .iframe-picker-toast {
        position: fixed;
        bottom: 80px;
        right: 24px;
        z-index: 2147483647;
        background: #52c41a;
        color: #fff;
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 13px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        pointer-events: none;
        transition: opacity 0.3s;
      }
    `
    document.head.appendChild(style)
  }

  // ── 复制 ──────────────────────────────────────────────
  function copyText(text, btn) {
    const done = () => {
      if (btn) {
        const orig = btn.textContent
        btn.textContent = '✅ 已复制'
        btn.classList.add('copied')
        setTimeout(() => {
          btn.textContent = orig
          btn.classList.remove('copied')
        }, 2000)
      }
      showToast('已复制 ✅')
    }

    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text); done(); return
    }
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }

  function fallbackCopy(text, cb) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    try { document.execCommand('copy') } catch (e) {}
    document.body.removeChild(ta)
    if (cb) cb()
  }

  function showToast(msg) {
    const t = document.createElement('div')
    t.className = 'iframe-picker-toast'
    t.textContent = msg
    t.style.opacity = '1'
    document.body.appendChild(t)
    setTimeout(() => { t.style.opacity = '0' }, 1600)
    setTimeout(() => t.remove(), 2000)
  }

  // ── 获取 iframe src ───────────────────────────────────
  function getIframeSrcs() {
    return Array.from(document.querySelectorAll('iframe'))
      .map(f => f.src)
      .filter(src => src && src !== 'about:blank' && src.trim() !== '')
  }

  // ── 面板 ──────────────────────────────────────────────
  function showPanel(urls) {
    document.getElementById('iframe-picker-mask')?.remove()

    const mask = document.createElement('div')
    mask.id = 'iframe-picker-mask'

    const panel = document.createElement('div')
    panel.id = 'iframe-picker-panel'

    const title = document.createElement('h3')
    title.textContent = `🔍 找到 ${urls.length} 个 iframe`
    panel.appendChild(title)

    const ul = document.createElement('ul')

    urls.forEach((url, i) => {
      const converted = convertUrl(url)

      const card = document.createElement('div')
      card.className = 'ip-card'

      const idx = document.createElement('div')
      idx.className = 'ip-card-index'
      idx.textContent = `iframe [${i + 1}]`
      card.appendChild(idx)

      // 行1：原始 URL
      card.appendChild(makeRow('原始链接', 'original', url))

      // 行2：转换后 URL
      if (converted) {
        card.appendChild(makeRow('转换链接', 'converted', converted))
      }

      const li = document.createElement('li')
      li.appendChild(card)
      ul.appendChild(li)
    })

    panel.appendChild(ul)

    const closeBtn = document.createElement('button')
    closeBtn.className = 'close-btn'
    closeBtn.textContent = '关闭'
    closeBtn.addEventListener('click', () => mask.remove())
    panel.appendChild(closeBtn)

    mask.addEventListener('click', (e) => { if (e.target === mask) mask.remove() })
    mask.appendChild(panel)
    document.body.appendChild(mask)
  }

  function makeRow(labelText, type, url) {
    const row = document.createElement('div')
    row.className = 'ip-row'

    const label = document.createElement('span')
    label.className = `ip-row-label ${type}`
    label.textContent = labelText

    const urlSpan = document.createElement('span')
    urlSpan.className = 'ip-row-url'
    urlSpan.textContent = url
    urlSpan.title = '点击复制'

    const btn = document.createElement('button')
    btn.className = `ip-copy-btn ${type}`
    btn.textContent = 'Copy'

    const doCopy = () => copyText(url, btn)
    btn.addEventListener('click', (e) => { e.stopPropagation(); doCopy() })
    urlSpan.addEventListener('click', doCopy)

    row.appendChild(label)
    row.appendChild(urlSpan)
    row.appendChild(btn)
    return row
  }

  // ── 挂载按钮 ──────────────────────────────────────────
  function mountBtn() {
    if (document.getElementById('iframe-picker-btn')) return

    const btn = document.createElement('button')
    btn.id = 'iframe-picker-btn'
    btn.textContent = '📋 提取 iframe'

    btn.addEventListener('click', () => {
      const urls = getIframeSrcs()

      if (urls.length === 0) {
        showToast('❌ 页面没有找到 iframe')
        return
      }

      if (urls.length === 1) {
        // 只有一个，直接展示面板（因为有两种选项）
        showPanel(urls)
        return
      }

      showPanel(urls)
    })

    document.body.appendChild(btn)
    console.log('[iframe-picker] 按钮已挂载 ✅')
  }

  init()
})()
