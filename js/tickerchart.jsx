/* ============================================================
   tickerchart.jsx — คลิก ticker → modal ที่มี 2 แท็บ:
     • กราฟ — TradingView Advanced Chart (realtime) + ราคาสด Finnhub
     • ข่าว — ให้ Claude สรุปข้อมูล/ข่าวล่าสุดของหุ้นตัวนั้น
              (เรียกผ่าน window.fetchTickerNews → news.js)
   - Global capture-phase click ทำให้ทุก .tkr คลิกได้ (default = กราฟ)
   Export window.openTickerChart(symbol[, tab]) + window.TickerChartHost
   ============================================================ */
(function () {
  const { useState, useEffect, useRef } = React;
  const { Icon } = window;

  const FINNHUB_KEY = 'd8ods19r01qrbffl14v0d8ods19r01qrbffl14vg';

  // แท็บ "งบการเงิน" — เปิด Qualtrim โดยเลือกหุ้นตัวนั้นให้อัตโนมัติ
  // (ถ้า Qualtrim เปลี่ยนรูปแบบ URL แก้บรรทัดนี้บรรทัดเดียว)
  const QUALTRIM_URL = sym => `https://www.qualtrim.com/app/insights/${encodeURIComponent(sym)}`;

  // ---- imperative open/close bridge (so non-React code can open it) ----
  let _open = null;
  window.openTickerChart = function (symbol, tab) {
    if (_open && symbol) {
      const t = (tab === 'news' || tab === 'financials') ? tab : 'chart';
      _open(String(symbol).toUpperCase().trim(), t);
    }
  };

  function appTheme() {
    const t = document.documentElement.getAttribute('data-theme')
      || document.body.getAttribute('data-theme');
    return t === 'light' ? 'light' : 'dark';
  }

  // ---- TradingView advanced chart embed (recreated per symbol/theme) ----
  function TVChart({ symbol }) {
    const host = useRef(null);
    useEffect(() => {
      const el = host.current;
      if (!el || !symbol) return;
      el.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'tradingview-widget-container';
      wrap.style.height = '100%';
      wrap.style.width = '100%';
      const widget = document.createElement('div');
      widget.className = 'tradingview-widget-container__widget';
      widget.style.height = '100%';
      widget.style.width = '100%';
      wrap.appendChild(widget);
      const s = document.createElement('script');
      s.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
      s.async = true;
      s.innerHTML = JSON.stringify({
        symbol,
        autosize: true,
        interval: 'D',
        timezone: 'Etc/UTC',
        theme: appTheme(),
        style: '1',
        locale: 'en',
        hide_side_toolbar: false,
        allow_symbol_change: true,
        calendar: false,
        backgroundColor: appTheme() === 'light' ? '#ffffff' : '#11151d',
        support_host: 'https://www.tradingview.com'
      });
      wrap.appendChild(s);
      el.appendChild(wrap);
    }, [symbol]);
    return <div ref={host} style={{ height: '100%', width: '100%' }} />;
  }

  // ---- live last-price header from Finnhub ----
  function LiveQuote({ symbol }) {
    const T = window.TL;
    const [q, setQ] = useState(null);
    const [err, setErr] = useState(false);
    useEffect(() => {
      let alive = true;
      setQ(null); setErr(false);
      const load = async () => {
        try {
          const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_KEY}`);
          const d = await r.json();
          if (!alive) return;
          if (d && d.c != null) setQ(d); else setErr(true);
        } catch { if (alive) setErr(true); }
      };
      load();
      const iv = setInterval(load, 15000); // realtime-ish poll
      return () => { alive = false; clearInterval(iv); };
    }, [symbol]);

    const fmt = n => n == null ? '—' : (T ? T.fmtNum(n, 2) : Number(n).toFixed(2));
    const up = q && q.dp >= 0;
    return (
      <div className="tc-quote">
        <span className="tkr tc-sym">{symbol}</span>
        {q ? (
          <>
            <span className="num tc-price">{fmt(q.c)}</span>
            <span className={'num tc-chg ' + (up ? 'pos' : 'neg')}>
              {up ? '+' : ''}{fmt(q.d)} ({up ? '+' : ''}{q.dp == null ? '—' : q.dp.toFixed(2)}%)
            </span>
            <span className="faint tc-live"><span className="tc-dot" />live · poll 15s</span>
          </>
        ) : err ? (
          <span className="faint tc-price" style={{ fontSize: 13 }}>โหลดราคาไม่ได้ (กราฟด้านล่างยังเรียลไทม์)</span>
        ) : (
          <span className="faint tc-price" style={{ fontSize: 13 }}>กำลังโหลด…</span>
        )}
      </div>
    );
  }

  // ---- tiny markdown → HTML (escape first, then transform) -------------
  function mdEsc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function mdInline(s) {
    s = mdEsc(s);
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    // bare urls → links
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return s;
  }
  function renderMarkdown(md) {
    const lines = (md || '').replace(/\r\n/g, '\n').split('\n');
    let html = '', listType = null, para = [];
    const flushPara = () => { if (para.length) { html += '<p>' + mdInline(para.join(' ')) + '</p>'; para = []; } };
    const closeList = () => { if (listType) { html += '</' + listType + '>'; listType = null; } };
    for (let raw of lines) {
      const line = raw.replace(/\s+$/, '');
      const t = line.trim();
      if (!t) { flushPara(); closeList(); continue; }
      let m;
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) {
        flushPara(); closeList();
        const lvl = Math.min(m[1].length + 1, 5); // ## → h3 etc
        html += '<h' + lvl + '>' + mdInline(m[2]) + '</h' + lvl + '>';
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flushPara(); closeList(); html += '<hr/>'; continue; }
      if ((m = t.match(/^[-*+]\s+(.*)$/))) {
        flushPara();
        if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
        html += '<li>' + mdInline(m[1]) + '</li>';
        continue;
      }
      if ((m = t.match(/^\d+[.)]\s+(.*)$/))) {
        flushPara();
        if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
        html += '<li>' + mdInline(m[1]) + '</li>';
        continue;
      }
      if ((m = t.match(/^>\s?(.*)$/))) {
        flushPara(); closeList();
        html += '<blockquote>' + mdInline(m[1]) + '</blockquote>';
        continue;
      }
      // bold-only line acts like a subheading (prompt uses **หัวข้อ**)
      if ((m = t.match(/^\*\*([^*]+)\*\*:?$/))) {
        flushPara(); closeList();
        html += '<h4>' + mdInline(m[1]) + '</h4>';
        continue;
      }
      closeList();
      para.push(t);
    }
    flushPara(); closeList();
    return html;
  }

  function timeAgo(iso) {
    if (!iso) return '';
    const t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    const s = Math.max(0, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'เมื่อสักครู่';
    const m = Math.round(s / 60); if (m < 60) return m + ' นาทีที่แล้ว';
    const h = Math.round(m / 60); if (h < 24) return h + ' ชม. ที่แล้ว';
    const d = Math.round(h / 24); return d + ' วันที่แล้ว';
  }

  // ---- News panel: ให้ Claude สรุปข่าว/ข้อมูลล่าสุด ----
  function NewsPanel({ symbol, active }) {
    const [data, setData] = useState(null);     // { text, at, source, cached }
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [showPrompt, setShowPrompt] = useState(false);
    const startedFor = useRef(null);

    const load = async (force) => {
      setLoading(true); setErr(null);
      try {
        const r = await window.fetchTickerNews(symbol, { force });
        setData(r);
      } catch (e) {
        setErr(e && e.code === 'NO_BACKEND' ? 'NO_BACKEND' : (e && e.message) || 'error');
      } finally { setLoading(false); }
    };

    // โหลดครั้งแรกเมื่อแท็บข่าวถูกเปิด (ต่อ symbol)
    useEffect(() => {
      if (!active) return;
      const cached = window.ozlNewsCache && window.ozlNewsCache.read(symbol);
      if (cached && cached.text) { setData(Object.assign({}, cached, { cached: true })); }
      if (startedFor.current !== symbol) {
        startedFor.current = symbol;
        if (!cached || !cached.text) load(false);
      }
    }, [active, symbol]);

    return (
      <div className="tc-news">
        <div className="tc-news-bar">
          <div className="tc-news-meta">
            <Icon name="weekly" size={14} style={{ color: 'var(--accent-2)' }} />
            <span className="tc-news-title">สรุปโดย Claude</span>
            {data && data.at && <span className="faint" style={{ fontSize: 11.5 }}>· อัปเดต {timeAgo(data.at)}</span>}
            {data && data.source === 'preview' && <span className="tc-news-badge">โหมด preview</span>}
          </div>
          <div className="tc-news-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setShowPrompt(s => !s)} title="ดู prompt ที่ส่งให้ Claude">
              <Icon name="summary" size={13} />prompt
            </button>
            <button className="btn btn-sm" onClick={() => load(true)} disabled={loading}>
              <Icon name="reset" size={13} style={loading ? { animation: 'spin 1s linear infinite' } : null} />
              {loading ? 'กำลังวิเคราะห์…' : 'รีเฟรช'}
            </button>
          </div>
        </div>

        {showPrompt && (
          <div className="tc-news-prompt">
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Prompt ที่ส่งให้ Claude</div>
            <pre>{window.ozlNewsPrompt ? window.ozlNewsPrompt(symbol) : ''}</pre>
          </div>
        )}

        <div className="tc-news-scroll">
          {loading && !data && (
            <div className="tc-news-loading">
              <div className="tc-news-spinner" />
              <div style={{ fontWeight: 600, fontSize: 14 }}>กำลังให้ Claude ค้นข้อมูลล่าสุดของ {symbol}…</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>ค้นเว็บ + สรุปงบ ข่าว มุมมองนักวิเคราะห์ · อาจใช้เวลาสักครู่</div>
              <div className="tc-skel-wrap">
                {[80, 100, 92, 70, 96, 60].map((w, i) => <div key={i} className="tc-skel" style={{ width: w + '%' }} />)}
              </div>
            </div>
          )}

          {err === 'NO_BACKEND' && !data && (
            <div className="tc-news-empty">
              <Icon name="weekly" size={26} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
              <div style={{ fontWeight: 600 }}>ยังไม่ได้ตั้งค่า Claude</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6, maxWidth: 440 }}>
                ฟีเจอร์นี้ให้ Claude ค้นเว็บ + สรุปข้อมูลหุ้นแบบสด ต้อง deploy Supabase edge function ชื่อ <code>news</code> และตั้ง secret <code>ANTHROPIC_API_KEY</code> ก่อน (ดูไฟล์ <code>supabase/functions/news/index.ts</code>)
              </div>
              <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => load(true)}><Icon name="reset" size={13} />ลองอีกครั้ง</button>
            </div>
          )}

          {err && err !== 'NO_BACKEND' && !data && (
            <div className="tc-news-empty">
              <Icon name="pulse" size={26} style={{ color: 'var(--neg-bright)', marginBottom: 10 }} />
              <div style={{ fontWeight: 600 }}>ดึงข้อมูลไม่สำเร็จ</div>
              <div className="faint" style={{ fontSize: 12.5, marginTop: 6, maxWidth: 420 }}>{err}</div>
              <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => load(true)}><Icon name="reset" size={13} />ลองอีกครั้ง</button>
            </div>
          )}

          {data && (
            <>
              {data.cached && !loading && (
                <div className="tc-news-cachehint faint">
                  <Icon name="pulse" size={12} />แสดงผลล่าสุดที่บันทึกไว้ — กด “รีเฟรช” เพื่อให้ Claude ค้นใหม่
                </div>
              )}
              <div className="md-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(data.text) }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-soft)' }}>
                <a className="btn btn-sm" href={'https://claude.ai/new?q=' + encodeURIComponent(window.ozlNewsPrompt ? window.ozlNewsPrompt(symbol) : ('วิเคราะห์หุ้น ' + symbol))} target="_blank" rel="noopener noreferrer">
                  <Icon name="arrow" size={13} />ถามต่อใน Claude
                </a>
                <span className="faint" style={{ fontSize: 11.5, lineHeight: 1.5, flex: '1 1 200px' }}>
                  เปิดแชทใหม่ใน Claude พร้อม prompt เดิมของ {symbol} — เจาะลึก/ถามต่อ พร้อมค้นเว็บล่าสุดได้
                </span>
              </div>
              <div className="tc-news-foot faint">
                ข้อมูลสร้างโดย AI เพื่อประกอบการตัดสินใจ — โปรดตรวจสอบกับแหล่งต้นทางก่อนเทรด
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // ---- Financials panel: เปิด Qualtrim เลือกหุ้นตัวนั้น ----
  function FinancialsPanel({ symbol }) {
    const url = QUALTRIM_URL(symbol);
    return (
      <div className="tc-news">
        <div className="tc-news-scroll">
          <div className="tc-news-empty">
            <Icon name="finance" size={28} style={{ color: 'var(--accent-2)', marginBottom: 12 }} />
            <div style={{ fontWeight: 700, fontSize: 16 }}>งบการเงินของ {symbol}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 6, lineHeight: 1.6, maxWidth: 420 }}>
              ดูงบการเงิน รายได้ กระแสเงินสด และเมตริกเชิงลึกของ <b>{symbol}</b> บน Qualtrim — เปิดแล้วระบบจะเลือกหุ้นตัวนี้ให้อัตโนมัติ
            </div>
            <a className="btn" style={{ marginTop: 16 }} href={url} target="_blank" rel="noopener noreferrer">
              <Icon name="arrow" size={14} />เปิดงบการเงินใน Qualtrim
            </a>
            <div className="faint" style={{ fontSize: 11, marginTop: 10 }}>เปิดในแท็บใหม่ · ต้องล็อกอิน Qualtrim อยู่</div>
          </div>
        </div>
      </div>
    );
  }

  function TickerChartHost() {
    const [symbol, setSymbol] = useState(null);
    const [tab, setTab] = useState('chart');
    useEffect(() => {
      _open = (sym, t) => { setSymbol(sym); setTab(t || 'chart'); };
      return () => { _open = null; };
    }, []);

    // esc to close
    useEffect(() => {
      if (!symbol) return;
      const h = e => { if (e.key === 'Escape') setSymbol(null); };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    }, [symbol]);

    // global capture-phase click: any .tkr opens the modal (default = chart).
    useEffect(() => {
      const onClick = e => {
        const el = e.target.closest && e.target.closest('.tkr');
        if (!el) return;
        if (el.closest('.tc-modal')) return; // ignore clicks inside our own modal
        const sym = (el.dataset.symbol || el.textContent || '').toUpperCase().trim();
        if (!sym || /[^A-Z0-9.\-:]/.test(sym)) return; // skip non-symbol text
        e.preventDefault();
        e.stopPropagation();
        setSymbol(sym);
        setTab('chart');
      };
      document.addEventListener('click', onClick, true);
      return () => document.removeEventListener('click', onClick, true);
    }, []);

    if (!symbol) return null;
    return (
      <>
        <div className="scrim" style={{ zIndex: 120 }} onClick={() => setSymbol(null)} />
        <div className="tc-modal" role="dialog" aria-label={'Ticker ' + symbol}>
          <div className="tc-head">
            <LiveQuote symbol={symbol} />
            <div className="tc-tabs" role="tablist">
              <button className={'tc-tab' + (tab === 'chart' ? ' active' : '')} role="tab" aria-selected={tab === 'chart'} onClick={() => setTab('chart')}>
                <Icon name="weekly" size={14} />กราฟ
              </button>
              <button className={'tc-tab' + (tab === 'news' ? ' active' : '')} role="tab" aria-selected={tab === 'news'} onClick={() => setTab('news')}>
                <Icon name="summary" size={14} />ข่าว
              </button>
              <button className={'tc-tab' + (tab === 'financials' ? ' active' : '')} role="tab" aria-selected={tab === 'financials'} onClick={() => setTab('financials')}>
                <Icon name="finance" size={14} />งบการเงิน
              </button>
            </div>
            <div className="tc-actions">
              {tab === 'chart' ? (
                <a className="btn btn-sm btn-ghost" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noopener" title="เปิดกราฟ layout ของบัญชีคุณบน TradingView (ต้องล็อกอินอยู่)">
                  <Icon name="arrow" size={14} />เปิดกราฟของฉัน
                </a>
              ) : tab === 'news' ? (
                <a className="btn btn-sm btn-ghost" href={`https://www.tradingview.com/symbols/${encodeURIComponent(symbol)}/news/`} target="_blank" rel="noopener" title="เปิดหน้าข่าวบน TradingView">
                  <Icon name="arrow" size={14} />ข่าวเต็ม
                </a>
              ) : (
                <a className="btn btn-sm btn-ghost" href={QUALTRIM_URL(symbol)} target="_blank" rel="noopener" title="เปิดงบการเงินบน Qualtrim">
                  <Icon name="arrow" size={14} />เปิด Qualtrim
                </a>
              )}
              <button className="btn btn-ghost icon-btn" onClick={() => setSymbol(null)}><Icon name="close" /></button>
            </div>
          </div>
          <div className="tc-body">
            <div className="tc-chart" style={{ display: tab === 'chart' ? 'block' : 'none' }}>
              <TVChart symbol={symbol} />
            </div>
            {tab === 'news' && <NewsPanel symbol={symbol} active={tab === 'news'} />}
            {tab === 'financials' && <FinancialsPanel symbol={symbol} />}
          </div>
        </div>
      </>
    );
  }

  window.TickerChartHost = TickerChartHost;
})();
