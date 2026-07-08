/* ============================================================
   app.jsx — shell: nav, routing, theming, tweaks, data tools.
   ============================================================ */
(function () {
  const { useState, useEffect, useRef, useMemo } = React;
  const { Icon } = window;
  const { useTweaks, TweaksPanel, TweakSection, TweakColor, TweakRadio, TweakToggle, TweakButton } = window;
  // ──────────────────────────────────────────────────────────

  function PortfolioSwitcher({ compact } = {}) {
    const { list, current } = window.usePortfolios();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', h);
      return () => document.removeEventListener('mousedown', h);
    }, []);
    const cur = list.find(p => p.id === current) || list[0];
    return (
      <div className={'pf-switch' + (compact ? ' pf-switch-top' : '')} ref={ref}>
        <button className={'pf-current' + (open ? ' open' : '')} onClick={() => setOpen(o => !o)}>
          <span className="pf-avatar">{(cur.name || '?').slice(0, 1).toUpperCase()}</span>
          <div className="pf-meta">
            {!compact && <span className="pf-eyebrow">พอร์ตที่ใช้งาน</span>}
            <span className="pf-name">{cur.name}</span>
          </div>
          <svg className="pf-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>
        {open && (
          <div className="pf-menu">
            {list.map(p => (
              <button key={p.id} className={'pf-opt' + (p.id === current ? ' on' : '')} onClick={() => { window.Store.switchPortfolio(p.id); setOpen(false); }}>
                <span className="pf-avatar sm">{(p.name || '?').slice(0, 1).toUpperCase()}</span>
                <span className="pf-opt-name">{p.name}</span>
                {p.id === current && <svg className="pf-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  function SyncIndicator() {
    const s = window.useSyncStatus();
    const map = {
      idle:    { dot: '#5e6a7d', text: 'Local' },
      syncing: { dot: '#d8a229', text: 'กำลังบันทึก…' },
      synced:  { dot: '#26a269', text: 'บันทึกแล้ว' },
      error:   { dot: '#e5484d', text: 'Sync error ⚠️' },
    };
    const { dot, text } = map[s] || map.idle;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', fontSize: 11.5, color: 'var(--text-faint)', borderTop: '1px solid var(--border-soft)', marginTop: 4 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, boxShadow: s === 'syncing' ? `0 0 6px ${dot}` : 'none', transition: 'background .3s' }} />
        <span>{text}</span>
        {s === 'error' && <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 10.5, marginLeft: 'auto' }} onClick={() => window.Store.pullFromCloud()}>retry</button>}
      </div>
    );
  }

  // Account box — shows the signed-in email + logout. Only renders when cloud
  // accounts are configured (window.OZLAuth present); hidden in local mode.
  function AccountBox() {
    window.useStore(); // re-render when pro status resolves (notify)
    const [email, setEmail] = React.useState('');
    React.useEffect(() => {
      if (!window.OZLAuth) return;
      window.OZLAuth.getSession().then(({ data }) => {
        if (data && data.session && data.session.user) setEmail(data.session.user.email || '');
      });
    }, []);
    if (!window.OZLAuth) return null;
    const pro = !!window.IS_PRO;
    const logout = async () => {
      try { await window.OZLAuth.signOut(); } catch (e) {}
      try { localStorage.removeItem('ozl_app_v1'); } catch (e) {}   // clear local cache so the next account starts clean
      window.location.replace('login.html');
    };
    return (
      <div style={{ borderTop: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px', fontSize: 12, color: 'var(--text-dim)' }}>
          <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--accent-soft, #1d2433)', color: 'var(--accent-2, #6aa6ff)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(email[0] || '?').toUpperCase()}</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={email}>{email || '—'}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 5, letterSpacing: '.4px', flexShrink: 0, background: pro ? 'var(--accent-soft)' : 'var(--surface-3)', color: pro ? 'var(--accent-2)' : 'var(--text-faint)', border: '1px solid ' + (pro ? 'var(--accent-line)' : 'var(--border)') }}>{pro ? 'PRO' : 'FREE'}</span>
          <button className="btn btn-ghost btn-sm" style={{ padding: '3px 8px', fontSize: 10.5 }} onClick={logout}>ออก</button>
        </div>
        {!pro && <a href="upgrade.html" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, margin: '0 8px 8px', padding: '7px', borderRadius: 8, fontSize: 12, fontWeight: 600, color: '#fff', background: 'linear-gradient(180deg,var(--accent-2),var(--accent))', textDecoration: 'none' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11z"/></svg>อัปเกรดเป็น Pro</a>}
      </div>
    );
  }

  const ACCENTS = {
    blue: ['#3b82f6', '#6aa6ff'], gold: ['#d8a229', '#edc24f'],
    green: ['#1f9d62', '#37c684'], purple: ['#8b5cf6', '#a78bfa'],
  };
  // count of watchlist items with an active trade signal
  function WatchNavBadge() {
    const list = window.useWatchlist();
    const n = (window.WL && list) ? list.filter(w => window.WL.grade(w).active).length : 0;
    if (!n) return null;
    return <span className="nav-badge" style={{ background: '#1f9d62', color: '#0a0e14' }}>{n}</span>;
  }
  // open-app popup summarising fired signals + price alerts (shown once per session)
  function WatchAlerts({ go }) {
    const list = window.useWatchlist();
    const [show, setShow] = useState(false);
    const fired = useMemo(() => {
      if (!window.WL || !list) return [];
      return list.map(w => {
        const g = window.WL.grade(w);
        const pa = window.WL.priceAlerts(w);
        return (g.active || pa.length) ? { w, g, pa } : null;
      }).filter(Boolean).sort((a, b) => {
        const ra = a.g.g ? window.WL.GRADES[a.g.g].rank : 0;
        const rb = b.g.g ? window.WL.GRADES[b.g.g].rank : 0;
        return rb - ra;
      });
    }, [list]);
    useEffect(() => {
      if (!fired.length) return;
      const sig = fired.map(f => f.w.ticker + (f.g.g || '') + f.pa.map(a => a.kind).join('')).join('|');
      try { if (sessionStorage.getItem('wl_alert_seen') === sig) return; } catch {}
      const t = setTimeout(() => setShow(true), 900);
      return () => clearTimeout(t);
    }, [fired]);
    const dismiss = () => {
      const sig = fired.map(f => f.w.ticker + (f.g.g || '') + f.pa.map(a => a.kind).join('')).join('|');
      try { sessionStorage.setItem('wl_alert_seen', sig); } catch {}
      setShow(false);
    };
    if (!show || !fired.length) return null;
    return (
      <div className="wl-toast">
        <div className="wl-toast-head">
          <Icon name="flame" size={16} style={{ color: 'var(--accent-2)' }} />
          <span>สัญญาณ Watchlist · {fired.length}</span>
          <button className="wl-toast-x" onClick={dismiss}><Icon name="close" size={15} /></button>
        </div>
        <div className="wl-toast-body">
          {fired.slice(0, 6).map(f => (
            <div key={f.w.id} className="wl-toast-row" onClick={() => { go('watchlist'); dismiss(); }}>
              {f.g.g && <span className="wl-toast-grade" style={{ background: window.WL.GRADES[f.g.g].color }}>{f.g.g}</span>}
              <span className="tkr" style={{ fontSize: 13.5 }}>{f.w.ticker}</span>
              <span className="faint" style={{ fontSize: 11.5, marginLeft: 'auto', textAlign: 'right' }}>{f.g.active ? f.g.label : (f.pa[0] && f.pa[0].text)}</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { go('watchlist'); dismiss(); }}>ดู Watchlist ทั้งหมด →</button>
      </div>
    );
  }
  function hexToRgba(hex, a) {
    const h = hex.replace('#', ''); const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  const NAV = [
    { id: 'dashboard', label: 'Dashboard', short: 'ภาพรวม', th: 'ภาพรวมพอร์ต', icon: 'dashboard' },
    { id: 'stocks', label: 'หุ้น', short: 'หุ้น', th: 'บัญชีรายไม้ · ต้นทุนเฉลี่ย', icon: 'coins' },
    { id: 'trades', label: 'Options', short: 'Options', th: 'บันทึกเทรดออปชั่น', icon: 'trades' },
    { id: 'daily', label: 'Daily NLV', short: 'NLV', th: 'NLV รายวัน', icon: 'daily' },
    { id: 'summary', label: 'สรุปผลเทรด', short: 'สรุป', th: 'ตามกลยุทธ์/ticker', icon: 'summary' },
    { id: 'watchlist', label: 'Watchlist', short: 'จับตา', th: 'จับตา + แจ้งเตือน', icon: 'eye', pro: true },
    { id: 'weekly', label: 'Weekly', short: 'สัปดาห์', th: 'วิเคราะห์รายสัปดาห์ + LEAP', icon: 'weekly', pro: true },
  ];

  // Partner Fund (กองหุ้นส่วน) — shows ONLY on the Dad&Mom account.
  const FUND_NAV = { id: 'fund', label: 'หุ้นส่วน', short: 'หุ้นส่วน', th: 'กองกลาง · แบ่งกำไร', icon: 'wallet' };
  function isPartnerFundAccount(name) { return /dad|mom|singthong|สิงห์ทอง|พ่อ|แม่|ครอบครัว/i.test(String(name || '')); }

  // ---- Watchlist = owner-only (NOT part of the sellable product yet) ----
  // Only these signed-in emails see the Watchlist nav / page / signal alerts.
  // Everyone else: hidden entirely. When ready to release Watchlist to all
  // users, just return true from isWatchlistOwner() (or clear this gate).
  const WATCHLIST_OWNERS = [
    'niimph@gmail.com',   // ← TODO: ยืนยันอีเมลล็อกอินจริงของเจ้าของ
  ].map(s => s.toLowerCase());
  function isWatchlistOwner(email) { return !!email && WATCHLIST_OWNERS.indexOf(String(email).toLowerCase()) !== -1; }
  function useAuthEmail() {
    const [email, setEmail] = React.useState(null); // null = ยังโหลด session ไม่เสร็จ
    React.useEffect(() => {
      if (!window.OZLAuth) { setEmail(''); return; }
      window.OZLAuth.getSession().then(({ data }) => {
        setEmail((data && data.session && data.session.user && data.session.user.email) || '');
      }).catch(() => setEmail(''));
    }, []);
    return email;
  }

  // ลิงก์ feedback — เปิดอีเมลหาทีมงานพร้อมหัวข้อตั้งไว้ให้
  const FEEDBACK_EMAIL = 'optionzlog@gmail.com';
  const FEEDBACK_MAILTO = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent('[Fillbook] Feedback') + '&body=' + encodeURIComponent('บอกเราได้เลยว่าชอบ/ติดตรงไหน อยากได้อะไรเพิ่ม:\n\n');

  function MobileAccount() {
    if (!window.OZLAuth) return null;
    const logout = async () => {
      if (!confirm('ออกจากระบบ?')) return;
      try { await window.OZLAuth.signOut(); } catch (e) {}
      try { localStorage.removeItem('ozl_app_v1'); } catch (e) {}
      window.location.replace('login.html');
    };
    return <button className="btn btn-sm tb-acct" title="ออกจากระบบ" onClick={logout}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>ออก</button>;
  }

  const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
    "accent": "blue",
    "dashVariant": "Classic",
    "theme": "dark",
    "fontset": "plex"
  }/*EDITMODE-END*/;

  // Freemium gate — shows the feature blurred behind a Pro lock.
  function ProGate({ title, th, desc, children }) {
    const goPricing = () => { try { window.location.href = 'upgrade.html'; } catch (e) {} };
    return (
      <div style={{ position: 'relative', height: '100%', overflow: 'hidden' }}>
        <div style={{ filter: 'blur(7px) saturate(0.7)', opacity: 0.45, pointerEvents: 'none', userSelect: 'none', height: '100%', overflow: 'hidden' }} aria-hidden="true">
          {children}
        </div>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, background: 'radial-gradient(600px 320px at 50% 30%, rgba(59,130,246,0.12), transparent 70%)' }}>
          <div style={{ textAlign: 'center', maxWidth: 460, background: 'var(--surface, #11151d)', border: '1px solid var(--accent-line, rgba(59,130,246,0.42))', borderRadius: 20, padding: '40px 36px', boxShadow: '0 40px 90px -50px rgba(0,0,0,0.9)' }}>
            <div style={{ width: 64, height: 64, margin: '0 auto 20px', borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--accent-soft, rgba(59,130,246,0.14))', border: '1px solid var(--accent-line, rgba(59,130,246,0.42))' }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2, #60a5fa)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            </div>
            <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, letterSpacing: '0.6px', color: '#fff', background: 'linear-gradient(180deg,#60a5fa,#3b82f6)', borderRadius: 99, padding: '4px 13px', marginBottom: 16 }}>PRO</span>
            <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.4px', margin: '0 0 6px' }}>{title}</h2>
            <div style={{ color: 'var(--text-dim, #97a2b3)', fontSize: 14, marginBottom: 18 }}>{th}</div>
            <p style={{ color: 'var(--text-dim, #97a2b3)', fontSize: 14.5, lineHeight: 1.6, margin: '0 0 26px' }}>
              {desc || 'สรุปผลรายสัปดาห์อัตโนมัติ + ติดตามพอร์ต LEAP แบบเจาะลึก พร้อม WoW, unrealized P/L และข้อความสรุปพร้อมแชร์ — ปลดล็อกด้วยแพ็กเกจ Pro'}
            </p>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: 15.5 }} onClick={goPricing}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}><path d="M5 16L3 5l5.5 4L12 4l3.5 5L21 5l-2 11H5z"/></svg>
              อัปเกรดเป็น Pro
            </button>
          </div>
        </div>
      </div>
    );
  }

  function App() {
    const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
    const [route, setRoute] = useState(() => (location.hash || '').replace('#', '') || 'dashboard');
    const state = window.useStore();
    const T = window.TL;
    const [backupAt, setBackupAt] = useState(() => { try { return +localStorage.getItem('ozl_last_backup') || 0; } catch (e) { return 0; } });
    const [backupHidden, setBackupHidden] = useState(false);
    const authEmail = useAuthEmail();
    const wlOwner = isWatchlistOwner(authEmail);
    const curPid = window.Store.getCurrentPortfolio();
    const isPartnerAcct = isPartnerFundAccount((window.Store.getPortfolios().find(p => p.id === curPid) || {}).name);
    let navItems = wlOwner ? NAV : NAV.filter(n => n.id !== 'watchlist');
    if (isPartnerAcct) navItems = [...navItems, FUND_NAV];

    useEffect(() => { const h = () => setRoute((location.hash || '').replace('#', '') || 'dashboard'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
    const go = (id) => { location.hash = id; setRoute(id); };

    // apply theme + font + accent to :root
    useEffect(() => {
      const root = document.documentElement;
      root.setAttribute('data-theme', t.theme === 'light' ? 'light' : 'dark');
      root.setAttribute('data-font', t.fontset === 'sarabun' ? 'sarabun' : 'plex');
      const [a1, a2] = ACCENTS[t.accent] || ACCENTS.blue;
      root.style.setProperty('--accent', a1);
      root.style.setProperty('--accent-2', a2);
      root.style.setProperty('--accent-soft', hexToRgba(a1, t.theme === 'light' ? 0.12 : 0.16));
      root.style.setProperty('--accent-line', hexToRgba(a1, 0.42));
    }, [t.theme, t.fontset, t.accent]);

    const variant = 1; // Dashboard มีเลย์เอาต์เดียว (Classic)

    // topbar quick stats
    const daily = state.daily.slice().filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
    const lastNLV = daily.length ? daily[daily.length - 1].nlv : 0;
    const m = T.metrics(state.trades);
    const cur = navItems.find(n => n.id === route) || navItems[0];

    let Page = null;
    if (route === 'dashboard') Page = <window.DashboardPage variant={variant} />;
    else if (route === 'stocks') Page = <window.StocksPage />;
    else if (route === 'trades') Page = <window.TradesPage />;
    else if (route === 'daily') Page = <window.DailyPage />;
    else if (route === 'summary') Page = <window.SummaryPage />;
    else if (route === 'weekly') Page = window.IS_PRO ? <window.WeeklyPage /> : <ProGate title="Weekly Analysis + LEAP Tracker" th="วิเคราะห์รายสัปดาห์ + ติดตาม LEAP"><window.WeeklyPage /></ProGate>;
    else if (route === 'fund') Page = isPartnerAcct ? <window.FundPage /> : <window.DashboardPage variant={variant} />;
    else if (route === 'watchlist') Page = wlOwner ? <window.WatchlistPage /> : <window.DashboardPage variant={variant} />;
    else Page = <window.DashboardPage variant={variant} />;

    // data tools
    const exportData = () => {
      const dump = window.Store.exportAll();
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = 'option-trade-log-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
      URL.revokeObjectURL(url);
      try { localStorage.setItem('ozl_last_backup', String(Date.now())); } catch (e) {}
      setBackupAt(Date.now());
    };
    const importData = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
      inp.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { window.Store.importState(JSON.parse(r.result)); } catch (err) { alert('ไฟล์ไม่ถูกต้อง'); } }; r.readAsText(f); };
      inp.click();
    };

    return (
      <div className="app">
        <window.TickerChartHost />
        {wlOwner && <WatchAlerts go={go} />}
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" dangerouslySetInnerHTML={{ __html: '<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fbTm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f3c72"/><stop offset="1" stop-color="#0a0d13"/></linearGradient><linearGradient id="fbPm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#37c684"/><stop offset="1" stop-color="#1f9d62"/></linearGradient></defs><rect width="64" height="64" rx="15" fill="#0a0d13"/><rect width="64" height="64" rx="15" fill="url(#fbTm)"/><path d="M32 27 C27 23.8 20 23.8 16 25.7 L16 45 C20 43.1 27 43.1 32 46.3 Z" fill="#3b82f6"/><path d="M32 27 C37 23.8 44 23.8 48 25.7 L48 45 C44 43.1 37 43.1 32 46.3 Z" fill="#2b62b8"/><path d="M20 31.5 L28.5 30.2" stroke="#2a63b8" stroke-width="1.5" stroke-linecap="round"/><path d="M20 35 L27 33.9" stroke="#2a63b8" stroke-width="1.5" stroke-linecap="round"/><path d="M20 38.5 L28.5 37.3" stroke="#2a63b8" stroke-width="1.5" stroke-linecap="round"/><polyline points="35,39 38.5,36.5 41.5,38 46,32.5" fill="none" stroke="#37c684" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/><circle cx="46" cy="32.5" r="1.7" fill="#bdf0d4"/><g transform="rotate(40 35 39)"><rect x="31.7" y="13" width="6.4" height="19" rx="3.2" fill="url(#fbPm)"/><rect x="31.7" y="15.3" width="6.4" height="2.8" fill="#1f9d62"/><path d="M31.8 31.5 L38 31.5 L34.9 39 Z" fill="#bdf0d4"/><path d="M34 34.6 L35.8 34.6 L34.9 39 Z" fill="#0c3a25"/></g></svg>' }} />
            <div>
              <div className="brand-name">Fillbook</div>
              <div className="brand-sub">Trading Journal</div>
            </div>
          </div>
          <PortfolioSwitcher />
          {navItems.map(n => (
            <div key={n.id} className={'nav-item' + (route === n.id ? ' active' : '')} onClick={() => go(n.id)}>
              <Icon name={n.icon} size={18} className="nav-ic" />
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
                <span>{n.label}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-faint)', fontWeight: 400 }}>{n.th}</span>
              </div>
              {n.id === 'trades' && <span className="nav-badge">{state.trades.filter(t => (t.assetType || 'option') === 'option').length}</span>}
              {n.id === 'stocks' && <span className="nav-badge">{(state.positions || []).filter(p => (p.lots || []).length).length}</span>}
              {n.pro && !window.IS_PRO && <span className="pro-badge">PRO</span>}
              {n.id === 'watchlist' && <WatchNavBadge />}
            </div>
          ))}
          <div className="nav-spacer" />
          {state.trades.length > 0 && (Date.now() - backupAt > 14 * 864e5) && !backupHidden && (
            <div style={{ margin: '0 4px 8px', padding: '9px 10px', borderRadius: 8, background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', fontSize: 11.5, lineHeight: 1.5, color: 'var(--text-dim)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 600, color: 'var(--text)' }}><Icon name="download" size={13} />สำรองข้อมูลไว้หน่อยนะ</div>
              เก็บไฟล์ JSON ไว้กันเหนียว เผื่อกู้คืนภายหลัง
              <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
                <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={exportData}>ดาวน์โหลด</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setBackupHidden(true)}>ไว้ก่อน</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 6, padding: '0 4px 6px' }}>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={exportData} title="ส่งออกข้อมูล JSON"><Icon name="download" size={14} />Export</button>
            <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={importData} title="นำเข้าข้อมูล JSON"><Icon name="upload" size={14} />Import</button>
          </div>
          <button className="feedback-btn" onClick={() => { window.location.href = FEEDBACK_MAILTO; }} title={'ส่งความเห็นมาที่ ' + FEEDBACK_EMAIL}>
            <span style={{ fontSize: 15 }}>💬</span>
            <span>ส่ง Feedback</span>
            <span className="feedback-beta">BETA</span>
          </button>
          <a href="https://www.facebook.com/profile.php?id=61590917656007" target="_blank" rel="noopener" title="Fillbook บน Facebook"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', margin: '10px auto 2px', background: 'var(--surface-2)', border: '1px solid var(--border)', color: 'var(--text-dim)', transition: 'color .15s, border-color .15s' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa'; e.currentTarget.style.borderColor = 'var(--accent-line)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.69.24 2.69.24v2.97h-1.52c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07z"/></svg>
          </a>
          <SyncIndicator />
          <AccountBox />
      <div className="nav-foot">{window.OZLAuth ? '☁️ ซิงก์อัตโนมัติ' : '💾 บันทึกในเครื่อง'} · {state.trades.length} เทรด · {daily.length} วัน</div>
        </aside>

        <main className="main">
          <div className="topbar">
            <div>
              <div className="page-title">{cur.label} <span style={{ fontWeight: 400, color: 'var(--text-faint)', fontSize: 14 }}>· {cur.th}</span></div>
            </div>
            <PortfolioSwitcher compact />
            <MobileAccount />
            <div className="topbar-stats">
              <div className="tb-stat"><div className="l">NLV</div><div className="v num">{T.fmtMoney(lastNLV)}</div></div>
              <div className="tb-stat tb-hide"><div className="l">Net P/L</div><div className="v num" style={{ color: m.net >= 0 ? 'var(--pos-bright)' : 'var(--neg-bright)' }}>{T.fmtMoneyP(m.net)}</div></div>
              <div className="tb-stat tb-hide"><div className="l">Win</div><div className="v num">{T.fmtPct(m.winRate, 0)}</div></div>
            </div>
          </div>

          {Page}
        </main>

        {/* mobile bottom nav */}
        <nav className="mobile-nav">
          {navItems.map(n => (
            <div key={n.id} className={'mnav-item' + (route === n.id ? ' active' : '')} onClick={() => go(n.id)}>
              <Icon name={n.icon} size={21} className="nav-ic" />
              <span>{n.label}</span>
            </div>
          ))}
        </nav>

        <TweaksPanel>
          <TweakSection label="หน้าตา / Appearance" />
          <TweakColor label="สีเน้น (Accent)" value={ACCENTS[t.accent][0]}
            options={[ACCENTS.blue[0], ACCENTS.gold[0], ACCENTS.green[0], ACCENTS.purple[0]]}
            onChange={(v) => { const k = Object.keys(ACCENTS).find(key => ACCENTS[key][0] === v) || 'blue'; setTweak('accent', k); }} />
          <TweakToggle label="โหมดสว่าง (Light)" value={t.theme === 'light'} onChange={(v) => setTweak('theme', v ? 'light' : 'dark')} />
          <TweakRadio label="ฟอนต์" value={t.fontset} options={['plex', 'sarabun']} onChange={(v) => setTweak('fontset', v)} />
          <TweakSection label="ข้อมูล / Data" />
          <TweakButton label="รีเซ็ตเป็นข้อมูลตั้งต้น" onClick={() => { if (confirm('รีเซ็ตข้อมูลทั้งหมดกลับเป็นชุดที่นำเข้าจาก Excel?')) window.Store.resetToSeed(); }} />
        </TweaksPanel>
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
