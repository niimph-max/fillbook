/* ============================================================
   ai.jsx — ฟีเจอร์ AI (เรียกผ่าน Edge Function `fillbook-ai` เท่านั้น)
   ------------------------------------------------------------
   • API key อยู่ฝั่ง Supabase — ห้ามใส่ในไฟล์นี้ (repo public)
   • กลุ่ม fillbook: Edge Function `fillbook-ai` · ตาราง fillbook_ai_usage
   • AIReview: ปุ่ม "ให้ AI รีวิวเทรดนี้" ในหน้ารีวิวไม้ (journal.jsx)
     ส่งข้อมูลไม้ + กฎจากหน้า "เช็คก่อนเทรด" ไปให้ AI เทียบ
   • รีวิวที่เคยทำ ดึงจากตาราง fillbook_ai_usage (RLS เฉพาะเจ้าของ) ไม่เก็บลง localStorage
   Exports window.AIReview, window.FBAI
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const { Icon } = window;

  const UNAVAILABLE = 'ฟีเจอร์ AI ใช้ไม่ได้ชั่วคราว';
  const TIMEOUT_MS = 90000;   // เกินนี้ = ถือว่าใช้ไม่ได้ ไม่ปล่อยให้ค้าง
  // ข้อความจากเซิร์ฟเวอร์ที่ให้แสดงตรงๆ (ที่เหลือ = ใช้ไม่ได้ชั่วคราว)
  const SHOW_AS_IS = [401, 403, 429];

  async function call(kind, ref, payload) {
    if (!window.sbClient) throw new Error('ต้องเข้าสู่ระบบก่อน');
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(UNAVAILABLE)), TIMEOUT_MS); });
    try {
      const { data, error } = await Promise.race([
        window.sbClient.functions.invoke('fillbook-ai', { body: { app: 'fillbook', kind, ref, payload } }),
        timeout,
      ]);
      if (error) {
        let msg = UNAVAILABLE;
        try {
          const res = error.context;
          if (res && SHOW_AS_IS.includes(res.status)) { const j = await res.json(); if (j && j.error) msg = j.error; }
        } catch (e) {}
        throw new Error(msg);
      }
      if (!data || !data.text) throw new Error(UNAVAILABLE);
      return data;
    } catch (e) {
      throw new Error((e && e.message) || UNAVAILABLE);
    } finally { clearTimeout(timer); }
  }
  async function lastResult(kind, ref) {
    if (!window.sbClient) return null;
    const { data } = await window.sbClient.from('fillbook_ai_usage').select('output_text,cost_usd,created_at').eq('app', 'fillbook')
      .eq('kind', kind).eq('ref', String(ref)).order('created_at', { ascending: false }).limit(1);
    return data && data[0] ? { text: data[0].output_text, cost_usd: data[0].cost_usd, at: data[0].created_at } : null;
  }
  window.FBAI = { call, lastResult };

  // ---- ข้อมูลที่ส่งให้ AI: ไม้นี้ + กฎของเจ้าของ ----------------------------
  function reviewPayload(t, state, settings) {
    const T = window.TL;
    const isSell = T.CREDIT_SPREADS.includes(t.strategy) || ['Sell Put', 'Sell Call'].includes(t.strategy);
    const daily = (state.daily || []).filter(d => d && d.date && d.date <= (t.date || '')).sort((a, b) => a.date.localeCompare(b.date));
    const nlv = daily.length ? daily[daily.length - 1].nlv : null;
    const risk = window.PlanRisk ? window.PlanRisk.riskOfTrade(t) : null;
    const plans = (Array.isArray(settings.plans) ? settings.plans : []).filter(p =>
      (p.ticker || '').toUpperCase() === (t.ticker || '').toUpperCase() && p.strategy === t.strategy &&
      t.date && p.at && Math.abs(T.daysBetween(p.at, t.date)) <= 5);
    const dte = T.dte(t), held = T.daysHeld(t), ann = T.annualizedROR(t);
    return {
      trade: {
        ticker: t.ticker, strategy: t.strategy, strike: t.strike, longStrike: t.longStrike, expiry: t.expiry, farExpiry: t.farExpiry,
        openDate: t.date, closeDate: t.closeDate, contracts: t.contracts, entryPrice: t.entryPrice, exitPrice: t.exitPrice,
        pl: t.pl, result: t.result, ror: t.ror, annualizedRor: ann, dteAtOpen: dte, daysHeld: held,
        openNote: t.openNote || null, closeNote: t.closeNote || null,
        capitalAtRisk: risk, nlvAtOpen: nlv, riskPctOfNlv: (risk != null && nlv) ? +(risk / nlv * 100).toFixed(2) : null,
      },
      ownerSelfReview: t.review || null,
      savedPlanBeforeOpen: plans.length ? plans[0] : null,
      ownerRules: {
        maxRiskPctOfNlvPerTrade: settings.planRiskPct != null ? settings.planRiskPct : 15,
        maxRiskPctPerTicker: settings.planTickerPct != null ? settings.planTickerPct : 30,
        minIvRankToSell: settings.planMinIVR != null ? settings.planMinIVR : 30,
        dteRange: '14–75 วัน',
        noEarningsBeforeExpiry: true,
        noFomcCpiBeforeExpiryPreferred: true,
        minPremiumPerShareWhenSelling: isSell ? 0.25 : null,
        sellPutNeedsCashToCoverAssignment: t.strategy === 'Sell Put',
        nakedSellCallNotAllowed: true,
        exitPlanBeforeEntry: 'ต้องตั้งเป้ากำไร % · จุดตัดขาดทุน (× พรีเมียม) · ปิดเมื่อเหลือกี่ DTE ก่อนเปิดไม้',
      },
      notAvailable: ['IV Rank ตอนเปิด', 'วันประกาศงบ/FOMC ในช่วงนั้น', 'ความเสี่ยงรวมใน ticker เดียวกันตอนเปิด'],
    };
  }

  function AIReview({ trade }) {
    const state = window.useStore();
    const settings = window.useSettings();
    const [res, setRes] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');

    useEffect(() => {
      let alive = true; setRes(null); setErr('');
      lastResult('review', trade.id).then(r => { if (alive && r) setRes(r); }, () => {});
      return () => { alive = false; };
    }, [trade.id]);

    if (!window.OZLAuth) return null;
    const run = async () => {
      setBusy(true); setErr('');
      try { setRes(await call('review', trade.id, reviewPayload(trade, state, settings))); }
      catch (e) { setErr(e.message || String(e)); }
      setBusy(false);
    };
    const T = window.TL;
    const html = res && window.FBDigest ? window.FBDigest.md(res.text) : '';

    return (
      <div className="ai-box">
        <div className="ai-head">
          <span className="ai-badge">AI</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>รีวิวโดย AI</div>
            <div className="faint" style={{ fontSize: 11.5 }}>เทียบไม้นี้กับกฎในหน้า "เช็คก่อนเทรด"</div>
          </div>
          <button className="btn btn-sm" disabled={busy} onClick={run}>
            {busy ? 'กำลังวิเคราะห์…' : res ? 'รีวิวใหม่' : 'ให้ AI รีวิวเทรดนี้'}
          </button>
        </div>
        {busy && <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>ใช้เวลาประมาณ 10–40 วินาที</div>}
        {err && <div className="ai-err">{err}</div>}
        {res && !busy && (
          <>
            <div className="md ai-md" data-ozl-skip="1" dangerouslySetInnerHTML={{ __html: html }} />
            <div className="faint" data-ozl-skip="1" style={{ fontSize: 11, marginTop: 8 }}>
              {res.at ? new Date(res.at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' · ' : ''}{res.cost_usd != null ? 'ค่าใช้จ่าย ~$' + Number(res.cost_usd).toFixed(3) + ' · ' : ''}ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน
            </div>
          </>
        )}
      </div>
    );
  }

  window.AIReview = AIReview;
})();
