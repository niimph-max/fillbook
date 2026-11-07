/* ============================================================
   checklist.js — กฎ "เช็คก่อนเทรด" แยกตามประเภทเทรด (spec v1.0)
   ------------------------------------------------------------
   ฟังก์ชันล้วน ไม่แตะ DOM → ทดสอบด้วย node ได้ · ใช้โดย plan.jsx (+ ai.jsx)
   ประเภท: CREDIT (กฎเดิมใน plan.jsx — ไม่เปลี่ยน) · DEBIT_SPREAD · LONG_OPTION · UNKNOWN
   ทุก threshold อ่านจาก settings.checklist (merge กับ DEFAULTS) — ห้าม hardcode
   sev: pass (เขียว) · warn (เหลือง) · fail (แดง) · note (ฟ้า = ข้อมูล ไม่นับผ่าน/ไม่ผ่าน) · info (เทา = ข้อมูลไม่พอ)
   Exports window.FBChecklist
   ============================================================ */
(function () {
  var DEFAULTS = {
    themeConcWarnPct: 25, themeConcCapPct: 35,
    themeGroups: {
      AI_SEMI: ['NVDA', 'TSM', 'AMAT', 'AMD', 'MU', 'AVGO', 'ANET', 'CLS', 'MRVL', 'LRCX'],
      MEGA_TECH: ['MSFT', 'GOOGL', 'META', 'AMZN', 'AAPL'],
      INDEX: ['QQQ', 'SPY', 'IWM'],
    },
    debit: {
      dteMin: 90, dteWarnMin: 45, dteMax: 450,
      minRR: 1.3, warnRR: 1.0,
      maxDebitWidthPct: 40, warnDebitWidthPct: 55,
      beGreenPerMonth: 2, beWarnPerMonth: 4,
      liqGreenPct: 8, liqWarnPct: 15,
      limitGreenPct: 25, limitWarnPct: 60,
      ivrWarn: 60, ivpWarn: 90, earnWindowDays: 30,
      profitTargetPct: 70, stopValuePct: 50, reviewAtDte: 30,
    },
    longOpt: {
      dteMin: 270, dteWarnMin: 120,
      deltaMin: 0.65, deltaMax: 0.85, deltaWarnMin: 0.50,
      extrGreenPct: 25, extrWarnPct: 40,
      profitTargetPct: 80, stopValuePct: 50,
    },
    leapBadgeDte: 270,
  };

  function merge(user) {
    var u = user || {};
    return {
      themeConcWarnPct: num(u.themeConcWarnPct, DEFAULTS.themeConcWarnPct),
      themeConcCapPct: num(u.themeConcCapPct, DEFAULTS.themeConcCapPct),
      themeGroups: u.themeGroups && typeof u.themeGroups === 'object' ? u.themeGroups : DEFAULTS.themeGroups,
      debit: Object.assign({}, DEFAULTS.debit, u.debit || {}),
      longOpt: Object.assign({}, DEFAULTS.longOpt, u.longOpt || {}),
      leapBadgeDte: num(u.leapBadgeDte, DEFAULTS.leapBadgeDte),
    };
  }
  function num(v, d) { return v == null || v === '' || isNaN(+v) ? d : +v; }
  function has(v) { return v != null && v !== '' && !isNaN(+v); }

  // ---- ประเภทเทรด (จากกลยุทธ์ในแอป) ----
  var TYPE_BY_STRATEGY = {
    'Sell Put': 'CREDIT', 'Sell Call': 'CREDIT', 'Bull Put Spread': 'CREDIT', 'Bear Call Spread': 'CREDIT',
    'Bull Call Spread': 'DEBIT_SPREAD', 'Bear Put Spread': 'DEBIT_SPREAD',
    'Buy Call': 'LONG_OPTION', 'Buy Call (Leap)': 'LONG_OPTION', 'Buy Put': 'LONG_OPTION',
  };
  var TYPE_LABEL = { CREDIT: 'CREDIT', DEBIT_SPREAD: 'DEBIT SPREAD', LONG_OPTION: 'LONG OPTION', UNKNOWN: 'UNKNOWN' };
  function classify(strategy) { return TYPE_BY_STRATEGY[strategy] || 'UNKNOWN'; }
  var isPutStrategy = function (s) { return /put/i.test(s || ''); };

  // ---- ธีม ----
  function themeOf(ticker, groups) {
    var t = String(ticker || '').toUpperCase().trim();
    for (var g in groups) if ((groups[g] || []).map(function (x) { return String(x).toUpperCase().trim(); }).indexOf(t) !== -1) return g;
    return null;
  }
  // "AI_SEMI: NVDA, TSM" ต่อบรรทัด ⇄ object
  function groupsToText(groups) {
    return Object.keys(groups || {}).map(function (g) { return g + ': ' + (groups[g] || []).join(', '); }).join('\n');
  }
  function textToGroups(text) {
    var out = {};
    String(text || '').split('\n').forEach(function (line) {
      var i = line.indexOf(':'); if (i < 1) return;
      var name = line.slice(0, i).trim().toUpperCase().replace(/\s+/g, '_');
      var list = line.slice(i + 1).split(/[,\s]+/).map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean);
      if (name && list.length) out[name] = list;
    });
    return out;
  }

  // ---- ตัวเลขพื้นฐาน ----
  // f: { strategy, strike (ขาขาย/ขาหลัก), longStrike, premium(limit), bid, ask, qty, spot, delta }
  function metrics(type, f, dte) {
    var n = Math.max(1, Math.abs(+f.qty || 1));
    var bid = has(f.bid) ? +f.bid : null, ask = has(f.ask) ? +f.ask : null;
    var mid = (bid != null && ask != null && ask >= bid) ? (bid + ask) / 2 : null;
    var limit = has(f.premium) ? Math.abs(+f.premium) : null;
    var fromMid = false;
    if (limit == null && mid != null) { limit = mid; fromMid = true; }
    var put = isPutStrategy(f.strategy);
    var spot = has(f.spot) ? +f.spot : null;
    var m = { n: n, bid: bid, ask: ask, mid: mid, limit: limit, fromMid: fromMid, put: put, spot: spot,
      maxLoss: null, maxProfit: null, breakeven: null, width: null };
    if (type === 'DEBIT_SPREAD') {
      var ks = has(f.strike) ? +f.strike : null, kl = has(f.longStrike) ? +f.longStrike : null;
      m.width = (ks != null && kl != null) ? Math.abs(ks - kl) : (has(f.width) ? Math.abs(+f.width) : null);
      if (limit != null) m.maxLoss = limit * 100 * n;
      if (limit != null && m.width != null) m.maxProfit = Math.max(0, m.width - limit) * 100 * n;
      if (limit != null && kl != null) m.breakeven = put ? kl - limit : kl + limit;
    } else if (type === 'LONG_OPTION') {
      var k = has(f.strike) ? +f.strike : null;
      if (limit != null) m.maxLoss = limit * 100 * n;
      if (limit != null && k != null) m.breakeven = put ? k - limit : k + limit;
      if (limit != null && k != null && spot != null) {
        var intrinsic = Math.max(0, put ? k - spot : spot - k);
        m.intrinsic = intrinsic;
        m.extrinsic = Math.max(0, limit - intrinsic);
      }
    }
    if (m.breakeven != null && spot) {
      var move = put ? (spot - m.breakeven) / spot : (m.breakeven - spot) / spot;
      m.beMovePct = move * 100;
      m.beMovePerMonth = (dte && dte > 0) ? m.beMovePct / (dte / 30.4) : null;
    }
    if (m.maxLoss && m.maxProfit != null) m.rr = m.maxProfit / m.maxLoss;
    if (m.limit != null && m.width) m.debitWidthPct = m.limit / m.width * 100;
    return m;
  }

  // ---- กฎเฉพาะ DEBIT_SPREAD / LONG_OPTION ----
  // ctx: { dte, earnDate, earnInLife, earnWithinWindow(days) → bool, ivr, ivp, delta, fmtMoney, fmtDate }
  function typeChecks(type, m, ctx, S) {
    var out = [];
    var push = function (id, label, sev, detail, value) { out.push({ id: id, label: label, sev: sev, detail: detail, value: value }); };
    var pct = function (x, d) { return x == null ? '—' : x.toFixed(d == null ? 1 : d) + '%'; };
    var dte = ctx.dte;

    if (type === 'DEBIT_SPREAD') {
      var D = S.debit;
      if (dte == null) push('dte', 'DTE', 'info', 'เลือกวันหมดอายุ', '—');
      else if (dte < D.dteWarnMin) push('dte', 'DTE', 'fail', 'สั้นเกิน — เวลาไม่พอให้ thesis ทำงาน (ฝั่งจ่าย theta)', dte + 'd');
      else if (dte < D.dteMin) push('dte', 'DTE', 'warn', 'ค่อนข้างสั้นสำหรับ debit spread — theta เริ่มกินเร็ว', dte + 'd');
      else if (dte > D.dteMax) push('dte', 'DTE', 'warn', 'ยาวมาก — เงินจมนาน สภาพคล่องขาไกลมักแย่', dte + 'd');
      else push('dte', 'DTE', 'pass', 'อยู่ในช่วง ' + D.dteMin + '–' + D.dteMax + ' วัน ให้เวลา thesis ทำงาน', dte + 'd');

      if (m.rr == null) push('rr', 'Reward : Risk', 'info', 'กรอก strike ทั้งสองขา + ราคา limit', '—');
      else push('rr', 'Reward : Risk', m.rr >= D.minRR ? 'pass' : m.rr >= D.warnRR ? 'warn' : 'fail',
        'กำไรสูงสุด ' + ctx.fmtMoney(m.maxProfit) + ' / ขาดทุนสูงสุด ' + ctx.fmtMoney(m.maxLoss) + ' · เป้า ≥ ' + D.minRR, m.rr.toFixed(2));

      if (m.debitWidthPct == null) push('debit_width', 'ต้นทุน / ความกว้าง', 'info', 'กรอก strike ทั้งสองขา + ราคา limit', '—');
      else push('debit_width', 'ต้นทุน / ความกว้าง', m.debitWidthPct <= D.maxDebitWidthPct + 1e-9 ? 'pass' : m.debitWidthPct <= D.warnDebitWidthPct + 1e-9 ? 'warn' : 'fail',
        'จ่าย ' + m.limit.toFixed(2) + ' จากความกว้าง ' + m.width.toFixed(2) + ' · เป้า ≤ ' + D.maxDebitWidthPct + '%', pct(m.debitWidthPct));

      if (m.beMovePerMonth == null) push('be_move', 'ระยะถึงจุดคุ้มทุน', 'info', m.breakeven == null ? 'กรอก strike ขาซื้อ + ราคา limit' : 'กรอกราคาหุ้นปัจจุบัน + วันหมดอายุ', '—');
      else push('be_move', 'ระยะถึงจุดคุ้มทุน', m.beMovePerMonth <= D.beGreenPerMonth ? 'pass' : m.beMovePerMonth <= D.beWarnPerMonth ? 'warn' : 'fail',
        'BE ' + m.breakeven.toFixed(2) + ' ต้อง' + (m.put ? 'ลง ' : 'ขึ้น ') + pct(m.beMovePct) + ' ใน ' + dte + ' วัน', pct(m.beMovePerMonth) + '/ด.');

      liquidity(m, D, push, pct);
      ivEntry(ctx, D, push);
      earningsNote(ctx, push);
    } else if (type === 'LONG_OPTION') {
      var L = S.longOpt;
      if (dte == null) push('dte', 'DTE', 'info', 'เลือกวันหมดอายุ', '—');
      else if (dte < L.dteWarnMin) push('dte', 'DTE', 'fail', 'สั้นเกิน — theta กินมูลค่าเร็ว', dte + 'd');
      else if (dte < L.dteMin) push('dte', 'DTE', 'warn', 'ต่ำกว่า ' + L.dteMin + ' วัน — ยังไม่ใช่ LEAP เต็มตัว', dte + 'd');
      else push('dte', 'DTE', 'pass', '≥ ' + L.dteMin + ' วัน — theta ต่อวันต่ำ', dte + 'd');

      var dl = has(ctx.delta) ? Math.abs(+ctx.delta) : null;
      if (dl == null) push('delta', 'Delta ขาซื้อ', 'info', 'กรอก delta จากแอปโบรก', '—');
      else if (dl >= L.deltaMin && dl <= L.deltaMax) push('delta', 'Delta ขาซื้อ', 'pass', 'อยู่ในช่วง ' + L.deltaMin + '–' + L.deltaMax + ' (ITM พอดี)', dl.toFixed(2));
      else if (dl > L.deltaMax) push('delta', 'Delta ขาซื้อ', 'warn', 'ลึกเกิน ' + L.deltaMax + ' — แพง ใช้ทุนใกล้เคียงซื้อหุ้น', dl.toFixed(2));
      else if (dl >= L.deltaWarnMin) push('delta', 'Delta ขาซื้อ', 'warn', 'ต่ำกว่า ' + L.deltaMin + ' — ต้องให้หุ้นวิ่งมากกว่า', dl.toFixed(2));
      else push('delta', 'Delta ขาซื้อ', 'fail', 'ต่ำกว่า ' + L.deltaWarnMin + ' — ใกล้เป็นการซื้อลอตเตอรี่', dl.toFixed(2));

      if (m.extrinsic == null) push('extrinsic', 'Extrinsic / ราคา', 'info', 'กรอก strike + ราคา limit + ราคาหุ้น', '—');
      else {
        var ep = m.limit ? m.extrinsic / m.limit * 100 : 0;
        push('extrinsic', 'Extrinsic / ราคา', ep <= L.extrGreenPct ? 'pass' : ep <= L.extrWarnPct ? 'warn' : 'fail',
          'มูลค่าเวลา ' + m.extrinsic.toFixed(2) + ' จากราคา ' + m.limit.toFixed(2) + ' (intrinsic ' + m.intrinsic.toFixed(2) + ')', pct(ep, 0));
      }
      ivEntry(ctx, S.debit, push);
      earningsNote(ctx, push);
    } else if (type === 'UNKNOWN') {
      push('unknown', 'ประเภทเทรด', 'note', 'ยังไม่มีกฎเฉพาะสำหรับเทรดประเภทนี้ — ใช้กฎกลางอย่างเดียว', '—');
    }
    return out;
  }
  function liquidity(m, D, push, pct) {
    if (m.mid == null || !m.mid) { push('spread_liq', 'สภาพคล่อง', 'info', 'กรอก bid / ask ของ spread', '—'); push('limit_vs_mid', 'ราคาเข้า', 'info', 'กรอก bid / ask ของ spread', '—'); return; }
    var liq = (m.ask - m.bid) / m.mid * 100;
    push('spread_liq', 'สภาพคล่อง', liq <= D.liqGreenPct ? 'pass' : liq <= D.liqWarnPct ? 'warn' : 'fail',
      'bid/ask ' + m.bid.toFixed(2) + ' / ' + m.ask.toFixed(2) + ' (mid ' + m.mid.toFixed(2) + ')', pct(liq));
    var room = m.ask - m.mid;
    var lv = room > 0 ? (m.limit - m.mid) / room * 100 : 0;
    push('limit_vs_mid', 'ราคาเข้า', lv <= D.limitGreenPct ? 'pass' : lv <= D.limitWarnPct ? 'warn' : 'fail',
      (m.fromMid ? 'คำนวณจาก mid (ยังไม่ได้กรอกราคา limit)' : 'limit ' + m.limit.toFixed(2) + ' เทียบ mid ' + m.mid.toFixed(2)) + (lv > D.limitWarnPct ? ' — กำลังไล่ราคาใกล้ ask' : ''),
      pct(Math.max(0, lv), 0));
  }
  function ivEntry(ctx, D, push) {
    var ivr = has(ctx.ivr) ? +ctx.ivr : null, ivp = has(ctx.ivp) ? +ctx.ivp : null;
    if (ivr == null && ivp == null) { push('iv_entry', 'IV ตอนเข้า', 'info', 'กรอก IVR / IV percentile', '—'); return; }
    var nearEarn = ctx.earnWithinWindow(D.earnWindowDays);
    var val = 'IVR ' + (ivr == null ? '—' : Math.round(ivr)) + ' · perc ' + (ivp == null ? '—' : Math.round(ivp));
    if (ivp != null && ivp >= D.ivpWarn && nearEarn)
      push('iv_entry', 'IV ตอนเข้า', 'fail', 'IV สูงสุดในรอบปี + งบภายใน ' + D.earnWindowDays + ' วัน — หลังงบ IV ยุบ spread เสียมูลค่าแม้หุ้นไม่ลง', val);
    else if ((ivr != null && ivr >= D.ivrWarn) || (ivp != null && ivp >= D.ivpWarn))
      push('iv_entry', 'IV ตอนเข้า', 'warn', 'IV แพง — ซื้อออปชั่นตอน IV สูงเสี่ยงโดน IV crush', val);
    else push('iv_entry', 'IV ตอนเข้า', 'pass', 'IV ไม่แพงเกินไป', val);
  }
  function earningsNote(ctx, push) {
    if (ctx.earnUnknown) { push('earnings', 'ประกาศงบ', 'info', 'ยังตรวจวันประกาศงบไม่ได้', '—'); return; }
    if (ctx.earnInLife) push('earnings', 'ประกาศงบ', 'note', 'งบ ' + ctx.fmtDate(ctx.earnDate) + ' อยู่ในอายุสัญญา — ถือผ่านหรือปิดก่อน? (กรอกแผนตอนงบ)', ctx.fmtDateShort(ctx.earnDate));
    else push('earnings', 'ประกาศงบ', 'note', ctx.earnDate ? 'งบรอบถัดไปหลังหมดอายุ' : 'ไม่พบวันประกาศงบในช่วงนี้', ctx.earnDate ? ctx.fmtDateShort(ctx.earnDate) : 'เคลียร์');
  }

  // ---- กฎกลางใหม่: ธีม ----
  // positions: [{ ticker, risk, date }] (เปิดอยู่) · recent: [{ ticker, date }] (เปิดวันนี้/เมื่อวาน)
  function themeChecks(ticker, myRisk, nlv, positions, recent, S, fmtMoney) {
    var out = [];
    var theme = themeOf(ticker, S.themeGroups);
    if (!ticker) return out;
    if (!theme) { out.push({ id: 'theme_conc', label: 'กระจุกตัวรายธีม', sev: 'info', detail: ticker + ' ยังไม่ได้จัดกลุ่มธีม (แก้ได้ในตั้งค่าธีม)', value: '—' }); return out; }
    var mates = positions.filter(function (p) { return themeOf(p.ticker, S.themeGroups) === theme; });
    var themeRisk = mates.reduce(function (s, p) { return s + (p.risk || 0); }, 0);
    var unknown = mates.filter(function (p) { return p.risk == null; }).length;
    if (!nlv || myRisk == null) out.push({ id: 'theme_conc', label: 'กระจุกตัวรายธีม ' + theme, sev: 'info', detail: 'ต้องมี NLV และทุนเสี่ยงของไม้นี้ก่อน', value: '—' });
    else {
      var p = (themeRisk + myRisk) / nlv * 100;
      out.push({ id: 'theme_conc', label: 'กระจุกตัวรายธีม ' + theme, sev: p <= S.themeConcWarnPct ? 'pass' : p <= S.themeConcCapPct ? 'warn' : 'fail',
        detail: 'เปิดอยู่ ' + mates.length + ' รายการ (' + fmtMoney(themeRisk) + ') + ไม้นี้' + (unknown ? ' · ' + unknown + ' รายการคำนวณทุนเสี่ยงไม่ได้ (ไม่นับ)' : '') + ' · เพดาน ' + S.themeConcCapPct + '%',
        value: p.toFixed(1) + '%' });
    }
    var again = recent.filter(function (r) { return themeOf(r.ticker, S.themeGroups) === theme; });
    out.push(again.length
      ? { id: 'same_theme_24h', label: 'เปิดธีมเดิมซ้ำใน 24 ชม.', sev: 'warn', detail: 'เพิ่งเปิด ' + again.map(function (r) { return r.ticker; }).join(', ') + ' (' + theme + ') — นี่คือ thesis ใหม่ หรือ thesis เดิมที่แทงซ้ำ?', value: again.length + ' ไม้' }
      : { id: 'same_theme_24h', label: 'เปิดธีมเดิมซ้ำใน 24 ชม.', sev: 'pass', detail: 'ไม่มีไม้ใหม่ใน ' + theme + ' วันนี้/เมื่อวาน', value: 'ไม่มี' });
    return out;
  }

  // ---- แผนออก: ช่องที่บังคับกรอกต่อประเภท ----
  function exitRequired(type, ex, ctx) {
    var miss = [];
    if (type === 'DEBIT_SPREAD' || type === 'LONG_OPTION') {
      if (!has(ex.targetPct)) miss.push('เป้ากำไร');
      if (!has(ex.stopValuePct)) miss.push('stop จากมูลค่า');
      if (!has(ex.invalidation)) miss.push('invalidation level');
      if (!String(ex.thesis || '').trim()) miss.push('thesis');
      if (type === 'DEBIT_SPREAD') {
        if (ctx.earnInLife && !ex.earnPlan) miss.push('แผนตอนงบ');
        if (!has(ex.reviewDte)) miss.push('time stop');
      }
    } else {
      if (!has(ex.targetPct)) miss.push('เป้ากำไร');
      if (!has(ex.stopMult)) miss.push('จุดตัดขาดทุน');
      if (!has(ex.closeDte)) miss.push('ปิดเมื่อเหลือ DTE');
    }
    return miss;
  }
  var EARN_PLANS = ['ถือผ่าน', 'ปิดก่อนงบ', 'ปิดก่อนงบถ้ากำไร ≥ 60%'];

  // ราคา spread ที่เป้ากำไร / stop (debit) — ให้แสดงเป็นราคา
  function exitPrices(type, m, ex) {
    if (m.limit == null) return {};
    var o = {};
    if (type === 'DEBIT_SPREAD' && m.width != null && has(ex.targetPct)) o.target = m.limit + (m.width - m.limit) * (+ex.targetPct / 100);
    if (type === 'LONG_OPTION' && has(ex.targetPct)) o.target = m.limit * (1 + (+ex.targetPct / 100));
    if ((type === 'DEBIT_SPREAD' || type === 'LONG_OPTION') && has(ex.stopValuePct)) o.stop = m.limit * (+ex.stopValuePct / 100);
    return o;
  }

  // สรุปกฎของประเภทนี้เป็นข้อความ (ส่งให้ AI รีวิว)
  function rulesSummary(type, S) {
    if (type === 'DEBIT_SPREAD') { var D = S.debit; return {
      tradeType: 'DEBIT_SPREAD', dteRange: D.dteMin + '–' + D.dteMax + ' วัน (สั้นกว่า ' + D.dteWarnMin + ' = ผิดกฎ)',
      minRewardRisk: D.minRR, maxDebitPerWidthPct: D.maxDebitWidthPct, breakevenMovePerMonthMaxPct: D.beGreenPerMonth,
      maxBidAskPctOfMid: D.liqGreenPct, ivEntry: 'IVR < ' + D.ivrWarn + '; ห้าม IV perc ≥ ' + D.ivpWarn + ' พร้อมงบภายใน ' + D.earnWindowDays + ' วัน',
      earnings: 'ไม่ผิดกฎ แต่ต้องมีแผนตอนงบ', exitPlan: 'เป้ากำไร ' + D.profitTargetPct + '% ของกำไรสูงสุด · stop เมื่อมูลค่า ≤ ' + D.stopValuePct + '% ของ debit · invalidation level · thesis · ทบทวนเมื่อเหลือ ' + D.reviewAtDte + ' DTE',
      note: 'ห้ามใช้กฎ "ตัดขาดทุนที่ 2× พรีเมียม" กับ debit spread' }; }
    if (type === 'LONG_OPTION') { var L = S.longOpt; return {
      tradeType: 'LONG_OPTION', dteMin: L.dteMin, deltaRange: L.deltaMin + '–' + L.deltaMax, maxExtrinsicPct: L.extrGreenPct,
      ivEntry: 'เหมือน debit spread', earnings: 'ไม่ผิดกฎ (ข้อมูล)', exitPlan: 'เป้ากำไร +' + L.profitTargetPct + '% · stop −' + L.stopValuePct + '% · invalidation level · thesis · กำไร ≥ 80% และมี binary event ภายใน 24 ชม. → ปิด' }; }
    return null;
  }

  window.FBChecklist = {
    DEFAULTS: DEFAULTS, merge: merge, classify: classify, TYPE_LABEL: TYPE_LABEL, TYPES: ['CREDIT', 'DEBIT_SPREAD', 'LONG_OPTION', 'UNKNOWN'],
    themeOf: themeOf, groupsToText: groupsToText, textToGroups: textToGroups,
    metrics: metrics, typeChecks: typeChecks, themeChecks: themeChecks,
    exitRequired: exitRequired, exitPrices: exitPrices, EARN_PLANS: EARN_PLANS, rulesSummary: rulesSummary,
  };
})();
