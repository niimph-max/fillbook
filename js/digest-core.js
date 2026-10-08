/* ============================================================
   digest-core.js — แกนกลางของ Market Digest (JS ธรรมดา ไม่ใช่ JSX)
   ------------------------------------------------------------
   ใช้ร่วมกันทั้งในแอป (js/digest.jsx) และหน้าเว็บสาธารณะ
   (index.html, digest.html) → window.FBDigest
   • ดึงตาราง Supabase `daily_digests` ผ่าน REST ด้วย anon key
     (RLS = public read) → อ่านได้โดยไม่ต้องล็อกอิน
   • เฉพาะในแอป (window.FB_DIGEST_PRIVATE): ถ้าล็อกอินอยู่ ลอง `private_digests` ก่อน
     (RLS = เจ้าของเท่านั้น) วันไหนมีฉบับส่วนตัว → แสดงแทน (row._private = true)
   • แคชรายการ + เนื้อหาใน localStorage ให้เปิดอ่านออฟไลน์ได้
   • md(): Markdown → HTML (escape HTML ก่อนทุกครั้ง กัน XSS)
   ต้องโหลดหลัง js/supabase-config.js
   ============================================================ */
(function () {
  'use strict';

  // ---------------- data layer ----------------
  var LIST_KEY = 'fb_digest_list';      // { at, rows } — แคชรายการ (ไม่มี content)
  var BODY_KEY = 'fb_digest_body';      // { [id]: row } — แคชเนื้อหาที่เคยเปิด (เก็บล่าสุด 10)
  var SEEN_KEY = 'fb_digest_seen';      // digest_date ล่าสุดที่เปิดอ่านแล้ว
  var STALE_MS = 10 * 60 * 1000;
  var LIST_COLS = 'id,digest_date,title,trading_day,created_at';

  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function configured() { return !!(window.OZL_SUPABASE_URL && window.OZL_SUPABASE_ANON_KEY); }

  // ---- ฉบับส่วนตัว (private_digests) ----
  // เปิดใช้เฉพาะหน้าที่ตั้ง window.FB_DIGEST_PRIVATE = true ก่อนโหลดไฟล์นี้ (= app.html เท่านั้น)
  // หน้าเว็บสาธารณะ (index.html, digest.html) ไม่ query private_digests เลย แม้เจ้าของจะล็อกอินอยู่
  // อ่านได้เฉพาะบัญชีเจ้าของ (RLS) → ใช้ JWT ของคนที่ล็อกอินอยู่ (supabase-js เก็บไว้ใน localStorage)
  // ไม่ได้ล็อกอิน = ไม่ยิง query เลย · query ไม่ได้/ว่าง = ใช้ daily_digests ตามปกติ
  var PRIVATE_ON = window.FB_DIGEST_PRIVATE === true;
  // ⚠️ ฉบับส่วนตัวเก็บในหน่วยความจำเท่านั้น ไม่ลง localStorage (กันหลุดหลัง logout / เครื่องที่ใช้ร่วมกัน)
  var PRIV = 'p.';                                   // prefix ของ id ฉบับส่วนตัวที่ไม่มีฉบับสาธารณะวันเดียวกัน
  function userToken() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!/^sb-.*-auth-token$/.test(k)) continue;
        var v = JSON.parse(localStorage.getItem(k) || 'null');
        var ses = v && (v.currentSession || v);
        if (ses && ses.access_token && (!ses.expires_at || ses.expires_at * 1000 > Date.now() + 15000)) return ses.access_token;
      }
    } catch (e) {}
    return null;
  }

  function rest(table, query, token) {
    var url = String(window.OZL_SUPABASE_URL).replace(/\/+$/, '') + '/rest/v1/' + table + '?' + query;
    var key = window.OZL_SUPABASE_ANON_KEY;
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 12000);
    return fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + (token || key) }, signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { clearTimeout(timer); return j; }, function (e) { clearTimeout(timer); throw e; });
  }
  // query ฉบับส่วนตัว — ผิดพลาดอะไรก็ตาม = ไม่มีฉบับส่วนตัว (ไม่ทำให้หน้าพัง)
  function restPriv(query) {
    var tok = PRIVATE_ON ? userToken() : null;
    if (!tok) return Promise.resolve([]);
    return rest('private_digests', query, tok)
      .then(function (rows) { return Array.isArray(rows) ? rows : []; }, function () { return []; });
  }
  function markPriv(row, id) {
    var o = {};
    for (var k in row) o[k] = row[k];
    o._private = true;
    o._pid = row.id;
    o.id = id != null ? id : PRIV + row.id;
    return o;
  }
  // รวมรายการ: วันไหนมีฉบับส่วนตัว → ใช้ฉบับส่วนตัวแทน (คง id ของฉบับสาธารณะไว้ ลิงก์เดิมยังใช้ได้)
  function mergeRows(pub, priv) {
    if (!priv.length) return pub;
    var byDate = {};
    priv.forEach(function (r) { if (!byDate[r.digest_date]) byDate[r.digest_date] = r; });  // priv เรียงใหม่→เก่าแล้ว
    var used = {};
    var out = pub.map(function (r) {
      var p = byDate[r.digest_date];
      if (!p || used[r.digest_date]) return r;
      used[r.digest_date] = 1;
      return markPriv(p, r.id);
    });
    priv.forEach(function (r) { if (!used[r.digest_date]) { used[r.digest_date] = 1; out.push(markPriv(r)); } });
    out.sort(function (a, b) { return String(b.digest_date).localeCompare(String(a.digest_date)) || String(b.created_at).localeCompare(String(a.created_at)); });
    return out;
  }

  var cached = lsGet(LIST_KEY, null);
  var S = {
    rows: cached ? cached.rows : null,
    at: cached ? cached.at : 0,
    loading: false,
    error: '',
  };
  var subs = [];
  function emit() { subs.slice().forEach(function (f) { try { f(); } catch (e) {} }); }
  function subscribe(f) { subs.push(f); return function () { subs = subs.filter(function (x) { return x !== f; }); }; }

  var ERR_LOAD = 'โหลดรายงานไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่';
  var LIST_Q = 'select=' + LIST_COLS + '&order=digest_date.desc,created_at.desc&limit=120';

  function loadList(force) {
    if (!configured() || S.loading) return Promise.resolve(S.rows);
    if (!force && S.rows && S.full && Date.now() - S.at < STALE_MS) return Promise.resolve(S.rows);
    S.loading = true; S.error = ''; emit();
    return Promise.all([rest('daily_digests', LIST_Q), restPriv(LIST_Q)])
      .then(function (res) {
        var pub = Array.isArray(res[0]) ? res[0] : [];
        lsSet(LIST_KEY, { at: Date.now(), rows: pub });            // แคชเฉพาะฉบับสาธารณะ
        S.rows = mergeRows(pub, res[1]);
        S.at = Date.now();
        S.full = true;                                              // โหลดจากเซิร์ฟเวอร์แล้ว (รวมฉบับส่วนตัว)
      }, function () { S.error = ERR_LOAD; })
      .then(function () { S.loading = false; emit(); return S.rows; });
  }

  var memPriv = {};                                                 // ฉบับส่วนตัวที่เปิดแล้ว (หน่วยความจำเท่านั้น)
  function cachedOne(id) { return memPriv[id] || lsGet(BODY_KEY, {})[id] || null; }
  function putOne(row) {
    if (row._private) { memPriv[row.id] = row; return; }
    var cache = lsGet(BODY_KEY, {});
    cache[row.id] = row;
    Object.keys(cache)
      .sort(function (a, b) { return String(cache[b].digest_date).localeCompare(String(cache[a].digest_date)); })
      .slice(10).forEach(function (k) { delete cache[k]; });
    lsSet(BODY_KEY, cache);
  }
  // เปิดอ่าน 1 ฉบับ: ถ้ามีฉบับส่วนตัวของวันเดียวกัน → แสดงฉบับส่วนตัวแทน
  function loadOne(id) {
    id = String(id);
    if (id.indexOf(PRIV) === 0) {
      return restPriv('select=*&id=eq.' + encodeURIComponent(id.slice(PRIV.length)) + '&limit=1').then(function (rows) {
        var row = rows[0] ? markPriv(rows[0]) : null;
        if (row) putOne(row);
        return row;
      });
    }
    return rest('daily_digests', 'select=*&id=eq.' + encodeURIComponent(id) + '&limit=1').then(function (rows) {
      var pub = rows && rows[0];
      if (!pub) return null;
      return restPriv('select=*&digest_date=eq.' + encodeURIComponent(pub.digest_date) + '&order=created_at.desc&limit=1').then(function (pr) {
        var row = pr[0] ? markPriv(pr[0], pub.id) : pub;
        putOne(pub);                                                // แคชฉบับสาธารณะเสมอ
        if (row !== pub) putOne(row);
        return row;
      });
    });
  }
  // ฉบับล่าสุดพร้อมเนื้อหา (ใช้บนหน้าแรก) — วันที่ใหม่สุด · วันเดียวกันใช้ฉบับส่วนตัว
  function loadLatest() {
    var q = 'select=*&order=digest_date.desc,created_at.desc&limit=1';
    return Promise.all([rest('daily_digests', q), restPriv(q)]).then(function (res) {
      var pub = res[0] && res[0][0], pr = res[1][0];
      if (pub) putOne(pub);
      if (pr && (!pub || pr.digest_date >= pub.digest_date)) {
        var row = markPriv(pr, pub && pub.digest_date === pr.digest_date ? pub.id : null);
        putOne(row);
        return row;
      }
      return pub || null;
    });
  }

  function getSeen() { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } }
  function markSeen(date) {
    if (!date || date <= getSeen()) return;
    try { localStorage.setItem(SEEN_KEY, date); } catch (e) {}
    emit();
  }
  function isUnread(row) { return !!(row && row.digest_date && row.digest_date > getSeen()); }

  // ---------------- วันที่ (ภาษาไทย พ.ศ.) ----------------
  function fmtD(s, opts) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return s || '—';
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    var o = { timeZone: 'UTC' };
    for (var k in opts) o[k] = opts[k];
    return d.toLocaleDateString('th-TH', o);
  }
  function fmtLong(s) { return fmtD(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function fmtMed(s) { return fmtD(s, { day: 'numeric', month: 'short', year: 'numeric' }); }
  function fmtShort(s) { return fmtD(s, { day: 'numeric', month: 'short' }); }

  // ---------------- Markdown → HTML ----------------
  // รองรับ: หัวข้อ #, ย่อหน้า, **หนา**, *เอียง*, ~~ขีดฆ่า~~, `code`, ลิงก์, bullet/ลำดับเลข (ซ้อนได้),
  // blockquote (ซ้อนได้), ตาราง GFM (+จัดชิด), ``` code block, เส้นคั่น ---
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function inline(src, opts) {
    var codes = [];
    var s = esc(src).replace(/`([^`]+)`/g, function (_, c) { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (all, text, href) {
      var h = href.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:)/i.test(h)) return text;
      return '<a href="' + esc(h) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
         .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
         .replace(/~~([^~]+?)~~/g, '<del>$1</del>')
         .replace(/ {2,}$/g, '<br>');
    if (opts && opts.signs) {
      s = s.replace(/(^|[\s(])([+\-−]\$?\d[\d,]*(?:\.\d+)?%?)(?=$|[\s),])/g, function (all, pre, num) {
        return pre + '<span class="' + (num[0] === '+' ? 'md-pos' : 'md-neg') + '">' + num + '</span>';
      });
    }
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
  }

  var RE_FENCE = /^\s*```/;
  var RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  var RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  var RE_QUOTE = /^\s{0,3}>\s?/;
  var RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var RE_TSEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  // ไม่ใช้ regex lookbehind — Safari บน iOS รุ่นเก่า parse ไม่ได้ ทั้งไฟล์จะพัง
  function splitRow(l) {
    return l.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, '\u0001').split('|')
      .map(function (c) { return c.trim().replace(/\u0001/g, '|'); });
  }
  function isBlockStart(l, next) {
    return RE_FENCE.test(l) || RE_HEAD.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_LIST.test(l) ||
      (l.indexOf('|') >= 0 && next != null && RE_TSEP.test(next));
  }

  function buildList(items, start, indent) {
    var first = items[start];
    var tag = first.ordered ? 'ol' : 'ul';
    var out = '<' + tag + (first.ordered && first.num !== 1 ? ' start="' + first.num + '"' : '') + '>';
    var i = start, open = false;
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent > indent) { var r = buildList(items, i, items[i].indent); out += r[0]; i = r[1]; continue; }
      if (open) out += '</li>';
      out += '<li>' + inline(items[i].text); open = true; i++;
    }
    if (open) out += '</li>';
    return [out + '</' + tag + '>', i];
  }

  function md(src) {
    var L = String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    var out = '', i = 0, m, buf;
    while (i < L.length) {
      var l = L[i];
      if (!l.trim()) { i++; continue; }
      if (RE_FENCE.test(l)) {
        buf = []; i++;
        while (i < L.length && !RE_FENCE.test(L[i])) buf.push(L[i++]);
        i++; out += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>'; continue;
      }
      m = RE_HEAD.exec(l);
      if (m) { var n = m[1].length; out += '<h' + n + '>' + inline(m[2]) + '</h' + n + '>'; i++; continue; }
      if (RE_HR.test(l)) { out += '<hr>'; i++; continue; }
      if (RE_QUOTE.test(l)) {
        buf = [];
        while (i < L.length && L[i].trim() && (RE_QUOTE.test(L[i]) || !isBlockStart(L[i], L[i + 1]))) buf.push(L[i++].replace(RE_QUOTE, ''));
        out += '<blockquote>' + md(buf.join('\n')) + '</blockquote>'; continue;
      }
      if (l.indexOf('|') >= 0 && i + 1 < L.length && RE_TSEP.test(L[i + 1])) {
        var head = splitRow(l);
        var align = splitRow(L[i + 1]).map(function (c) { return /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : ''; });
        // คอลัมน์ชิดขวา = ตัวเลข → ห้ามตัดบรรทัดกลางตัวเลข
        var st = function (k) { return (align[k] === 'right' ? ' class="md-num"' : '') + (align[k] ? ' style="text-align:' + align[k] + '"' : ''); };
        i += 2;
        var t = '<div class="md-table"><table><thead><tr>' + head.map(function (c, k) { return '<th' + st(k) + '>' + inline(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        while (i < L.length && L[i].trim() && L[i].indexOf('|') >= 0) {
          var cells = splitRow(L[i++]);
          t += '<tr>' + head.map(function (_, k) { return '<td' + st(k) + '>' + inline(cells[k] || '', { signs: true }) + '</td>'; }).join('') + '</tr>';
        }
        out += t + '</tbody></table></div>'; continue;
      }
      if (RE_LIST.test(l)) {
        var items = [];
        while (i < L.length) {
          var cur = L[i];
          var lm = RE_LIST.exec(cur);
          if (lm) {
            items.push({ indent: lm[1].length, ordered: /\d/.test(lm[2]), num: parseInt(lm[2], 10) || 1, text: lm[3] });
            i++;
          } else if (cur.trim() && /^\s{2,}/.test(cur) && items.length) {
            items[items.length - 1].text += ' ' + cur.trim(); i++;          // บรรทัดต่อของ bullet เดิม
          } else if (!cur.trim() && i + 1 < L.length && RE_LIST.test(L[i + 1])) {
            i++;                                                              // บรรทัดว่างระหว่าง bullet
          } else break;
        }
        var base = Math.min.apply(null, items.map(function (x) { return x.indent; }));
        items.forEach(function (x) { if (x.indent < base) x.indent = base; });
        var k = 0;
        while (k < items.length) { var r = buildList(items, k, items[k].indent); out += r[0]; k = r[1]; }
        continue;
      }
      buf = [l]; i++;
      while (i < L.length && L[i].trim() && !isBlockStart(L[i], L[i + 1])) buf.push(L[i++]);
      out += '<p>' + buf.map(function (x) { return inline(x); }).join('\n') + '</p>';
    }
    return out;
  }

  // ตัด H1 บรรทัดแรกออกถ้าซ้ำกับ title (กันหัวข้อซ้อน 2 ชั้น)
  function stripDupTitle(src, title) {
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var k = -1;
    for (var j = 0; j < lines.length; j++) if (lines[j].trim()) { k = j; break; }
    if (k >= 0) {
      var m = /^\s*#\s+(.*?)\s*#*\s*$/.exec(lines[k]);
      var norm = function (s) { return String(s || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim(); };
      if (m && norm(m[1]) === norm(title)) lines.splice(k, 1);
    }
    return lines.join('\n');
  }

  // ข้อความย่อ (ย่อหน้าแรกที่เป็นเนื้อความ) สำหรับการ์ดตัวอย่าง
  function excerpt(src, max) {
    max = max || 180;
    var lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    var para = [];
    for (var j = 0; j < lines.length; j++) {
      var l = lines[j].trim();
      if (!l) { if (para.length) break; continue; }
      if (/^(#|\||>|```|[-*_]{3,}$)/.test(l) || RE_TSEP.test(l)) { if (para.length) break; continue; }
      para.push(l.replace(/^([-*+]|\d+[.)])\s+/, ''));
    }
    var s = para.join(' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ').trim();
    return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, '') + '…' : s;
  }

  window.FBDigest = {
    state: S, subscribe: subscribe, configured: configured,
    loadList: loadList, loadOne: loadOne, loadLatest: loadLatest, cachedOne: cachedOne,
    getSeen: getSeen, markSeen: markSeen, isUnread: isUnread,
    fmtD: fmtD, fmtLong: fmtLong, fmtMed: fmtMed, fmtShort: fmtShort,
    md: md, stripDupTitle: stripDupTitle, excerpt: excerpt, esc: esc,
    DISCLAIMER: 'ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน',
    PRIVATE_LABEL: 'ฉบับส่วนตัว',
  };
})();
