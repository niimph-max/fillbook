/* ============================================================
   digest.jsx — Market Digest: สรุปตลาด Options อเมริกาประจำวัน
   ------------------------------------------------------------
   • ข้อมูล/ตัวแปลง Markdown อยู่ใน js/digest-core.js (window.FBDigest)
     ไฟล์นี้เป็นแค่ UI ในแอป · หน้าเว็บสาธารณะคือ digest.html
   • route: #digest = รายการ · #digest/<id> = หน้าอ่าน
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
