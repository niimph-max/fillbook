/* ============================================================
   calc.js — pure calculation engine for the trade log.
   Mirrors the spreadsheet formulas. P/L uses intuitive sign
   (profit = positive). Attaches helpers to window.TL.
   ============================================================ */
(function () {
  const LONG_STRATS = ['Buy Call', 'Buy Call (Leap)', 'Buy Put'];
  const LEAP_STRATS = ['Buy Call (Leap)'];
  // Strategies whose default direction is "sell to open" (credit)
  const SELL_DEFAULT = ['Sell Put', 'Sell Call', 'Bull Put Spread', 'Bear Call Spread'];

  // vertical spreads — fully-supported logging (2 strikes, net premium, ROR vs max loss)
  const VERTICAL_SPREADS = ['Bull Put Spread', 'Bear Call Spread', 'Bear Put Spread'];
  const CREDIT_SPREADS = ['Bull Put Spread', 'Bear Call Spread'];
  const isVerticalSpread = t => VERTICAL_SPREADS.includes(t && t.strategy);

  // Single-leg strategies plus legacy spread labels (carried over from OptionNLog).
  // Spreads are logged single-row for now; proper multi-leg logging can be added later.
  const STRATEGIES = [
    'Sell Put', 'Sell Call', 'Buy Call (Leap)', 'Buy Call', 'Buy Put',
    'Bull Put Spread', 'Bear Call Spread', 'Bear Put Spread',
    'Calendar Spread', 'Diagonal Spread', 'Synthetic Long'
  ];
  const STATUSES = ['Opened', 'Closed', 'Rolled', 'Pair'];
  const RESULTS = ['Win', 'Loss'];

  function parseD(s) { return s ? new Date(s + 'T00:00:00Z') : null; }
  function daysBetween(a, b) {
    const da = parseD(a), db = parseD(b);
    if (!da || !db) return null;
    return Math.round((db - da) / 86400000);
  }
  const dte = t => daysBetween(t.date, t.expiry);
  const daysHeld = t => daysBetween(t.date, t.closeDate);

  const isLong = t => LONG_STRATS.includes(t.strategy);
  const isLeap = t => LEAP_STRATS.includes(t.strategy);
  // counted in performance stats: Closed OR Rolled, with a result, not a Pair leg
  const isCounted = t => (t.status === 'Closed' || t.status === 'Rolled');
  const isRealized = t => isCounted(t) && (t.result === 'Win' || t.result === 'Loss');

  // P/L = ((exit - entry) * contracts * mult) + fee   (contracts signed: sells negative)
  // stock: mult = 1 (contracts holds signed share count); option: mult = 100
  function computePL(t) {
    if (t.exitPrice == null || t.entryPrice == null || t.contracts == null) return null;
    const fee = t.fee == null ? 0 : t.fee;
    if (t.assetType === 'stock') {
      return ((t.exitPrice - t.entryPrice) * t.contracts) + fee;
    }
    if ((t.strategy === 'Buy Call' || t.strategy === 'Buy Call (Leap)') && t.status === 'Opened') return null;
    return ((t.exitPrice - t.entryPrice) * t.contracts * 100) + fee;
  }
  // ROR — stock: pl / (entry*|shares|); long: pl / (entry*100*|c|); else pl / (strike*100*|c|)
  function computeROR(t, pl) {
    const p = pl == null ? t.pl : pl;
    if (p == null) return null;
    const c = Math.abs(t.contracts || 0);
    if (!c) return null;
    if (isVerticalSpread(t)) {
      const ml = spreadMaxLoss(t);
      if (ml && ml > 0) return p / ml;   // ROR vs capital at risk (standard for spreads)
    }
    let base;
    if (t.assetType === 'stock') base = t.entryPrice * c;
    else base = isLong(t) ? (t.entryPrice * 100 * c) : (t.strike * 100 * c);
    if (!base) return null;
    return p / base;
  }

  // ---- vertical-spread risk math (per-share net premium + strike width) ----
  function spreadWidth(t) {
    if (!t || t.strike == null || t.longStrike == null) return null;
    return Math.abs(t.strike - t.longStrike);
  }
  function spreadMaxLoss(t) {          // positive dollars at risk
    const w = spreadWidth(t); if (w == null || t.entryPrice == null) return null;
    const c = Math.abs(t.contracts || 0) || 1;
    const net = Math.abs(t.entryPrice);
    const perShare = CREDIT_SPREADS.includes(t.strategy) ? Math.max(0, w - net) : net;
    return perShare * 100 * c;
  }
  function spreadMaxProfit(t) {        // positive dollars best case
    const w = spreadWidth(t); if (w == null || t.entryPrice == null) return null;
    const c = Math.abs(t.contracts || 0) || 1;
    const net = Math.abs(t.entryPrice);
    const perShare = CREDIT_SPREADS.includes(t.strategy) ? net : Math.max(0, w - net);
    return perShare * 100 * c;
  }
  function annualizedROR(t, ror) {
    const r = ror == null ? t.ror : ror;
    const d = daysHeld(t);
    if (r == null || !d || d <= 0) return null;
    return r / d * 365;
  }
  // notional exposure for an open sold put
  function notional(t) {
    if (t.strategy === 'Sell Put' && t.status === 'Opened') return t.strike * Math.abs(t.contracts || 0) * 100;
    return null;
  }

  // unrealized P/L for an OPEN stock position with a current price
  function unrealized(t) {
    if ((t.assetType === 'stock') && t.status === 'Opened'
        && t.currentPrice != null && t.entryPrice != null && t.contracts != null)
      return (t.currentPrice - t.entryPrice) * t.contracts;
    return null;
  }

  function defaultContractSign(strategy) {
    return SELL_DEFAULT.includes(strategy) || strategy === 'Sell Put' || strategy === 'Sell Call' ? -1 : 1;
  }

  // ---- Aggregate performance metrics over a list of trades ----
  function metrics(trades) {
    const c = trades.filter(isRealized);
    const wins = c.filter(t => t.result === 'Win');
    const losses = c.filter(t => t.result === 'Loss');
    const sumWin = wins.reduce((s, t) => s + (t.pl || 0), 0);
    const sumLoss = losses.reduce((s, t) => s + (t.pl || 0), 0); // negative
    const net = c.reduce((s, t) => s + (t.pl || 0), 0);
    const decided = wins.length + losses.length;
    const winRate = decided ? wins.length / decided : 0;
    const profitFactor = sumLoss !== 0 ? sumWin / Math.abs(sumLoss) : (sumWin > 0 ? Infinity : 0);
    const avgWin = wins.length ? sumWin / wins.length : 0;
    const avgLoss = losses.length ? sumLoss / losses.length : 0;
    const expectancy = decided ? net / decided : 0;
    const rolled = trades.filter(t => t.status === 'Rolled').length;
    const opened = trades.filter(t => t.status === 'Opened').length;
    return {
      count: c.length, wins: wins.length, losses: losses.length, decided,
      net, sumWin, sumLoss, winRate, profitFactor, avgWin, avgLoss, expectancy,
      rolled, opened, totalTrades: trades.length
    };
  }

  // cumulative realized P/L series sorted by close (fallback entry) date
  function equityFromTrades(trades) {
    const c = trades.filter(isRealized)
      .slice()
      .sort((a, b) => (a.closeDate || a.date || '').localeCompare(b.closeDate || b.date || ''));
    let run = 0;
    return c.map(t => { run += (t.pl || 0); return { date: t.closeDate || t.date, value: run, pl: t.pl, t }; });
  }

  // max drawdown from a numeric series (array of {value, date})
  function maxDrawdown(series) {
    let peak = -Infinity, maxDD = 0, maxDDpct = 0, peakV = 0;
    let peakDate = null, troughDate = null, curPeakDate = null;
    for (const p of series) {
      const v = typeof p === 'number' ? p : p.value;
      const d = typeof p === 'number' ? null : p.date;
      if (v > peak) { peak = v; peakV = v; curPeakDate = d; }
      const dd = peak - v;
      if (dd > maxDD) { maxDD = dd; maxDDpct = peakV ? dd / peakV : 0; peakDate = curPeakDate; troughDate = d; }
    }
    return { abs: maxDD, pct: maxDDpct, peakDate, troughDate };
  }

  // group performance by a key (strategy / ticker)
  function groupBy(trades, key) {
    const map = {};
    for (const t of trades.filter(isRealized)) {
      const k = t[key] || '—';
      if (!map[k]) map[k] = [];
      map[k].push(t);
    }
    return Object.entries(map).map(([k, ts]) => {
      const wins = ts.filter(t => t.result === 'Win');
      const losses = ts.filter(t => t.result === 'Loss');
      const earned = wins.reduce((s, t) => s + (t.pl || 0), 0);
      const lost = losses.reduce((s, t) => s + (t.pl || 0), 0);
      return {
        key: k, trades: ts.length, wins: wins.length, losses: losses.length,
        winRate: ts.length ? wins.length / ts.length : 0,
        earned, lost, net: earned + lost, list: ts
      };
    }).sort((a, b) => b.net - a.net);
  }

  // ---- formatting ----
  // currency symbol per current portfolio ('USD' → $, 'THB' → ฿). Default $.
  function curSym() {
    try {
      const c = window.Store && window.Store.get ? window.Store.get().portfolio.currency : null;
      return c === 'THB' ? '฿' : '$';
    } catch (e) { return '$'; }
  }
  window.curSym = curSym;
  const fmtMoney = (v, dp = 0) => {
    if (v == null || isNaN(v)) return '—';
    const neg = v < 0;
    const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
    return (neg ? '-' : '') + curSym() + s;
  };
  const fmtMoneyP = (v, dp = 0) => { // signed with + for positive
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : v < 0 ? '-' : '') + curSym() + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  };
  const fmtPct = (v, dp = 1) => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(dp) + '%';
  const fmtPctP = (v, dp = 1) => (v == null || isNaN(v)) ? '—' : (v > 0 ? '+' : '') + (v * 100).toFixed(dp) + '%';
  const fmtNum = (v, dp = 2) => (v == null || isNaN(v)) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
  const fmtDate = (s) => {
    if (!s) return '—';
    const d = parseD(s); if (!d) return s;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', timeZone: 'UTC' });
  };
  const fmtDateShort = (s) => {
    if (!s) return '—';
    const d = parseD(s); if (!d) return s;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' });
  };

  // ISO week helpers
  function weekRange(dateStr) {
    const d = parseD(dateStr); if (!d) return null;
    const day = (d.getUTCDay() + 6) % 7; // Mon=0
    const start = new Date(d); start.setUTCDate(d.getUTCDate() - day);
    const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  }
  function isoWeek(dateStr) {
    const d = parseD(dateStr); if (!d) return null;
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const dayN = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dayN + 3);
    const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
    return week;
  }

  // ---- per-portfolio goal (Road to $X) ---- editable per user, stored on the portfolio
  const DEFAULT_GOAL = 100000;
  window.goalFor = function (pid) { return DEFAULT_GOAL; };
  window.currentGoal = function () {
    try {
      const p = window.Store && window.Store.get ? window.Store.get().portfolio : null;
      if (p && p.goal != null && +p.goal > 0) return +p.goal;
    } catch (e) {}
    return DEFAULT_GOAL;
  };
  window.fmtGoalFull = function (g) { return curSym() + g.toLocaleString('en-US'); };   // $50,000
  window.fmtGoalShort = function (g) {                                            // $50k
    return curSym() + (g % 1000 === 0 ? (g / 1000) + 'k' : g.toLocaleString('en-US'));
  };

  // ---- per-portfolio mission start (Road to $X tracking window) ----
  window.currentMissionStart = function () {
    try {
      const p = window.Store && window.Store.get ? window.Store.get().portfolio : null;
      if (p && p.missionStart) return p.missionStart;
      const d = window.Store && window.Store.get ? (window.Store.get().daily || []) : [];
      const dated = d.filter(x => x && x.date).map(x => x.date).sort();
      if (dated.length) return dated[0];
    } catch (e) {}
    return new Date().toISOString().slice(0, 10);
  };
  window.missionStartLabel = function () {
    const d = parseD(window.currentMissionStart());
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '';
  };

  // cumulative Time-Weighted Return from a daily NLV series (neutralises deposits/withdrawals)
  function cumulativeTWR(daily) {
    const d = daily.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    let twr = 1; let has = false;
    for (let i = 1; i < d.length; i++) {
      const prev = d[i - 1].nlv; const dep = d[i].deposit || 0;
      if (prev && prev !== 0 && d[i].nlv != null) { twr *= (d[i].nlv - dep) / prev; has = true; }
    }
    return has ? twr - 1 : null;
  }

  // ---- stock lot-ledger (average-cost) -------------------------------------
  // derive a position's held shares, avg cost, realized & unrealized P/L from
  // its chronological lots. Each sell realizes vs the running average cost.
  function derivePosition(pos) {
    let shares = 0, basis = 0, realized = 0, avg = 0;
    const lots = (pos.lots || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || '')).map(l => {
      const row = { ...l };
      if (l.type === 'sell') {
        row.lotRealized = (l.price - avg) * l.shares - (l.fee || 0);
        realized += row.lotRealized;
        basis -= avg * l.shares;
        shares -= l.shares;
      } else {
        basis += l.shares * l.price + (l.fee || 0);
        shares += l.shares;
        avg = shares ? basis / shares : 0;
        row.lotRealized = null;
      }
      row.avgAfter = avg;
      return row;
    });
    const cp = pos.currentPrice;
    const mv = cp != null ? shares * cp : null;
    const unreal = mv != null ? mv - Math.max(basis, 0) : null;
    return { ...pos, lots, shares, avg, basis: Math.max(basis, 0), realized,
      mv, unreal, unrealPct: basis ? (unreal != null ? unreal / basis : null) : null };
  }
  // aggregate a list of positions
  function positionsSummary(positions) {
    const rows = (positions || []).map(derivePosition);
    const held = rows.filter(r => r.shares > 1e-6);
    const cost = held.reduce((s, r) => s + r.basis, 0);
    const mv = held.reduce((s, r) => s + (r.mv != null ? r.mv : r.basis), 0);
    const unreal = held.reduce((s, r) => s + (r.unreal || 0), 0);
    const realized = rows.reduce((s, r) => s + r.realized, 0);
    return { rows, held, cost, mv, unreal, realized, unrealPct: cost ? unreal / cost : 0 };
  }

  window.TL = {
    STRATEGIES, STATUSES, RESULTS, LONG_STRATS, LEAP_STRATS,
    dte, daysHeld, isLong, isLeap, isCounted, isRealized,
    computePL, computeROR, annualizedROR, notional, unrealized, defaultContractSign,
    isVerticalSpread, spreadWidth, spreadMaxLoss, spreadMaxProfit, CREDIT_SPREADS, VERTICAL_SPREADS,
    metrics, equityFromTrades, maxDrawdown, groupBy, cumulativeTWR,
    derivePosition, positionsSummary,
    fmtMoney, fmtMoneyP, fmtPct, fmtPctP, fmtNum, fmtDate, fmtDateShort,
    weekRange, isoWeek, parseD, daysBetween
  };
})();
