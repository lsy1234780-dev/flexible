# /sync-main — main 브랜치 최신 변경사항을 현재 브랜치에 동기화

현재 고객 브랜치에 main(공용 베이스)의 최신 변경사항을 가져와 머지합니다.

## 실행 절차

1. **현재 상태 확인**
   - `git status`로 uncommitted 변경사항 확인
   - 변경사항이 있으면 `git stash push -u -m "sync-main 전 임시 저장"` 실행
   - 현재 브랜치명 확인 (`git branch --show-current`)
   - main 브랜치에서는 실행 거부: "main 브랜치에서는 sync할 필요가 없습니다."

2. **main 최신화**
   - `git fetch origin main`

3. **머지 시도**
   - `git merge origin/main --no-edit`
   - 충돌 발생 시:
     - 충돌 파일 목록을 사용자에게 보여줌
     - 각 충돌 파일의 충돌 내용을 보여줌
     - 사용자에게 해결 방법 확인 후 진행 (자동 해결 시도하지 말 것)

4. **stash 복원**
   - 1단계에서 stash 했으면 `git stash pop` 실행

5. **결과 보고**
   - 머지된 커밋 수, 변경 파일 수 요약
   - 충돌 여부 및 해결 상태
