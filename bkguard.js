/*! bkguard.js — BK 가족 앱 공용: 휴대폰 ◁(뒤로 가기) 확인창 + 쓰던 내용 자동 저장 · 이어서 하기
 *  - 글을 쓰거나 고른 뒤 ◁ 를 누르면: 💾 저장하고 나가기 / 🚪 그냥 나가기 / ✏️ 계속 쓰기
 *  - 쓰는 동안 이 휴대폰에 자동 저장 → 다시 열면 「✏️ 쓰던 내용 이어서 하기」
 *  - 글 쓰는 칸마다 「✕ 지우기」 (실수하면 4초 안에 「↩ 되살리기」)
 *  - 화면별 설정: window.BKGUARD_CFG = { noForm, onBack(), isDirty(), save(), exit(), msg, saveLabel }
 */
(function () {
  'use strict';
  if (window.BKGUARD) return;

  // ───────── ✕ 지우기: 글 쓰는 칸을 누르면 오른쪽 위에 「✕ 지우기」 → 한 번에 싹 / 4초 안에 「↩ 되살리기」 ─────────
  (function () {
    if (window.BKCLEAR) return; window.BKCLEAR = 1;
    var OK = /^(text|search|tel|url|email|)$/i, btn = null, cur = null, undo = null, undoT = 0;
    function okEl(el) { if (!el || el.disabled || el.readOnly) return false; if (el.tagName === 'TEXTAREA') return true; return el.tagName === 'INPUT' && OK.test(el.getAttribute('type') || '') && !el.hasAttribute('data-noclear'); }
    function mk() {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'bkclr'; btn.setAttribute('aria-label', '칸 비우기');
      var st = document.createElement('style'); st.textContent = '.bkclr{position:fixed;z-index:2147482000;display:none;padding:4px 10px;border-radius:999px;border:0;background:rgba(220,38,38,.92);color:#fff;font:800 13px/1.4 "Noto Sans KR",system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);cursor:pointer;-webkit-tap-highlight-color:transparent}.bkclr.undo{background:rgba(23,71,130,.95)}';
      document.head.appendChild(st); document.body.appendChild(btn);
      btn.addEventListener('pointerdown', function (e) { e.preventDefault(); });   // 칸에서 손을 떼도 글쓰기가 그대로
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation(); if (!cur) return;
        if (undo != null && !cur.value) { set(cur, undo); undo = null; place(); return; }
        if (!cur.value) return; undo = cur.value; set(cur, ''); clearTimeout(undoT); undoT = setTimeout(function () { undo = null; place(); }, 4000); place();
      });
    }
    function set(el, v) { el.value = v; try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { } try { el.focus(); } catch (e) { } }
    function place() {
      if (!btn) return; var el = cur;
      if (!el || !document.contains(el) || (!el.value && undo == null)) { btn.style.display = 'none'; return; }
      var r = el.getBoundingClientRect(); if (r.width < 60 || r.bottom < 0 || r.top > innerHeight) { btn.style.display = 'none'; return; }
      var u = !el.value && undo != null; btn.textContent = u ? '↩ 되살리기' : '✕ 지우기'; btn.classList.toggle('undo', u); btn.style.display = 'block';
      var bw = btn.offsetWidth || 70, bh = btn.offsetHeight || 24, tall = el.tagName === 'TEXTAREA' || r.height > 60;
      btn.style.left = Math.max(4, r.right - bw - 6) + 'px'; btn.style.top = (tall ? r.top + 6 : r.top + (r.height - bh) / 2) + 'px';
    }
    document.addEventListener('focusin', function (e) { if (okEl(e.target)) { if (!btn) mk(); if (cur !== e.target) undo = null; cur = e.target; place(); } });
    document.addEventListener('focusout', function (e) { if (e.target === cur) setTimeout(function () { if (document.activeElement !== cur) { cur = null; undo = null; place(); } }, 150); });
    document.addEventListener('input', function (e) { if (e.target === cur) { if (cur.value) undo = null; place(); } }, true);
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
    if (window.visualViewport) { visualViewport.addEventListener('resize', place); visualViewport.addEventListener('scroll', place); }
  })();
  var parts = location.pathname.split('/').filter(Boolean), repo = parts[0] || '', file = (parts[1] || 'index.html').replace(/\.html?$/i, '') || 'index';
  /* 따로 처리하는 화면: 첫 메뉴 · 라이선스 화면 · 가계부(자체 뒤로 가기 + 바로 저장) · BK프롬(관리자 전용) */
  var OFF = { 'bk-card/index': 1, 'bk-card/license': 1, 'bk-card/activate': 1, 'bk-card/garyebu': 1, 'bk-prom/index': 1 };
  if (OFF[repo + '/' + file]) return;
  /* 비밀 도장이 있는 BK라이선스는 입력 내용을 저장하지 않음 (확인창만) */
  var NOFORM = repo === 'bk-license';
  var KEY = 'bkdraft:' + repo + '/' + file, dirty = false, armed = false, leaving = false, asking = false, timer = 0;
  /* 화면별 기본값: BK쇼츠 편집기는 스스로 프로젝트를 저장함 */
  var DEF = { 'bk-shorts/edit': { noForm: true, save: function () { try { window.dispatchEvent(new Event('beforeunload')); } catch (e) { } }, msg: '편집하던 영상을 저장하고 나갈까요? 다음에 열면 이어서 할 수 있어요.', exitLabel: '🚪 나가기' } };
  function C() { var d = DEF[repo + '/' + file] || {}, c = window.BKGUARD_CFG || {}, o = {}, k; for (k in d) o[k] = d[k]; for (k in c) o[k] = c[k]; return o; }
  function noForm() { return NOFORM || !!C().noForm; }
  function isDirty() { var c = C(); return c.isDirty ? !!c.isDirty() : dirty; }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; } }

  // ───────── 입력칸 모으기 · 저장 · 되살리기 ─────────
  var SKIP = /^(file|password|hidden|submit|button|reset|image)$/i;
  function fields() {
    return Array.prototype.filter.call(document.querySelectorAll('input,textarea,select'), function (el) {
      if (SKIP.test(el.type || '') || el.closest('[data-nosave],#bkLicGate,.bkg-box') || /^bkLic/.test(el.id || '')) return false;
      return !!(el.id || el.name);
    });
  }
  function keyOf(el) { var t = (el.type || '').toLowerCase(); if (t === 'radio' || t === 'checkbox') return (el.id ? '#' + el.id : '@' + el.name + '=' + el.value); return el.id ? '#' + el.id : '@' + el.name; }
  function collect() { var v = {}, n = 0; fields().forEach(function (el) { var t = (el.type || '').toLowerCase(); if (t === 'radio' || t === 'checkbox') v[keyOf(el)] = el.checked ? 1 : 0; else { v[keyOf(el)] = el.value; if (el.value) n++; } }); return { v: v, n: n }; }
  function saveDraft() { if (noForm()) return; var c = collect(); if (!c.n && !dirty) return; ls(KEY, JSON.stringify({ t: Date.now(), v: c.v })); }
  function clearDraft() { ls(KEY, null); }
  function restore(d) {
    var els = fields(), map = {}; els.forEach(function (el) { map[keyOf(el)] = el; });
    Object.keys(d.v).forEach(function (k) {
      var el = map[k]; if (!el) return; var t = (el.type || '').toLowerCase(), val = d.v[k];
      if (t === 'radio' || t === 'checkbox') { if (!!val === el.checked) return; el.checked = !!val; if (t === 'radio' && !val) return; }
      else { if (el.value === val) return; el.value = val; }
      try { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
    });
  }
  function offerRestore() {
    if (noForm()) return; var d = null; try { d = JSON.parse(ls(KEY) || 'null'); } catch (e) { }
    if (!d || !d.v) return;
    if (Date.now() - d.t > 1000 * 60 * 60 * 24 * 30) { clearDraft(); return; }
    var dt = new Date(d.t), when = (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일 ' + dt.getHours() + ':' + String(dt.getMinutes()).padStart(2, '0');
    var bar = document.createElement('div'); bar.className = 'bkg-bar';
    bar.innerHTML = '<b>✏️ 지난번에 쓰던 내용이 있어요</b><small>' + when + ' 자동 저장</small><div><button type="button" data-a="go">이어서 하기</button><button type="button" data-a="no">새로 쓰기</button></div>';
    var host = document.querySelector('main') || document.body, first = host.querySelector('.bkqr-row');
    if (first && first.parentNode === host) host.insertBefore(bar, first.nextSibling); else host.insertBefore(bar, host.firstChild);
    bar.addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'go') { restore(d); toast('✏️ 쓰던 내용을 불러왔어요'); } else clearDraft(); bar.remove(); });
  }

  // ───────── 뒤로 가기 지키기 ─────────
  function arm() { if (armed || leaving || asking) return; try { history.pushState({ bkg: 1 }, '', location.href); armed = true; } catch (e) { } }
  function leave() { leaving = true; try { history.back(); } catch (e) { } setTimeout(function () { leaving = false; }, 1500); }
  window.addEventListener('popstate', function (e) {
    if (leaving || !armed) return;
    if (e.state && (e.state.bkg || e.state.gb)) return;
    armed = false;
    var c = C(); if (c.onBack && c.onBack()) { arm(); return; }
    if (isDirty()) ask(); else leave();
  });
  function markDirty(e) { if (!e.isTrusted || (e.target && e.target.closest && e.target.closest('.bkg-box,.bkg-bar,#bkLicGate'))) return; dirty = true; if (!asking) arm(); clearTimeout(timer); timer = setTimeout(saveDraft, 700); }
  document.addEventListener('input', markDirty, true);
  document.addEventListener('change', markDirty, true);
  document.addEventListener('visibilitychange', function () { if (document.hidden && dirty) saveDraft(); });
  window.addEventListener('pagehide', function () { if (dirty) saveDraft(); });

  // ───────── 확인창 ─────────
  var css = '.bkg-wrap{position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:flex-end;justify-content:center;font-family:"Noto Sans KR",system-ui,sans-serif}' +
    '.bkg-box{width:100%;max-width:520px;background:#fff;border-radius:22px 22px 0 0;padding:22px 18px 26px;box-shadow:0 -6px 30px rgba(0,0,0,.25);animation:bkgUp .2s ease}@keyframes bkgUp{from{transform:translateY(40px);opacity:.4}}' +
    '.bkg-box h3{margin:0 0 6px;font-size:1.2rem;color:#172554}.bkg-box p{margin:0 0 14px;color:#475569;font-size:.95rem;line-height:1.55}' +
    '.bkg-box button{display:block;width:100%;margin:8px 0 0;padding:15px 10px;border-radius:14px;border:0;font:800 1.05rem "Noto Sans KR",sans-serif;cursor:pointer}' +
    '.bkg-save{background:#174782;color:#fff}.bkg-exit{background:#fff;color:#b91c1c;border:2px solid #fecaca!important}.bkg-stay{background:#f1f5f9;color:#334155}' +
    '.bkg-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px;margin:0 0 12px;padding:12px 14px;border-radius:14px;background:#fff8e6;border:2px solid #f2c14e;color:#7a4a00;font-family:"Noto Sans KR",sans-serif}.bkg-bar b{font-size:.98rem}.bkg-bar small{color:#a16207}.bkg-bar div{display:flex;gap:8px;width:100%}' +
    '.bkg-bar button{flex:1;padding:10px;border-radius:10px;border:0;font:800 .95rem "Noto Sans KR",sans-serif;background:#174782;color:#fff}.bkg-bar button+button{background:#fff;color:#475569;border:1.5px solid #e2e8f0}' +
    '.bkg-toast{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:2147483001;background:rgba(15,23,42,.92);color:#fff;padding:11px 18px;border-radius:999px;font:700 .92rem "Noto Sans KR",sans-serif}';
  function style() { if (document.getElementById('bkgCss')) return; var s = document.createElement('style'); s.id = 'bkgCss'; s.textContent = css; document.head.appendChild(s); }
  function toast(m) { style(); var t = document.createElement('div'); t.className = 'bkg-toast'; t.textContent = m; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2200); }
  /** o: { title, msg, saveLabel, onSave(), onExit(), onStay(), noSave } */
  function ask(o) {
    o = o || {}; var c = C(); style(); if (asking) return; asking = true; try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { }
    var canSave = !o.noSave && !(noForm() && !c.save && !o.onSave);
    var w = document.createElement('div'); w.className = 'bkg-wrap';
    w.innerHTML = '<div class="bkg-box" role="dialog" aria-modal="true"><h3>' + (o.title || '⚠️ 이대로 나가면 지워져요') + '</h3><p>' + (o.msg || c.msg || (canSave ? '쓰던 내용을 저장하고 나갈까요? 저장하면 다음에 열 때 「이어서 하기」로 다시 불러올 수 있어요.' : '지금 만들던 것이 지워져요. 그래도 나갈까요?')) + '</p>' +
      (canSave ? '<button type="button" class="bkg-save" data-a="save">' + (o.saveLabel || c.saveLabel || '💾 저장하고 나가기') + '</button>' : '') +
      '<button type="button" class="bkg-exit" data-a="exit">' + (o.exitLabel || c.exitLabel || ('🚪 그냥 나가기' + (canSave ? ' (저장 안 함)' : ''))) + '</button><button type="button" class="bkg-stay" data-a="stay">✏️ 계속 쓰기</button></div>';
    document.body.appendChild(w);
    function close() { w.remove(); asking = false; }
    w.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) { if (e.target === w) { close(); arm(); if (o.onStay) o.onStay(); } return; }
      var a = b.dataset.a; close();
      if (a === 'stay') { arm(); if (o.onStay) o.onStay(); return; }
      if (a === 'save') { Promise.resolve(o.onSave ? o.onSave() : (c.save ? c.save() : saveDraft())).then(function (r) { dirty = false; if (r !== 'stay' && !o.onSave) leave(); else if (r === 'stay') arm(); if (!o.onSave) toast('💾 저장했어요'); }).catch(function () { arm(); toast('저장하지 못했어요'); }); return; }
      if (a === 'exit') { dirty = false; if (o.onExit) { o.onExit(); return; } if (c.exit) c.exit(); clearDraft(); leave(); }
    });
  }

  window.BKGUARD = { arm: arm, ask: ask, saveDraft: saveDraft, clearDraft: clearDraft, setDirty: function (v) { dirty = !!v; if (v) arm(); }, get dirty() { return isDirty(); } };
  function start() { setTimeout(offerRestore, 700); var c = C(); if (c.autoArm && c.autoArm()) arm(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  // ───────── BK톡톡 인사 카드: AI가 만든 그림에 글씨 올리기 ─────────
  var ADMIN = ls('bkAdmin') === '1';
  if (repo === 'bk-card' && /^(card|event|faith)$/.test(file)) {
    var add = function () {
      if (document.getElementById('bkgImport')) return;
      var main = document.querySelector('main'); if (!main) return;
      var sec = document.createElement('section'); sec.id = 'bkgImport'; sec.setAttribute('data-nosave', '');
      sec.style.cssText = 'margin:18px 0;padding:16px;border-radius:18px;background:#fff;border:2px dashed #f2c14e;font-family:"Noto Sans KR",sans-serif';
      sec.innerHTML = '<h2 style="margin:0 0 6px;font-size:1.15rem;color:#174782">✏️ 완성 그림에 글씨 올리기 · 고치기</h2>' +
        '<p style="margin:0 0 10px;color:#475569;font-size:.92rem;line-height:1.55">AI가 만들어 준 카드 그림을 고르면, 그 위에 <b>글씨 · 스티커 · 원형 사진 + 명함</b>을 손가락으로 옮기며 넣고 ✎로 고칠 수 있어요. 움직이는 효과 · 음악을 넣어 영상으로도 보낼 수 있어요.</p>' +
        '<label style="display:block;text-align:center;padding:15px;border-radius:14px;background:#174782;color:#fff;font-weight:800;cursor:pointer">🖼️ AI가 만든 그림 고르기<input type="file" accept="image/*" hidden></label>';
      var guide = Array.prototype.find.call(main.querySelectorAll('h2'), function (h) { return /사용법/.test(h.textContent); });
      var anchor = guide ? (guide.closest('section,.card,details') || guide) : null;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(sec, anchor); else main.appendChild(sec);
      sec.querySelector('input').addEventListener('change', function (e) {
        var f = e.target.files[0]; if (!f) return; var r = new FileReader();
        r.onload = function () {
          var img = new Image(); img.onload = function () {
            var k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            var data = c.toDataURL('image/jpeg', .9), q = indexedDB.open('bk-today', 1);
            q.onupgradeneeded = function () { var d = q.result; if (!d.objectStoreNames.contains('cards')) d.createObjectStore('cards', { keyPath: 'id' }); if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv'); };
            q.onsuccess = function () { var t = q.result.transaction('kv', 'readwrite'); t.objectStore('kv').put({ img: data, from: file, at: Date.now() }, 'import'); t.oncomplete = function () { dirty = false; location.href = 'today.html?import=1'; }; };
            q.onerror = function () { toast('그림을 넘기지 못했어요'); };
          }; img.src = r.result;
        }; r.readAsDataURL(f);
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(add, 300); }); else setTimeout(add, 300);
  }
})();
