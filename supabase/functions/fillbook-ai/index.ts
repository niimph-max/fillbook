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
// • body: { app?: 'fillbook', kind: 'review', ref?, payload }
// ============================================================
import Anthropic from "npm:@anthropic-ai/sdk@0.133.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const MODEL = "claude-opus-5-5";
const PRICE_IN = 4 / 1e6;   // $ ต่อ input token
const PRICE_OUT = 20 / 1e6; // $ ต่อ output token (รวม thinking)
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

  let system: string, userText: string;
  if (body.kind === "review") {
    const data = JSON.stringify(body.payload ?? {});
    if (data.length > 20000) return json(400, { error: "ข้อมูลไม้นี้ยาวเกินไป" });
    system = REVIEW_SYSTEM;
    userText = "ข้อมูลไม้นี้ + กฎของเจ้าของ (JSON):\n" + data;
  } else {
    return json(400, { error: "ไม่รู้จักคำสั่งนี้" });
  }

  // ---- เรียก Claude (ตัดที่ 60 วินาที ไม่ให้แอปค้าง) ----
  const client = new Anthropic({ apiKey, timeout: 60_000, maxRetries: 1 });
  let msg;
  try {
    msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: userText }],
    });
  } catch (e) {
    // เครดิตหมด (400 credit balance), key ผิด (401), โดนจำกัด (429), Anthropic ล่ม (5xx), timeout/เน็ต → ข้อความเดียวกัน
    if (e instanceof Anthropic.APIError) return unavailable(`anthropic ${e.status}: ${e.message}`);
    return unavailable("connection: " + String(e));
  }

  if (msg.stop_reason === "refusal") return unavailable("refusal " + JSON.stringify(msg.stop_details));
  const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
  if (!text) return unavailable("empty response, stop_reason=" + msg.stop_reason);

  const inTok = msg.usage.input_tokens || 0, outTok = msg.usage.output_tokens || 0;
  const cost = +(inTok * PRICE_IN + outTok * PRICE_OUT).toFixed(4);
  const { error: logErr } = await admin.from("fillbook_ai_usage").insert({
    user_id: user.id, app, kind: body.kind, ref: body.ref ? String(body.ref).slice(0, 80) : null,
    model: msg.model, input_tokens: inTok, output_tokens: outTok, cost_usd: cost, output_text: text,
  });
  if (logErr) console.error("[fillbook-ai] log insert failed:", logErr);

  return json(200, { text, cost_usd: cost, model: msg.model, at: new Date().toISOString() });
});
