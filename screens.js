/* ============================================================
   screens.js — renders mini OptionzLog app screens inside phone
   frames on the marketing site. Bilingual (uses .th/.en spans
   so the page-level lang toggle drives them too).
   ============================================================ */
(function () {
  const statusBar = `
    <div class="scr-status">
      <span>9:41</span>
      <span class="dots">
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor"><rect x="0" y="6" width="3" height="5" rx="1"/><rect x="4.5" y="4" width="3" height="7" rx="1"/><rect x="9" y="2" width="3" height="9" rx="1"/><rect x="13" y="0" width="3" height="11" rx="1" opacity=".4"/></svg>
        <svg width="22" height="11" viewBox="0 0 22 11" fill="none"><rect x="1" y="1" width="17" height="9" rx="2.4" stroke="currentColor" opacity=".5"/><rect x="2.5" y="2.5" width="12" height="6" rx="1.2" fill="currentColor"/><rect x="19" y="3.5" width="1.6" height="4" rx="0.8" fill="currentColor" opacity=".6"/></svg>
      </span>
    </div>`;

  function tabbar(active) {
    const tabs = [
      { id: 'dash', th: 'หน้าหลัก', en: 'Home', d: 'M3 11l9-8 9 8M5 9.5V21h5v-6h4v6h5V9.5' },
      { id: 'stocks', th: 'หุ้น', en: 'Stocks', d: 'M12 8m-7 0a7 3 0 1 0 14 0a7 3 0 1 0-14 0M5 8v6c0 1.7 3.1 3 7 3s7-1.3 7-3V8' },
      { id: 'trades', th: 'Options', en: 'Options', d: 'M4 6h16M4 12h16M4 18h10' },
      { id: 'summary', th: 'สรุป', en: 'Summary', d: 'M4 19V5M10 19V9M16 19v-7M22 19H2' },
      { id: 'share', th: 'แชร์', en: 'Share', d: 'M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M16 6l-4-4-4 4M12 2v13' },
    ];
    return `<div class="scr-tabbar">` + tabs.map(t => `
      <div class="scr-tab ${t.id === active ? 'on' : ''}">
        <svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${t.d}"/></svg>
        <span class="th">${t.th}</span><span class="en">${t.en}</span>
      </div>`).join('') + `</div>`;
  }

  function equityCurve() {
    // a believable upward-drifting equity curve
    const pts = [6, 10, 8, 14, 13, 19, 24, 22, 30, 34, 33, 41, 47, 52, 49, 58];
    const W = 250, H = 70, max = 62, min = 0;
    const step = W / (pts.length - 1);
    const coords = pts.map((p, i) => [i * step, H - ((p - min) / (max - min)) * (H - 8) - 4]);
    const line = coords.map((c, i) => (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1)).join(' ');
    const area = line + ` L${W} ${H} L0 ${H} Z`;
    return `
      <div class="spark-wrap">
        <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px;">
          <span style="font-size:10px; color:var(--text-faint); text-transform:uppercase; letter-spacing:.4px;"><span class="th">Equity Curve</span><span class="en">Equity Curve</span></span>
          <span class="num pos" style="font-size:12px; font-weight:600;">+18.4%</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="none" style="display:block; height:62px;">
          <defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
          <path d="${area}" fill="url(#eg)"/>
          <path d="${line}" fill="none" stroke="var(--accent-2)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
      </div>`;
  }

  const SCREENS = {
    dash() {
      return `
        ${statusBar}
        <div class="scr-head">
          <div>
            <div class="scr-title"><span class="th">หน้าหลัก</span><span class="en">Dashboard</span></div>
            <div class="scr-sub"><span class="th">ภาพรวมบัญชี</span><span class="en">Account overview</span></div>
          </div>
          <div style="width:30px;height:30px;border-radius:50%;background:var(--accent-soft);border:1px solid var(--accent-line);display:grid;place-items:center;color:var(--accent-2);font-size:12px;font-weight:700;">P</div>
        </div>
        <div class="scr-body">
          <div class="mini-card" style="background:linear-gradient(135deg,var(--accent-soft),transparent 70%);">
            <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.4px;"><span class="th">มูลค่าพอร์ต (NLV)</span><span class="en">Net Liq. Value</span></div>
            <div class="num" style="font-size:25px;font-weight:700;margin-top:2px;">$194,820</div>
            <div class="num pos" style="font-size:12px;font-weight:600;margin-top:1px;">+$27,820 · +16.6%</div>
          </div>
          <div class="mini-kpis">
            <div class="mini-kpi"><div class="l"><span class="th">Net P/L</span><span class="en">Net P/L</span></div><div class="v pos">+$66.2k</div></div>
            <div class="mini-kpi"><div class="l">Win Rate</div><div class="v">71.4%</div></div>
            <div class="mini-kpi"><div class="l"><span class="th">หุ้น Unreal.</span><span class="en">Stock Unreal.</span></div><div class="v pos">+$9.1k</div></div>
            <div class="mini-kpi"><div class="l">Profit Factor</div><div class="v">2.34</div></div>
          </div>
          ${equityCurve()}
        </div>
        ${tabbar('dash')}`;
    },

    stocks() {
      const rows = [
        { t: 'GOOGL', sh: '20.4', avg: '206.67', p: '+$2,140', pct: '+12.4%', cls: 'pos' },
        { t: 'SOFI', sh: '850', avg: '17.85', p: '+$1,050', pct: '+6.9%', cls: 'pos' },
        { t: 'TSM', sh: '5.9', avg: '173.23', p: '+$2,635', pct: '+170%', cls: 'pos' },
        { t: 'NFLX', sh: '100', avg: '85.95', p: '-$428', pct: '-5.0%', cls: 'neg' },
      ];
      return `
        ${statusBar}
        <div class="scr-head">
          <div>
            <div class="scr-title"><span class="th">หุ้น</span><span class="en">Stocks</span></div>
            <div class="scr-sub"><span class="th">บัญชีรายไม้ · ต้นทุนเฉลี่ย</span><span class="en">Lot ledger · avg cost</span></div>
          </div>
          <div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(180deg,var(--accent-2),var(--accent));display:grid;place-items:center;color:#fff;font-size:18px;font-weight:600;box-shadow:0 4px 12px -4px var(--accent-glow);">+</div>
        </div>
        <div class="scr-body">
          <div class="mini-card" style="background:linear-gradient(135deg,var(--accent-soft),transparent 70%);">
            <div style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.4px;"><span class="th">มูลค่าหุ้นรวม</span><span class="en">Stock value</span></div>
            <div class="num" style="font-size:23px;font-weight:700;margin-top:2px;">$33,406</div>
            <div class="num pos" style="font-size:12px;font-weight:600;margin-top:1px;">+$7,582 · +29.4% <span style="color:var(--text-faint);font-weight:400;">unrealized</span></div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin:10px 2px 9px;">
            <span style="font-size:9px;color:var(--text-faint);text-transform:uppercase;letter-spacing:.4px;"><span class="th">แบ่งเงิน</span><span class="en">Plan</span></span>
            <div style="flex:1;height:8px;border-radius:99px;overflow:hidden;display:flex;background:var(--surface-3);">
              <div style="width:60%;background:var(--accent-2);"></div><div style="width:25%;background:#5e6a7d;border-left:1px solid var(--surface);"></div>
            </div>
            <span style="font-size:9px;color:var(--text-dim);"><span class="th">หุ้น 60% · Options 25%</span><span class="en">Stocks 60% · Options 25%</span></span>
          </div>
          <div class="mini-card" style="padding:4px 11px;">
            ${rows.map(r => `
              <div class="trow">
                <span class="tkr" style="min-width:46px;">${r.t}</span>
                <span style="color:var(--text-faint);font-size:10px;">${r.sh}@$${r.avg}</span>
                <span class="sp ${r.cls}">${r.p} <span style="color:var(--text-faint);font-weight:400;font-size:9px;">${r.pct}</span></span>
              </div>`).join('')}
          </div>
        </div>
        ${tabbar('stocks')}`;
    },

    trades() {
      const rows = [
        { t: 'NVDA', s: 'Sell Put', p: '+$500', cls: 'pos' },
        { t: 'AAPL', s: 'Covered Call', p: '+$312', cls: 'pos' },
        { t: 'CLS', s: 'Sell Put', p: '+$418', cls: 'pos' },
        { t: 'TSM', s: 'Sell Put', p: '+$673', cls: 'pos' },
        { t: 'MSFT', s: 'Sell Put', p: '-$210', cls: 'neg' },
        { t: 'GOOGL', s: 'Covered Call', p: '+$245', cls: 'pos' },
      ];
      return `
        ${statusBar}
        <div class="scr-head">
          <div>
            <div class="scr-title">Options</div>
            <div class="scr-sub"><span class="th">บันทึกเทรดออปชั่น</span><span class="en">Option trades</span></div>
          </div>
          <div style="width:30px;height:30px;border-radius:9px;background:linear-gradient(180deg,var(--accent-2),var(--accent));display:grid;place-items:center;color:#fff;font-size:18px;font-weight:600;box-shadow:0 4px 12px -4px var(--accent-glow);">+</div>
        </div>
        <div class="scr-body">
          <div class="mini-kpis" style="margin-bottom:9px;">
            <div class="mini-kpi"><div class="l">Win Rate</div><div class="v">71.4%</div></div>
            <div class="mini-kpi"><div class="l">Profit Factor</div><div class="v">2.34</div></div>
          </div>
          <div class="mini-card" style="padding:4px 11px;">
            ${rows.map(r => `
              <div class="trow">
                <span class="asset-tag opt">OPT</span>
                <span class="tkr">${r.t}</span>
                <span style="color:var(--text-faint);font-size:10px;">${r.s}</span>
                <span class="sp ${r.cls}">${r.p}</span>
              </div>`).join('')}
          </div>
        </div>
        ${tabbar('trades')}`;
    },

    dash_alt() { return SCREENS.dash(); },

    share() {
      // payoff diagram for a Sell Put
      const W = 250, H = 120, padL = 6, padR = 6, padT = 10, padB = 16;
      const plotW = W - padL - padR;
      // short put: profit flat above K, slopes down below breakeven
      const knots = [[0, -38], [0.42, -38], [0.62, 0], [1, 26]]; // x-frac, y(px from mid scaled later)
      const y0 = padT + (H - padT - padB) * 0.62;
      const Y = v => y0 - v; // v already in px offset
      const X = f => padL + f * plotW;
      const line = knots.map((k, i) => (i ? 'L' : 'M') + X(k[0]).toFixed(1) + ' ' + Y(k[1]).toFixed(1)).join(' ');
      const greenArea = `M${X(0.42)} ${y0} L${X(0.42)} ${Y(-38)} L${X(0)} ${Y(-38)}`.replace('-', ''); // not used
      return `
        ${statusBar}
        <div class="scr-head">
          <div>
            <div class="scr-title"><span class="th">แชร์เทรด</span><span class="en">Share trade</span></div>
            <div class="scr-sub">Sell Put · CLS</div>
          </div>
        </div>
        <div class="scr-body">
          <div class="mini-card" style="padding:0;overflow:hidden;">
            <div style="padding:10px 12px;border-bottom:1px solid var(--border-soft);background:var(--surface-2);">
              <div style="font-weight:700;font-size:13px;">Sell Put · <span class="accent">CLS</span></div>
              <div class="num" style="font-size:10px;color:var(--text-dim);margin-top:1px;">@ 372.55 · Exp 18 Jul · DTE 24</div>
            </div>
            <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
              <path d="M${X(0)} ${y0} L${X(0)} ${Y(-38)} L${X(0.42)} ${Y(-38)} L${X(0.62)} ${y0} Z" fill="rgba(229,72,77,.18)"/>
              <path d="M${X(0.62)} ${y0} L${X(0.42)} ${Y(-38)} L${X(0.42)} ${y0} Z" fill="none"/>
              <path d="M${X(0.62)} ${y0} L${X(1)} ${y0} L${X(1)} ${Y(26)} L${X(0.62)} ${y0} Z" fill="rgba(38,162,105,.20)"/>
              <line x1="${padL}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="var(--border)" stroke-width="1"/>
              <line x1="${X(0.42)}" y1="${padT}" x2="${X(0.42)}" y2="${H - padB}" stroke="var(--text-faint)" stroke-width="1" stroke-dasharray="3 3"/>
              <line x1="${X(0.62)}" y1="${padT}" x2="${X(0.62)}" y2="${H - padB}" stroke="var(--warn)" stroke-width="1" stroke-dasharray="2 3"/>
              <line x1="${X(0.78)}" y1="${padT}" x2="${X(0.78)}" y2="${H - padB}" stroke="var(--pos-bright)" stroke-width="1.5"/>
              <path d="${line}" fill="none" stroke="var(--text)" stroke-width="2" stroke-linejoin="round"/>
              <text x="${X(0.42)}" y="8" fill="var(--text-dim)" font-size="8" text-anchor="middle" font-family="var(--font-mono)">K 330</text>
              <text x="${X(0.78)}" y="${padT + 8}" fill="var(--pos-bright)" font-size="8" text-anchor="middle" font-family="var(--font-mono)">372</text>
            </svg>
            <div style="display:flex;flex-wrap:wrap;gap:7px;padding:9px 12px;border-top:1px solid var(--border-soft);">
              <div style="flex:1 1 44%;"><div style="font-size:8px;color:var(--text-faint);text-transform:uppercase;">Net Credit</div><div class="num pos" style="font-size:12px;font-weight:600;">+$418</div></div>
              <div style="flex:1 1 44%;"><div style="font-size:8px;color:var(--text-faint);text-transform:uppercase;">Breakeven</div><div class="num" style="font-size:12px;font-weight:600;">325.82</div></div>
              <div style="flex:1 1 44%;"><div style="font-size:8px;color:var(--text-faint);text-transform:uppercase;">Max Profit</div><div class="num pos" style="font-size:12px;font-weight:600;">+$418</div></div>
              <div style="flex:1 1 44%;"><div style="font-size:8px;color:var(--text-faint);text-transform:uppercase;"><span class="th">ห่าง Strike</span><span class="en">Moneyness</span></div><div class="num accent" style="font-size:12px;font-weight:600;">+12.9%</div></div>
            </div>
          </div>
          <div style="display:flex;gap:8px;">
            <div style="flex:1;text-align:center;font-size:11px;font-weight:600;padding:9px;border-radius:9px;background:var(--surface);border:1px solid var(--border);">📸 <span class="th">คัดลอกรูป</span><span class="en">Copy image</span></div>
            <div style="flex:1;text-align:center;font-size:11px;font-weight:600;padding:9px;border-radius:9px;background:linear-gradient(180deg,var(--accent-2),var(--accent));color:#fff;"><span class="th">เปิด X</span><span class="en">Post to X</span></div>
          </div>
        </div>
        ${tabbar('share')}`;
    },

    summary() {
      const strats = [
        { s: 'Sell Put', w: '78%', p: '+$24.1k', cls: 'pos', bar: 78 },
        { s: 'Long Stock', w: '66%', p: '+$18.9k', cls: 'pos', bar: 66 },
        { s: 'Covered Call', w: '83%', p: '+$11.2k', cls: 'pos', bar: 83 },
        { s: 'Buy Call', w: '41%', p: '-$2.4k', cls: 'neg', bar: 41 },
      ];
      return `
        ${statusBar}
        <div class="scr-head">
          <div>
            <div class="scr-title"><span class="th">สรุปผล</span><span class="en">Summary</span></div>
            <div class="scr-sub"><span class="th">ตามกลยุทธ์</span><span class="en">By strategy</span></div>
          </div>
        </div>
        <div class="scr-body">
          <div style="display:flex;gap:6px;margin-bottom:10px;">
            <span style="font-size:10px;padding:4px 10px;border-radius:7px;background:var(--accent-soft);color:var(--accent-2);border:1px solid var(--accent-line);font-weight:600;"><span class="th">ทั้งหมด</span><span class="en">All</span></span>
            <span style="font-size:10px;padding:4px 10px;border-radius:7px;background:var(--surface);color:var(--text-dim);border:1px solid var(--border);">📈 <span class="th">หุ้น</span><span class="en">Stocks</span></span>
            <span style="font-size:10px;padding:4px 10px;border-radius:7px;background:var(--surface);color:var(--text-dim);border:1px solid var(--border);">⚙️ <span class="th">ออปชั่น</span><span class="en">Options</span></span>
          </div>
          ${strats.map(r => `
            <div class="mini-card" style="padding:10px 12px;">
              <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px;">
                <span style="font-size:12px;font-weight:600;">${r.s}</span>
                <span class="num ${r.cls}" style="font-size:12px;font-weight:600;">${r.p}</span>
              </div>
              <div style="height:6px;border-radius:99px;background:var(--surface-3);overflow:hidden;">
                <div style="height:100%;width:${r.bar}%;border-radius:99px;background:linear-gradient(90deg,var(--accent),var(--accent-2));"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:5px;">
                <span style="font-size:9px;color:var(--text-faint);">Win ${r.w}</span>
                <span style="font-size:9px;color:var(--text-faint);">PF ${(1 + r.bar / 40).toFixed(2)}</span>
              </div>
            </div>`).join('')}
        </div>
        ${tabbar('summary')}`;
    },
  };

  window.OZScreens = {
    render(el, name) {
      if (!el || !SCREENS[name]) return;
      el.innerHTML = `<div class="scr">${SCREENS[name]()}</div>`;
    }
  };
})();
