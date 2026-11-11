# 제3자 구성요소 — .claude/ 아래의 외부 스킬

이 폴더의 아래 파일은 **이 저장소의 저작물이 아니다**. 공개 저장소 **addyosmani/agent-skills**(MIT 라이선스)에서
**내용을 바꾸지 않고** 그대로 가져온 것이다. 루트 `LICENSE`(All rights reserved)는 이 파일들에 적용되지 않는다.

- 출처: https://github.com/addyosmani/agent-skills
- 가져온 판: 커밋 `301b02b12bff98e4688e6984af6556802322bbde` (2026-11-01) — 플러그인 버전 0.6.15
- 가져온 날: 2026-11-11 (Min 요청 「추천 4개만 넣어줘」 — 25개 중 이 프로젝트에 맞는 4개)

| 가져온 파일 | 원본 경로 |
|---|---|
| `.claude/skills/debugging-and-error-recovery/SKILL.md` | `skills/debugging-and-error-recovery/SKILL.md` |
| `.claude/skills/code-review-and-quality/SKILL.md` | `skills/code-review-and-quality/SKILL.md` |
| `.claude/skills/security-and-hardening/SKILL.md` · `references/hardening-patterns.md` | `skills/security-and-hardening/…` |
| `.claude/skills/test-driven-development/SKILL.md` | `skills/test-driven-development/SKILL.md` |
| `.claude/references/security-checklist.md` · `performance-checklist.md` · `testing-patterns.md` | `references/…` (스킬 본문이 `../../references/` 로 가리키는 점검표) |

## 쓰는 규칙

- 이 스킬들은 **참고 절차**다. 이 프로젝트의 규칙(`CLAUDE.md`, `.claude/skills/saizen-ops-change`)이 **항상 우선**한다 — `CLAUDE.md` §3 참조.
- 본문이 가리키는 다른 스킬(`performance-optimization`·`constraint-driven-development`·`browser-testing-with-devtools`·`observability-and-instrumentation`)과
  슬래시 명령(`/spec`·`/plan`·`/build`·`/test`·`/review`·`/ship`)은 **가져오지 않았다**.
- 새 판으로 바꿀 때: 위 파일을 원본에서 다시 복사하고 이 문서의 커밋·날짜를 고친다(내용을 손대지 않았으므로 덮어쓰면 된다).

## 라이선스 (원본 LICENSE 전문)

```
MIT License

Copyright (c) 2025 Addy Osmani

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
