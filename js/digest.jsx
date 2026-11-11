/* ============================================================
   digest.jsx — Market Digest: สรุปตลาด Options อเมริกาประจำวัน
   ------------------------------------------------------------
   • ข้อมูล/ตัวแปลง Markdown อยู่ใน js/digest-core.js (window.FBDigest)
     ไฟล์นี้เป็นแค่ UI ในแอป · หน้าเว็บสาธารณะคือ digest.html
   • route: #digest = รายการสรุปเช้า · #digest/<id> = หน้าอ่าน
            #digest/evening = รายการสรุปเย็น · #digest/evening/<YYYY-MM-DD> = หน้าอ่าน
   • แท็บ "สรุปเช้า" = Market Digest (daily/private_digests) · "สรุปเย็น" = เตรียมเทรดคืนนี้ 19:00 น.
     (ตาราง fillbook_briefs · RLS เฉพาะเจ้าของ · ไม่เก็บลง localStorage · ตารางไม่มี/ไม่ได้ล็อกอิน = ซ่อนแท็บ)
   • เนื้อหารายงานห่อด้วย data-ozl-skip → ตัวแปลภาษา TH⇄EN ไม่ไปแตะ
   Exports: DigestPage, DigestCard, DigestNavBadge, useDigests
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const { Icon } = window;

  // ข้อมูล / Markdown / วันที่ — อยู่ใน js/digest-core.js (ใช้ร่วมกับหน้าเว็บสาธารณะ)
  const D = window.FBDigest;
  const { fmtD, fmtLong, fmtMed, fmtShort, isUnread, markSeen } = D;
  const cfgOk = D.configured;

  function useDigests() {
    const [, bump] = useState(0);
    useEffect(() => {
      const off = D.subscribe(() => bump(x => x + 1));
      D.loadList(false);
      return off;
    }, []);
    const S = D.state;
    return { rows: S.rows, loading: S.loading, error: S.error, reload: () => D.loadList(true), configured: cfgOk() };
  }

  // ---------------- UI ----------------
  const go = (h) => { location.hash = h; };
  // ป้าย "ฉบับส่วนตัว" (row._private มาจาก private_digests — เห็นเฉพาะเจ้าของ)
  function PrivBadge({ row }) {
    if (!row || !row._private) return null;
    return <span className="dg-priv"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>{D.PRIVATE_LABEL}</span>;
  }

  // ---- สรุปเย็น (fillbook_briefs) ----
  async function loadEvening() {
    if (!window.sbClient || !window.OZLAuth) return null;
    const { data, error } = await window.sbClient.from('fillbook_briefs').select('brief_date,title,created_at,cost_usd')
      .eq('app', 'fillbook').eq('kind', 'premarket').order('brief_date', { ascending: false }).limit(500);
    return error ? null : (data || []);
  }
  let eveningCache;   // undefined = ยังไม่โหลด · null = ใช้ไม่ได้ · [] = แถว (หน่วยความจำเท่านั้น)
  function useEvening() {
    const [rows, setRows] = useState(eveningCache);
    const [loading, setLoading] = useState(false);
    const reload = () => { setLoading(true); return loadEvening().then(r => { eveningCache = r; setRows(r); }, () => {}).finally(() => setLoading(false)); };
    useEffect(() => { reload(); }, []);
    return { rows, loading, reload };
  }
  const thTime = iso => { try { return new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }); } catch (e) { return ''; } };
  const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  function DigestTabs({ active }) {
    const ev = useEvening();
    if (ev.rows === null || ev.rows === undefined) return null;   // ยังไม่ได้ตั้งค่าสรุปเย็น → ไม่ต้องมีแท็บ
    return (
      <div className="jtabs dg-tabs">
        <button className={'jtab' + (active === 'am' ? ' on' : '')} onClick={() => go('digest')}>☀️ สรุปเช้า</button>
        <button className={'jtab' + (active === 'pm' ? ' on' : '')} onClick={() => go('digest/evening')}>🌙 สรุปเย็น{ev.rows.length ? <span className="jtab-b dg-tabn">{ev.rows.length}</span> : null}</button>
      </div>
    );
  }

  function DigestHeader({ rows, loading, onReload, evening }) {
    const latest = rows && rows[0];
    const latestDate = latest && (evening ? latest.brief_date : latest.digest_date);
    return (
      <div className="card dg-hero">
        <div className="dg-hero-ic"><Icon name="news" size={22} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="dg-eyebrow">MARKET DIGEST</div>
          <h2 className="dg-hero-t">{evening ? 'สรุปเย็น · เตรียมเทรดคืนนี้' : 'สรุปตลาด Options อเมริกา'}</h2>
          <div className="dg-hero-s">{evening ? 'ก่อนตลาดอเมริกาเปิด · ทุก 19:00 น. จ.–ศ. · อ่านได้เฉพาะคุณ' : 'รายงานประจำวันภาษาไทย · อัปเดตอัตโนมัติทุกเช้าวันทำการ'}</div>
        </div>
        <div className="dg-hero-r">
          {latestDate && <span className="dg-pill">ล่าสุด {fmtMed(latestDate)}</span>}
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
        <DigestTabs active="am" />
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
                      <PrivBadge row={r} />{fmtLong(r.digest_date)}
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
    const [row, setRow] = useState(() => D.cachedOne(id));
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const fetchRow = () => {
      if (!cfgOk()) return;
      setLoading(true); setErr('');
      D.loadOne(id).then(r => { if (r) setRow(r); else setErr('ไม่พบรายงานฉบับนี้'); })
        .catch(() => setErr('โหลดรายงานไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่'))
        .finally(() => setLoading(false));
    };
    useEffect(() => {
      setRow(D.cachedOne(id));
      fetchRow();
      try { window.scrollTo(0, 0); document.querySelector('.main') && document.querySelector('.main').scrollTo(0, 0); } catch (e) {}
    }, [id]);
    useEffect(() => { if (row) markSeen(row.digest_date); }, [row]);

    const idx = rows ? rows.findIndex(r => String(r.id) === String(id)) : -1;
    const newer = idx > 0 ? rows[idx - 1] : null;
    const older = idx >= 0 && rows && idx < rows.length - 1 ? rows[idx + 1] : null;
    const html = React.useMemo(() => row ? D.md(D.stripDupTitle(row.content_md, row.title)) : '', [row]);

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
              <PrivBadge row={row} />
              {row.trading_day && <span className="dg-meta-s">สรุปวันเทรด US · {fmtMed(row.trading_day)}</span>}
            </div>
            <h1 className="dg-title" data-ozl-skip="1">{row.title || 'Market Digest'}</h1>
            <div className="md" data-ozl-skip="1" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="dg-disclaimer">
              <Icon name="shield" size={15} />
              <span>{D.DISCLAIMER}</span>
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

  function EveningList() {
    const { rows, loading, reload } = useEvening();
    return (
      <div className="content dg-wrap">
        <DigestHeader rows={rows} loading={loading} onReload={reload} evening />
        <DigestTabs active="pm" />
        {rows === undefined && <div className="card dg-list">{[0, 1, 2].map(k => <div key={k} className="dg-row dg-skel"><div className="dg-date" /><div style={{ flex: 1 }}><div className="dg-skel-l" /><div className="dg-skel-l s" /></div></div>)}</div>}
        {rows === null && <DigestState icon="alert" title="ยังเปิดสรุปเย็นไม่ได้" sub="ต้องล็อกอิน และตั้งค่าตาราง fillbook_briefs ใน Supabase ก่อน" />}
        {rows && !rows.length && <DigestState icon="news" title="ยังไม่มีสรุปเย็น" sub="ฉบับแรกจะมาเวลา 19:00 น. ของวันที่ตลาดอเมริกาเปิด หรือกด 'สร้างตอนนี้' ที่การ์ดบน Dashboard" />}
        {rows && rows.length > 0 && (
          <div className="card dg-list">
            {rows.map((r, idx) => (
              <div key={r.brief_date} className={'dg-row' + (idx === 0 ? ' latest' : '')} onClick={() => go('digest/evening/' + r.brief_date)}>
                <div className="dg-date">
                  <span className="d">{fmtD(r.brief_date, { day: 'numeric' })}</span>
                  <span className="m">{fmtD(r.brief_date, { month: 'short' })}</span>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="dg-row-t">{r.title || 'เตรียมเทรดคืนนี้'}</div>
                  <div className="dg-row-s">{fmtLong(r.brief_date)} · ส่ง {thTime(r.created_at)} น.</div>
                </div>
                {idx === 0 && (Date.now() - new Date(r.created_at).getTime()) < 14 * 3600e3 && <span className="dg-new">ใหม่</span>}
                <Icon name="chevR" size={17} className="dg-chev" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function EveningReader({ date }) {
    const { rows } = useEvening();
    const [row, setRow] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(false);
    const fetchRow = () => {
      if (!window.sbClient) { setErr('ต้องล็อกอินก่อน'); return; }
      setLoading(true); setErr('');
      window.sbClient.from('fillbook_briefs').select('brief_date,title,content_md,sources,cost_usd,created_at')
        .eq('app', 'fillbook').eq('kind', 'premarket').eq('brief_date', date).maybeSingle()
        .then(({ data, error }) => { if (error) setErr('โหลดสรุปไม่สำเร็จ'); else if (!data) setErr('ไม่พบสรุปวันนี้'); else setRow(data); },
          () => setErr('โหลดสรุปไม่สำเร็จ — ตรวจการเชื่อมต่ออินเทอร์เน็ตแล้วลองใหม่'))
        .finally(() => setLoading(false));
    };
    useEffect(() => {
      setRow(null); fetchRow();
      try { window.scrollTo(0, 0); document.querySelector('.main') && document.querySelector('.main').scrollTo(0, 0); } catch (e) {}
    }, [date]);
    const idx = rows ? rows.findIndex(r => r.brief_date === date) : -1;
    const newer = idx > 0 ? rows[idx - 1] : null;
    const older = idx >= 0 && rows && idx < rows.length - 1 ? rows[idx + 1] : null;
    const html = React.useMemo(() => row ? D.md(row.content_md) : '', [row]);
    return (
      <div className="content dg-wrap">
        <div className="dg-bar">
          <button className="btn btn-ghost btn-sm" onClick={() => go('digest/evening')}><Icon name="chevR" size={14} style={{ transform: 'rotate(180deg)' }} />สรุปเย็นทั้งหมด</button>
          {loading && row && <span className="dg-sync">กำลังอัปเดต…</span>}
        </div>
        {!row && loading && <div className="card dg-article">{[40, 85, 90, 100, 76].map((w, k) => <div key={k} className="dg-skel-l" style={{ width: w + '%' }} />)}</div>}
        {!row && !loading && err && <DigestState icon="alert" title={err} action={<button className="btn btn-primary btn-sm" onClick={fetchRow}>ลองใหม่</button>} />}
        {row && (
          <article className="card dg-article">
            <div className="dg-meta">
              <span className="dg-pill">{fmtLong(row.brief_date)}</span>
              <span className="dg-meta-s">🌙 สรุปเย็น · ส่ง {thTime(row.created_at)} น.</span>
            </div>
            <h1 className="dg-title">{row.title || 'เตรียมเทรดคืนนี้'}</h1>
            <div className="md" data-ozl-skip="1" dangerouslySetInnerHTML={{ __html: html }} />
            {!!(row.sources && row.sources.length) && (
              <div className="aichat-src" data-ozl-skip="1">
                <div className="faint" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>แหล่งข้อมูล</div>
                {row.sources.map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<span className="faint"> · {domainOf(s.url)}</span></a>)}
              </div>
            )}
            <div className="dg-disclaimer">
              <Icon name="shield" size={15} />
              <span>{D.DISCLAIMER} · สรุปโดย AI อาจผิดพลาดได้{row.cost_usd != null ? ' · ค่าใช้จ่าย ~$' + Number(row.cost_usd).toFixed(3) : ''}</span>
            </div>
          </article>
        )}
        {(newer || older) && (
          <div className="dg-pager">
            {older ? <div className="dg-pg" onClick={() => go('digest/evening/' + older.brief_date)}><span className="l">← วันก่อนหน้า</span><span className="t">{fmtLong(older.brief_date)}</span></div> : <div />}
            {newer ? <div className="dg-pg r" onClick={() => go('digest/evening/' + newer.brief_date)}><span className="l">วันถัดไป →</span><span className="t">{fmtLong(newer.brief_date)}</span></div> : <div />}
          </div>
        )}
      </div>
    );
  }

  function DigestPage({ id }) {
    const sub = String(id || '');
    if (sub === 'evening') return <EveningList />;
    if (sub.indexOf('evening/') === 0) return <EveningReader date={sub.slice(8)} />;
    return sub ? <DigestReader id={sub} /> : <DigestList />;
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
            <PrivBadge row={latest} />
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

  const hasUnreadDigest = () => !!(D.state.rows && isUnread(D.state.rows[0]));

  Object.assign(window, { DigestPage, DigestCard, DigestNavBadge, useDigests, hasUnreadDigest });
})();
