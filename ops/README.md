# ops/ — SaiZen Yamanami 운영 Hub

이 폴더의 구조·실행·검증·SQL 적용 절차는 저장소 루트의 `README.md` 와 `CLAUDE.md` 를 본다(여기에 따로 적지 않는다).

## SQL(`hub/sql/`)을 다룰 때

- **운영 DB 에서 옛 번호 파일을 다시 실행하지 않는다.**
  - `05_room_inventory_real.sql` 은 야마나미·쿠주 객실 마스터를 지웠다 다시 넣는다 — 객실 행의 id 가 바뀌어 방배정의 객실 연결이 끊기고, 객실 폐쇄·객실 메모·청소 완료 기록이 함께 지워진다.
  - `06_rooms_member.sql` 은 맨 앞의 `truncate` 로 방배정(`rooms`) 전체를 비운다.
  - 뒤 번호 파일이 같은 함수·정책을 다시 정의했다(예: `has_any_area` 는 19 → 49 → 138). 앞 번호를 다시 돌리면 옛 정의로 되돌아간다.
- 적용 상태는 `hub/sql/00_VERIFY.sql` 로 확인하고, 고칠 것은 새 번호 파일로 더한다.
