/* ============================================================
   alerts.jsx — ศูนย์แจ้งเตือน (กระดิ่งบน topbar)
   ------------------------------------------------------------
   รวมเตือนจากทุกที่: ใกล้หมดอายุ · ราคาหลุด strike · ถึงกำหนด
   ปิดตามแผน · งบออกก่อนหมดอายุ · FOMC/CPI ใกล้ · สัญญาณ
   Watchlist · ไม้ที่รอรีวิว  + ส่งเป็น notification บนเครื่องได้
   Exports window.AlertBell, window.computeAlerts
   ============================================================ */
(function () {
  const { useState, useEffect, useMemo, useRef } = React;
  const { Icon } = window;

  const SEV = { high: '#e5484d', mid: '#d8a229', low: '#6aa6ff' };
  const RANK = { high: 3, mid: 2, low: 1 };
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const QKEY = 'ozl_alert_q';

  // ---- ราคาสดของ ticker ที่มีไม้เปิดอยู่ (cache 5 นาทีใน sessionStorage) ----
  function useOpenQuotes(tickers) {
    const [map, setMap] = useState(() => { try { const c = JSON.parse(sessionStorage.getItem(QKEY)); return c && c.map ? c.map : {}; } catch (e) { return {}; } });
    const key = tickers.join(',');
    useEffect(() => {
      if (!tickers.length || !window.fetchQuote) return;
      let stale = true;
      try { const c = JSON.parse(sessionStorage.getItem(QKEY)); if (c && Date.now() - c.at < 3e5) stale = false; } catch (e) {}
      if (!stale) return;
      let dead = false;
      Promise.all(tickers.map(async t => [t, await window.fetchQuote(t)])).then(pairs => {
        if (dead) return;
        const m = {};
        pairs.forEach(([t, q]) => { if (q && q.c != null) m[t] = q.c; });
        setMap(m);
        try { sessionStorage.setItem(QKEY, JSON.stringify({ at: Date.now(), map: m })); } catch (e) {}
      }).catch(() => {});
      return () => { dead = true; };
    }, [key]);
    return map;
  }

  // ---- สร้างรายการแจ้งเตือน ----------------------------------------------
  function computeAlerts({ state, settings, watchlist, quotes, earnings }) {
    const T = window.TL, out = [];
    const today = todayStr();
    const plans = Array.isArray(settings.plans) ? settings.plans : [];
    const open = state.trades.filter(t => (t.assetType || 'option') === 'option' && t.status === 'Opened');

    open.forEach(t => {
      const tk = (t.ticker || '?').toUpperCase();
      const label = `${tk} ${t.strategy}${t.strike != null ? ' $' + t.strike : ''}`;
      const dte = t.expiry ? T.daysBetween(today, t.expiry) : null;

      if (dte != null && dte <= 0) out.push({ id: 'exp' + t.id, sev: 'high', title: label, sub: dte === 0 ? 'หมดอายุวันนี้ — จัดการก่อนตลาดปิด' : `เลยวันหมดอายุมา ${-dte} วัน — อัปเดตสถานะเป็น Closed`, route: 'trades' });
      else if (dte != null && dte <= 7) out.push({ id: 'exp' + t.id, sev: 'mid', title: label, sub: `เหลือ ${dte} วันหมดอายุ`, route: 'trades' });

      const px = quotes[tk];
      if (px != null && t.strike != null) {
        if (t.strategy === 'Sell Put') {
          if (px < t.strike) out.push({ id: 'itm' + t.id, sev: 'high', title: label, sub: `ราคา $${px.toFixed(2)} หลุดใต้ strike แล้ว (ITM) — เสี่ยงถูก assign`, route: 'trades' });
          else if (px <= t.strike * 1.03) out.push({ id: 'near' + t.id, sev: 'mid', title: label, sub: `ราคา $${px.toFixed(2)} จ่อ strike (ห่าง ${((px / t.strike - 1) * 100).toFixed(1)}%)`, route: 'trades' });
        } else if (t.strategy === 'Sell Call') {
          if (px > t.strike) out.push({ id: 'itm' + t.id, sev: 'high', title: label, sub: `ราคา $${px.toFixed(2)} ทะลุ strike แล้ว (ITM)`, route: 'trades' });
          else if (px >= t.strike * 0.97) out.push({ id: 'near' + t.id, sev: 'mid', title: label, sub: `ราคา $${px.toFixed(2)} จ่อ strike`, route: 'trades' });
        }
      }

      // ถึงกำหนดปิดตามแผนที่บันทึกไว้
      const p = plans.find(x => x.ticker === tk && x.expiry === t.expiry && (x.strike == null || t.strike == null || +x.strike === +t.strike));
      if (p && p.closeDte && dte != null && dte <= p.closeDte && dte > 0)
        out.push({ id: 'plan' + t.id, sev: 'mid', title: label, sub: `แผนบอกให้ปิดเมื่อเหลือ ${p.closeDte} DTE — ตอนนี้เหลือ ${dte}`, route: 'trades' });

      // งบออกก่อนหมดอายุ
      const e = earnings[tk];
      if (e && e.date && !(window.isEarnUnavail && window.isEarnUnavail(e)) && t.expiry && e.date >= today && e.date <= t.expiry)
        out.push({ id: 'earn' + t.id, sev: 'mid', title: label, sub: `${tk} ประกาศงบ ${T.fmtDate(e.date)} ก่อนหมดอายุ`, route: 'trades' });
    });

    // อีเวนต์มหภาคใน 3 วัน
    if (window.macroEvents) {
      window.macroEvents(2).filter(e => e.kind !== 'OPEX').forEach(e => {
        const g = T.daysBetween(today, e.date);
        if (g != null && g >= 0 && g <= 3) out.push({ id: 'macro' + e.date + e.kind, sev: 'low', title: e.kind + ' · ' + e.label + (e.est ? ' (คาด)' : ''), sub: g === 0 ? 'วันนี้' : `อีก ${g} วัน — ตลาดมักแกว่งแรง`, route: 'plan' });
      });
    }

    // สัญญาณ Watchlist
    if (window.WL) {
      (watchlist || []).forEach(w => {
        const g = window.WL.grade(w);
        if (g.active) out.push({ id: 'wl' + w.id, sev: 'low', title: (w.ticker || '?') + ' · ' + (g.label || 'สัญญาณ'), sub: g.sub || '', route: 'watchlist' });
        window.WL.priceAlerts(w).forEach(a => out.push({ id: 'wlp' + w.id + a.kind, sev: a.kind === 'stop' ? 'mid' : 'low', title: (w.ticker || '?'), sub: a.text, route: 'watchlist' }));
      });
    }

    // ไม้ที่รอรีวิว
    if (window.pendingReviews) {
      const n = window.pendingReviews(state.trades).length;
      if (n) out.push({ id: 'rev' + n, sev: 'low', title: `มี ${n} ไม้ที่ปิดแล้วยังไม่ได้รีวิว`, sub: 'รีวิวไว้ ระบบจะสรุปนิสัยการเทรดให้', route: 'journal' });
    }

    return out.sort((a, b) => RANK[b.sev] - RANK[a.sev]);
  }
  window.computeAlerts = computeAlerts;

  function AlertBell({ go }) {
    const state = window.useStore();
    const settings = window.useSettings();
    const watchlist = window.useWatchlist();
    const [open, setOpen] = useState(false);
    const [earnings, setEarnings] = useState({});
    const ref = useRef(null);

    const openTickers = useMemo(() => [...new Set(state.trades
      .filter(t => (t.assetType || 'option') === 'option' && t.status === 'Opened')
      .map(t => (t.ticker || '').toUpperCase()).filter(Boolean))], [state.trades]);
    const quotes = useOpenQuotes(openTickers);

    useEffect(() => {
      if (!openTickers.length) return;
      const seed = {};
      if (window.earningsCached) openTickers.forEach(t => { const v = window.earningsCached(t); if (v && !(window.isEarnUnavail && window.isEarnUnavail(v))) seed[t] = v; });
      setEarnings(seed);
      let dead = false;
      if (window.fetchEarningsBatch) window.fetchEarningsBatch(openTickers).then(m => { if (!dead) setEarnings(m); });
      return () => { dead = true; };
    }, [openTickers.join(',')]);

    const alerts = useMemo(() => computeAlerts({ state, settings, watchlist, quotes, earnings }), [state, settings, watchlist, quotes, earnings]);
    const high = alerts.filter(a => a.sev === 'high').length;
    const notifyOn = !!settings.notifyOn;

    useEffect(() => {
      const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, []);

    // ส่ง notification บนเครื่อง (เฉพาะรายการใหม่ที่ยังไม่เคยส่งวันนี้)
    useEffect(() => {
      if (!notifyOn || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      let sent = {};
      try { const c = JSON.parse(localStorage.getItem('ozl_notified')); if (c && c.at === todayStr()) sent = c.ids || {}; } catch (e) {}
      const fresh = alerts.filter(a => a.sev !== 'low' && !sent[a.id]).slice(0, 3);
      if (!fresh.length) return;
      fresh.forEach(a => { try { new Notification('Fillbook · ' + a.title, { body: a.sub, icon: 'icon-192.png', tag: a.id }); } catch (e) {} });
      fresh.forEach(a => { sent[a.id] = 1; });
      try { localStorage.setItem('ozl_notified', JSON.stringify({ at: todayStr(), ids: sent })); } catch (e) {}
    }, [alerts, notifyOn]);

    const toggleNotify = async () => {
      if (notifyOn) { window.Store.setSettings({ notifyOn: false }); return; }
      if (typeof Notification === 'undefined') { alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน'); return; }
      let p = Notification.permission;
      if (p === 'default') p = await Notification.requestPermission();
      if (p !== 'granted') { alert('ต้องอนุญาตการแจ้งเตือนในเบราว์เซอร์ก่อน'); return; }
      window.Store.setSettings({ notifyOn: true });
      try { new Notification('Fillbook', { body: 'เปิดแจ้งเตือนแล้ว — จะเตือนเมื่อไม้ใกล้หมดอายุหรือราคาหลุด strike', icon: 'icon-192.png' }); } catch (e) {}
    };

    return (
      <div className="albell-wrap" ref={ref}>
        <button className={'albell' + (open ? ' on' : '')} onClick={() => setOpen(o => !o)} title="การแจ้งเตือน">
          <Icon name="bell" size={18} />
          {!!alerts.length && <span className="albell-b" style={{ background: high ? SEV.high : SEV.mid }}>{alerts.length > 9 ? '9+' : alerts.length}</span>}
        </button>
        {open && (
          <div className="alpanel">
            <div className="alpanel-h">
              <span>การแจ้งเตือน</span>
              <span className="faint num" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{alerts.length} รายการ</span>
            </div>
            <div className="alpanel-b">
              {alerts.length ? alerts.slice(0, 24).map(a => (
                <div key={a.id} className="alrow" onClick={() => { go(a.route); setOpen(false); }}>
                  <span className="aldot" style={{ background: SEV[a.sev] }} />
                  <div style={{ minWidth: 0 }}>
                    <div className="altitle">{a.title}</div>
                    <div className="alsub">{a.sub}</div>
                  </div>
                </div>
              )) : <div className="faint" style={{ padding: '18px 14px', fontSize: 12.5 }}>ไม่มีอะไรต้องจัดการ 👌</div>}
            </div>
            <button className="alnotify" onClick={toggleNotify}>
              <Icon name="bell" size={14} />
              <span>{notifyOn ? 'ปิดแจ้งเตือนบนเครื่อง' : 'เปิดแจ้งเตือนบนเครื่อง'}</span>
              <span className={'alsw' + (notifyOn ? ' on' : '')} />
            </button>
          </div>
        )}
      </div>
    );
  }

  window.AlertBell = AlertBell;
})();
