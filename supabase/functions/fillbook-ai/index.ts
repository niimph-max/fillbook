// ============================================================
// Edge Function `fillbook-ai` — ฟีเจอร์ AI ของกลุ่มแอป Fillbook (เรียก Claude API)
// ------------------------------------------------------------
// Secrets (Supabase → Edge Functions → Secrets) — ห้ามใส่ค่าจริงในโค้ด:
//   FILLBOOK_AI_KEY           API key จาก Claude Console (ตั้งชื่อ key ว่า "fillbook")
//   FILLBOOK_AI_USERS         user id ที่ใช้ได้ คั่นด้วย , (ตอนนี้ = บัญชีเจ้าของ)
//   FILLBOOK_AI_DAILY_LIMIT   เพดานต่อผู้ใช้ต่อวัน (ค่าเริ่มต้น 30)
//   FILLBOOK_AI_MINUTE_LIMIT  เพดานต่อผู้ใช้ต่อนาที (ค่าเริ่มต้น 3)
// • ตอบเป็นภาษาไทยเสมอ · บันทึกการใช้ลงตาราง fillbook_ai_usage
// • API error / เครดิตหมด / ช้าเกิน → ส่ง "ฟีเจอร์ AI ใช้ไม่ได้ชั่วคราว" (code: ai_unavailable)
// • body: { app?: 'fillbook', kind: 'review' | 'ask', ref?, payload }
//   - review: payload = ข้อมูลไม้ + กฎ → รีวิวเทียบกฎ
//   - ask:    payload.messages = ประวัติแชท → ถาม-ตอบออปชั่น + ข่าวหุ้น (ค้นเว็บเองเมื่อจำเป็น, สูงสุด 3 ครั้ง)
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
- ถ้าไม่แน่ใจหรือหาข้อมูลไม่เจอ ให้บอกตรงๆ ห้ามแต่งตัวเลข
- อธิบายและวิเคราะห์ได้ แต่ห้ามสั่งให้ซื้อ/ขายตัวไหน และห้ามรับประกันผลตอบแทน`;

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

  // ---- ตรวจตัวตน: ต้องอยู่ในรายชื่อ FILLBOOK_AI_USERS ----
  const sbUser = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
  const { data: { user } } = await sbUser.auth.getUser();
  if (!user) return json(401, { error: "ต้องเข้าสู่ระบบก่อน" });
  if (!allowed.includes(user.id)) return json(403, { error: "บัญชีนี้ยังไม่ได้เปิดใช้ฟีเจอร์ AI" });
  if (!apiKey) return unavailable("FILLBOOK_AI_KEY not set");

  let body: { app?: string; kind?: string; ref?: string; payload?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "ข้อมูลที่ส่งมาไม่ถูกต้อง" }); }
  const app = String(body.app || "fillbook").slice(0, 40);

  const admin = createClient(url, service);

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

  // ---- เตรียมคำขอตาม kind ----
  type Msg = { role: "user" | "assistant"; content: unknown };
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
    tools = [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }];
    ref = ref || String(hist[hist.length - 1].content).slice(0, 80);
  } else {
    return json(400, { error: "ไม่รู้จักคำสั่งนี้" });
  }

  // ---- เรียก Claude (มีเพดานเวลา ไม่ให้แอปค้าง) ----
  const client = new Anthropic({ apiKey, timeout: 100_000, maxRetries: tools ? 0 : 1 });
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
    // เครดิตหมด (400 credit balance), key ผิด (401), โดนจำกัด (429), Anthropic ล่ม (5xx), timeout/เน็ต → ข้อความเดียวกัน
    if (e instanceof Anthropic.APIError) return unavailable(`anthropic ${e.status}: ${e.message}`);
    return unavailable("connection: " + String(e));
  }
  if (!msg) return unavailable("no response");

  if (msg.stop_reason === "refusal") return unavailable("refusal " + JSON.stringify(msg.stop_details));
  if (msg.stop_reason === "pause_turn") return unavailable("still paused after retries");
  // deno-lint-ignore no-explicit-any
  const textBlocks = msg.content.filter((b) => b.type === "text") as any[];
  const text = textBlocks.map((b) => b.text).join("").trim();
  if (!text) return unavailable("empty response, stop_reason=" + msg.stop_reason);

  // แหล่งข่าวที่ AI อ้างอิง (จาก citations) — ไม่ซ้ำ, สูงสุด 8
  const sources: { url: string; title: string }[] = [];
  for (const b of textBlocks) for (const c of (b.citations || [])) {
    if (c?.url && /^https?:\/\//.test(c.url) && !sources.some((x) => x.url === c.url) && sources.length < 8)
      sources.push({ url: c.url, title: String(c.title || c.url).slice(0, 200) });
  }

  const cost = +(inTok * PRICE_IN + outTok * PRICE_OUT + searches * PRICE_SEARCH).toFixed(4);
  const { error: logErr } = await admin.from("fillbook_ai_usage").insert({
    user_id: user.id, app, kind: body.kind, ref,
    model: msg.model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, output_text: text,
  });
  if (logErr) console.error("[fillbook-ai] log insert failed:", logErr);

  return json(200, { text, sources, searches, cost_usd: cost, model: msg.model, at: new Date().toISOString() });
});
