# /create-pr — 현재 브랜치에서 main으로 PR 생성 (선택적 머지)

현재 브랜치의 변경사항을 main 브랜치로 보내는 PR을 생성합니다.
인자로 `--merge`를 전달하면 PR 생성 후 바로 머지까지 실행합니다.

## 인자

- `$ARGUMENTS` — 옵션 (예: `--merge`, `--merge --title "제목"`)

## 실행 절차

1. **사전 확인**
   - `git status`로 uncommitted 변경사항 확인
   - 변경사항이 있으면 사용자에게 알리고 커밋 여부 확인
   - 현재 브랜치명 확인 — main이면 실행 거부
   - `git log origin/main..HEAD --oneline`으로 포함될 커밋 확인

2. **리모트 푸시**
   - `git push -u origin HEAD`
   - 이미 푸시되어 있으면 최신 커밋만 푸시

3. **PR 생성**
   - 커밋 내역을 분석하여 PR 제목과 본문 자동 생성
   - PR 제목: 커밋 컨벤션 형식 (70자 이내)
   - PR 본문: 변경 요약 + 커밋 목록
   - `gh pr create --base main --title "..." --body "..."`
   - PR URL을 사용자에게 보여줌

4. **머지 (--merge 옵션 시)**
   - `$ARGUMENTS`에 `--merge`가 포함되어 있으면:
     - `gh pr merge <PR번호> --merge` 실행
     - 머지 완료 후 로컬 main 업데이트: `git fetch origin main`
   - `--merge`가 없으면 PR URL만 보여주고 종료

5. **결과 보고**
   - PR URL
   - 머지 여부
   - 포함된 커밋 수
