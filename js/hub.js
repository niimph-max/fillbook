/* ============================================================
   hub.js — ตัวช่วยของหน้าเว็บสาธารณะ (index.html, digest.html)
   ต้องโหลดหลัง js/digest-core.js
   ============================================================ */
(function () {
  'use strict';
  var D = window.FBDigest;

  // nav: เส้นขอบเมื่อเลื่อนหน้า
  var nav = document.getElementById('siteNav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 12); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
  }

  var ICON = {
    chev: '<svg class="dchev" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
    arrow: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    lock: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    back: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
    shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  };

  function link(row) { return 'digest.html?id=' + encodeURIComponent(row.id); }
  // ป้าย "ฉบับส่วนตัว" — ขึ้นเฉพาะเจ้าของที่ล็อกอินอยู่ (row._private มาจาก private_digests)
  function privHTML(row) { return row && row._private ? '<span class="priv">' + ICON.lock + D.PRIVATE_LABEL + '</span>' : ''; }

  // แถวรายการ Digest (กล่องวันที่ + ชื่อเรื่อง)
  function rowHTML(r, first) {
    var e = D.esc;
    var sub = D.fmtLong(r.digest_date);
    if (r.trading_day && r.trading_day !== r.digest_date) sub += ' · สรุปวันเทรด US ' + D.fmtShort(r.trading_day);
    var unread = first && D.isUnread(r);
    return '<a class="drow' + (first ? ' first' : '') + '" href="' + link(r) + '">' +
      '<div class="ddate"><span class="d">' + e(D.fmtD(r.digest_date, { day: 'numeric' })) + '</span><span class="m">' + e(D.fmtD(r.digest_date, { month: 'short' })) + '</span></div>' +
      '<div class="dbody"><div class="dtitle">' + e(r.title || 'Market Digest') + '</div><div class="dsub">' + privHTML(r) + e(sub) + '</div></div>' +
      (unread ? '<span class="new">ใหม่</span>' : '') + ICON.chev + '</a>';
  }

  function skelRows(n) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<div class="drow" style="pointer-events:none"><div class="ddate" style="animation:hbpulse 1.3s ease-in-out infinite"></div><div class="dbody"><div class="skel" style="width:80%"></div><div class="skel" style="width:45%"></div></div></div>';
    return s;
  }

  window.FBHub = { ICON: ICON, link: link, privHTML: privHTML, rowHTML: rowHTML, skelRows: skelRows };
})();
