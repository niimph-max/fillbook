/* ============================================================
   tickerchart.jsx — Phase 1 realtime: click any ticker → live chart.
   - Embeds TradingView Advanced Chart (free, realtime) in a modal.
   - Shows a live last-price header polled from Finnhub.
   - Global capture-phase click handler makes every .tkr clickable,
     so no per-page wiring is needed.
   Exports window.openTickerChart(symbol) + window.TickerChartHost
   ============================================================ */
(function () {
  const { useState, useEffect, useRef } = React;
  const { Icon } = window;

  const FINNHUB_KEY = 'd8ods19r01qrbffl14v0d8ods19r01qrbffl14vg';

  // ---- imperative open/close bridge (so non-React code can open it) ----
  let _setSymbol = null;
  window.openTickerChart = function (symbol) {
    if (_setSymbol && symbol) _setSymbol(String(symbol).toUpperCase().trim());
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

  function TickerChartHost() {
    const [symbol, setSymbol] = useState(null);
    useEffect(() => { _setSymbol = setSymbol; return () => { _setSymbol = null; }; }, []);

    // esc to close
    useEffect(() => {
      if (!symbol) return;
      const h = e => { if (e.key === 'Escape') setSymbol(null); };
      window.addEventListener('keydown', h);
      return () => window.removeEventListener('keydown', h);
    }, [symbol]);

    // global capture-phase click: any .tkr opens the chart, intercepting
    // row-level handlers so a ticker click never also navigates.
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
      };
      document.addEventListener('click', onClick, true);
      return () => document.removeEventListener('click', onClick, true);
    }, []);

    if (!symbol) return null;
    return (
      <>
        <div className="scrim" style={{ zIndex: 120 }} onClick={() => setSymbol(null)} />
        <div className="tc-modal" role="dialog" aria-label={'Chart ' + symbol}>
          <div className="tc-head">
            <LiveQuote symbol={symbol} />
            <div className="tc-actions">
              <a className="btn btn-sm btn-ghost" href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`} target="_blank" rel="noopener" title="เปิดกราฟ layout ของบัญชีคุณบน TradingView (ต้องล็อกอินอยู่)">
                <Icon name="arrow" size={14} />เปิดกราฟของฉัน
              </a>
              <button className="btn btn-ghost icon-btn" onClick={() => setSymbol(null)}><Icon name="close" /></button>
            </div>
          </div>
          <div className="tc-chart"><TVChart symbol={symbol} /></div>
        </div>
      </>
    );
  }

  window.TickerChartHost = TickerChartHost;
})();
