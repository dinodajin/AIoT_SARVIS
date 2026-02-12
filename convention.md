# Git Convention

본 문서는 프로젝트에서 사용하는 Git 브랜치 및 커밋 메시지 컨벤션을 정의합니다.

---

## 1. Branch Convention

### 1.1 Main Branch
main (또는 master) : 최종 결과물 및 배포 브랜치
develop : 개발 통합 브랜치

### 1.2 Working Branch
feature/기능이름

fix/버그이름

refactor/대상

docs/문서이름

chore/기타작업

#### Example
feature/user-tracking

feature/monitor-control

fix/angle-calculation

docs/readme-update

chore/project-setup

#### Rules
- 소문자 사용
- 단어 구분은 하이픈(`-`) 사용
- 한글 사용 금지!!!
- 기능 단위로 브랜치 생성

---

## 2. Commit Message Convention

### 2.1 Format
type: subject

### 2.2 Type List
| Type | Description |
|---|---|
| feat | 새로운 기능 추가 |
| fix | 버그 수정 |
| refactor | 기능 변경 없는 코드 개선 |
| docs | 문서 수정 |
| style | 코드 포맷 수정 (공백, 세미콜론 등) |
| test | 테스트 코드 |
| chore | 설정, 빌드, 기타 작업 |

---

### 2.3 Subject Rules
- 현재형 사용
- 50자 이내 권장
- 마침표 사용 금지
- 무엇을 했는지 명확히 작성

#### Example
feat: add user position based monitor tracking

fix: correct robot arm angle calculation

refactor: separate monitor control logic

docs: update project README