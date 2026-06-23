/* ============================================================
   store.jsx — localStorage persistence (sellable build).
   ------------------------------------------------------------
   Single portfolio, local-only. Cloud sync is stubbed out
   (see the sb stub below) — wire a real per-user backend
   for production.
   ============================================================ */
(function () {
  // ---- plan / feature flag ----
  // Public release: everything unlocked, free for everyone. The Pro code paths
  // (gates, badges, trade-limit modal) are kept intact and dormant — flip IS_PRO
  // back to false the day a paid tier + sync go live.
  window.IS_PRO = true;           // everything unlocked (free-for-all release)
  window.FREE_TRADE_LIMIT = 50;   // (dormant) free-tier cap, ignored while IS_PRO

  // Backend is LIVE when Supabase is configured (js/supabase-config.js) and a
  // user is signed in — see Store.enableCloud below. Until then we run on a
  // harmless no-op stub so every sync call is safe and data lives in
  // localStorage only (local mode).
  const _res = (data) => Promise.resolve({ data: data || [], error: null });
  const _q = {
    select() { return this; }, order() { return _res([]); },
    upsert() { return _res(null); }, delete() { return this; }, eq() { return _res(null); },
  };
  const stubSb = { from() { return _q; } };
  let sb = stubSb;          // swapped to the real client by Store.enableCloud()
  let cloudOn = false;

  // Real Supabase wrapper: mirrors the stub's chaining shape but talks to the
  // live client. Per-user rows are isolated by RLS; the composite primary key
  // (user_id + id/date) needs an explicit onConflict target for upserts.
  function cloudSb(client) {
    return {
      from(table) {
        const onConflict = table === 'daily_nlv' ? 'user_id,date' : 'user_id,id';
        const qb = client.from(table);
        return {
          select(cols) { return qb.select(cols); },
          upsert(rows) { return qb.upsert(rows, { onConflict }); },
          delete() { return qb.delete(); },
        };
      },
    };
  }

  const LOCAL_KEY = 'ozl_app_v1';   // sellable build — isolated key, never collides with personal app
  const OLD_KEY   = '__ozl_none__';  // no legacy migration in sellable build

  const DEFAULT_PORTFOLIOS = [
    { id: 'p1', name: 'My Portfolio' },
  ];

  // ---- sync status ----
  let syncStatus = 'idle'; // idle | syncing | synced | error | offline
  const syncSubs = new Set();
  function setSyncStatus(s) { syncStatus = s; syncSubs.forEach(fn => fn(s)); }
  window.useSyncStatus = function () {
    const [s, setS] = React.useState(syncStatus);
    React.useEffect(() => { syncSubs.add(setS); return () => syncSubs.delete(setS); }, []);
    return s;
  };

  // ---- defaults ----
  function defaultStocks() {
    return [];
  }
  function emptySlice()  { return { trades: [], daily: [], leaps: [], stocks: [], portfolio: { totalDeposit: 0, cash: 0 } }; }
  function seedSlice() {
    const s = window.SEED || { trades: [], daily: [], leaps: [] };
    return {
      trades: s.trades.map(t => ({ ...t })),
      daily:  s.daily.map(d => ({ ...d })),
      leaps:  s.leaps.map(l => ({ ...l })),
      stocks: (s.stocks && s.stocks.length ? s.stocks : defaultStocks()),
      portfolio: s.portfolio || { totalDeposit: 0, cash: 0 },
    };
  }
  function ensureSlice(sl) {
    sl = sl || emptySlice();
    if (!sl.trades) sl.trades = [];
    if (!sl.daily)  sl.daily  = [];
    if (!sl.leaps)  sl.leaps  = [];
    if (!sl.stocks) sl.stocks = [];
    if (!sl.portfolio) sl.portfolio = { totalDeposit: 0, cash: 0 };
    return sl;
  }

  // ---- load root (with migration from otl_v1) ----
  function loadRoot() {
    try { const r = localStorage.getItem(LOCAL_KEY); if (r) { const root = JSON.parse(r); return normalizeRoot(root); } } catch {}
    // migrate single-portfolio data → p1
    let p1 = null;
    try { const old = localStorage.getItem(OLD_KEY); p1 = old ? JSON.parse(old) : null; } catch {}
    if (!p1) p1 = seedSlice();
    p1 = ensureSlice(p1);
    if (!p1.stocks.length) p1.stocks = defaultStocks();
    if (!p1.portfolio || (!p1.portfolio.totalDeposit && !p1.portfolio.cash)) p1.portfolio = p1.portfolio && p1.portfolio.totalDeposit ? p1.portfolio : { totalDeposit: 0, cash: 0 };
    return { current: 'p1', portfolios: DEFAULT_PORTFOLIOS.slice(), data: { p1 }, watchlist: [], settings: {} };
  }
  function normalizeRoot(root) {
    if (!root || !root.data) return loadRoot();
    root.portfolios = (root.portfolios && root.portfolios.length) ? root.portfolios : DEFAULT_PORTFOLIOS.slice();
    for (const p of root.portfolios) root.data[p.id] = ensureSlice(root.data[p.id]);
    if (!root.current || !root.data[root.current]) root.current = root.portfolios[0].id;
    if (!Array.isArray(root.watchlist)) root.watchlist = [];
    if (!root.settings || typeof root.settings !== 'object') root.settings = {};
    return root;
  }

  // ---- state ----
  let root  = loadRoot();
  let state = root.data[root.current];           // exposed: current portfolio's slice
  function curSlice() { return root.data[root.current]; }
  function setSlice(patch) {
    root = { ...root, data: { ...root.data, [root.current]: { ...root.data[root.current], ...patch } } };
    state = root.data[root.current];
  }
  function persist() { try { localStorage.setItem(LOCAL_KEY, JSON.stringify(root)); } catch {} }
  persist();

  function computeNextId() {
    let max = 0;
    for (const pid in root.data) {
      const d = root.data[pid];
      (d.trades || []).forEach(t => { if (t.id > max) max = t.id; });
      (d.leaps  || []).forEach(l => { if (l.id > max) max = l.id; });
      (d.stocks || []).forEach(s => { if (s.id > max) max = s.id; });
    }
    (root.watchlist || []).forEach(w => { if (w.id > max) max = w.id; });
    return max + 1;
  }
  let _id = computeNextId();
  const nextId = () => _id++;

  const subs = new Set();
  function notify() { persist(); subs.forEach(fn => fn()); }

  // ---- Supabase helpers ----
  async function sbUpsert(table, rows) {
    if (!rows.length) return;
    const chunk = 100;
    for (let i = 0; i < rows.length; i += chunk) {
      const { error } = await sb.from(table).upsert(rows.slice(i, i + chunk));
      if (error) throw error;
    }
  }
  async function sbLoad(table, orderCol) {
    const { data, error } = await sb.from(table).select('data').order(orderCol);
    if (error) throw error;
    return data.map(r => r.data);
  }
  const nowISO = () => new Date().toISOString();
  // daily_nlv PK is `date`; keep p1 bare (backward compat), prefix others.
  function dailyKey(pid, date) { return pid === 'p1' ? date : pid + '__' + date; }
  function metaKey(pid) { return '__meta__' + pid; }
  const WATCH_KEY = '__watchlist__';   // global watchlist rides in daily_nlv (shared across portfolios)

  // fire-and-forget writes
  function sbSave(table, row) {
    setSyncStatus('syncing');
    sb.from(table).upsert(row).then(({ error }) => {
      if (error) { console.error('Supabase write error:', error); setSyncStatus('error'); }
      else setSyncStatus('synced');
    });
  }
  function sbDel(table, col, val) {
    setSyncStatus('syncing');
    sb.from(table).delete().eq(col, val).then(({ error }) => {
      if (error) { console.error('Supabase delete error:', error); setSyncStatus('error'); }
      else setSyncStatus('synced');
    });
  }
  // portfolio meta + stocks ride in the daily_nlv table as a reserved __meta__<pid> row so they sync across devices
  function sbSaveMeta(pid) {
    const d = root.data[pid]; if (!d) return;
    sbSave('daily_nlv', { date: metaKey(pid), data: { __meta: true, portfolioId: pid, portfolio: d.portfolio, stocks: d.stocks }, updated_at: nowISO() });
  }
  // global watchlist (shared, not per-portfolio)
  function sbSaveWatchlist() {
    sbSave('daily_nlv', { date: WATCH_KEY, data: { __watchlist: true, items: root.watchlist || [], settings: root.settings || {} }, updated_at: nowISO() });
  }

  // ---- initial sync from Supabase ----
  async function uploadAll() {
    const tr = [], dl = [], lp = [];
    for (const pid in root.data) {
      const d = root.data[pid];
      (d.trades || []).forEach(t => tr.push({ id: t.id, data: { ...t, portfolioId: pid }, updated_at: nowISO() }));
      (d.daily  || []).forEach(x => dl.push({ date: dailyKey(pid, x.date), data: { ...x, portfolioId: pid }, updated_at: nowISO() }));
      (d.leaps  || []).forEach(l => lp.push({ id: l.id, data: { ...l, portfolioId: pid }, updated_at: nowISO() }));
      dl.push({ date: metaKey(pid), data: { __meta: true, portfolioId: pid, portfolio: d.portfolio, stocks: d.stocks }, updated_at: nowISO() });
    }
    dl.push({ date: WATCH_KEY, data: { __watchlist: true, items: root.watchlist || [], settings: root.settings || {} }, updated_at: nowISO() });
    await Promise.all([ sbUpsert('trades', tr), sbUpsert('daily_nlv', dl), sbUpsert('leaps', lp) ]);
  }

  async function initSync() {
    setSyncStatus('syncing');
    try {
      const [trades, daily, leaps] = await Promise.all([
        sbLoad('trades', 'id'),
        sbLoad('daily_nlv', 'date'),
        sbLoad('leaps', 'id'),
      ]);
      const cloudEmpty = !trades.length && !daily.length && !leaps.length;
      if (cloudEmpty) {
        await uploadAll();
        setSyncStatus('synced');
        return;
      }
      // partition cloud rows by portfolioId (legacy rows → p1); meta rows carry portfolio+stocks
      const byPid = {};
      const metaByPid = {};
      let cloudWatch = null;
      let cloudSettings = null;
      const bucket = (pid) => byPid[pid] || (byPid[pid] = { trades: [], daily: [], leaps: [] });
      trades.forEach(t => bucket(t.portfolioId || 'p1').trades.push(stripPid(t)));
      daily .forEach(d => {
        if (d && d.__watchlist) { cloudWatch = Array.isArray(d.items) ? d.items : []; if (d.settings) cloudSettings = d.settings; return; }
        if (d && d.__meta) { metaByPid[d.portfolioId || 'p1'] = d; return; }
        bucket(d.portfolioId || 'p1').daily.push(stripPid(d));
      });
      leaps .forEach(l => bucket(l.portfolioId || 'p1').leaps .push(stripPid(l)));

      const ids = new Set([...root.portfolios.map(p => p.id), ...Object.keys(byPid)]);
      const newData = { ...root.data };
      ids.forEach(pid => {
        const existing = ensureSlice(root.data[pid] ? { ...root.data[pid] } : null);
        const b = byPid[pid] || { trades: [], daily: [], leaps: [] };
        const meta = metaByPid[pid];
        newData[pid] = {
          trades: b.trades,
          daily:  b.daily.slice().filter(d => d && d.date).sort((a, b2) => a.date.localeCompare(b2.date)),
          leaps:  b.leaps,
          stocks: (meta && meta.stocks) ? meta.stocks : (existing.stocks.length ? existing.stocks : (pid === 'p1' ? defaultStocks() : [])),
          portfolio: (meta && meta.portfolio) ? meta.portfolio
            : ((existing.portfolio && (existing.portfolio.totalDeposit || existing.portfolio.cash))
            ? existing.portfolio
            : (pid === 'p1' ? { totalDeposit: 67000, cash: 38900 } : { totalDeposit: 0, cash: 0 })),
        };
      });
      // make sure any newly-seen pid is registered in the portfolio list
      const known = new Set(root.portfolios.map(p => p.id));
      const extraPortfolios = [...ids].filter(pid => !known.has(pid)).map(pid => ({ id: pid, name: pid }));

      root = { ...root, data: newData, portfolios: [...root.portfolios, ...extraPortfolios], watchlist: cloudWatch != null ? cloudWatch : (root.watchlist || []), settings: cloudSettings != null ? { ...(root.settings || {}), ...cloudSettings } : (root.settings || {}) };
      if (!root.data[root.current]) root.current = root.portfolios[0].id;
      state = curSlice();
      _id = computeNextId();
      notify();
      setSyncStatus('synced');
    } catch (e) {
      console.error('Supabase sync error:', e);
      setSyncStatus('error');
    }
  }
  function stripPid(o) { if (o && o.portfolioId !== undefined) { const { portfolioId, ...rest } = o; return rest; } return o; }

  // ---- Store API (operates on the CURRENT portfolio) ----
  const Store = {
    get() { return state; },
    getSyncStatus() { return syncStatus; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },

    // ---- portfolios ----
    getPortfolios() { return root.portfolios; },
    getCurrentPortfolio() { return root.current; },
    switchPortfolio(pid) {
      if (!root.data[pid] || pid === root.current) return;
      root = { ...root, current: pid };
      state = curSlice();
      notify();
    },
    renamePortfolio(pid, name) {
      root = { ...root, portfolios: root.portfolios.map(p => p.id === pid ? { ...p, name } : p) };
      notify();
    },

    // ---- watchlist (GLOBAL — shared across all portfolios, synced) ----
    getWatchlist() { return root.watchlist || []; },
    addWatch(item) {
      const w = { id: nextId(), createdAt: nowISO(), ...item };
      root = { ...root, watchlist: [...(root.watchlist || []), w] };
      notify(); sbSaveWatchlist();
      return w;
    },
    updateWatch(id, patch) {
      root = { ...root, watchlist: (root.watchlist || []).map(w => w.id === id ? { ...w, ...patch } : w) };
      notify(); sbSaveWatchlist();
    },
    deleteWatch(id) {
      root = { ...root, watchlist: (root.watchlist || []).filter(w => w.id !== id) };
      notify(); sbSaveWatchlist();
    },

    // ---- global settings (shared, synced) ----
    getSettings() { return root.settings || {}; },
    setSettings(patch) {
      root = { ...root, settings: { ...(root.settings || {}), ...patch } };
      notify(); sbSaveWatchlist();
    },

    // ---- trades ----
    addTrade(t) {
      const trade = { id: nextId(), ...t, portfolioId: root.current };
      setSlice({ trades: [trade, ...curSlice().trades] });
      notify();
      sbSave('trades', { id: trade.id, data: trade, updated_at: nowISO() });
      return trade;
    },
    updateTrade(id, patch) {
      setSlice({ trades: curSlice().trades.map(t => t.id === id ? { ...t, ...patch } : t) });
      notify();
      const updated = curSlice().trades.find(t => t.id === id);
      if (updated) sbSave('trades', { id: updated.id, data: { ...updated, portfolioId: root.current }, updated_at: nowISO() });
    },
    deleteTrade(id) {
      setSlice({ trades: curSlice().trades.filter(t => t.id !== id) });
      notify();
      sbDel('trades', 'id', id);
    },

    // ---- daily NLV ----
    upsertDaily(rec) {
      const slice = curSlice();
      const exists = slice.daily.find(d => d.date === rec.date);
      let portfolio = slice.portfolio;
      if (rec.deposit && !exists) {
        portfolio = { ...portfolio, totalDeposit: (portfolio.totalDeposit || 0) + rec.deposit };
      } else if (rec.deposit && exists && rec.deposit !== exists.deposit) {
        const diff = (rec.deposit || 0) - (exists.deposit || 0);
        portfolio = { ...portfolio, totalDeposit: (portfolio.totalDeposit || 0) + diff };
      }
      let daily = exists ? slice.daily.map(d => d.date === rec.date ? { ...d, ...rec } : d) : [...slice.daily, rec];
      daily = daily.filter(d => d && d.date);
      daily.sort((a, b) => a.date.localeCompare(b.date));
      setSlice({ daily, portfolio });
      notify();
      sbSave('daily_nlv', { date: dailyKey(root.current, rec.date), data: { ...rec, portfolioId: root.current }, updated_at: nowISO() });
      if (portfolio !== slice.portfolio) sbSaveMeta(root.current);
    },
    deleteDaily(date) {
      setSlice({ daily: curSlice().daily.filter(d => d.date !== date) });
      notify();
      sbDel('daily_nlv', 'date', dailyKey(root.current, date));
    },

    // ---- leaps ----
    addLeap(l) {
      const leap = { id: nextId(), ...l, portfolioId: root.current };
      setSlice({ leaps: [...curSlice().leaps, leap] });
      notify();
      sbSave('leaps', { id: leap.id, data: leap, updated_at: nowISO() });
      return leap;
    },
    updateLeap(id, patch) {
      setSlice({ leaps: curSlice().leaps.map(l => l.id === id ? { ...l, ...patch } : l) });
      notify();
      const updated = curSlice().leaps.find(l => l.id === id);
      if (updated) sbSave('leaps', { id: updated.id, data: { ...updated, portfolioId: root.current }, updated_at: nowISO() });
    },
    deleteLeap(id) {
      setSlice({ leaps: curSlice().leaps.filter(l => l.id !== id) });
      notify();
      sbDel('leaps', 'id', id);
    },

    // ---- stocks (local per-portfolio) ----
    addStock(s) {
      const stock = { id: nextId(), ...s };
      setSlice({ stocks: [...curSlice().stocks, stock] });
      notify(); sbSaveMeta(root.current); return stock;
    },
    updateStock(id, patch) {
      setSlice({ stocks: curSlice().stocks.map(s => s.id === id ? { ...s, ...patch } : s) });
      notify(); sbSaveMeta(root.current);
    },
    deleteStock(id) {
      setSlice({ stocks: curSlice().stocks.filter(s => s.id !== id) });
      notify(); sbSaveMeta(root.current);
    },
    updatePortfolio(patch) {
      setSlice({ portfolio: { ...curSlice().portfolio, ...patch } });
      notify(); sbSaveMeta(root.current);
    },

    resetToSeed() {
      const fresh = root.current === 'p1' ? seedSlice() : emptySlice();
      setSlice(fresh);
      _id = computeNextId();
      notify();
    },
    importState(obj) {
      const sl = ensureSlice({
        trades: obj.trades || [],
        daily:  obj.daily || [],
        leaps:  obj.leaps || [],
        stocks: obj.stocks || (root.current === 'p1' ? defaultStocks() : []),
        portfolio: obj.portfolio || { totalDeposit: 0, cash: 0 },
      });
      setSlice(sl);
      _id = computeNextId();
      notify();
    },

    async pullFromCloud() { await initSync(); },

    // ---- cloud on/off (called by the auth bootstrap once a session exists) ----
    isCloud() { return cloudOn; },
    enableCloud(client) {
      if (cloudOn) return;
      sb = cloudSb(client);
      cloudOn = true;
      setSyncStatus('syncing');
      initSync();
    },
    disableCloud() {
      sb = stubSb;
      cloudOn = false;
      setSyncStatus('idle');
    },
  };

  function useStore() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => Store.subscribe(force), []);
    return state;
  }
  // re-renders on portfolio switch / rename too
  function usePortfolios() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => Store.subscribe(force), []);
    return { list: root.portfolios, current: root.current };
  }
  // global watchlist hook
  function useWatchlist() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => Store.subscribe(force), []);
    return root.watchlist || [];
  }
  function useSettings() {
    const [, force] = React.useReducer(x => x + 1, 0);
    React.useEffect(() => Store.subscribe(force), []);
    return root.settings || {};
  }

  window.Store = Store;
  window.useStore = useStore;
  window.usePortfolios = usePortfolios;
  window.useWatchlist = useWatchlist;
  window.useSettings = useSettings;

  // ---- bootstrap: turn on cloud sync when signed in, else stay local ----
  function cloudBootstrap() {
    if (!window.OZLAuth) { return; }   // local mode — no backend configured
    window.OZLAuth.getSession().then(({ data }) => {
      if (data && data.session) Store.enableCloud(window.sbClient);
    }).catch((e) => console.error('session check failed', e));
    // react to login/logout that happens while the app is open
    window.OZLAuth.onChange((evt, session) => {
      if (session && !cloudOn) Store.enableCloud(window.sbClient);
      if (!session && cloudOn) Store.disableCloud();
    });
  }
  setTimeout(cloudBootstrap, 300);
})();
