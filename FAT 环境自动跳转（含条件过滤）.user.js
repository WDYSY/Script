// ==UserScript==
// @name         FAT 环境自动跳转（含条件过滤）
// @namespace    http://tampermonkey.net/
// @version      8.1.0
// @description  自动/手动跳转到指定 fat 环境，支持 URL 关键词条件过滤
// @author       You
// @include      *://*ctripcorp*/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
  'use strict';

  const KEY_TARGET_FAT = 'targetFat';
  const KEY_CONDITIONS = 'conditions';
  const KEY_AUTO_JUMP  = 'autoJump';
  const KEY_COLLAPSED  = 'collapsed';
  const LOCK_KEY       = 'fat_jump_lock';

  // ===================== 启动清理脏数据 =====================
  (function fixStoredValue() {
    const raw     = GM_getValue(KEY_TARGET_FAT, '');
    const cleaned = String(raw).replace(/^fat/i, '').trim();
    if (cleaned !== raw) GM_setValue(KEY_TARGET_FAT, cleaned);
  })();

  // ===================== 工具函数 =====================

  function getFatNumFromHostname(url) {
    try {
      const m = new URL(url).hostname.match(/\bfat(\d{1,5})\b/i);
      return m ? m[1] : null;
    } catch { return null; }
  }

  function replaceFatInHostname(url, targetNum) {
    try {
      const u        = new URL(url);
      const original = u.hostname;
      const replaced = original.replace(/\bfat\d{1,5}\b/i, `fat${targetNum}`);
      if (replaced === original) return url;
      u.hostname = replaced;
      return u.toString();
    } catch { return url; }
  }

  function parseToNum(raw) {
    return String(raw).trim().replace(/^fat/i, '');
  }

  function matchesConditions(url, conditions) {
    if (!conditions || conditions.length === 0) return true;
    return conditions.some(kw => kw && url.toLowerCase().includes(kw.toLowerCase()));
  }

  function getConditions() {
    try { return JSON.parse(GM_getValue(KEY_CONDITIONS, '[]')); }
    catch { return []; }
  }

  function saveConditions(arr) {
    GM_setValue(KEY_CONDITIONS, JSON.stringify(arr));
  }

  // ===================== 自动跳转 =====================

  function tryAutoJump() {
    const autoJump  = GM_getValue(KEY_AUTO_JUMP, true);
    const targetNum = parseToNum(GM_getValue(KEY_TARGET_FAT, ''));
    if (!autoJump || !targetNum || !/^\d+$/.test(targetNum)) return;

    if (sessionStorage.getItem(LOCK_KEY) === '1') {
      sessionStorage.removeItem(LOCK_KEY);
      return;
    }

    const currentNum = getFatNumFromHostname(location.href);
    if (!currentNum || currentNum === targetNum) return;
    if (!matchesConditions(location.href, getConditions())) return;

    const newUrl = replaceFatInHostname(location.href, targetNum);
    if (newUrl === location.href) return;

    sessionStorage.setItem(LOCK_KEY, '1');
    location.replace(newUrl);
  }

  tryAutoJump();

  // ===================== UI =====================

  function buildUI() {
    const savedNum   = parseToNum(GM_getValue(KEY_TARGET_FAT, ''));
    const currentNum = getFatNumFromHostname(location.href);
    let collapsed    = GM_getValue(KEY_COLLAPSED, false);

    let posRight  = 24;
    let posBottom = 24;

    // =========== 浮球 ===========
    const ball = document.createElement('div');
    ball.id = 'fat-ball';
    Object.assign(ball.style, {
      position:       'fixed',
      right:          `${posRight}px`,
      bottom:         `${posBottom}px`,
      zIndex:         '2147483647',
      width:          '48px',
      height:         '48px',
      borderRadius:   '50%',
      background:     'linear-gradient(135deg,#89b4fa,#cba6f7)',
      boxShadow:      '0 4px 16px rgba(0,0,0,.45)',
      cursor:         'pointer',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      flexDirection:  'column',
      userSelect:     'none',
      transition:     'transform .15s',
    });

    const ballNum = document.createElement('div');
    Object.assign(ballNum.style, {
      color:      '#1e1e2e',
      fontFamily: 'monospace',
      fontWeight: 'bold',
      fontSize:   savedNum ? (savedNum.length > 3 ? '11px' : '14px') : '12px',
      lineHeight: '1',
    });
    ballNum.textContent = savedNum || '?';

    const ballLabel = document.createElement('div');
    Object.assign(ballLabel.style, {
      color:      '#1e1e2e',
      fontFamily: 'monospace',
      fontSize:   '9px',
      lineHeight: '1',
      marginTop:  '2px',
      opacity:    '0.75',
    });
    ballLabel.textContent = 'FAT';

    ball.appendChild(ballNum);
    ball.appendChild(ballLabel);

    // =========== 面板 ===========
    const panel = document.createElement('div');
    panel.id = 'fat-panel';
    Object.assign(panel.style, {
      position:     'fixed',
      right:        `${posRight}px`,
      bottom:       `${posBottom}px`,
      zIndex:       '2147483647',
      background:   '#1e1e2e',
      color:        '#cdd6f4',
      borderRadius: '14px',
      padding:      '14px 16px',
      boxShadow:    '0 6px 28px rgba(0,0,0,.5)',
      fontFamily:   'monospace',
      fontSize:     '13px',
      minWidth:     '270px',
      maxWidth:     '360px',
      userSelect:   'none',
      boxSizing:    'border-box',
    });

    // 标题栏
    const header = document.createElement('div');
    Object.assign(header.style, {
      display:        'flex',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom:   '10px',
      cursor:         'move',
    });

    const title = el('span', '🚀 FAT 切换', {
      fontWeight: 'bold', color: '#89b4fa', fontSize: '14px',
    });
    const headerRight = el('div', '', { display: 'flex', gap: '8px', alignItems: 'center' });

    const autoLabel  = el('span', '自动', { fontSize: '11px', color: '#a6adc8' });
    const autoToggle = document.createElement('input');
    autoToggle.type    = 'checkbox';
    autoToggle.checked = GM_getValue(KEY_AUTO_JUMP, true);
    autoToggle.style.cursor = 'pointer';
    autoToggle.addEventListener('change', () => GM_setValue(KEY_AUTO_JUMP, autoToggle.checked));

    const collapseBtn = el('span', '−', {
      cursor: 'pointer', fontSize: '17px', color: '#a6e3a1', lineHeight: '1',
    });
    collapseBtn.title = '收起';

    headerRight.appendChild(autoLabel);
    headerRight.appendChild(autoToggle);
    headerRight.appendChild(collapseBtn);
    header.appendChild(title);
    header.appendChild(headerRight);
    panel.appendChild(header);

    // Body
    const body = document.createElement('div');
    panel.appendChild(body);

    body.appendChild(el('div',
      `当前环境：${currentNum ? 'fat' + currentNum : '未识别'}`,
      { color: '#f38ba8', fontSize: '12px', marginBottom: '10px' }
    ));

    // 目标行
    const targetRow = el('div', '', {
      display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px',
    });
    targetRow.appendChild(el('span', '目标：', {
      fontSize: '12px', color: '#a6adc8', whiteSpace: 'nowrap',
    }));

    const targetInput = document.createElement('input');
    targetInput.type        = 'text';
    targetInput.placeholder = 'fat28 或 28';
    targetInput.value       = savedNum ? `fat${savedNum}` : '';
    styleInput(targetInput);
    targetRow.appendChild(targetInput);

    const jumpBtn = styledBtn('跳转', '#a6e3a1');
    const saveBtn = styledBtn('保存', '#89b4fa');
    targetRow.appendChild(jumpBtn);
    targetRow.appendChild(saveBtn);
    body.appendChild(targetRow);

    // 预览
    const preview = el('div', '', {
      fontSize: '11px', color: '#a6e3a1', wordBreak: 'break-all',
      lineHeight: '1.5', minHeight: '14px', marginBottom: '10px',
    });
    body.appendChild(preview);

    function updatePreview() {
      const num = parseToNum(targetInput.value);
      if (!num) { preview.textContent = ''; return; }
      if (!/^\d{1,5}$/.test(num)) { preview.textContent = '⚠️ 格式错误'; return; }

      // ✅ 已是目标环境时，预览也给出提示
      const curNum = getFatNumFromHostname(location.href);
      if (curNum === num) {
        preview.textContent = '✅ 当前已是该环境';
        preview.style.color = '#a6e3a1';
        return;
      }

      const newUrl = replaceFatInHostname(location.href, num);
      if (newUrl === location.href) {
        preview.textContent = '⚠️ hostname 中未找到 fatXX';
        preview.style.color = '#f38ba8';
      } else {
        preview.textContent = `→ ${newUrl}`;
        preview.style.color = '#a6e3a1';
      }
    }

    targetInput.addEventListener('input', updatePreview);
    updatePreview();

    function syncBallNum(num) {
      ballNum.textContent    = num || '?';
      ballNum.style.fontSize = num && num.length > 3 ? '11px' : '14px';
    }

    // ✅ 修复后的 doJump
    function doJump() {
      const num = parseToNum(targetInput.value);
      if (!/^\d{1,5}$/.test(num)) {
        alert('请输入正确格式，如 fat28 或 28');
        return;
      }

      GM_setValue(KEY_TARGET_FAT, num);
      syncBallNum(num);

      // 先判断是否已在目标环境
      const curNum = getFatNumFromHostname(location.href);
      if (curNum === num) {
        alert(`✅ 当前已是 fat${num} 环境，无需跳转`);
        return;
      }

      const newUrl = replaceFatInHostname(location.href, num);
      if (newUrl === location.href) {
        alert('⚠️ hostname 中未找到 fatXX，无法跳转');
        return;
      }

      location.href = newUrl;
    }

    jumpBtn.addEventListener('click', doJump);
    targetInput.addEventListener('keydown', e => e.key === 'Enter' && doJump());

    saveBtn.addEventListener('click', () => {
      const num = parseToNum(targetInput.value);
      if (!/^\d{1,5}$/.test(num)) { alert('请输入正确格式'); return; }
      GM_setValue(KEY_TARGET_FAT, num);
      syncBallNum(num);
      saveBtn.textContent = '✅';
      setTimeout(() => saveBtn.textContent = '保存', 1200);
    });

    // 条件列表
    body.appendChild(el('div', '📋 URL 关键词条件（OR）', {
      fontSize: '12px', color: '#cba6f7', marginBottom: '4px', fontWeight: 'bold',
    }));
    body.appendChild(el('div', '满足任意一条才触发自动跳转（为空则全部触发）', {
      fontSize: '11px', color: '#6c7086', marginBottom: '8px', lineHeight: '1.4',
    }));

    const condList = el('div', '', {
      display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '8px',
    });
    body.appendChild(condList);

    function renderConditions() {
      condList.innerHTML = '';
      getConditions().forEach((kw, idx) => {
        const row = el('div', '', { display: 'flex', gap: '4px', alignItems: 'center' });
        const inp = document.createElement('input');
        inp.type  = 'text';
        inp.value = kw;
        styleInput(inp, { flex: '1', fontSize: '12px', padding: '3px 6px' });
        inp.addEventListener('change', () => {
          const arr = getConditions();
          arr[idx]  = inp.value.trim();
          saveConditions(arr);
        });
        const delBtn = styledBtn('✕', '#f38ba8', { padding: '2px 6px', fontSize: '12px' });
        delBtn.addEventListener('click', () => {
          const arr = getConditions();
          arr.splice(idx, 1);
          saveConditions(arr);
          renderConditions();
        });
        row.appendChild(inp);
        row.appendChild(delBtn);
        condList.appendChild(row);
      });
    }
    renderConditions();

    const addCondBtn = styledBtn('＋ 添加条件', '#fab387', {
      width: '100%', marginBottom: '4px', fontSize: '12px', padding: '4px',
    });
    addCondBtn.addEventListener('click', () => {
      const arr = getConditions();
      arr.push('');
      saveConditions(arr);
      renderConditions();
      const inputs = condList.querySelectorAll('input');
      if (inputs.length) inputs[inputs.length - 1].focus();
    });
    body.appendChild(addCondBtn);

    // =========== 折叠逻辑 ===========

    function applyCollapse() {
      if (collapsed) {
        panel.style.display = 'none';
        ball.style.display  = 'flex';
      } else {
        ball.style.display  = 'none';
        panel.style.display = 'block';
      }
      GM_setValue(KEY_COLLAPSED, collapsed);
    }

    ball.addEventListener('click', () => {
      if (isDragging) return;
      collapsed = false;
      applyCollapse();
    });

    collapseBtn.addEventListener('click', () => {
      collapsed = true;
      applyCollapse();
    });

    applyCollapse();

    // =========== 拖拽 ===========

    let isDragging = false;

    function makeDraggable(handle, getTarget) {
      let startX, startY, startRight, startBottom;
      let dragging = false;

      handle.addEventListener('mousedown', e => {
        if ([collapseBtn, autoToggle, autoLabel].includes(e.target)) return;

        const target = getTarget();
        const rect   = target.getBoundingClientRect();
        startX       = e.clientX;
        startY       = e.clientY;
        startRight   = window.innerWidth  - rect.right;
        startBottom  = window.innerHeight - rect.bottom;
        dragging     = false;

        const onMove = e => {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          if (!dragging && Math.abs(dx) + Math.abs(dy) > 3) dragging = true;
          if (!dragging) return;

          posRight  = Math.max(0, startRight  - dx);
          posBottom = Math.max(0, startBottom - dy);

          ball.style.right   = `${posRight}px`;
          ball.style.bottom  = `${posBottom}px`;
          panel.style.right  = `${posRight}px`;
          panel.style.bottom = `${posBottom}px`;
        };

        const onUp = () => {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          setTimeout(() => { isDragging = dragging; dragging = false; }, 0);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        e.preventDefault();
      });
    }

    makeDraggable(ball,   () => ball);
    makeDraggable(header, () => panel);

    return { ball, panel };
  }

  // ===================== 工具 =====================

  function el(tag, text, styles = {}) {
    const e = document.createElement(tag);
    if (text) e.textContent = text;
    Object.assign(e.style, styles);
    return e;
  }

  function styleInput(inp, extra = {}) {
    Object.assign(inp.style, {
      flex: '1', padding: '4px 8px', borderRadius: '6px',
      border: '1px solid #45475a', background: '#313244',
      color: '#cdd6f4', fontSize: '13px', outline: 'none',
      boxSizing: 'border-box', ...extra,
    });
  }

  function styledBtn(text, bg = '#89b4fa', extra = {}) {
    const b = document.createElement('button');
    b.textContent = text;
    Object.assign(b.style, {
      padding: '4px 10px', borderRadius: '6px', border: 'none',
      background: bg, color: '#1e1e2e', fontWeight: 'bold',
      cursor: 'pointer', fontSize: '13px', whiteSpace: 'nowrap', ...extra,
    });
    return b;
  }

  // ===================== 挂载 =====================

  function mount() {
    if (document.getElementById('fat-ball')) return;
    const { ball, panel } = buildUI();
    document.body.appendChild(ball);
    document.body.appendChild(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

})();
