/* ============================================================
   digest.jsx — Market Digest: สรุปตลาด Options อเมริกาประจำวัน
   ------------------------------------------------------------
   • ข้อมูลจากตาราง Supabase `daily_digests` (หลังบ้านส่งเข้าทุกเช้าวันทำการ)
     อ่านผ่าน REST ด้วย anon key (RLS = public read) → ไม่ต้องล็อกอินก็อ่านได้
   • route: #digest = รายการ · #digest/<id> = หน้าอ่าน
   • Markdown → HTML ด้วยตัวแปลงในไฟล์นี้ (escape HTML ก่อนทุกครั้ง กัน XSS)
   • เนื้อหารายงานห่อด้วย data-ozl-skip → ตัวแปลภาษา TH⇄EN ไม่ไปแตะ
   Exports: DigestPage, DigestCard, DigestNavBadge, useDigests
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const { Icon } = window;

  // ---------------- data layer ----------------
  const LIST_KEY = 'fb_digest_list';      // { at, rows } — แคชรายการ (ไม่มี content)
  const BODY_KEY = 'fb_digest_body';      // { [id]: row } — แคชเนื้อหาที่เคยเปิด (เก็บล่าสุด 10)
  const SEEN_KEY = 'fb_digest_seen';      // digest_date ล่าสุดที่ผู้ใช้เปิดอ่านแล้ว
  const STALE_MS = 10 * 60 * 1000;
  const LIST_COLS = 'id,digest_date,title,trading_day,created_at';

  function lsGet(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  const cfgOk = () => !!(window.OZL_SUPABASE_URL && window.OZL_SUPABASE_ANON_KEY);

  async function rest(query) {
    const url = window.OZL_SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/daily_digests?' + query;
    const key = window.OZL_SUPABASE_ANON_KEY;
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 12000);
    try {
      const r = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: ctl ? ctl.signal : undefined });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  const cachedList = lsGet(LIST_KEY, null);
  const DG = {
    rows: cachedList ? cachedList.rows : null,
    at: cachedList ? cachedList.at : 0,
    loading: false,
    error: '',
    subs: new Set(),
  };
  const emit = () => DG.subs.forEach(f => f());

  async function loadList(force) {
    if (!cfgOk() || DG.loading) return;
    if (!force && DG.rows && Date.now() - DG.at < STALE_MS) return;
    DG.loading = true; DG.error = ''; emit();
    try {
      const rows = await rest('select=' + LIST_COLS + '&order=digest_date.desc,created_at.desc&limit=120');
      DG.rows = Array.isArray(rows) ? rows : [];
      DG.at = Date.now();
      lsSet(LIST_KEY, { at: DG.at, rows: DG.rows });
    } catch (e) {
      DG.error = 'โหลดรายงานไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่';
    }
    DG.loading = false; emit();
  }

  async function loadOne(id) {
    const cache = lsGet(BODY_KEY, {});
    const rows = await rest('select=*&id=eq.' + encodeURIComponent(id) + '&limit=1');
    const row = rows && rows[0];
    if (row) {
      cache[id] = row;
      const ids = Object.keys(cache).sort((a, b) => String(cache[b].digest_date).localeCompare(String(cache[a].digest_date)));
      ids.slice(10).forEach(k => delete cache[k]);
      lsSet(BODY_KEY, cache);
    }
    return row || null;
  }

  function useDigests() {
    const [, bump] = useState(0);
    useEffect(() => {
      const f = () => bump(x => x + 1);
      DG.subs.add(f);
      loadList(false);
      return () => DG.subs.delete(f);
    }, []);
    return { rows: DG.rows, loading: DG.loading, error: DG.error, reload: () => loadList(true), configured: cfgOk() };
  }

  const getSeen = () => { try { return localStorage.getItem(SEEN_KEY) || ''; } catch (e) { return ''; } };
  function markSeen(date) {
    if (!date || date <= getSeen()) return;
    try { localStorage.setItem(SEEN_KEY, date); } catch (e) {}
    emit();
  }
  const isUnread = (row) => !!(row && row.digest_date && row.digest_date > getSeen());

  // ---------------- date formatting (ตามภาษาที่เลือก) ----------------
  function fmtD(s, opts) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return s || '—';
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.toLocaleDateString(window.OZL_LANG === 'en' ? 'en-GB' : 'th-TH', Object.assign({ timeZone: 'UTC' }, opts));
  }
  const fmtLong = (s) => fmtD(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = (s) => fmtD(s, { day: 'numeric', month: 'short' });
  const fmtMed = (s) => fmtD(s, { day: 'numeric', month: 'short', year: 'numeric' });

  // ---------------- Markdown → HTML ----------------
  // รองรับ: หัวข้อ #, ย่อหน้า, **หนา**, *เอียง*, ~~ขีดฆ่า~~, `code`, ลิงก์, bullet/ลำดับเลข (ซ้อนได้),
  // blockquote (ซ้อนได้), ตาราง GFM (+จัดชิด), ``` code block, เส้นคั่น ---
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function inline(src, opts) {
    const codes = [];
    let s = esc(src).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, href) => {
      const h = href.replace(/&amp;/g, '&');
      if (!/^(https?:|mailto:)/i.test(h)) return text;
      return '<a href="' + esc(h) + '" target="_blank" rel="noopener noreferrer">' + text + '</a>';
    });
    s = s.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>')
         .replace(/__([^_]+?)__/g, '<strong>$1</strong>')
         .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
         .replace(/~~([^~]+?)~~/g, '<del>$1</del>')
         .replace(/ {2,}$/g, '<br>');
    if (opts && opts.signs) {
      s = s.replace(/(^|[\s(])([+\-−]\$?\d[\d,]*(?:\.\d+)?%?)(?=$|[\s),])/g, (all, pre, num) =>
        pre + '<span class="' + (num[0] === '+' ? 'md-pos' : 'md-neg') + '">' + num + '</span>');
    }
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + codes[+i] + '</code>');
  }

  const RE_FENCE = /^\s*```/;
  const RE_HEAD = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
  const RE_HR = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
  const RE_QUOTE = /^\s{0,3}>\s?/;
  const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const RE_TSEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  // ไม่ใช้ regex lookbehind — Safari บน iOS รุ่นเก่า parse ไม่ได้ ทั้งไฟล์จะพัง
  const splitRow = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').replace(/\\\|/g, '\u0001').split('|').map(c => c.trim().replace(/\u0001/g, '|'));
  const isBlockStart = (l, next) => RE_FENCE.test(l) || RE_HEAD.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_LIST.test(l) || (l.includes('|') && next != null && RE_TSEP.test(next));

  function buildList(items, start, indent) {
    const first = items[start];
    const tag = first.ordered ? 'ol' : 'ul';
    let out = '<' + tag + (first.ordered && first.num !== 1 ? ' start="' + first.num + '"' : '') + '>';
    let i = start, open = false;
    while (i < items.length && items[i].indent >= indent) {
      if (items[i].indent > indent) { const [h, n] = buildList(items, i, items[i].indent); out += h; i = n; continue; }
      if (open) out += '</li>';
      out += '<li>' + inline(items[i].text); open = true; i++;
    }
    if (open) out += '</li>';
    return [out + '</' + tag + '>', i];
  }

  function md(src) {
    const L = String(src || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
    let out = '', i = 0;
    while (i < L.length) {
      const l = L[i];
      if (!l.trim()) { i++; continue; }
      if (RE_FENCE.test(l)) {
        const buf = []; i++;
        while (i < L.length && !RE_FENCE.test(L[i])) buf.push(L[i++]);
        i++; out += '<pre><code>' + esc(buf.join('\n')) + '</code></pre>'; continue;
      }
      let m = RE_HEAD.exec(l);
      if (m) { const n = m[1].length; out += '<h' + n + '>' + inline(m[2]) + '</h' + n + '>'; i++; continue; }
      if (RE_HR.test(l)) { out += '<hr>'; i++; continue; }
      if (RE_QUOTE.test(l)) {
        const buf = [];
        while (i < L.length && L[i].trim() && (RE_QUOTE.test(L[i]) || !isBlockStart(L[i], L[i + 1]))) buf.push(L[i++].replace(RE_QUOTE, ''));
        out += '<blockquote>' + md(buf.join('\n')) + '</blockquote>'; continue;
      }
      if (l.includes('|') && i + 1 < L.length && RE_TSEP.test(L[i + 1])) {
        const head = splitRow(l);
        const align = splitRow(L[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
        // คอลัมน์ชิดขวา = ตัวเลข → ห้ามตัดบรรทัดกลางตัวเลข
        const st = (k) => (align[k] === 'right' ? ' class="md-num"' : '') + (align[k] ? ' style="text-align:' + align[k] + '"' : '');
        i += 2;
        let t = '<div class="md-table"><table><thead><tr>' + head.map((c, k) => '<th' + st(k) + '>' + inline(c) + '</th>').join('') + '</tr></thead><tbody>';
        while (i < L.length && L[i].trim() && L[i].includes('|')) {
          const cells = splitRow(L[i++]);
          t += '<tr>' + head.map((_, k) => '<td' + st(k) + '>' + inline(cells[k] || '', { signs: true }) + '</td>').join('') + '</tr>';
        }
        out += t + '</tbody></table></div>'; continue;
      }
      if (RE_LIST.test(l)) {
        const items = [];
        while (i < L.length) {
          const cur = L[i];
          const lm = RE_LIST.exec(cur);
          if (lm) {
            items.push({ indent: lm[1].length, ordered: /\d/.test(lm[2]), num: parseInt(lm[2], 10) || 1, text: lm[3] });
            i++;
          } else if (cur.trim() && /^\s{2,}/.test(cur) && items.length) {
            items[items.length - 1].text += ' ' + cur.trim(); i++;          // บรรทัดต่อของ bullet เดิม
          } else if (!cur.trim() && i + 1 < L.length && RE_LIST.test(L[i + 1])) {
            i++;                                                              // บรรทัดว่างระหว่าง bullet
          } else break;
        }
        const base = Math.min(...items.map(x => x.indent));
        items.forEach(x => { if (x.indent < base) x.indent = base; });
        let k = 0;
        while (k < items.length) { const [h, n] = buildList(items, k, items[k].indent); out += h; k = n; }
        continue;
      }
      const buf = [l]; i++;
      while (i < L.length && L[i].trim() && !isBlockStart(L[i], L[i + 1])) buf.push(L[i++]);
      out += '<p>' + buf.map(x => inline(x)).join('\n') + '</p>';
    }
    return out;
  }

  // ตัด H1 บรรทัดแรกออกถ้าซ้ำกับ title (กันหัวข้อซ้อน 2 ชั้น)
  function stripDupTitle(src, title) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const k = lines.findIndex(l => l.trim());
    if (k >= 0) {
      const m = /^\s*#\s+(.*?)\s*#*\s*$/.exec(lines[k]);
      const norm = (s) => String(s || '').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim();
      if (m && norm(m[1]) === norm(title)) lines.splice(k, 1);
    }
    return lines.join('\n');
  }

  // ---------------- UI ----------------
  const go = (h) => { location.hash = h; };

  function DigestHeader({ rows, loading, onReload }) {
    const latest = rows && rows[0];
    return (
      <div className="card dg-hero">
        <div className="dg-hero-ic"><Icon name="news" size={22} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dg-eyebrow">MARKET DIGEST</div>
          <h2 className="dg-hero-t">สรุปตลาด Options อเมริกา</h2>
          <div className="dg-hero-s">รายงานประจำวันภาษาไทย · อัปเดตอัตโนมัติทุกเช้าวันทำการ</div>
        </div>
        <div className="dg-hero-r">
          {latest && <span className="dg-pill">ล่าสุด {fmtMed(latest.digest_date)}</span>}
          <button className="btn btn-ghost btn-sm" onClick={onReload} disabled={loading} title="โหลดใหม่">
            <Icon name="reset" size={14} style={loading ? { animation: 'dgspin 0.9s linear infinite' } : null} />รีเฟรช
          </button>
        </div>
      </div>
    );
  }

  function DigestState({ icon, title, sub, action }) {
    return (
      <div className="card dg-state">
        <div className="dg-state-ic"><Icon name={icon} size={22} /></div>
        <div className="dg-state-t">{title}</div>
        {sub && <div className="dg-state-s">{sub}</div>}
        {action}
      </div>
    );
  }

  function DigestList() {
    const { rows, loading, error, reload, configured } = useDigests();
    if (!configured) return <div className="content dg-wrap"><DigestState icon="news" title="ยังไม่ได้เชื่อมต่อคลาวด์" sub="Market Digest ต้องเชื่อมต่อ Supabase ก่อนจึงจะดึงรายงานได้" /></div>;
    return (
      <div className="content dg-wrap">
        <DigestHeader rows={rows} loading={loading} onReload={reload} />
        {error && <div className="dg-err"><Icon name="alert" size={15} />{error}</div>}
        {!rows && loading && (
          <div className="card dg-list">{[0, 1, 2, 3].map(k => <div key={k} className="dg-row dg-skel"><div className="dg-date" /><div style={{ flex: 1 }}><div className="dg-skel-l" /><div className="dg-skel-l s" /></div></div>)}</div>
        )}
        {rows && !rows.length && <DigestState icon="news" title="ยังไม่มีรายงาน" sub="รายงานฉบับแรกจะมาถึงเช้าวันทำการถัดไป" />}
        {rows && rows.length > 0 && (
          <div className="card dg-list">
            {rows.map((r, idx) => {
              const unread = idx === 0 && isUnread(r);
              return (
                <div key={r.id} className={'dg-row' + (idx === 0 ? ' latest' : '')} onClick={() => go('digest/' + r.id)}>
                  <div className="dg-date">
                    <span className="d">{fmtD(r.digest_date, { day: 'numeric' })}</span>
                    <span className="m">{fmtD(r.digest_date, { month: 'short' })}</span>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="dg-row-t" data-ozl-skip="1">{r.title || 'Market Digest'}</div>
                    <div className="dg-row-s">
                      {fmtLong(r.digest_date)}
                      {r.trading_day && r.trading_day !== r.digest_date && <> · <span>สรุปวันเทรด US {fmtShort(r.trading_day)}</span></>}
                    </div>
                  </div>
                  {unread && <span className="dg-new">ใหม่</span>}
                  <Icon name="chevR" size={17} className="dg-chev" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function DigestReader({ id }) {
    const { rows } = useDigests();
    const [row, setRow] = useState(() => (lsGet(BODY_KEY, {})[id]) || null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const fetchRow = () => {
      if (!cfgOk()) return;
      setLoading(true); setErr('');
      loadOne(id).then(r => { if (r) setRow(r); else setErr('ไม่พบรายงานฉบับนี้'); })
        .catch(() => setErr('โหลดรายงานไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่'))
        .finally(() => setLoading(false));
    };
    useEffect(() => {
      setRow((lsGet(BODY_KEY, {})[id]) || null);
      fetchRow();
      try { window.scrollTo(0, 0); document.querySelector('.main') && document.querySelector('.main').scrollTo(0, 0); } catch (e) {}
    }, [id]);
    useEffect(() => { if (row) markSeen(row.digest_date); }, [row]);

    const idx = rows ? rows.findIndex(r => String(r.id) === String(id)) : -1;
    const newer = idx > 0 ? rows[idx - 1] : null;
    const older = idx >= 0 && rows && idx < rows.length - 1 ? rows[idx + 1] : null;
    const html = React.useMemo(() => row ? md(stripDupTitle(row.content_md, row.title)) : '', [row]);

    return (
      <div className="content dg-wrap">
        <div className="dg-bar">
          <button className="btn btn-ghost btn-sm" onClick={() => go('digest')}><Icon name="chevR" size={14} style={{ transform: 'rotate(180deg)' }} />รายงานทั้งหมด</button>
          {loading && row && <span className="dg-sync">กำลังอัปเดต…</span>}
        </div>
        {!row && loading && <div className="card dg-article"><div className="dg-skel-l" style={{ width: '40%' }} /><div className="dg-skel-l" style={{ width: '85%', height: 22, margin: '14px 0 24px' }} />{[90, 100, 76, 95, 60].map((w, k) => <div key={k} className="dg-skel-l" style={{ width: w + '%' }} />)}</div>}
        {!row && !loading && err && <DigestState icon="alert" title={err} action={<button className="btn btn-primary btn-sm" onClick={fetchRow}>ลองใหม่</button>} />}
        {row && (
          <article className="card dg-article">
            <div className="dg-meta">
              <span className="dg-pill">{fmtLong(row.digest_date)}</span>
              {row.trading_day && <span className="dg-meta-s">สรุปวันเทรด US · {fmtMed(row.trading_day)}</span>}
            </div>
            <h1 className="dg-title" data-ozl-skip="1">{row.title || 'Market Digest'}</h1>
            <div className="md" data-ozl-skip="1" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="dg-disclaimer">
              <Icon name="shield" size={15} />
              <span>ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน</span>
            </div>
          </article>
        )}
        {(newer || older) && (
          <div className="dg-pager">
            {older ? <div className="dg-pg" onClick={() => go('digest/' + older.id)}><span className="l">← ฉบับก่อนหน้า</span><span className="t" data-ozl-skip="1">{older.title}</span></div> : <div />}
            {newer ? <div className="dg-pg r" onClick={() => go('digest/' + newer.id)}><span className="l">ฉบับถัดไป →</span><span className="t" data-ozl-skip="1">{newer.title}</span></div> : <div />}
          </div>
        )}
      </div>
    );
  }

  function DigestPage({ id }) {
    return id ? <DigestReader id={id} /> : <DigestList />;
  }

  // การ์ดทางเข้าบน Dashboard — โชว์ฉบับล่าสุด + badge วันที่
  function DigestCard() {
    const { rows, configured } = useDigests();
    if (!configured) return null;
    const latest = rows && rows[0];
    const unread = isUnread(latest);
    return (
      <div className={'card dg-entry' + (unread ? ' unread' : '')} onClick={() => go(latest ? 'digest/' + latest.id : 'digest')}>
        <div className="dg-hero-ic"><Icon name="news" size={20} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dg-entry-h">
            <span className="dg-eyebrow" style={{ margin: 0 }}>MARKET DIGEST</span>
            {latest && <span className="dg-pill sm">{fmtMed(latest.digest_date)}</span>}
            {unread && <span className="dg-new">ใหม่</span>}
          </div>
          <div className="dg-entry-t" data-ozl-skip={latest ? '1' : undefined}>{latest ? (latest.title || 'Market Digest') : 'สรุปตลาด Options อเมริกาประจำวัน'}</div>
          <div className="dg-entry-s">{latest ? 'สรุปตลาด Options อเมริกาประจำวัน · แตะเพื่ออ่าน' : 'กำลังโหลดรายงานล่าสุด…'}</div>
        </div>
        <span className="dg-entry-go">อ่าน<Icon name="arrow" size={15} /></span>
      </div>
    );
  }

  // badge วันที่ล่าสุดในเมนูด้านข้าง (สีเด่นเมื่อมีฉบับใหม่ที่ยังไม่อ่าน)
  function DigestNavBadge() {
    const { rows } = useDigests();
    const latest = rows && rows[0];
    if (!latest) return null;
    const unread = isUnread(latest);
    return <span className={'nav-badge dg-navb' + (unread ? ' on' : '')}>{fmtShort(latest.digest_date)}</span>;
  }

  const hasUnreadDigest = () => !!(DG.rows && isUnread(DG.rows[0]));

  Object.assign(window, { DigestPage, DigestCard, DigestNavBadge, useDigests, hasUnreadDigest, DigestMarkdown: md });
})();
