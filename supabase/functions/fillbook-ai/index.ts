// ============================================================
// Edge Function `fillbook-ai` — ฟีเจอร์ AI ของกลุ่มแอป Fillbook (เรียก Claude API)
// ------------------------------------------------------------
// Secrets (Supabase → Edge Functions → Secrets) — ห้ามใส่ค่าจริงในโค้ด:
//   FILLBOOK_AI_KEY           API key จาก Claude Console (ตั้งชื่อ key ว่า "fillbook")
//   FILLBOOK_AI_USERS         user id ที่ใช้ได้ คั่นด้วย , (ตอนนี้ = บัญชีเจ้าของ)
//   FILLBOOK_AI_DAILY_LIMIT   เพดานต่อผู้ใช้ต่อวัน (ค่าเริ่มต้น 30)
//   FILLBOOK_AI_MINUTE_LIMIT  เพดานต่อผู้ใช้ต่อนาที (ค่าเริ่มต้น 3)
//   FILLBOOK_AI_MAX_SEARCHES  ค้นเว็บได้กี่ครั้งต่อคำถาม (ค่าเริ่มต้น 5, $0.01/ครั้ง)
//   FILLBOOK_CRON_SECRET      รหัสลับที่ตัวตั้งเวลา (pg_cron) ส่งมาใน header x-cron-secret
//   FILLBOOK_BRIEF_SEARCHES   ค้นเว็บได้กี่ครั้งต่อสรุปก่อนตลาดเปิด (ค่าเริ่มต้น 8)
// • ตอบเป็นภาษาไทยเสมอ · บันทึกการใช้ลงตาราง fillbook_ai_usage
// • API error / เครดิตหมด / ช้าเกิน → ส่ง "ฟีเจอร์ AI ใช้ไม่ได้ชั่วคราว" (code: ai_unavailable)
// • body: { app?: 'fillbook', kind: 'review' | 'ask' | 'premarket', ref?, payload }
//   - premarket: สรุป "เตรียมเทรดคืนนี้" (19:00 น. ไทย จ.–ศ. ข้ามวันหยุดตลาด US) → ตาราง fillbook_briefs
//     เรียกได้ 2 ทาง: pg_cron (header x-cron-secret · ทำให้ทุก user ใน FILLBOOK_AI_USERS) หรือกดเองในแอป (JWT)
//     ทำงานเบื้องหลัง (EdgeRuntime.waitUntil) แล้วตอบ 202 ทันที
//   - review: payload = ข้อมูลไม้ + กฎ → รีวิวเทียบกฎ
//   - ask:    payload.messages = ประวัติแชท → ถาม-ตอบออปชั่น + ข่าวหุ้น (ค้นเว็บเองเมื่อจำเป็น, สูงสุด FILLBOOK_AI_MAX_SEARCHES ครั้ง)
// ============================================================
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const MODEL = "claude-opus-5-5";
const PRICE_IN = 4 / 1e6;   // $ ต่อ input token
const PRICE_OUT = 20 / 1e6; // $ ต่อ output token (รวม thinking)
const PRICE_SEARCH = 10 / 1000; // $ ต่อการค้นเว็บ 1 ครั้ง
const UNAVAILABLE = "ฟีเจอร์ AI ใช้ไม่ได้ชั่วคราว";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const unavailable = (why: string) => { console.error("[fillbook-ai] unavailable:", why); return json(503, { error: UNAVAILABLE, code: "ai_unavailable" }); };

const THAI = "ตอบเป็นภาษาไทยเสมอ ศัพท์เทรดภาษาอังกฤษใช้ได้";

const REVIEW_SYSTEM = `คุณคือโค้ชเทรดออปชั่นที่รีวิว "ไม้ที่ปิดไปแล้ว" ให้เจ้าของสมุดบันทึกการเทรด Fillbook
งานของคุณ: เทียบไม้นี้กับ "กฎของเจ้าของ" ที่แนบมา แล้วบอกตรงๆ ว่าทำตามกฎข้อไหน พลาดข้อไหน

หลักการ
- ${THAI} กระชับ
- ตัดสินจากข้อมูลที่แนบมาเท่านั้น ข้อไหนข้อมูลไม่พอ ให้เขียนว่า "ไม่มีข้อมูล" ห้ามเดา
- กำไร/ขาดทุนไม่ได้บอกว่าทำถูกหรือผิด ไม้ที่กำไรอาจผิดกฎ ไม้ที่ขาดทุนอาจทำถูกทุกข้อ
- ถ้าเจ้าของรีวิวเองไว้แล้ว (แผน/อารมณ์/เหตุผลปิด/บทเรียน) ให้นำมาพิจารณาด้วย
- ห้ามแนะนำให้ซื้อ/ขายหุ้นหรือออปชั่นตัวใดในอนาคต

รูปแบบคำตอบ (Markdown)
## สรุป
1–2 ประโยค: ไม้นี้โดยรวมทำตามกฎแค่ไหน

## เทียบกับกฎ
ตาราง 3 คอลัมน์: | กฎ | ไม้นี้ | ผล | — ผลใช้ ✅ ผ่าน · ⚠️ เฉียด/ไม่ชัด · ❌ ผิดกฎ · ➖ ไม่มีข้อมูล

## ทำได้ดี
bullet 1–3 ข้อ

## ควรปรับ
bullet 1–3 ข้อ แต่ละข้อบอกว่าครั้งหน้าทำอะไรต่างไป

## บทเรียน 1 บรรทัด
ประโยคเดียว`;

const ASK_SYSTEM = `คุณคือผู้ช่วย AI ในแอป Fillbook (สมุดบันทึกการเทรดออปชั่นหุ้นอเมริกา) ตอบคำถามเรื่องออปชั่น การเทรด และข่าวหุ้น

หลักการ
- ${THAI} กระชับ อ่านง่ายบนมือถือ ใช้ Markdown ได้ (หัวข้อ, bullet, ตาราง) ไม่ต้องใส่รูป
- คำถามความรู้ทั่วไป (ศัพท์ Greeks, กลยุทธ์, การคำนวณ) ตอบจากความรู้ ไม่ต้องค้นเว็บ
- คำถามที่ต้องใช้ข้อมูลล่าสุด (ข่าว, ราคาวันนี้, งบ, เหตุการณ์ตลาด) ให้ค้นเว็บก่อนตอบ และระบุว่าข้อมูลเป็นของวันที่เท่าไร
- ค้นให้คุ้ม: วางแผนก่อนว่าต้องรู้อะไรบ้าง รวมหลายเรื่องไว้ในคำค้นเดียว เลือกหน้าที่มีข้อมูลครบในหน้าเดียว (เช่น หน้า quote/options ของ Yahoo Finance, Nasdaq, MarketWatch) ไม่ค้นซ้ำเรื่องเดิม
- ถ้าไม่แน่ใจหรือหาข้อมูลไม่เจอ ให้บอกตรงๆ ว่าขาดข้อมูลอะไร และแนะนำว่าเช็คเองได้ที่ไหน ห้ามแต่งตัวเลข
- ห้ามพูดถึงข้อจำกัดภายในของระบบ (เช่น โควตาการค้น จำนวนครั้งที่ค้นได้)
- อธิบายและวิเคราะห์ได้ แต่ห้ามสั่งให้ซื้อ/ขายตัวไหน และห้ามรับประกันผลตอบแทน`;

// ---- สรุป "เตรียมเทรดคืนนี้" ----------------------------------------------------
const BRIEF_SYSTEM = `คุณคือผู้ช่วยเตรียมเทรดของเจ้าของสมุดบันทึกการเทรด Fillbook (เทรดออปชั่นหุ้นอเมริกา อยู่ประเทศไทย)
ตอนนี้ประมาณ 19:00 น. เวลาไทย ก่อนตลาดหุ้นอเมริกาเปิด เขียนสรุปให้อ่านจบใน 3 นาที เพื่อเตรียมตัวก่อนเทรดคืนนี้

หลักการ
- ${THAI} กระชับ อ่านง่ายบนมือถือ
- ค้นเว็บหาข้อมูลล่าสุดของวันนี้ (ตามเวลาอเมริกา) วางแผนการค้นให้คุ้ม รวมหลายเรื่องในคำค้นเดียว
- ตัวเลขทุกตัวต้องมาจากที่ค้นเจอ ห้ามแต่ง ถ้าหาไม่เจอให้เขียนว่า "ไม่พบข้อมูล"
- เวลาเหตุการณ์ให้บอกเป็นเวลาไทย
- อธิบาย/วิเคราะห์ได้ แต่ห้ามสั่งซื้อ/ขาย ห้ามรับประกันผลตอบแทน
- ห้ามพูดถึงข้อจำกัดภายในของระบบ

รูปแบบ (Markdown)
## ภาพรวมก่อนตลาดเปิด
ตารางสั้น: S&P 500 futures · Nasdaq futures · VIX · ดอลลาร์ (DXY) · บอนด์ 10 ปี — ค่าล่าสุด และ % เปลี่ยนแปลง
แล้ว 1–2 ประโยคว่าบรรยากาศเป็นยังไง

## ปฏิทินคืนนี้
bullet: ตัวเลขเศรษฐกิจ / ประชุม Fed / คนจาก Fed พูด (เวลาไทย) · หุ้นใหญ่ที่ประกาศงบก่อนเปิด/หลังปิด

## หุ้นในพอร์ต + Watchlist
เฉพาะตัวที่มีข่าว ความเคลื่อนไหว pre-market หรืออีเวนต์ที่ต้องรู้ (งบ ปันผล) — ตัวไหนไม่มีอะไรไม่ต้องเขียน
ถ้ามีงบ/อีเวนต์ก่อนวันหมดอายุของไม้ที่เปิดอยู่ ให้เตือนชัดๆ

## Top movers pre-market
3–5 ตัวที่ขยับแรงพร้อมเหตุผลสั้นๆ

## ต้องระวังคืนนี้
3 ข้อสั้นๆ`;

// วันหยุดตลาดหุ้นอเมริกา (NYSE) — อัปเดตทุกปี
const US_HOLIDAYS = new Set([
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);
// วันที่ตามเวลานิวยอร์ก (YYYY-MM-DD) + วันในสัปดาห์
function nyDate(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" })
    .formatToParts(d).reduce((o, p) => { o[p.type] = p.value; return o; }, {} as Record<string, string>);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday };
}
function isUsTradingDay(d = new Date()) {
  const { date, weekday } = nyDate(d);
  return weekday !== "Sat" && weekday !== "Sun" && !US_HOLIDAYS.has(date);
}

// ไม้ที่เปิดอยู่ + Watchlist + หุ้นที่ถือ ของ user (อ่านอย่างเดียว ด้วย service key)
// deno-lint-ignore no-explicit-any
async function portfolioOf(admin: any, userId: string) {
  const out = { options: [] as Record<string, unknown>[], watchlist: [] as string[], stocks: [] as string[] };
  const { data: trades } = await admin.from("trades").select("data").eq("user_id", userId);
  for (const r of trades || []) {
    const t = r.data || {};
    if ((t.assetType || "option") === "option" && t.status === "Opened" && t.ticker)
      out.options.push({ ticker: String(t.ticker).toUpperCase(), strategy: t.strategy, strike: t.strike, longStrike: t.longStrike ?? undefined, expiry: t.expiry, contracts: t.contracts });
  }
  const { data: rows } = await admin.from("daily_nlv").select("date,data").eq("user_id", userId).like("date", "\\_\\_%");
  for (const r of rows || []) {
    const d = r.data || {};
    if (d.__watchlist && Array.isArray(d.items)) d.items.forEach((w: { ticker?: string }) => w && w.ticker && out.watchlist.push(String(w.ticker).toUpperCase()));
    if (d.__meta && Array.isArray(d.positions)) d.positions.forEach((p: { ticker?: string; lots?: { type?: string; shares?: number }[] }) => {
      const sh = (p.lots || []).reduce((s, l) => s + (l.type === "sell" ? -1 : 1) * (+(l.shares || 0)), 0);
      if (p.ticker && sh > 1e-6) out.stocks.push(String(p.ticker).toUpperCase());
    });
  }
  out.watchlist = [...new Set(out.watchlist)].slice(0, 40);
  out.stocks = [...new Set(out.stocks)].slice(0, 40);
  out.options = out.options.slice(0, 60);
  return out;
}

type Msg = { role: "user" | "assistant"; content: unknown };
type ClaudeOk = { text: string; sources: { url: string; title: string }[]; searches: number; cost: number; inTok: number; outTok: number; model: string };
type ClaudeResult = { fail: string } | ClaudeOk;
// เรียก Claude 1 งาน (รองรับ web search + pause_turn) → ผลลัพธ์ หรือ { fail: เหตุผล }
async function runClaude(apiKey: string, system: string, messages: Msg[], tools: unknown[] | undefined, timeoutMs: number): Promise<ClaudeResult> {
  const client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: tools ? 0 : 1 });
  let inTok = 0, outTok = 0, searches = 0;
  let msg;
  try {
    // web search อาจหยุดกลางทาง (pause_turn) → ส่งต่อให้ทำต่อ สูงสุด 3 รอบ
    for (let round = 0; round < 4; round++) {
      msg = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: "medium" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system,
        // deno-lint-ignore no-explicit-any
        messages: messages as any,
        // deno-lint-ignore no-explicit-any
        ...(tools ? { tools: tools as any } : {}),
      });
      inTok += msg.usage.input_tokens || 0;
      outTok += msg.usage.output_tokens || 0;
      searches += msg.usage.server_tool_use?.web_search_requests || 0;
      if (msg.stop_reason !== "pause_turn") break;
      messages = [...messages, { role: "assistant", content: msg.content }];
    }
  } catch (e) {
    // เครดิตหมด (400 credit balance), key ผิด (401), โดนจำกัด (429), Anthropic ล่ม (5xx), timeout/เน็ต
    if (e instanceof Anthropic.APIError) return { fail: `anthropic ${e.status}: ${e.message}` };
    return { fail: "connection: " + String(e) };
  }
  if (!msg) return { fail: "no response" };
  if (msg.stop_reason === "refusal") return { fail: "refusal " + JSON.stringify(msg.stop_details) };
  if (msg.stop_reason === "pause_turn") return { fail: "still paused after retries" };
  // deno-lint-ignore no-explicit-any
  const textBlocks = msg.content.filter((b) => b.type === "text") as any[];
  const text = textBlocks.map((b) => b.text).join("").trim();
  if (!text) return { fail: "empty response, stop_reason=" + msg.stop_reason };
  // แหล่งข่าวที่ AI อ้างอิง (จาก citations) — ไม่ซ้ำ, สูงสุด 12
  const sources: { url: string; title: string }[] = [];
  for (const b of textBlocks) for (const c of (b.citations || [])) {
    if (c?.url && /^https?:\/\//.test(c.url) && !sources.some((x) => x.url === c.url) && sources.length < 12)
      sources.push({ url: c.url, title: String(c.title || c.url).slice(0, 200) });
  }
  const cost = +(inTok * PRICE_IN + outTok * PRICE_OUT + searches * PRICE_SEARCH).toFixed(4);
  return { text, sources, searches, cost, inTok, outTok, model: msg.model };
}

// สร้างสรุปก่อนตลาดเปิดของ user 1 คน แล้วเก็บลง fillbook_briefs (ทับฉบับเดิมของวันเดียวกัน)
// deno-lint-ignore no-explicit-any
async function makeBrief(admin: any, apiKey: string, userId: string, app: string, maxSearches: number) {
  const ny = nyDate().date;
  const pf = await portfolioOf(admin, userId);
  const nowTh = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "short" }).format(new Date());
  const userText = `เวลาตอนนี้ (ไทย): ${nowTh}\nวันเทรดของตลาดอเมริกา: ${ny}\n\nพอร์ตของเจ้าของ (JSON):\n` + JSON.stringify(pf);
  const r = await runClaude(apiKey, BRIEF_SYSTEM, [{ role: "user", content: userText }],
    [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }], 300_000);
  if ("fail" in r) { console.error("[fillbook-ai] brief failed:", userId, r.fail); return { ok: false }; }
  const { error } = await admin.from("fillbook_briefs").upsert({
    user_id: userId, app, kind: "premarket", brief_date: ny, title: "เตรียมเทรดคืนนี้",
    content_md: r.text, sources: r.sources, cost_usd: r.cost, created_at: new Date().toISOString(),
  }, { onConflict: "user_id,app,kind,brief_date" });
  if (error) console.error("[fillbook-ai] brief save failed:", error);
  await admin.from("fillbook_ai_usage").insert({ user_id: userId, app, kind: "premarket", ref: ny, model: r.model,
    input_tokens: r.inTok, output_tokens: r.outTok, cost_usd: r.cost, output_text: null });
  return { ok: !error };
}

// งานเบื้องหลัง: ตอบกลับทันที แล้วทำต่อหลังตอบ (Supabase Edge Runtime)
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
  else p.catch((e) => console.error("[fillbook-ai] background:", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "ใช้ได้เฉพาะ POST" });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const apiKey = Deno.env.get("FILLBOOK_AI_KEY");
  const allowed = (Deno.env.get("FILLBOOK_AI_USERS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const dailyLimit = Number(Deno.env.get("FILLBOOK_AI_DAILY_LIMIT") || 30);
  const minuteLimit = Number(Deno.env.get("FILLBOOK_AI_MINUTE_LIMIT") || 3);
  const maxSearches = Math.max(1, Math.min(10, Number(Deno.env.get("FILLBOOK_AI_MAX_SEARCHES") || 5)));
  const briefSearches = Math.max(1, Math.min(15, Number(Deno.env.get("FILLBOOK_BRIEF_SEARCHES") || 8)));
  const cronSecret = Deno.env.get("FILLBOOK_CRON_SECRET") || "";

  let body: { app?: string; kind?: string; ref?: string; payload?: unknown; force?: boolean };
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }
  const app = String(body.app || "fillbook").slice(0, 40);
  const admin = createClient(url, service);

  // ---- ตัวตั้งเวลา (pg_cron): ทำสรุปก่อนตลาดเปิดให้ทุก user ที่เปิดใช้ ----
  const cronHeader = req.headers.get("x-cron-secret") || "";
  if (cronHeader) {
    if (!cronSecret || cronHeader !== cronSecret) return json(401, { error: "cron secret ไม่ถูกต้อง" });
    if (body.kind !== "premarket") return json(400, { error: "cron ใช้ได้เฉพาะ premarket" });
    if (!apiKey) return unavailable("FILLBOOK_AI_KEY not set");
    if (!body.force && !isUsTradingDay()) return json(200, { skipped: "ตลาดอเมริกาปิดวันนี้", ny: nyDate().date });
    background(Promise.all(allowed.map((uid) => makeBrief(admin, apiKey, uid, app, briefSearches))));
    return json(202, { started: allowed.length, ny: nyDate().date });
  }

  // ---- ตรวจตัวตน: ต้องอยู่ในรายชื่อ FILLBOOK_AI_USERS ----
  const sbUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json(401, { error: "ต้องเข้าสู่ระบบก่อน" });
  if (!allowed.includes(user.id)) return json(403, { error: "บัญชีนี้ยังไม่ได้เปิดใช้ฟีเจอร์ AI" });
  if (!apiKey) return unavailable("FILLBOOK_AI_KEY not set");

  // ---- rate limit ต่อผู้ใช้: ต่อนาที + ต่อวัน (นับทุกแอปในกลุ่ม) ----
  const used = async (sinceIso: string) => {
    const { count, error } = await admin.from("fillbook_ai_usage").select("id", { count: "exact", head: true })
      .eq("user_id", user.id).gte("created_at", sinceIso);
    if (error) throw error;
    return count || 0;
  };
  try {
    const day = new Date(); day.setUTCHours(0, 0, 0, 0);
    if (await used(new Date(Date.now() - 60_000).toISOString()) >= minuteLimit)
      return json(429, { error: "เรียกใช้ AI ถี่เกินไป รอสัก 1 นาทีแล้วลองใหม่", code: "rate_limited" });
    if (await used(day.toISOString()) >= dailyLimit)
      return json(429, { error: `ใช้ AI ครบ ${dailyLimit} ครั้งของวันนี้แล้ว พรุ่งนี้ใช้ได้ใหม่`, code: "rate_limited" });
  } catch (e) {
    return unavailable("usage table: " + JSON.stringify(e));
  }

  // ---- กดสร้างสรุปก่อนตลาดเปิดเองในแอป → ทำเบื้องหลัง แอปรอดูผลในตาราง ----
  if (body.kind === "premarket") {
    background(makeBrief(admin, apiKey, user.id, app, briefSearches));
    return json(202, { started: true, ny: nyDate().date, at: new Date().toISOString() });
  }

  // ---- เตรียมคำขอตาม kind ----
  let system: string;
  let messages: Msg[];
  let tools: unknown[] | undefined;
  let ref = body.ref ? String(body.ref).slice(0, 80) : null;
  if (body.kind === "review") {
    const data = JSON.stringify(body.payload ?? {});
    if (data.length > 20000) return json(400, { error: "ข้อมูลไม้นี้ยาวเกินไป" });
    system = REVIEW_SYSTEM;
    messages = [{ role: "user", content: "ข้อมูลไม้นี้ + กฎของเจ้าของ (JSON):\n" + data }];
  } else if (body.kind === "ask") {
    // payload.messages = ประวัติแชท (ข้อความล้วน) สลับ user/assistant ลงท้ายด้วย user
    const raw = (body.payload as { messages?: unknown })?.messages;
    if (!Array.isArray(raw) || !raw.length || raw.length > 12) return json(400, { error: "ประวัติแชทไม่ถูกต้อง" });
    const hist: Msg[] = [];
    for (let k = 0; k < raw.length; k++) {
      const m = raw[k] as { role?: string; content?: unknown };
      const role = k % 2 === 0 ? "user" : "assistant";
      if (m?.role !== role || typeof m.content !== "string" || !m.content.trim() || m.content.length > 6000)
        return json(400, { error: "ประวัติแชทไม่ถูกต้อง" });
      hist.push({ role, content: m.content });
    }
    if (hist[hist.length - 1].role !== "user") return json(400, { error: "ประวัติแชทไม่ถูกต้อง" });
    system = ASK_SYSTEM + "\n\nวันนี้: " + new Date().toISOString().slice(0, 10) + " (เวลา UTC)";
    messages = hist;
    tools = [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }];
    ref = ref || String(hist[hist.length - 1].content).slice(0, 80);
  } else {
    return json(400, { error: "ไม่รู้จักคำสั่งนี้" });
  }

  // ---- เรียก Claude (มีเพดานเวลา ไม่ให้แอปค้าง) ----
  const r = await runClaude(apiKey, system, messages, tools, 100_000);
  if ("fail" in r) return unavailable(r.fail);

  const { error: logErr } = await admin.from("fillbook_ai_usage").insert({
    user_id: user.id, app, kind: body.kind, ref,
    model: r.model, input_tokens: r.inTok, output_tokens: r.outTok, cost_usd: r.cost, output_text: r.text,
  });
  if (logErr) console.error("[fillbook-ai] log insert failed:", logErr);

  return json(200, { text: r.text, sources: r.sources.slice(0, 8), searches: r.searches, cost_usd: r.cost, model: r.model, at: new Date().toISOString() });
});
