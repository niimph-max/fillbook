/* ============================================================
   ai.jsx — ฟีเจอร์ AI (เรียกผ่าน Edge Function `fillbook-ai` เท่านั้น)
   ------------------------------------------------------------
   • API key อยู่ฝั่ง Supabase — ห้ามใส่ในไฟล์นี้ (repo public)
   • กลุ่ม fillbook: Edge Function `fillbook-ai` · ตาราง fillbook_ai_usage
   • AIReview: ปุ่ม "ให้ AI รีวิวเทรดนี้" ในหน้ารีวิวไม้ (journal.jsx)
     ส่งข้อมูลไม้ + กฎจากหน้า "เช็คก่อนเทรด" ไปให้ AI เทียบ
   • รีวิวที่เคยทำ ดึงจากตาราง fillbook_ai_usage (RLS เฉพาะเจ้าของ) ไม่เก็บลง localStorage
   • AIChatPage: หน้า "ถาม AI" — ถาม-ตอบออปชั่น + ข่าวหุ้น (AI ค้นเว็บเองเมื่อจำเป็น)
     ประวัติแชทอยู่ในหน่วยความจำเท่านั้น (ปิดแอป = หาย) ส่งย้อนหลังสูงสุด 12 ข้อความ
   Exports window.AIReview, window.AIChatPage, window.FBAI
   ============================================================ */
(function () {
  const { useState, useEffect } = React;
  const { Icon } = window;

  const UNAVAILABLE = 'ฟีเจอร์ AI ใช้ไม่ได้ชั่วคราว';
  const TIMEOUT_MS = 90000;   // เกินนี้ = ถือว่าใช้ไม่ได้ ไม่ปล่อยให้ค้าง (แชทที่ค้นเว็บได้ใช้ 130 วิ)
  // ข้อความจากเซิร์ฟเวอร์ที่ให้แสดงตรงๆ (ที่เหลือ = ใช้ไม่ได้ชั่วคราว)
  const SHOW_AS_IS = [401, 403, 429];

  async function call(kind, ref, payload, timeoutMs) {
    if (!window.sbClient) throw new Error('ต้องเข้าสู่ระบบก่อน');
    let timer;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(UNAVAILABLE)), timeoutMs || TIMEOUT_MS); });
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

  // ---- หน้า "ถาม AI" -------------------------------------------------------
  // เก็บแชทไว้ระดับโมดูล: สลับไปหน้าอื่นแล้วกลับมายังอยู่ · ไม่ลง localStorage
  let chatStore = [];
  const SUGGEST = [
    'Theta คืออะไร ทำงานยังไงกับคนขายออปชั่น',
    'ทำไม IV ถึงลดลงหลังประกาศงบ',
    'Sell Put กับ Covered Call ต่างกันยังไง',
    'ข่าวล่าสุดของ NVDA มีอะไรบ้าง',
    'ตลาดหุ้นอเมริกาเมื่อวานเป็นยังไง',
  ];
  const domainOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

  function AIChatPage() {
    const [msgs, setMsgsRaw] = useState(chatStore);
    const setMsgs = v => { chatStore = typeof v === 'function' ? v(chatStore) : v; setMsgsRaw(chatStore); };
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const endRef = React.useRef(null);
    useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end', behavior: 'smooth' }); }, [msgs.length, busy]);

    const send = async (text) => {
      const q = String(text || '').trim();
      if (!q || busy) return;
      // ตัดคำถามที่ล้มเหลว (user + error ที่ตามมา) ออกจากประวัติ ให้สลับ user/assistant ถูกเสมอ
      const ok = msgs.filter((m, i) => !m.error && !(m.role === 'user' && msgs[i + 1] && msgs[i + 1].error));
      const next = [...ok, { role: 'user', content: q.slice(0, 2000) }];
      setMsgs(next); setInput(''); setBusy(true);
      // ส่งย้อนหลังไม่เกิน 12 ข้อความ (เริ่มที่ user เสมอ)
      let hist = next.map(m => ({ role: m.role, content: m.content })).slice(-12);
      if (hist[0].role !== 'user') hist = hist.slice(1);
      try {
        const r = await call('ask', null, { messages: hist }, 130000);
        setMsgs(cur => [...cur, { role: 'assistant', content: r.text, sources: r.sources || [], cost: r.cost_usd, searches: r.searches }]);
      } catch (e) {
        setMsgs(cur => [...cur, { role: 'assistant', error: true, content: (e && e.message) || UNAVAILABLE }]);
      }
      setBusy(false);
    };
    const onKey = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input); } };

    if (!window.OZLAuth) return <div className="content"><div className="card card-pad faint">ต้องเข้าสู่ระบบก่อนใช้ AI</div></div>;
    return (
      <div className="content aichat" data-ozl-skip="1">
        <div className="aichat-list">
          {!msgs.length && (
            <div className="aichat-empty">
              <span className="ai-badge" style={{ fontSize: 13, padding: '6px 10px' }}>AI</span>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 12 }}>ถามเรื่องออปชั่น หรือข่าวหุ้นได้เลย</div>
              <div className="faint" style={{ fontSize: 13, marginTop: 4 }}>คำถามข่าว/ราคาล่าสุด AI จะค้นเว็บให้ พร้อมลิงก์แหล่งข่าว</div>
              <div className="aichat-sugs">{SUGGEST.map(s => <button key={s} className="jchip" onClick={() => send(s)}>{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => m.role === 'user' ? (
            <div key={i} className="aichat-q">{m.content}</div>
          ) : m.error ? (
            <div key={i} className="aichat-a ai-err">{m.content}</div>
          ) : (
            <div key={i} className="aichat-a">
              <div className="md ai-md" data-ozl-skip="1" dangerouslySetInnerHTML={{ __html: window.FBDigest ? window.FBDigest.md(m.content) : '' }} />
              {!!(m.sources && m.sources.length) && (
                <div className="aichat-src" data-ozl-skip="1">
                  <div className="faint" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 4 }}>แหล่งข้อมูล</div>
                  {m.sources.map(s => (
                    <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title}<span className="faint"> · {domainOf(s.url)}</span></a>
                  ))}
                </div>
              )}
              <div className="faint" data-ozl-skip="1" style={{ fontSize: 11, marginTop: 6 }}>
                {m.searches ? 'ค้นเว็บ ' + m.searches + ' ครั้ง · ' : ''}{m.cost != null ? '~$' + Number(m.cost).toFixed(3) : ''}
              </div>
            </div>
          ))}
          {busy && <div className="aichat-a faint" style={{ fontSize: 13 }}>กำลังคิด… (ถ้าต้องค้นข่าวอาจใช้ถึง 1 นาที)</div>}
          <div ref={endRef} />
        </div>
        <div className="aichat-foot" data-ozl-skip="1">
        <div className="aichat-bar">
          <textarea className="input" rows="1" value={input} placeholder="พิมพ์คำถาม…"
            onChange={e => setInput(e.target.value)} onKeyDown={onKey} disabled={busy} />
          <button className="btn btn-primary" disabled={busy || !input.trim()} onClick={() => send(input)}>ส่ง</button>
          {!!msgs.length && <button className="btn" disabled={busy} onClick={() => setMsgs([])} title="ล้างแชท">ใหม่</button>}
        </div>
        <div className="faint aichat-note">ข้อมูลเพื่อการศึกษา ไม่ใช่คำแนะนำการลงทุน · AI อาจผิดพลาดได้ ตรวจสอบจากแหล่งข้อมูลก่อนตัดสินใจ</div>
        </div>
      </div>
    );
  }
  window.AIChatPage = AIChatPage;
})();
