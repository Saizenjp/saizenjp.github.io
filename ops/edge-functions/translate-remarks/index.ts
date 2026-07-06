// translate-remarks — 비고/현지비고 KO→JA 번역(DeepL) + bookings 캐시
// ---------------------------------------------------------------------------
//  · 호출: 로그인(JWT) 사용자만. 입력 { items:[{event_seq, remark, remark_local}] }
//  · 한글 포함 필드만 DeepL(KO→JA) 번역 → bookings.remark_ja / remark_local_ja 저장
//    (bookings 쓰기는 step1 전용 RLS라 클라 대신 여기서 service_role로 기록)
//  · 반환 { results: { [event_seq]: { remark_ja?, remark_local_ja? } } }
//  · 시크릿: DEEPL_API_KEY (free 키는 ':fx'로 끝남 → api-free 엔드포인트)
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 기본 주입.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const hasKo = (s: string) => /[가-힣]/.test(s || "");
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function deepl(texts: string[], key: string): Promise<string[]> {
  if (!texts.length) return [];
  const base = key.trim().endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com";
  const res = await fetch(base + "/v2/translate", {
    method: "POST",
    headers: { "Authorization": "DeepL-Auth-Key " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: texts, source_lang: "KO", target_lang: "JA" }),
  });
  if (!res.ok) throw new Error("DeepL " + res.status + ": " + (await res.text()).slice(0, 200));
  const j = await res.json();
  return (j.translations || []).map((t: { text: string }) => t.text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = Deno.env.get("DEEPL_API_KEY");
    if (!key) return json({ error: "DEEPL_API_KEY 미설정 — Supabase Edge Functions 시크릿에 추가하세요." }, 500);

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ results: {} });

    // 한글 포함 필드만 번역 배치로 수집
    const texts: string[] = [];
    const map: { seq: string; ja: string; idx: number }[] = [];
    for (const it of items) {
      for (const [field, jaField] of [["remark", "remark_ja"], ["remark_local", "remark_local_ja"]]) {
        const v = String(it[field] ?? "").trim();
        if (v && hasKo(v)) { map.push({ seq: String(it.event_seq), ja: jaField, idx: texts.length }); texts.push(v); }
      }
    }
    // DeepL 배치(요청당 ~45개로 청크)
    const translated: string[] = [];
    for (let i = 0; i < texts.length; i += 45) translated.push(...await deepl(texts.slice(i, i + 45), key));

    const results: Record<string, Record<string, string>> = {};
    for (const m of map) { (results[m.seq] ??= {})[m.ja] = translated[m.idx] ?? ""; }

    // bookings 캐시 기록(service_role)
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    for (const seq of Object.keys(results)) {
      await supa.from("bookings").update(results[seq]).eq("event_seq", seq);
    }
    return json({ results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
