-- 85_shizu_ref_note.sql — 시즈 예약표 参考事項을 현장 직접입력(일본어)으로 전환
--   · 기존: 参考事項 = 메리트 현지비고(remark_local, 한국어) 자동표시 → 현장(일본)에서 무의미
--   · 변경: shizu_team_memo에 ref_note 추가 → 트리플룸·합팀 등 현장 필요한 것만 일본어로 직접 입력·저장
--   · 現地메모(note)와 별개 칸. RLS는 기존 shizu_team_memo 정책 그대로(읽기 로그인·쓰기 shizu/room).
-- 멱등.
alter table public.shizu_team_memo add column if not exists ref_note text;
