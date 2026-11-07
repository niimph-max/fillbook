/* ============================================================
   plan.jsx — เช็คก่อนเทรด + คำนวณขนาดไม้ (position sizer)
   ------------------------------------------------------------
   กรอกไม้ที่ "กำลังจะ" เปิด → บอกทุนที่เสี่ยงจริง, % ของพอร์ต,
   ROR/ปี, และเช็กลิสต์ตามประเภทเทรด (js/checklist.js):
   CREDIT = กฎเดิม 9 ข้อ · DEBIT_SPREAD / LONG_OPTION = กฎใหม่ตาม spec v1.0
   + กฎกลางใหม่: กระจุกตัวรายธีม · เปิดธีมเดิมซ้ำใน 24 ชม.
   ยืนยัน = แผนออกครบ + มีข้อแดงต้องพิมพ์เหตุผล → บันทึกลง settings.plans
   Exports window.PlanPage
   ============================================================ */
(function () {
  const { useState, useEffect, useMemo } = React;
  const { Icon, Card, Field, Select, NumInput } = window;

  const SEV = { pass: '#37c684', warn: '#d8a229', fail: '#e5484d', info: 'var(--text-faint)', note: '#60a5fa' };   // note = ข้อมูล (ฟ้า) ไม่นับผ่าน/ไม่ผ่าน
  const todayStr = () => new Date().toISOString().slice(0, 10);

  // ---- ทุนที่เสี่ยงจริง (ดอลลาร์, บวก) ----------------------------------
  function riskOf(strategy, strike, prem, width, n) {
    const T = window.TL, c = Math.max(1, Math.abs(+n || 1));
    const p = Math.abs(+prem || 0), k = +strike || 0, w = Math.abs(+width || 0);
    if (T.TIME_SPREADS.includes(strategy)) return p * 100 * c;
    if (T.CREDIT_SPREADS.includes(strategy)) return w ? Math.max(0, w - p) * 100 * c : null;
    if (strategy === 'Bear Put Spread' || strategy === 'Bull Call Spread') return p * 100 * c;   // debit vertical = จ่ายสุทธิ
    if (T.LONG_STRATS.includes(strategy) || strategy === 'Synthetic Long') return p * 100 * c;
    if (strategy === 'Sell Put') return k ? Math.max(0, (k - p)) * 100 * c : null;
    if (strategy === 'Sell Call') return null;      // naked call = เสี่ยงไม่จำกัด
    return null;
  }
  function maxProfitOf(strategy, prem, width, n) {
    const T = window.TL, c = Math.max(1, Math.abs(+n || 1));
    const p = Math.abs(+prem || 0), w = Math.abs(+width || 0);
    if (T.CREDIT_SPREADS.includes(strategy) || strategy === 'Sell Put' || strategy === 'Sell Call') return p * 100 * c;
    if (strategy === 'Bear Put Spread' || strategy === 'Bull Call Spread') return w ? Math.max(0, w - p) * 100 * c : null;
    return null;                                     // long / calendar = เปิดปลาย
  }
  // ทุนเสี่ยงของไม้ที่เปิดอยู่แล้ว (ใช้เช็กกระจุกตัว)
  function riskOfTrade(t) {
    return riskOf(t.strategy, t.strike, t.entryPrice, t.longStrike != null && t.strike != null ? Math.abs(t.strike - t.longStrike) : null, t.contracts);
  }
  window.PlanRisk = { riskOf, maxProfitOf, riskOfTrade };

  function CheckRow({ c }) {
    return (
      <div className="pchk" data-sev={c.sev} style={{ borderColor: c.sev === 'fail' ? 'rgba(229,72,77,.4)' : c.sev === 'warn' ? 'rgba(216,162,41,.38)' : c.sev === 'note' ? 'rgba(96,165,250,.35)' : 'var(--border-soft)' }}>
        <span className="pchk-dot" style={{ background: SEV[c.sev] }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="pchk-l">{c.label}</div>
          <div className="pchk-s">{c.detail}</div>
        </div>
        <span className="pchk-v num" style={{ color: SEV[c.sev] }}>{c.value || ''}</span>
      </div>
    );
  }

  const FIELD_DEFAULTS = { longStrike: null, bid: null, ask: null, ivr: null, ivp: null, spot: null, delta: null,
    stopValuePct: null, invalidation: null, earnPlan: '', reviewDte: null, thesis: '', typeOverride: null, redReason: '' };
  // ค่าเริ่มต้นของแผนออกตามประเภทเทรด
  function exitDefaults(type, S) {
    if (type === 'DEBIT_SPREAD') return { targetPct: S.debit.profitTargetPct, stopValuePct: S.debit.stopValuePct, reviewDte: S.debit.reviewAtDte };
    if (type === 'LONG_OPTION') return { targetPct: S.longOpt.profitTargetPct, stopValuePct: S.longOpt.stopValuePct };
    return { targetPct: 50, stopMult: 2, closeDte: 21 };
  }

  function PlanPage() {
    const state = window.useStore();
    const settings = window.useSettings();
    const wl = window.useWatchlist();
    const T = window.TL;
    const C = window.FBChecklist;
    const CS = C.merge(settings.checklist);

    const maxPct = settings.planRiskPct != null ? settings.planRiskPct : 15;
    const maxTickerPct = settings.planTickerPct != null ? settings.planTickerPct : 30;
    const minIVR = settings.planMinIVR != null ? settings.planMinIVR : 30;

    const [f, setF] = useState({ ticker: '', strategy: 'Sell Put', strike: null, expiry: '', premium: null, width: null, qty: 1, targetPct: 50, stopMult: 2, closeDte: 21, ...FIELD_DEFAULTS });
    const set = (k, v) => setF(s => {
      const n = { ...s, [k]: v };
      // เปลี่ยนกลยุทธ์/ประเภท → ใส่ค่าเริ่มต้นของแผนออกตามประเภทใหม่
      if (k === 'strategy') { n.typeOverride = null; Object.assign(n, exitDefaults(C.classify(v), CS)); }
      if (k === 'typeOverride') Object.assign(n, exitDefaults(v || C.classify(n.strategy), CS));
      return n;
    });
    const [earn, setEarn] = useState(null);
    const [saved, setSaved] = useState(false);
    const [themeText, setThemeText] = useState(null);

    // ---- งบของ ticker นี้ (cache ก่อน แล้วยิงถามจริง) ----
    useEffect(() => {
      const sym = (f.ticker || '').toUpperCase().trim();
      if (!sym) { setEarn(null); return; }
      setEarn(window.earningsCached ? window.earningsCached(sym) : null);
      let dead = false;
      const t = setTimeout(() => {
        if (window.fetchEarnings) window.fetchEarnings(sym).then(v => { if (!dead) setEarn(v); });
      }, 500);
      return () => { dead = true; clearTimeout(t); };
    }, [f.ticker]);

    // ---- ประเภทเทรด ----
    const autoType = C.classify(f.strategy);
    const type = f.typeOverride || autoType;
    const overridden = !!(f.typeOverride && f.typeOverride !== autoType);
    const isNewType = type === 'DEBIT_SPREAD' || type === 'LONG_OPTION';

    // ราคาหุ้น: ดึงสดเมื่อเปลี่ยน ticker (เฉพาะประเภทที่ต้องใช้) · แก้เองได้
    useEffect(() => {
      const sym = (f.ticker || '').toUpperCase().trim();
      if (!sym || !isNewType || !window.fetchQuote) return;
      let dead = false;
      const t = setTimeout(() => window.fetchQuote(sym).then(q => { if (!dead && q && q.c != null) setF(s => (s.spot == null || s._spotAuto) ? { ...s, spot: +q.c, _spotAuto: true } : s); }), 600);
      return () => { dead = true; clearTimeout(t); };
    }, [f.ticker, isNewType]);

    // ---- ตัวเลขพื้นฐาน ----
    const daily = state.daily.filter(d => d && d.date).sort((a, b) => a.date.localeCompare(b.date));
    const nlv = daily.length ? (daily[daily.length - 1].nlv || 0) : 0;
    const cash = (state.portfolio && state.portfolio.cash) || 0;
    const n = Math.max(1, Math.abs(+f.qty || 1));
    const isMulti = T.MULTI_LEG.includes(f.strategy);
    const needWidth = T.VERTICAL_SPREADS.includes(f.strategy);
    // vertical: กรอก strike ทั้งสองขา → ความกว้างคำนวณให้ (แผนเก่าที่มีแค่ width ยังใช้ได้)
    const widthEff = (needWidth && f.strike != null && f.longStrike != null) ? Math.abs((+f.strike) - (+f.longStrike)) : f.width;
    const dte = f.expiry ? T.daysBetween(todayStr(), f.expiry) : null;
    const wlRow = wl.find(x => (x.ticker || '').toUpperCase() === (f.ticker || '').toUpperCase().trim());
    const ivrIn = f.ivr != null ? f.ivr : (wlRow && wlRow.ivr != null ? wlRow.ivr : null);
    const m = C.metrics(type, { ...f, width: widthEff, ivr: ivrIn }, dte);
    const premEff = isNewType && m.limit != null ? m.limit : f.premium;
    const risk = isNewType ? m.maxLoss : riskOf(f.strategy, f.strike, f.premium, widthEff, n);
    const risk1 = isNewType ? (m.limit != null ? m.limit * 100 : null) : riskOf(f.strategy, f.strike, f.premium, widthEff, 1);
    const maxProfit = isNewType ? m.maxProfit : maxProfitOf(f.strategy, f.premium, widthEff, n);
    const credit = Math.abs(+premEff || 0) * 100 * n;
    const ror = (maxProfit != null && risk) ? maxProfit / risk : null;
    const annRor = (ror != null && dte && dte > 0) ? ror / dte * 365 : null;
    const riskPct = (risk != null && nlv) ? risk / nlv * 100 : null;
    const budget = nlv ? nlv * maxPct / 100 : 0;
    const suggested = (risk1 && budget) ? Math.floor(budget / risk1) : null;

    const sym = (f.ticker || '').toUpperCase().trim();
    const openOpts = state.trades.filter(t => (t.assetType || 'option') === 'option' && t.status === 'Opened');
    const openSame = openOpts.filter(t => (t.ticker || '').toUpperCase() === sym);
    const openTickerRisk = openSame.reduce((s, t) => s + (riskOfTrade(t) || 0), 0);
    const tickerPct = nlv ? (openTickerRisk + (risk || 0)) / nlv * 100 : null;
    const w = wl.find(x => (x.ticker || '').toUpperCase() === sym);
    const macro = (f.expiry && window.macroBetween) ? window.macroBetween(todayStr(), f.expiry) : [];
    const earnBefore = !!(earn && f.expiry && earn.date >= todayStr() && earn.date <= f.expiry);
    const earnUnknown = !!(window.isEarnUnavail && window.isEarnUnavail(earn));
    const isSelling = ['Sell Put', 'Sell Call'].includes(f.strategy) || T.CREDIT_SPREADS.includes(f.strategy);

    // ทุก position ที่เปิดอยู่ (ออปชั่น + หุ้นที่ถือ) สำหรับกระจุกตัวรายธีม
    const themePositions = useMemo(() => {
      const opts = openOpts.map(t => ({ ticker: t.ticker, risk: riskOfTrade(t) }));
      const stocks = (T.positionsSummary ? T.positionsSummary(state.positions).held : []).map(r => ({ ticker: r.ticker, risk: r.basis }));
      return [...opts, ...stocks];
    }, [state.trades, state.positions]);
    // ไม้ที่เปิดวันนี้/เมื่อวาน (แอปเก็บแค่วันที่ — "24 ชม." จึงนับเป็น 2 วันล่าสุด)
    const yesterday = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    const recentOpens = state.trades.filter(t => t.date && t.date >= yesterday && (t.ticker || '').toUpperCase() !== sym).map(t => ({ ticker: t.ticker, date: t.date }));

    const exitMissing = C.exitRequired(type, f, { earnInLife: earnBefore });
    const exitPx = C.exitPrices(type, m, f);

    // ---- เช็กลิสต์ ----
    const checks = useMemo(() => {
      const out = [];
      const push = (label, sev, detail, value) => out.push({ label, sev, detail, value });
      const pushAll = rows => rows.forEach(r => out.push(r));
      const theme = () => pushAll(C.themeChecks(sym, risk, nlv, themePositions, recentOpens, CS, x => T.fmtMoney(x)));
      const macroRow = () => {
        if (!f.expiry) push('อีเวนต์มหภาค', 'info', 'เลือกวันหมดอายุเพื่อเช็ก FOMC / CPI', '—');
        else if (!macro.length) push('อีเวนต์มหภาค', 'pass', 'ไม่มี FOMC / CPI ก่อนหมดอายุ', 'เคลียร์');
        else push('อีเวนต์มหภาค', 'warn', macro.slice(0, 3).map(e => `${e.kind} ${T.fmtDateShort(e.date)}${e.est ? '~' : ''}`).join(' · '), macro.length + ' อีเวนต์');
      };

      if (f.strategy === 'Sell Call') push('ขนาดไม้ vs พอร์ต', 'fail', 'Naked call ขาดทุนได้ไม่จำกัด — ควรใช้ Bear Call Spread แทน', 'ไม่จำกัด');
      else if (risk == null) push('ขนาดไม้ vs พอร์ต', 'info', needWidth ? 'ใส่ strike ทั้งสองขาเพื่อคำนวณทุนเสี่ยง' : 'กรอกข้อมูลให้ครบก่อน', '—');
      else if (!nlv) push('ขนาดไม้ vs พอร์ต', 'info', 'ยังไม่มี NLV ในหน้า Daily — บันทึกก่อนเพื่อเช็กสัดส่วน', '—');
      else push('ขนาดไม้ vs พอร์ต', riskPct > maxPct ? 'fail' : riskPct > maxPct * 0.75 ? 'warn' : 'pass',
        `ทุนเสี่ยง ${T.fmtMoney(risk)} จาก NLV ${T.fmtMoney(nlv)} · เพดานที่ตั้งไว้ ${maxPct}%`, riskPct.toFixed(1) + '%');

      if (sym && nlv && risk != null) push('กระจุกตัวใน ' + sym,
        tickerPct > maxTickerPct ? 'fail' : tickerPct > maxTickerPct * 0.7 ? 'warn' : 'pass',
        openSame.length ? `เปิดอยู่แล้ว ${openSame.length} ไม้ (${T.fmtMoney(openTickerRisk)}) + ไม้นี้` : 'ยังไม่มีไม้เปิดในตัวนี้',
        tickerPct.toFixed(1) + '%');
      theme();

      // ---- DEBIT_SPREAD / LONG_OPTION / UNKNOWN: กฎใหม่ตาม spec ----
      if (type !== 'CREDIT') {
        pushAll(C.typeChecks(type, m, { dte, ivr: ivrIn, ivp: f.ivp, delta: f.delta, earnDate: earn && earn.date, earnInLife: earnBefore, earnUnknown,
          earnWithinWindow: days => !!(earn && earn.date && earn.date >= todayStr() && T.daysBetween(todayStr(), earn.date) <= days),
          fmtMoney: x => T.fmtMoney(x), fmtDate: d => T.fmtDate(d), fmtDateShort: d => T.fmtDateShort(d) }, CS));
        macroRow();
        push('แผนออกก่อนเข้า', exitMissing.length ? 'fail' : 'pass',
          exitMissing.length ? 'ยังขาด: ' + exitMissing.join(' · ') : 'กรอกครบทุกช่องที่บังคับ', exitMissing.length ? 'ยังไม่ครบ' : 'ครบ');
        return out;
      }

      // ---- CREDIT: กฎเดิมทุกข้อ (ห้ามเปลี่ยนผล) ----
      if (dte == null) push('DTE', 'info', 'เลือกวันหมดอายุ', '—');
      else if (dte <= 0) push('DTE', 'fail', 'วันหมดอายุอยู่ในอดีต', dte + 'd');
      else if (dte < 14) push('DTE', 'warn', 'สั้นมาก — แกมมาแรง ราคาแกว่งกระทบพอร์ตเร็ว', dte + 'd');
      else if (dte > 75) push('DTE', 'warn', 'ยาวเกิน — เงินจมนาน theta เก็บได้ช้า', dte + 'd');
      else push('DTE', 'pass', 'อยู่ในช่วง 14–75 วัน ที่ theta ทำงานคุ้ม', dte + 'd');

      if (!sym) push('ประกาศงบ', 'info', 'ใส่ ticker เพื่อเช็กวันประกาศงบ', '—');
      else if (earnUnknown) push('ประกาศงบ', 'warn', 'ยังตรวจงบไม่ได้ — ต้อง deploy Edge Function `quote` เวอร์ชันใหม่ก่อน (รองรับ kind:"earnings")', 'ตรวจไม่ได้');
      else if (!earn) push('ประกาศงบ', 'pass', 'ไม่พบวันประกาศงบในช่วงนี้', 'เคลียร์');
      else if (earnBefore) push('ประกาศงบ', 'fail', `${sym} ประกาศงบ ${T.fmtDate(earn.date)} ก่อนหมดอายุ — IV จะยุบและราคาเด้งแรง`, T.fmtDateShort(earn.date));
      else push('ประกาศงบ', 'pass', `งบรอบถัดไป ${T.fmtDate(earn.date)} (หลังหมดอายุ)`, T.fmtDateShort(earn.date));

      macroRow();

      if (isSelling) {
        if (!w || w.ivr == null) push('IV Rank', 'info', w ? `${sym} อยู่ใน Watchlist แต่ยังไม่ได้กรอก IVR` : 'เพิ่ม ' + (sym || 'ตัวนี้') + ' ใน Watchlist แล้วกรอก IVR', '—');
        else push('IV Rank', w.ivr < minIVR ? 'warn' : 'pass',
          w.ivr < minIVR ? `IVR ต่ำกว่า ${minIVR} — พรีเมียมถูก ขายไม่คุ้มความเสี่ยง` : 'พรีเมียมแพงพอที่จะขาย', Math.round(w.ivr));
      }

      const pr = Math.abs(+f.premium || 0);
      if (!pr) push('พรีเมียม', 'info', 'กรอกพรีเมียมต่อหุ้น', '—');
      else if (pr < 0.25 && isSelling) push('พรีเมียม', 'warn', 'ต่ำกว่า $0.25 — ค่าธรรมเนียมกินกำไรเกือบหมด', '$' + pr.toFixed(2));
      else push('พรีเมียม', 'pass', `รับ/จ่ายรวม ${T.fmtMoney(credit)} (${n} สัญญา)`, '$' + pr.toFixed(2));

      if (f.strategy === 'Sell Put' && risk != null) {
        push('เงินสดรองรับ', cash >= risk ? 'pass' : 'warn',
          cash >= risk ? `มีเงินสด ${T.fmtMoney(cash)} พอรับหุ้นถ้าถูก assign` : `เงินสด ${T.fmtMoney(cash)} ไม่พอรับหุ้น — ต้องใช้มาร์จิ้น`, T.fmtMoney(cash));
      }

      if (annRor == null) push('ผลตอบแทน/ปี', 'info', 'ต้องมีทุนเสี่ยง + DTE ก่อน', '—');
      else push('ผลตอบแทน/ปี', annRor < 0.15 ? 'warn' : 'pass',
        `กำไรสูงสุด ${T.fmtMoney(maxProfit)} · ROR ${T.fmtPct(ror)} ใน ${dte} วัน`, T.fmtPct(annRor, 0));

      push('แผนออกก่อนเข้า', (f.targetPct && f.closeDte) ? 'pass' : 'warn',
        `ปิดที่กำไร ${f.targetPct || '—'}% · ตัดขาดทุนที่ ${f.stopMult || '—'}× พรีเมียม · ปิดเมื่อเหลือ ${f.closeDte || '—'} DTE`,
        (f.targetPct && f.closeDte) ? 'ตั้งแล้ว' : 'ยังไม่ตั้ง');
      return out;
    }, [f, type, risk, riskPct, tickerPct, dte, earn, macro.length, w, nlv, cash, annRor, themePositions, recentOpens.length, JSON.stringify(CS)]);

    const fails = checks.filter(c => c.sev === 'fail').length;
    const warns = checks.filter(c => c.sev === 'warn').length;
    const counted = checks.filter(c => c.sev !== 'note');   // ข้อสีฟ้า (ข้อมูล) ไม่นับ
    const verdict = fails ? { t: 'ไม่ควรเปิดไม้นี้', c: '#e5484d', s: `มี ${fails} ข้อที่ผิดกฎความเสี่ยง` }
      : warns >= 3 ? { t: 'เสี่ยงสูง — คิดอีกที', c: '#d8a229', s: `${warns} ข้อควรระวัง` }
      : warns ? { t: 'เปิดได้ แต่ระวัง', c: '#d8a229', s: `${warns} ข้อควรระวัง` }
      : { t: 'ผ่านทุกข้อ', c: '#37c684', s: 'ไม้นี้อยู่ในกรอบความเสี่ยงที่ตั้งไว้' };

    // ยืนยันเทรด: แผนออกต้องครบ · มีข้อแดง → ต้องพิมพ์เหตุผลก่อน
    const needReason = fails > 0;
    const blockMsg = exitMissing.length ? 'กรอกแผนออกให้ครบก่อน: ' + exitMissing.join(' · ')
      : (needReason && !String(f.redReason || '').trim()) ? 'มีข้อสีแดง — พิมพ์เหตุผลก่อนยืนยัน' : '';
    const canConfirm = !!sym && !blockMsg;

    const buildPlan = () => ({ id: Date.now(), at: todayStr(), ticker: sym, strategy: f.strategy, strike: f.strike, longStrike: needWidth ? f.longStrike : null,
      expiry: f.expiry, premium: premEff, premiumFromMid: !!m.fromMid, qty: n, width: widthEff, risk,
      targetPct: f.targetPct, stopMult: f.stopMult, closeDte: f.closeDte,
      type, typeAuto: autoType, type_override: overridden,
      ...(isNewType ? { stopValuePct: f.stopValuePct, invalidation: f.invalidation, earnPlan: earnBefore ? f.earnPlan : '', reviewDte: f.reviewDte, thesis: (f.thesis || '').trim(),
        spot: m.spot, bid: m.bid, ask: m.ask, ivr: ivrIn, ivp: f.ivp, delta: f.delta, breakeven: m.breakeven, maxProfit: m.maxProfit,
        targetPrice: exitPx.target != null ? +exitPx.target.toFixed(2) : null, stopPrice: exitPx.stop != null ? +exitPx.stop.toFixed(2) : null } : {}),
      redReason: needReason ? String(f.redReason || '').trim() : '',
      redRules: checks.filter(c => c.sev === 'fail').map(c => c.label),
      checks: checks.map(c => ({ label: c.label, sev: c.sev, value: c.value })) });
    const savePlan = () => {
      const plans = Array.isArray(settings.plans) ? settings.plans : [];
      const p = buildPlan();
      window.Store.setSettings({ plans: [p, ...plans].slice(0, 60) });
      setSaved(true); setTimeout(() => setSaved(false), 1800);
      return p;
    };
    const loadPlan = p => {
      const lk = p.longStrike != null ? p.longStrike
        : (T.VERTICAL_SPREADS.includes(p.strategy) && p.strike != null && p.width != null ? +(/^Bull /.test(p.strategy) ? p.strike - p.width : p.strike + p.width).toFixed(2) : null);
      setF(s => ({ ...s, ...FIELD_DEFAULTS, ticker: p.ticker, strategy: p.strategy, strike: p.strike, longStrike: lk, expiry: p.expiry, premium: p.premium, qty: p.qty, width: p.width,
        targetPct: p.targetPct, stopMult: p.stopMult, closeDte: p.closeDte,
        typeOverride: p.type_override ? p.type : null, stopValuePct: p.stopValuePct != null ? p.stopValuePct : null, invalidation: p.invalidation != null ? p.invalidation : null,
        earnPlan: p.earnPlan || '', reviewDte: p.reviewDte != null ? p.reviewDte : null, thesis: p.thesis || '', bid: p.bid != null ? p.bid : null, ask: p.ask != null ? p.ask : null,
        ivr: p.ivr != null ? p.ivr : null, ivp: p.ivp != null ? p.ivp : null, delta: p.delta != null ? p.delta : null, spot: p.spot != null ? p.spot : null, redReason: p.redReason || '' }));
    };

    const stat = (l, v, color, sub) => (
      <div className="pstat"><div className="l">{l}</div><div className="v num" style={color ? { color } : null}>{v}</div>{sub && <div className="faint num" style={{ fontSize: 10.5, marginTop: 2 }}>{sub}</div>}</div>
    );
    const isLeap = type === 'LONG_OPTION' && dte != null && dte >= CS.leapBadgeDte;
    const premLabel = isNewType ? 'ราคา Limit / หุ้น' : 'พรีเมียมสุทธิ / หุ้น';
    const premHint = isNewType ? (m.fromMid ? 'ว่าง = ใช้ mid' : 'ราคาที่จะส่งคำสั่ง') : (isSelling ? 'เครดิตที่รับ' : 'เดบิตที่จ่าย');

    return (
      <div className="content">
        <div className="plan-grid">
          <Card>
            <div className="card-head"><Icon name="shield" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">ไม้ที่กำลังจะเปิด</div></div>
            <div className="form-grid">
              <Field label="Ticker" hint="สัญลักษณ์หุ้น">
                <input className="input" style={{ textTransform: 'uppercase' }} value={f.ticker} onChange={e => set('ticker', e.target.value.toUpperCase())} placeholder="AAPL" />
              </Field>
              <Field label="จำนวนสัญญา" hint="Contracts"><NumInput value={f.qty} onChange={v => set('qty', v)} step="1" /></Field>
              <Field label="กลยุทธ์" span><Select value={f.strategy} onChange={v => set('strategy', v)} options={T.STRATEGIES} /></Field>
              {needWidth ? (
                <>
                  <Field label="Strike ขาขาย" hint="Sell leg"><NumInput value={f.strike} onChange={v => set('strike', v)} /></Field>
                  <Field label="Strike ขาซื้อ" hint={widthEff != null ? 'กว้าง ' + (+widthEff).toFixed(2) : 'Buy leg'}><NumInput value={f.longStrike} onChange={v => set('longStrike', v)} /></Field>
                </>
              ) : (
                <Field label="Strike" hint={isMulti ? 'ขาที่ขาย/ขาหลัก' : 'ราคาใช้สิทธิ'}><NumInput value={f.strike} onChange={v => set('strike', v)} /></Field>
              )}
              <Field label="วันหมดอายุ" hint="Expiry">
                <input className="input num" type="date" value={f.expiry || ''} onChange={e => set('expiry', e.target.value)} />
              </Field>
              <Field label={premLabel} hint={premHint}><NumInput value={f.premium} onChange={v => set('premium', v)} /></Field>
            </div>

            {isNewType && (
              <>
                <div className="section-label" style={{ marginTop: 18 }}>ข้อมูลตลาด <span className="faint" style={{ fontWeight: 400 }}>— กรอกจากแอปโบรก ช่องไหนว่าง ข้อนั้นขึ้น "ไม่มีข้อมูล"</span></div>
                <div className="form-grid">
                  <Field label="ราคาหุ้นตอนนี้" hint={f._spotAuto ? 'ดึงอัตโนมัติ · แก้ได้' : 'Spot'}><NumInput value={f.spot} onChange={v => setF(s => ({ ...s, spot: v, _spotAuto: false }))} /></Field>
                  <Field label="Bid" hint={type === 'DEBIT_SPREAD' ? 'ของทั้ง spread' : 'ของออปชั่น'}><NumInput value={f.bid} onChange={v => set('bid', v)} /></Field>
                  <Field label="Ask" hint={m.mid != null ? 'mid ' + m.mid.toFixed(2) : ''}><NumInput value={f.ask} onChange={v => set('ask', v)} /></Field>
                  <Field label="IVR ตอนเข้า" hint={f.ivr == null && wlRow && wlRow.ivr != null ? 'จาก Watchlist' : '0–100'}><NumInput value={ivrIn} onChange={v => set('ivr', v)} step="1" /></Field>
                  <Field label="IV percentile" hint="0–100"><NumInput value={f.ivp} onChange={v => set('ivp', v)} step="1" /></Field>
                  {type === 'LONG_OPTION' && <Field label="Delta ขาซื้อ" hint="เช่น 0.70"><NumInput value={f.delta} onChange={v => set('delta', v)} step="0.01" /></Field>}
                </div>
              </>
            )}

            <div className="section-label" style={{ marginTop: 18 }}>แผนออก — ตั้งก่อนเข้า{isNewType ? <span className="faint" style={{ fontWeight: 400 }}> · ทุกช่องบังคับ</span> : null}</div>
            {type === 'DEBIT_SPREAD' || type === 'LONG_OPTION' ? (
              <div className="form-grid">
                <Field label="เป้ากำไร" hint={(type === 'DEBIT_SPREAD' ? '% ของกำไรสูงสุด' : '+% ของราคา') + (exitPx.target != null ? ' · ปิดที่ ~' + exitPx.target.toFixed(2) : '')}><NumInput value={f.targetPct} onChange={v => set('targetPct', v)} step="5" /></Field>
                <Field label="Stop จากมูลค่า" hint={'ปิดเมื่อเหลือ ≤ % ของที่จ่าย' + (exitPx.stop != null ? ' · ~' + exitPx.stop.toFixed(2) : '')}><NumInput value={f.stopValuePct} onChange={v => set('stopValuePct', v)} step="5" /></Field>
                <Field label="Invalidation level" hint="ราคาปิดหุ้นที่ถ้าหลุด = thesis ผิด"><NumInput value={f.invalidation} onChange={v => set('invalidation', v)} /></Field>
                {type === 'DEBIT_SPREAD' && <Field label="Time stop" hint="ทบทวนเมื่อเหลือกี่ DTE"><NumInput value={f.reviewDte} onChange={v => set('reviewDte', v)} step="1" /></Field>}
                {type === 'DEBIT_SPREAD' && earnBefore && (
                  <Field label="แผนตอนงบ" hint={'งบ ' + T.fmtDateShort(earn.date) + ' อยู่ในอายุ'} span>
                    <Select value={f.earnPlan} onChange={v => set('earnPlan', v)} options={C.EARN_PLANS} placeholder="— เลือก —" />
                  </Field>
                )}
                <Field label="Thesis" hint="สั้นๆ ทำไมถึงเข้าไม้นี้" span>
                  <textarea className="input" rows="2" style={{ resize: 'vertical', fontFamily: 'inherit' }} value={f.thesis} onChange={e => set('thesis', e.target.value)} placeholder="เช่น 400 ยังน่าซื้อ — คาดกลับเหนือ EMA200 ภายในงบ ม.ค." />
                </Field>
                {type === 'LONG_OPTION' && <div className="pnote" style={{ gridColumn: '1 / -1' }}>กฎประจำ: กำไร ≥ 80% และมี binary event (งบ / FOMC) ภายใน 24 ชม. → ปิด</div>}
              </div>
            ) : (
              <div className="form-grid">
                <Field label="ปิดที่กำไร" hint="% ของพรีเมียม"><NumInput value={f.targetPct} onChange={v => set('targetPct', v)} step="5" /></Field>
                <Field label="ตัดขาดทุนที่" hint="× พรีเมียม"><NumInput value={f.stopMult} onChange={v => set('stopMult', v)} step="0.5" /></Field>
                <Field label="ปิดเมื่อเหลือ" hint="DTE"><NumInput value={f.closeDte} onChange={v => set('closeDte', v)} step="1" /></Field>
              </div>
            )}

            <div className="section-label" style={{ marginTop: 18 }}>เพดานความเสี่ยงของฉัน</div>
            <div className="form-grid">
              <Field label="ต่อ 1 ไม้" hint="% ของ NLV"><NumInput value={maxPct} onChange={v => window.Store.setSettings({ planRiskPct: v })} step="1" /></Field>
              <Field label="ต่อ 1 ticker" hint="% ของ NLV"><NumInput value={maxTickerPct} onChange={v => window.Store.setSettings({ planTickerPct: v })} step="1" /></Field>
              <Field label="IVR ต่ำสุดที่ยอมขาย" hint="0–100"><NumInput value={minIVR} onChange={v => window.Store.setSettings({ planMinIVR: v })} step="5" /></Field>
              <Field label="ต่อ 1 ธีม" hint="% ของ NLV (เหลืองเกิน)"><NumInput value={CS.themeConcCapPct} onChange={v => window.Store.setSettings({ checklist: { ...(settings.checklist || {}), themeConcCapPct: v } })} step="1" /></Field>
              <Field label="กลุ่มธีม" hint="1 บรรทัด = ชื่อธีม: TICKER, TICKER" span>
                <textarea className="input num" rows="3" style={{ resize: 'vertical', fontSize: 12.5 }} value={themeText != null ? themeText : C.groupsToText(CS.themeGroups)}
                  onChange={e => setThemeText(e.target.value)}
                  onBlur={() => { if (themeText == null) return; const g = C.textToGroups(themeText); window.Store.setSettings({ checklist: { ...(settings.checklist || {}), themeGroups: g } }); setThemeText(null); }} />
              </Field>
            </div>
          </Card>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
            <Card style={{ borderColor: verdict.c + '66', background: `linear-gradient(180deg,${verdict.c}14,transparent 70%)` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center', background: verdict.c + '22', border: '1px solid ' + verdict.c + '55' }}>
                  <Icon name={fails ? 'close' : warns ? 'alert' : 'check'} size={21} style={{ color: verdict.c }} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: verdict.c }}>{verdict.t}</div>
                  <div className="faint" style={{ fontSize: 12.5 }}>{verdict.s}</div>
                </div>
              </div>
              <div className="pstat-row" style={{ marginTop: 14 }}>
                {stat('ทุนที่เสี่ยง', risk != null ? T.fmtMoney(risk) : (f.strategy === 'Sell Call' ? 'ไม่จำกัด' : '—'), risk != null ? null : '#e5484d')}
                {stat('% ของพอร์ต', riskPct != null ? riskPct.toFixed(1) + '%' : '—', riskPct != null && riskPct > maxPct ? '#e5484d' : null)}
                {stat('กำไรสูงสุด', maxProfit != null ? T.fmtMoney(maxProfit) : (type === 'LONG_OPTION' ? 'ไม่จำกัด' : '—'), 'var(--pos-bright)')}
                {type === 'DEBIT_SPREAD'
                  ? stat('ROR รวม', ror != null ? T.fmtPct(ror, 0) : '—', null, annRor != null ? 'ต่อปี ' + T.fmtPct(annRor, 0) : null)
                  : type === 'LONG_OPTION'
                    ? stat('จุดคุ้มทุน', m.breakeven != null ? m.breakeven.toFixed(2) : '—')
                    : stat('ROR/ปี', annRor != null ? T.fmtPct(annRor, 0) : '—')}
              </div>
              {type === 'DEBIT_SPREAD' && m.breakeven != null && <div className="faint num" style={{ fontSize: 12, marginTop: 8 }}>จุดคุ้มทุน {m.breakeven.toFixed(2)}{m.width != null ? ' · กว้าง ' + m.width.toFixed(2) : ''}{m.fromMid ? ' · คำนวณจาก mid' : ''}</div>}
            </Card>

            <Card>
              <div className="card-head"><Icon name="pulse" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">ขนาดไม้ที่แนะนำ</div></div>
              {suggested != null ? (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                  <span className="num" style={{ fontSize: 34, fontWeight: 700, color: 'var(--accent-2)', letterSpacing: '-1px' }}>{Math.max(0, suggested)}</span>
                  <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>สัญญา</span>
                  <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>งบเสี่ยง {T.fmtMoney(budget)} ÷ {T.fmtMoney(risk1)}/สัญญา</span>
                </div>
              ) : <div className="faint" style={{ fontSize: 13 }}>กรอก strike / พรีเมียม และมี NLV ในหน้า Daily ก่อน แล้วจะคำนวณให้</div>}
              {suggested != null && suggested < n && (
                <div className="pnote warn" style={{ marginTop: 10 }}>ไม้นี้ {n} สัญญา เกินเพดาน — ลดลงเป็น {Math.max(0, suggested)} สัญญาถึงจะอยู่ในกรอบ {maxPct}% ของ NLV</div>
              )}
            </Card>

            <Card pad={false}>
              <div className="card-pad card-head" style={{ marginBottom: 0, flexWrap: 'wrap', rowGap: 8 }}>
                <Icon name="check" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">เช็กลิสต์</div>
                <span className="ctype-badge">{C.TYPE_LABEL[type]}</span>
                {isLeap && <span className="ctype-badge leap">LEAP</span>}
                <select className="select ctype-sel" value={type} title="เปลี่ยนประเภทเทรด" onChange={e => set('typeOverride', e.target.value === autoType ? null : e.target.value)}>
                  {C.TYPES.map(t => <option key={t} value={t}>{C.TYPE_LABEL[t]}{t === autoType ? ' (อัตโนมัติ)' : ''}</option>)}
                </select>
                <div className="card-actions faint chk-count" style={{ fontSize: 12 }}>{counted.filter(c => c.sev === 'pass').length}/{counted.length} ผ่าน</div>
              </div>
              {overridden && <div className="pnote warn" style={{ margin: '0 14px 8px' }}>เปลี่ยนประเภทเองจาก {C.TYPE_LABEL[autoType]} — ระบบจะบันทึกไว้ว่า override</div>}
              <div className="pchk-list" style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 14px 14px' }}>
                {checks.map((c, i) => <CheckRow key={i} c={c} />)}
              </div>
            </Card>

            <MarketCalendar tickers={sym ? [sym] : []} days={dte && dte > 0 ? Math.max(dte, 30) : 45} title="ปฏิทินตลาดถึงวันหมดอายุ" />

            {needReason && (
              <Card>
                <div className="section-label" style={{ marginTop: 0, color: '#e5484d' }}>มี {fails} ข้อสีแดง — เหตุผลที่ยังจะเปิดไม้นี้</div>
                <textarea className="input" rows="2" style={{ resize: 'vertical', fontFamily: 'inherit', width: '100%' }} value={f.redReason} onChange={e => set('redReason', e.target.value)}
                  placeholder="บังคับกรอก — จะบันทึกไว้กับแผนและบันทึกเทรด" />
              </Card>
            )}
            {blockMsg && sym && <div className="pnote warn">{blockMsg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} disabled={!canConfirm} onClick={savePlan}>
                <Icon name={saved ? 'check' : 'download'} size={15} />{saved ? 'บันทึกแผนแล้ว' : 'ยืนยัน · บันทึกแผน'}
              </button>
              <button className="btn" disabled={!canConfirm} onClick={() => {
                const p = savePlan();
                window.OZL_PREFILL = p;
                location.hash = 'trades';
              }}><Icon name="plus" size={15} />ยืนยัน · เปิดเป็นเทรด</button>
            </div>
            {!!(settings.plans || []).length && (
              <Card pad={false}>
                <div className="card-pad card-head" style={{ marginBottom: 0 }}><Icon name="layers" size={16} style={{ color: 'var(--accent-2)' }} /><div className="card-title">แผนที่บันทึกไว้</div></div>
                <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(settings.plans || []).slice(0, 6).map(p => (
                    <div key={p.id} className="pchk" style={{ cursor: 'pointer' }} onClick={() => loadPlan(p)}>
                      <span className="tkr" style={{ fontSize: 13 }}>{p.ticker}</span>
                      <div style={{ minWidth: 0, flex: 1 }}><div className="pchk-s">{p.strategy} {p.strike != null ? '$' + p.strike : ''}{p.longStrike != null ? '/' + p.longStrike : ''} · {T.fmtDateShort(p.expiry)} · ปิด {p.targetPct}%{p.type && p.type !== 'CREDIT' ? ' · ' + C.TYPE_LABEL[p.type] : ''}{p.redReason ? ' · ⚠ ฝ่ากฎแดง' : ''}</div></div>
                      <span className="pchk-v num faint">{T.fmtMoney(p.risk)}</span>
                      <button className="btn btn-ghost btn-sm icon-btn" title="เปิดเป็นเทรด" onClick={e => { e.stopPropagation(); window.OZL_PREFILL = p; location.hash = 'trades'; }}><Icon name="plus" size={14} /></button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---- ปฏิทินตลาด: วันประกาศงบของ ticker ที่กำหนด + FOMC/CPI/OpEx ----
  function MarketCalendar({ tickers, days, title }) {
    const T = window.TL;
    const syms = useMemo(() => [...new Set((tickers || []).map(s => String(s || '').toUpperCase().trim()).filter(Boolean))], [(tickers || []).join(',')]);
    const [earn, setEarn] = useState({});
    useEffect(() => {
      if (!syms.length) return;
      const seed = {};
      if (window.earningsCached) syms.forEach(s => { const v = window.earningsCached(s); if (v) seed[s] = v; });
      setEarn(seed);
      let dead = false;
      if (window.fetchEarningsBatch) window.fetchEarningsBatch(syms).then(m => { if (!dead) setEarn(m); });
      return () => { dead = true; };
    }, [syms.join(',')]);

    const horizon = days || 45;
    const limit = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + horizon); return d.toISOString().slice(0, 10); })();
    const unavail = syms.length > 0 && syms.every(s => window.isEarnUnavail && window.isEarnUnavail(earn[s]));
    const items = useMemo(() => {
      const macro = (window.macroEvents ? window.macroEvents(4) : []).filter(e => e.date <= limit)
        .map(e => ({ date: e.date, kind: e.kind, label: e.label + (e.est ? ' (คาด)' : '') }));
      const es = Object.entries(earn).filter(([, v]) => v && v.date && v.date <= limit)
        .filter(([, v]) => !(window.isEarnUnavail && window.isEarnUnavail(v)))
        .map(([s, v]) => ({ date: v.date, kind: 'EARN', label: s + ' ประกาศงบ' + (v.hour === 'bmo' ? ' (ก่อนเปิด)' : v.hour === 'amc' ? ' (หลังปิด)' : '') }));
      return [...macro, ...es].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14);
    }, [earn, limit]);

    return (
      <Card pad={false}>
        <div className="card-pad card-head" style={{ marginBottom: 0 }}>
          <Icon name="daily" size={16} style={{ color: 'var(--accent-2)' }} />
          <div className="card-title">{title || 'ปฏิทินตลาด'}</div>
          <div className="card-actions faint" style={{ fontSize: 11.5 }}>{horizon} วันข้างหน้า</div>
        </div>
        <div className="mcal">
          {items.length ? items.map((e, i) => {
            const g = T.daysBetween(todayStr(), e.date);
            const col = (window.MACRO_COLORS || {})[e.kind] || 'var(--text-dim)';
            return (
              <div key={i} className="mcal-row">
                <span className="mcal-k" style={{ color: col, background: col + '1f', borderColor: col + '55' }}>{e.kind}</span>
                <span className="mcal-l">{e.label}</span>
                <span className="mcal-d num faint">{T.fmtDateShort(e.date)}</span>
                <span className="mcal-g num" style={{ color: g <= 3 ? '#d8a229' : 'var(--text-faint)' }}>{g === 0 ? 'วันนี้' : g + 'd'}</span>
              </div>
            );
          }) : <div className="faint" style={{ padding: '14px', fontSize: 12.5 }}>ไม่มีอีเวนต์ในช่วงนี้</div>}
          {unavail && <div className="pnote warn" style={{ margin: '4px 8px 8px' }}>ยังดึงวันประกาศงบไม่ได้ — ต้อง deploy Edge Function <b>quote</b> เวอร์ชันใหม่ (รองรับ kind:"earnings") ก่อน ตอนนี้แสดงเฉพาะ FOMC / CPI / OpEx</div>}
        </div>
      </Card>
    );
  }

  window.MarketCalendar = MarketCalendar;
  window.PlanPage = PlanPage;
})();
