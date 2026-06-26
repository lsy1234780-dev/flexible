# /deploy-preview — Vercel 프리뷰 배포

현재 브랜치를 Vercel에 프리뷰 배포합니다.

## 실행 절차

1. **사전 확인**
   - `git status`로 uncommitted 변경사항 확인
   - 변경사항이 있으면 사용자에게 커밋 여부 확인
   - 현재 브랜치명 확인

2. **리모트 푸시**
   - `git push -u origin HEAD`
   - Vercel이 GitHub 연동되어 있으면 푸시만으로 프리뷰 배포가 트리거됨

3. **배포 상태 확인**
   - `gh api repos/{owner}/{repo}/deployments --jq '.[0]'`로 최신 배포 확인
   - 또는 Vercel CLI가 설치되어 있으면 `npx vercel --yes` 실행

4. **결과 보고**
   - 프리뷰 URL (있으면)
   - 배포 상태
   - "Vercel 대시보드에서 배포 상태를 확인하세요" 안내

## 참고
- Vercel 프로젝트가 GitHub 레포와 연동되어 있어야 합니다
- 고객별 Vercel 프로젝트는 별도로 설정해야 합니다 (사람이 직접)
