/* ============================================================
   i18n.js — bilingual runtime (TH ⇄ EN) for Fillbook.
   ------------------------------------------------------------
   Strategy: the app's source stays Thai. At render time we
   translate visible DOM text (and a few attributes) to English
   when the chosen language is 'en'. Stored data is never
   changed — only what the user SEES. Switching back to Thai
   restores the original text from a per-node cache.

   Loads BEFORE the React layers. Dictionary lives in
   i18n-en.js  (window.OZL_I18N_EN = { "ไทย": "English", ... }).
   ============================================================ */
(function () {
  'use strict';

  // ---------- language detection ----------
  function detect() {
    try {
      var saved = localStorage.getItem('ozl_lang');
      if (saved === 'th' || saved === 'en') return saved;
    } catch (e) {}
    try {
      var n = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
      return n.indexOf('th') === 0 ? 'th' : 'en';
    } catch (e) {}
    return 'en';
  }

  var LANG = detect();
  window.OZL_LANG = LANG;
  window.OZL_CCY = LANG === 'th' ? 'THB' : 'USD';   // currency follows language
  try { document.documentElement.lang = LANG; } catch (e) {}

  // ---------- native-bilingual detection ----------
  // Some pages (landing, onboarding, login) already ship hand-written
  // .th / .en spans toggled by a data-lang attribute. On those we DON'T
  // run the DOM text translator — we just drive their data-lang attribute
  // so our pill / language choice stays in sync. The translator + dict are
  // only for React app + plain pages (upgrade, guide).
  var NATIVE = false;
  try { NATIVE = document.documentElement.hasAttribute('data-lang'); } catch (e) {}
  if (NATIVE) { try { document.documentElement.setAttribute('data-lang', LANG); } catch (e) {} }
  function syncNativeButtons() {
    try {
      var btns = document.querySelectorAll('[data-set-lang]');
      for (var i = 0; i < btns.length; i++)
        btns[i].classList.toggle('on', btns[i].getAttribute('data-set-lang') === LANG);
    } catch (e) {}
  }

  var THAI = /[\u0E00-\u0E7F]/;
  var EN = window.OZL_I18N_EN || {};
  // allow the dictionary to load after us
  window.__ozlRegisterDict = function (d) { if (d) { EN = d; window.OZL_I18N_EN = d; retranslateAll(); } };

  // ---------- core translate ----------
  // Translates a raw Thai string to English, preserving leading /
  // trailing whitespace so layout spacing is kept.
  function tr(s) {
    if (LANG === 'th' || s == null) return s;
    if (!THAI.test(s)) return s;            // nothing Thai to translate
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s);
    var lead = m[1], core = m[2], trail = m[3];
    if (Object.prototype.hasOwnProperty.call(EN, core)) return lead + EN[core] + trail;
    if (Object.prototype.hasOwnProperty.call(EN, s)) return EN[s];
    return s;                                // graceful fallback: keep Thai
  }
  window.t = tr;

  // ---------- DOM translation ----------
  var ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, CODE: 1, INPUT: 1 };

  function applyTextNode(node) {
    var cur = node.nodeValue;
    // If the current value isn't what WE last wrote, React (or anything else)
    // changed it — re-capture it as the new source. This is what lets live
    // text (counters like "กำลังดึง 2/5…", prices) keep updating instead of
    // being frozen to the first value we cached.
    if (node.__ozlLast === undefined || cur !== node.__ozlLast) {
      node.__ozlRaw = cur;
    }
    var raw = node.__ozlRaw;
    if (raw == null || !THAI.test(raw)) { node.__ozlLast = cur; return; }
    var out = (LANG === 'th') ? raw : tr(raw);
    if (node.nodeValue !== out) node.nodeValue = out;
    node.__ozlLast = out;
  }

  function applyEl(el) {
    if (!el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      if (!el.hasAttribute(a)) continue;
      var rawKey = '__ozlAttr_' + a, lastKey = '__ozlAttrLast_' + a;
      var cur = el.getAttribute(a);
      if (el[lastKey] === undefined || cur !== el[lastKey]) {
        el[rawKey] = cur;            // re-capture React-driven attr changes
      }
      var raw = el[rawKey];
      if (raw == null || !THAI.test(raw)) { el[lastKey] = cur; continue; }
      var out = (LANG === 'th') ? raw : tr(raw);
      if (el.getAttribute(a) !== out) el.setAttribute(a, out);
      el[lastKey] = out;
    }
  }

  function inSkip(node) {
    var el = node.nodeType === 1 ? node : node.parentNode;
    while (el) { if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('data-ozl-skip')) return true; el = el.parentNode; }
    return false;
  }
  var FILTER = { acceptNode: function (n) {
    var el = n.nodeType === 1 ? n : n.parentNode;
    if (el && el.closest && el.closest('[data-ozl-skip]')) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  } };
  function walk(root) {
    if (!root) return;
    if (inSkip(root)) return;
    if (root.nodeType === 3) { applyTextNode(root); return; }
    if (root.nodeType !== 1) return;
    if (SKIP_TAGS[root.tagName]) { applyEl(root); return; }
    applyEl(root);
    var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, FILTER, false);
    var n;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 3) applyTextNode(n);
      else applyEl(n);
    }
  }

  function retranslateAll() {
    if (document.body) walk(document.body);
  }
  window.__ozlRetranslate = retranslateAll;

  // ---------- observe dynamic React updates ----------
  var pending = [];
  var scheduled = false;
  function flush() {
    scheduled = false;
    var batch = pending; pending = [];
    for (var i = 0; i < batch.length; i++) {
      var rec = batch[i];
      if (rec.target && inSkip(rec.target)) continue;
      if (rec.type === 'characterData') {
        applyTextNode(rec.target);
      } else if (rec.type === 'attributes') {
        applyEl(rec.target);
      } else { // childList
        for (var j = 0; j < rec.addedNodes.length; j++) walk(rec.addedNodes[j]);
        applyEl(rec.target);
      }
    }
  }
  function schedule(records) {
    for (var i = 0; i < records.length; i++) pending.push(records[i]);
    if (!scheduled) { scheduled = true; (window.requestAnimationFrame || window.setTimeout)(flush, 0); }
  }

  var observer = new MutationObserver(schedule);
  function startObserver() {
    if (!document.body) return;
    walk(document.body);
    observer.observe(document.body, {
      childList: true, subtree: true,
      characterData: true,
      attributes: true, attributeFilter: ATTRS
    });
  }

  if (!NATIVE) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else {
      startObserver();
    }
  }

  // ---------- translate native dialogs ----------
  ['alert', 'confirm', 'prompt'].forEach(function (fn) {
    var orig = window[fn];
    if (typeof orig !== 'function') return;
    window[fn] = function (msg) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof msg === 'string') args[0] = tr(msg);
      return orig.apply(window, args);
    };
  });

  // ---------- language switch ----------
  function setLang(l) {
    if (l !== 'th' && l !== 'en' || l === LANG) return;
    try { localStorage.setItem('ozl_lang', l); } catch (e) {}
    LANG = l;
    window.OZL_LANG = l;
    window.OZL_CCY = l === 'th' ? 'THB' : 'USD';
    try { document.documentElement.lang = l; } catch (e) {}
    if (NATIVE) {
      // drive the page's own .th/.en span system
      try { document.documentElement.setAttribute('data-lang', l); } catch (e) {}
      syncNativeButtons();
    } else {
      retranslateAll();
    }
    updatePill();
    // nudge React-driven currency formatting to repaint
    try { if (window.Store && window.Store.__notifyLang) window.Store.__notifyLang(); } catch (e) {}
    window.dispatchEvent(new CustomEvent('ozl-langchange', { detail: { lang: l } }));
  }
  window.OZLSetLang = setLang;
  window.OZLGetLang = function () { return LANG; };

  // ---------- floating language pill ----------
  var pillTH, pillEN;
  function updatePill() {
    if (!pillTH) return;
    var on = '#fff', onbg = 'rgba(59,130,246,.95)', off = 'rgba(255,255,255,.62)';
    pillTH.style.background = LANG === 'th' ? onbg : 'transparent';
    pillTH.style.color = LANG === 'th' ? on : off;
    pillEN.style.background = LANG === 'en' ? onbg : 'transparent';
    pillEN.style.color = LANG === 'en' ? on : off;
  }
  function buildPill() {
    if (document.getElementById('ozl-lang-pill') || !document.body) return;
    // Pages can opt out of the floating pill (e.g. the app, which has a language
    // control in Account settings) via window.OZL_NO_PILL / <html data-ozl-no-pill>.
    if (window.OZL_NO_PILL || document.documentElement.hasAttribute('data-ozl-no-pill')) return;
    // If the page already ships its own visible language toggle, defer to it
    // (just keep its buttons in sync) and don't add a second control.
    if (document.querySelector('[data-set-lang], .demo-lang')) { syncNativeButtons(); return; }
    var wrap = document.createElement('div');
    wrap.id = 'ozl-lang-pill';
    wrap.setAttribute('data-ozl-skip', '1');
    wrap.style.cssText = [
      'position:fixed', 'z-index:99999', 'bottom:calc(14px + env(safe-area-inset-bottom,0px))',
      'left:14px', 'display:flex', 'gap:2px', 'padding:3px',
      'border-radius:999px', 'background:rgba(17,22,32,.78)',
      'backdrop-filter:blur(8px)', '-webkit-backdrop-filter:blur(8px)',
      'border:1px solid rgba(255,255,255,.12)', 'box-shadow:0 6px 20px rgba(0,0,0,.32)',
      'font-family:system-ui,-apple-system,sans-serif', 'user-select:none'
    ].join(';');
    function mk(code, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = [
        'border:0', 'cursor:pointer', 'font-size:12px', 'font-weight:700',
        'letter-spacing:.3px', 'padding:5px 12px', 'border-radius:999px',
        'background:transparent', 'transition:background .15s,color .15s', 'line-height:1'
      ].join(';');
      b.onclick = function () { setLang(code); };
      return b;
    }
    pillTH = mk('th', 'ไทย');
    pillEN = mk('en', 'EN');
    wrap.appendChild(pillTH);
    wrap.appendChild(pillEN);
    document.body.appendChild(wrap);
    updatePill();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildPill);
  } else {
    buildPill();
  }
})();
