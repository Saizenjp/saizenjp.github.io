// translate-remarks — 비고/현지비고 KO→JA 번역(DeepL) + bookings 캐시
//  v2(2026-11-21 보안): 호출한 사람이 로그인한 활성 직원이고 시즈·객실·인쇄 영역이 있을 때만 돈다.
//  번역할 글자는 요청 본문이 아니라 DB(bookings)의 비고를 읽는다 — 남의 예약 번역 칸을 임의 글자로 덮어쓰지 못하게.
//  요청 모양·응답 모양은 v1 과 같다({items:[{event_seq,…}]} → {results:{seq:{remark_ja,remark_local_ja}}}).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const hasKo = (s: string) => /[가-힣]/.test(s || "");
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });
const MAX_ITEMS = 300;

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
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+\S+/.test(auth)) return json({ error: "로그인이 필요합니다" }, 401);

    // 호출자 확인 — 그 사람의 토큰으로 권한 함수를 부른다(활성 계정 + 시즈·객실·인쇄 영역, 관리자는 통과)
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: who } = await userClient.auth.getUser();
    if (!who || !who.user) return json({ error: "로그인이 필요합니다" }, 401);
    const { data: ok, error: eOk } = await userClient.rpc("has_any_area", { p_areas: ["shizu", "room", "print"] });
    if (eOk || ok !== true) return json({ error: "권한 없음(시즈·객실·인쇄 영역)" }, 403);

    const key = Deno.env.get("DEEPL_API_KEY");
    if (!key) return json({ error: "DEEPL_API_KEY 미설정 — Supabase Edge Functions 시크릿에 추가하세요." }, 500);

    const body = await req.json().catch(() => ({}));
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return json({ results: {} });
    if (items.length > MAX_ITEMS) return json({ error: "한 번에 " + MAX_ITEMS + "건까지" }, 400);
    const seqs = [...new Set(items.map((it: { event_seq?: unknown }) => Number(it && it.event_seq)).filter((n: number) => Number.isFinite(n) && n > 0))];
    if (!seqs.length) return json({ results: {} });

    const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rows, error: eRows } = await svc.from("bookings").select("event_seq,remark,remark_local").in("event_seq", seqs);
    if (eRows) throw eRows;

    const texts: string[] = [];
    const map: { seq: string; ja: string; idx: number }[] = [];
    for (const b of rows || []) {
      for (const [field, jaField] of [["remark", "remark_ja"], ["remark_local", "remark_local_ja"]]) {
        const v = String((b as Record<string, unknown>)[field] ?? "").trim();
        if (v && hasKo(v)) { map.push({ seq: String(b.event_seq), ja: jaField, idx: texts.length }); texts.push(v); }
      }
    }
    const translated: string[] = [];
    for (let i = 0; i < texts.length; i += 45) translated.push(...await deepl(texts.slice(i, i + 45), key));

    const results: Record<string, Record<string, string>> = {};
    for (const m of map) { (results[m.seq] ??= {})[m.ja] = translated[m.idx] ?? ""; }
    for (const seq of Object.keys(results)) {
      await svc.from("bookings").update(results[seq]).eq("event_seq", seq);
    }
    return json({ results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
