/* ============================================================
   store.jsx — localStorage persistence (sellable build).
   ------------------------------------------------------------
   Single portfolio, local-only. Cloud sync is stubbed out
   (see the sb stub below) — wire a real per-user backend
   for production.
   ============================================================ */
(function () {
  // ---- plan / feature flag ----
  // Pro status is read per-user from profiles.is_pro (set manually in Supabase) and
  // controls the feature gates / badge / trade-limit — unchanged. Cloud sync, however,
  // is FREE for every signed-in account (see Store.enableCloud) and is NOT gated on Pro.
  window.IS_PRO = false;          // gated: flipped to true per-user from profiles.is_pro (set manually in Supabase)
  window.FREE_TRADE_LIMIT = 20;   // free-tier cap (enforced while IS_PRO is false)

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
  const OWNER_KEY = 'ozl_owner_uid'; // which signed-in user this browser's local cache belongs to (per-account isolation)
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
  function emptySlice()  { return { trades: [], daily: [], leaps: [], stocks: [], positions: [], portfolio: { totalDeposit: 0, cash: 0 } }; }

  // ---- positions (lot ledger) migration ------------------------------------
  // Build the new stock lot-ledger from legacy snapshot `stocks` + legacy
  // stock `trades` (assetType==='stock'). Non-destructive: legacy arrays kept.
  function migratePositions(sl) {
    if (sl.posMigrated) return sl;
    const byTicker = {};
    let pid = (Date.now() % 1e7) * 10;
    const ensurePos = (ticker, name, currentPrice) => {
      const k = (ticker || '?').toUpperCase();
      if (!byTicker[k]) byTicker[k] = { id: ++pid, ticker: k, name: name || '', currentPrice: currentPrice != null ? currentPrice : null, lots: [] };
      else { if (name && !byTicker[k].name) byTicker[k].name = name; if (currentPrice != null) byTicker[k].currentPrice = currentPrice; }
      return byTicker[k];
    };
    (sl.stocks || []).forEach(s => {
      const shares = s.shares || 0; if (!shares) return;
      const basis = s.costBasis != null ? s.costBasis : (s.costPrice || 0) * shares;
      const price = shares ? basis / shares : (s.costPrice || 0);
      const p = ensurePos(s.ticker, s.note, s.currentPrice);
      p.lots.push({ id: ++pid, date: s.date || '2024-01-01', type: 'buy', shares, price: +price.toFixed(4), fee: 0, tag: 'เก็บของ', conf: 3, note: 'ย้ายจากหุ้นที่ถือเดิม' });
    });
    (sl.trades || []).filter(t => (t.assetType || 'option') === 'stock').forEach(t => {
      const shares = Math.abs(t.contracts || 0); if (!shares) return;
      const p = ensurePos(t.ticker, null, t.currentPrice);
      const feeOpen = Math.abs(t.feeOpen != null ? t.feeOpen : (t.fee || 0) / (t.closeDate ? 2 : 1));
      p.lots.push({ id: ++pid, date: t.date, type: 'buy', shares, price: t.entryPrice || 0, fee: +feeOpen.toFixed(2), tag: 'ซื้อเพิ่ม', conf: 3, note: t.openNote || 'ย้ายจากตารางเทรด' });
      if ((t.status === 'Closed' || t.status === 'Rolled') && t.exitPrice != null) {
        const feeClose = Math.abs(t.feeClose != null ? t.feeClose : (t.fee || 0) / 2);
        p.lots.push({ id: ++pid, date: t.closeDate || t.date, type: 'sell', shares, price: t.exitPrice, fee: +feeClose.toFixed(2), tag: t.result === 'Loss' ? 'ตัดขาดทุน' : 'ทำกำไร', conf: 3, note: t.closeNote || 'ย้ายจากตารางเทรด' });
      }
    });
    Object.values(byTicker).forEach(p => p.lots.sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    sl.positions = Object.values(byTicker);
    sl.posMigrated = true;
    return sl;
  }
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
    if (!sl.positions) sl.positions = [];
    if (!sl.portfolio) sl.portfolio = { totalDeposit: 0, cash: 0 };
    migratePositions(sl);
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
      (d.positions || []).forEach(p => { if (p.id > max) max = p.id; (p.lots || []).forEach(l => { if (l.id > max) max = l.id; }); });
    }
    (root.watchlist || []).forEach(w => { if (w.id > max) max = w.id; });
    return max + 1;
  }
  let _id = computeNextId();
  const nextId = () => _id++;

  // ---- per-account isolation -------------------------------------------------
  // localStorage is shared by every account that signs in on the same browser.
  // To guarantee one account's data can never bleed into another's, we wipe the
  // local cache back to empty whenever we detect an account switch or a logout.
  function freshRoot() {
    return { current: 'p1', portfolios: DEFAULT_PORTFOLIOS.slice(), data: { p1: ensureSlice(emptySlice()) }, watchlist: [], settings: {} };
  }
  function resetLocalCache() {
    root = freshRoot();
    state = root.data[root.current];
    _id = computeNextId();
    notify();   // persists empty root + re-renders
  }

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
    const nm = (root.portfolios.find(p => p.id === pid) || {}).name;
    sbSave('daily_nlv', { date: metaKey(pid), data: { __meta: true, portfolioId: pid, name: nm, portfolio: d.portfolio, stocks: d.stocks, positions: d.positions }, updated_at: nowISO() });
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
      dl.push({ date: metaKey(pid), data: { __meta: true, portfolioId: pid, name: (root.portfolios.find(p => p.id === pid) || {}).name, portfolio: d.portfolio, stocks: d.stocks, positions: d.positions }, updated_at: nowISO() });
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
      // local rows the cloud doesn't have yet — kept (never overwritten) and re-uploaded below so nothing is lost
      const localOnly = { trades: [], daily: [], leaps: [] };
      const mergeKeep = (cloudArr, localArr, key, kind, pid) => {
        const have = new Set((cloudArr || []).map(r => r && r[key]));
        const extras = (localArr || []).filter(r => r && r[key] != null && !have.has(r[key]));
        extras.forEach(row => localOnly[kind].push({ pid, row }));
        return [...(cloudArr || []), ...extras];
      };
      ids.forEach(pid => {
        const existing = ensureSlice(root.data[pid] ? { ...root.data[pid] } : null);
        const b = byPid[pid] || { trades: [], daily: [], leaps: [] };
        const meta = metaByPid[pid];
        newData[pid] = ensureSlice({
          trades: mergeKeep(b.trades, existing.trades, 'id', 'trades', pid),
          daily:  mergeKeep(b.daily, existing.daily, 'date', 'daily', pid).filter(d => d && d.date).sort((a, b2) => a.date.localeCompare(b2.date)),
          leaps:  mergeKeep(b.leaps, existing.leaps, 'id', 'leaps', pid),
          stocks: (meta && meta.stocks) ? meta.stocks : (existing.stocks.length ? existing.stocks : (pid === 'p1' ? defaultStocks() : [])),
          positions: (meta && meta.positions) ? meta.positions : (existing.posMigrated ? existing.positions : []),
          posMigrated: !!(meta && meta.positions) || !!existing.posMigrated,
          portfolio: (meta && meta.portfolio) ? meta.portfolio
            : ((existing.portfolio && (existing.portfolio.totalDeposit || existing.portfolio.cash))
            ? existing.portfolio
            : (pid === 'p1' ? { totalDeposit: 67000, cash: 38900 } : { totalDeposit: 0, cash: 0 })),
        });
      });
      // make sure any newly-seen pid is registered in the portfolio list
      const metaName = (pid) => { const m = metaByPid[pid]; return (m && m.name) ? m.name : null; };
      const known = new Set(root.portfolios.map(p => p.id));
      const extraPortfolios = [...ids].filter(pid => !known.has(pid)).map(pid => ({ id: pid, name: metaName(pid) || pid }));
      // cloud meta now carries the portfolio name → it wins, so names match on every device
      const mergedPortfolios = [...root.portfolios.map(p => ({ ...p, name: metaName(p.id) || p.name })), ...extraPortfolios];

      root = { ...root, data: newData, portfolios: mergedPortfolios, watchlist: cloudWatch != null ? cloudWatch : (root.watchlist || []), settings: cloudSettings != null ? { ...(root.settings || {}), ...cloudSettings } : (root.settings || {}) };
      if (!root.data[root.current]) root.current = root.portfolios[0].id;
      state = curSlice();
      _id = computeNextId();
      // seed real portfolio names up to the cloud when the cloud meta has none yet
      // (first sync after this update — whichever device already knows the names publishes them)
      try {
        const GENERIC = new Set(['My Portfolio']);
        const seed = [];
        root.portfolios.forEach(p => {
          const meaningful = p.name && p.name !== p.id && !GENERIC.has(p.name);
          if (!metaName(p.id) && meaningful) {
            const d = root.data[p.id];
            seed.push({ date: metaKey(p.id), data: { __meta: true, portfolioId: p.id, name: p.name, portfolio: d.portfolio, stocks: d.stocks, positions: d.positions }, updated_at: nowISO() });
          }
        });
        if (seed.length) await sbUpsert('daily_nlv', seed);
      } catch (e) { console.error('seed portfolio names failed', e); }
      // re-upload any local-only rows so they persist on the cloud (prevents loss when logging in on a device that had unsynced local data)
      try {
        const upTr = localOnly.trades.map(({ pid, row }) => ({ id: row.id, data: { ...row, portfolioId: pid }, updated_at: nowISO() }));
        const upDl = localOnly.daily.map(({ pid, row }) => ({ date: dailyKey(pid, row.date), data: { ...row, portfolioId: pid }, updated_at: nowISO() }));
        const upLp = localOnly.leaps.map(({ pid, row }) => ({ id: row.id, data: { ...row, portfolioId: pid }, updated_at: nowISO() }));
        const ups = [];
        if (upTr.length) ups.push(sbUpsert('trades', upTr));
        if (upDl.length) ups.push(sbUpsert('daily_nlv', upDl));
        if (upLp.length) ups.push(sbUpsert('leaps', upLp));
        if (ups.length) await Promise.all(ups);
      } catch (e) { console.error('re-upload local-only rows failed', e); }
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
    __notifyLang() { subs.forEach(fn => fn()); },

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
      notify(); sbSaveMeta(pid);
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
      // reconcile totalDeposit by the change in this record's deposit.
      // handles add, edit to a new amount, AND clearing the deposit to 0/blank.
      const hasDepField = Object.prototype.hasOwnProperty.call(rec, 'deposit');
      const oldDep = exists ? (exists.deposit || 0) : 0;
      // if the patch doesn't carry a deposit field at all, keep the old value untouched
      const newDep = hasDepField ? (rec.deposit || 0) : oldDep;
      const depDelta = newDep - oldDep;
      if (depDelta !== 0) {
        portfolio = { ...portfolio, totalDeposit: Math.max(0, (portfolio.totalDeposit || 0) + depDelta) };
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
      const slice = curSlice();
      const rec = slice.daily.find(d => d.date === date);
      let portfolio = slice.portfolio;
      // a deleted record's deposit must be removed from totalDeposit too
      if (rec && rec.deposit) {
        portfolio = { ...portfolio, totalDeposit: Math.max(0, (portfolio.totalDeposit || 0) - rec.deposit) };
      }
      setSlice({ daily: slice.daily.filter(d => d.date !== date), portfolio });
      notify();
      sbDel('daily_nlv', 'date', dailyKey(root.current, date));
      if (portfolio !== slice.portfolio) sbSaveMeta(root.current);
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

    // ---- positions (stock lot ledger; synced via meta row) ----
    addPosition(p) {
      const pos = { id: nextId(), lots: [], ...p };
      setSlice({ positions: [...(curSlice().positions || []), pos] });
      notify(); sbSaveMeta(root.current); return pos;
    },
    updatePosition(id, patch) {
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === id ? { ...p, ...patch } : p) });
      notify(); sbSaveMeta(root.current);
    },
    deletePosition(id) {
      setSlice({ positions: (curSlice().positions || []).filter(p => p.id !== id) });
      notify(); sbSaveMeta(root.current);
    },
    addLot(posId, lot) {
      const l = { id: nextId(), ...lot };
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, lots: [...(p.lots || []), l] } : p) });
      notify(); sbSaveMeta(root.current); return l;
    },
    updateLot(posId, lotId, patch) {
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, lots: (p.lots || []).map(l => l.id === lotId ? { ...l, ...patch } : l) } : p) });
      notify(); sbSaveMeta(root.current);
    },
    deleteLot(posId, lotId) {
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, lots: (p.lots || []).filter(l => l.id !== lotId) } : p) });
      notify(); sbSaveMeta(root.current);
    },
    // ---- dividends (per-position log; record-only, no P/L impact; synced via meta) ----
    addDividend(posId, div) {
      const dv = { id: nextId(), ...div };
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, dividends: [...(p.dividends || []), dv] } : p) });
      notify(); sbSaveMeta(root.current); return dv;
    },
    updateDividend(posId, divId, patch) {
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, dividends: (p.dividends || []).map(d => d.id === divId ? { ...d, ...patch } : d) } : p) });
      notify(); sbSaveMeta(root.current);
    },
    deleteDividend(posId, divId) {
      setSlice({ positions: (curSlice().positions || []).map(p => p.id === posId ? { ...p, dividends: (p.dividends || []).filter(d => d.id !== divId) } : p) });
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
    // full multi-portfolio snapshot — every portfolio + watchlist + settings
    exportAll() {
      return { __full: true, version: 2, exportedAt: nowISO(), current: root.current,
        portfolios: root.portfolios, data: root.data, watchlist: root.watchlist || [], settings: root.settings || {} };
    },

    importState(obj) {
      const pushCloud = () => { if (cloudOn) { try { uploadAll().then(() => setSyncStatus('synced')).catch(() => {}); } catch (e) {} } };

      // ---- full multi-portfolio file → restore/merge EVERY portfolio ----
      if (obj && (obj.__full || (obj.portfolios && obj.data))) {
        const incoming = obj.data || {};
        const mergeRows = (existing, inc, key) => {
          const map = new Map();
          (existing || []).forEach(r => { if (r && r[key] != null) map.set(r[key], r); });
          (inc || []).forEach(r => { if (r && r[key] != null) map.set(r[key], r); }); // incoming wins on conflict
          return [...map.values()];
        };
        const newData = { ...root.data };
        Object.keys(incoming).forEach(pid => {
          const inc = ensureSlice(incoming[pid]);
          const ex  = root.data[pid] ? ensureSlice({ ...root.data[pid] }) : null;
          if (!ex) { newData[pid] = inc; return; }
          newData[pid] = ensureSlice({
            trades: mergeRows(ex.trades, inc.trades, 'id'),
            daily:  mergeRows(ex.daily, inc.daily, 'date').filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date)),
            leaps:  mergeRows(ex.leaps, inc.leaps, 'id'),
            stocks: (inc.stocks && inc.stocks.length) ? inc.stocks : ex.stocks,
            positions: inc.posMigrated ? inc.positions : ex.positions,
            posMigrated: inc.posMigrated || ex.posMigrated,
            portfolio: (inc.portfolio && (inc.portfolio.totalDeposit || inc.portfolio.cash)) ? inc.portfolio : ex.portfolio,
          });
        });
        const known = new Map(root.portfolios.map(p => [p.id, p]));
        (obj.portfolios || []).forEach(p => { if (p && p.id) known.set(p.id, { id: p.id, name: p.name || p.id }); });
        Object.keys(newData).forEach(pid => { if (!known.has(pid)) known.set(pid, { id: pid, name: pid }); });
        root = { ...root, data: newData, portfolios: [...known.values()] };
        if (Array.isArray(obj.watchlist)) root = { ...root, watchlist: obj.watchlist };
        if (obj.settings && typeof obj.settings === 'object') root = { ...root, settings: { ...(root.settings || {}), ...obj.settings } };
        if (!root.data[root.current]) root.current = root.portfolios[0].id;
        state = curSlice();
        _id = computeNextId();
        notify(); pushCloud();
        return;
      }

      // ---- legacy single-portfolio file → import into the current portfolio ----
      const sl = ensureSlice({
        trades: obj.trades || [],
        daily:  obj.daily || [],
        leaps:  obj.leaps || [],
        stocks: obj.stocks || (root.current === 'p1' ? defaultStocks() : []),
        positions: obj.positions || [],
        posMigrated: Array.isArray(obj.positions),
        portfolio: obj.portfolio || { totalDeposit: 0, cash: 0 },
      });
      setSlice(sl);
      if (Array.isArray(obj.watchlist)) root = { ...root, watchlist: obj.watchlist };
      if (obj.settings && typeof obj.settings === 'object') root = { ...root, settings: { ...(root.settings || {}), ...obj.settings } };
      _id = computeNextId();
      notify(); pushCloud();
    },

    async pullFromCloud() { await initSync(); },

    // ---- cloud on/off (called by the auth bootstrap once a session exists) ----
    isCloud() { return cloudOn; },
    enableCloud(client) {
      if (cloudOn) return;
      // Cloud sync is FREE for everyone signed in. Pro status is still read to drive
      // the feature gates / badge / trade-limit, but it does NOT gate sync anymore.
      try {
        client.auth.getUser().then(({ data }) => {
          const u = data && data.user; if (!u) { setSyncStatus('idle'); return; }
          // --- per-account isolation guard ---
          // localStorage is shared across accounts in the same browser. Treat the
          // local cache as trustworthy ONLY when it is explicitly stamped with THIS
          // user's id. If the stamp is missing (legacy/contaminated install) OR
          // belongs to a different user, wipe it BEFORE syncing so it can never
          // merge into — or upload into — this account. The account's real data is
          // pulled fresh from its own cloud by initSync right after.
          let _owner = null;
          try { _owner = localStorage.getItem(OWNER_KEY); } catch (e) {}
          if (_owner !== u.id) resetLocalCache();
          try { localStorage.setItem(OWNER_KEY, u.id); } catch (e) {}
          // ensure a profile row exists (insert-if-missing; never clobbers is_pro)
          client.from('profiles').upsert({ id: u.id, email: u.email || null }, { onConflict: 'id', ignoreDuplicates: true }).then(() => {});
          // turn on cloud sync for everyone (free), regardless of plan
          sb = cloudSb(client);
          cloudOn = true;
          setSyncStatus('syncing');
          initSync();              // pull + merge (uploads local data on first sync if cloud empty)
          // resolve plan for feature gates / badge only (does not affect sync)
          client.from('profiles').select('is_pro, plan, expires_at').eq('id', u.id).maybeSingle().then(({ data: p }) => {
            const active = !!(p && p.is_pro && (!p.expires_at || new Date(p.expires_at) > new Date()));
            window.IS_PRO = active;
            window.OZL_PLAN = active ? (p && p.plan ? p.plan : 'pro') : 'free';
            notify();
          }).catch(() => { notify(); });
          notify();
        }).catch(() => { setSyncStatus('idle'); });
      } catch (e) { setSyncStatus('idle'); }
    },
    disableCloud() {
      sb = stubSb;
      cloudOn = false;
      window.IS_PRO = false;
      window.OZL_PLAN = 'free';
      // clear the local cache on logout so the next account (or an anonymous
      // session) in this same browser never inherits the previous user's data.
      try { localStorage.removeItem(OWNER_KEY); } catch (e) {}
      resetLocalCache();
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
