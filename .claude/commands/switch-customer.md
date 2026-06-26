# /switch-customer — 고객 브랜치 전환

다른 고객 브랜치로 안전하게 전환하고, 해당 고객의 환경변수를 자동으로 활성화합니다.

## 인자

- `$ARGUMENTS` — 고객 식별자 (예: `jungwook`, `techsol`). 없으면 고객 브랜치 목록을 보여주고 선택.

## 실행 절차

### Step 1: 현재 상태 보호

```bash
git status
```

- uncommitted 변경사항이 있으면:
  - 사용자에게 "커밋하시겠습니까, 아니면 임시 저장(stash)하시겠습니까?" 질문
  - 커밋 선택 시: 커밋 진행
  - stash 선택 시: `git stash push -u -m "switch-customer: <현재브랜치>에서 작업 중 임시 저장"`

### Step 2: 대상 브랜치 확인

인자가 없으면 고객 브랜치 목록을 보여줌:

```bash
git branch -a | grep "customer/"
```

목록을 보여주고 사용자에게 선택 요청.

인자가 있으면:
- `customer/{고객식별자}` 브랜치 존재 확인
- 없으면: "customer/{고객식별자} 브랜치가 없습니다. /new-customer 로 먼저 생성하세요."

### Step 3: 브랜치 전환

```bash
git checkout customer/<고객식별자>
git pull origin customer/<고객식별자>
```

### Step 4: 환경변수 전환

3개 앱에서 `.env.{고객식별자}` → `.env.local` 복사:

```bash
cp apps/admin/.env.<고객식별자> apps/admin/.env.local
cp apps/b2b-portal/.env.<고객식별자> apps/b2b-portal/.env.local
cp apps/logistics/.env.<고객식별자> apps/logistics/.env.local
```

- `.env.{고객식별자}` 파일이 없으면:
  - 사용자에게 "이 고객의 환경변수 파일(.env.{고객식별자})이 없습니다."
  - ".env.example을 참고하여 Supabase 키를 입력해주세요." 안내
  - 사용자로부터 키를 받아 `.env.{고객식별자}` 생성 후 `.env.local`로 복사

### Step 5: 결과 보고

```
브랜치 전환 완료

  이전: <이전 브랜치>
  현재: customer/<고객식별자>
  환경변수: .env.<고객식별자> 활성화됨
```

- stash 했었으면: "이전 브랜치로 돌아갈 때 git stash pop 으로 작업을 복원하세요." 안내
