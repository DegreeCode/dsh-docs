# dsh-docs

[DeepSeek Harness](https://github.com/DegreeCode/deepseek-harness)의 문서를 VitePress 사이트로 배포하는 저장소입니다.

[English](README.md) | 한국어

## 저장소 구성

- `docs/` — 기준이 되는 Markdown 문서입니다. 영어 원문, 중국어 번역본, 그리고 선택적으로 제공되는 한국어 번역본이 함께 포함되어 있습니다.
- `website/` — 해당 원문을 3개의 라우트 트리(`/`, `/zh/`, `/ko/`)로 매핑하여 제공하는 VitePress 사이트입니다.
- `scripts/project-doc-site.ts` — 경로 변환 어댑터입니다. 저장소 상대 경로 링크를 사이트 라우트나 GitHub URL로 변환하고, 각 페이지의 원본 Markdown 사본을 함께 생성합니다.
- `.github/workflows/docs-pages.yml` — 사이트를 빌드하여 GitHub Pages로 배포합니다.

## 문서를 별도 저장소로 분리한 이유

하네스(Harness) 메인 저장소는 소스 코드와 검증 게이트, 릴리스 자동화 절차를 모두 포함하고 있습니다. 문서만 수정하는 작업에는 전체 코드 트리가 불필요하며, 문서를 코드와 같은 저장소에 둘 경우 단순 번역 작업 시에도 애플리케이션, 데스크톱 설치 프로그램, 전체 테스트 매트릭스를 빌드하는 전체 소스를 체크아웃해야 했습니다. 이 저장소는 Node와 VitePress만으로 동일한 Markdown 문서를 빌드하고 배포할 수 있도록 경량화되었습니다.

## 소스 저장소 링크 처리

문서 내 링크의 대부분은 이 저장소에 포함되지 않은 파일(`packages/…`, `.agents/notes/…`)을 가리킵니다. 해당 링크들의 연결 대상은 다음 세 가지 환경 변수에 따라 결정됩니다:

| 환경 변수 | 의미 |
|---|---|
| `DOCS_REPOSITORY_URL` | 소스 코드, 이미지, 편집 링크가 가리킬 대상 저장소입니다. |
| `DOCS_REPOSITORY_REF` | 해당 링크가 고정(pin)할 기준 브랜치입니다. |
| `DOCS_ONLY_CHECKOUT` | `true`로 설정하면 현재 체크아웃에 없는 링크 대상에 대해 빌드 오류를 내지 않고 `DOCS_REPOSITORY_URL`을 기준으로 링크를 연결합니다. |

GitHub Actions 워크플로에서 이 세 값을 자동으로 설정합니다. 로컬 환경에서 사이트를 실행할 때도 동일하게 설정해야 합니다:

```sh
DOCS_ONLY_CHECKOUT=true \
DOCS_REPOSITORY_URL=https://github.com/DegreeCode/deepseek-harness \
DOCS_REPOSITORY_REF=next \
pnpm run docs:dev
```

## 주요 명령어

```sh
pnpm install
pnpm run docs:dev      # http://127.0.0.1:5173 에서 로컬 사이트 실행
pnpm run docs:build    # website/.dist 로 프로덕션 빌드
pnpm run docs:preview  # 빌드된 사이트 미리보기 서빙
```

## 배포

`main`/`master` 브랜치에 푸시하거나 **Deploy documentation** 워크플로를 수동으로 실행합니다. 먼저 **Settings → Pages → Build and deployment → Source: GitHub Actions**에서 Pages 배포를 활성화해야 합니다. 배포된 사이트는 `https://<owner>.github.io/<repository>/`로 서비스되며, 한국어 페이지는 `/ko/` 경로 아래에 위치합니다.

수동 실행 시 두 가지 입력을 지원합니다: `base_path`는 사이트의 기본 경로를 재정의하며, `deploy: false`는 배포 없이 아티팩트만 빌드합니다.

## 번역 규칙 (Translation Contract)

영어 원문과 중국어 번역본은 `foo.i18n.yaml` 일관성 추적 레코드와 함께 쌍을 이룹니다. 한국어 문서인 `foo.ko.md`는 해당 쌍 외부에 존재하는 선택적 세 번째 번역본입니다. 일관성 추적 레코드는 없으며 영어 원문이 기준이 됩니다. 한국어 번역본 내의 코드 블록(code fence)은 영어 원문과 바이트 단위로 정확히 일치하므로, 소스 동등성 검사에서는 이를 별개의 선언이 아닌 파생물로 취급합니다.

## 알려진 제약 사항

**하네스의 기타 문서 검사는 이 저장소에서 실행되지 않습니다.** `verify-md-links`와 `verify-md-wrap`은 이식되어 CI에서 실행됩니다. 그러나 `verify-type-equiv`(선언된 소스 타입과 코드 블록 대조), `verify-doc-budgets`(단어 수 상한 검사), `verify-translation-pairing`(en/zh 일관성 레코드 검증)은 하네스 메인 저장소 체크아웃에서만 실행되며, 해당 저장소에는 더 이상 이 문서 파일들이 포함되어 있지 않습니다. 특히 타입 동등성 검사는 하네스 소스 트리가 필요하므로, 두 저장소를 함께 체크아웃하는 CI 작업에서 실행해야 합니다.

**패키지 메타데이터 문구는 한국어로 번역되지 않습니다.** 플러그인의 제목과 설명은 하네스 저장소 내 각 패키지의 `locale/<language>.json`에서 제공됩니다. 이를 번역하려면 문서 수정이 아니라 언어팩 레이어의 메타데이터 API 지원이 필요합니다.

**다음 두 문서 트리에는 한국어 번역이 제공되지 않습니다.** `docs/persistence-changes/**`는 파일명에서 레코드 ID와 릴리스 산출물을 도출하며, `docs/upgrade-guide/**`는 `guide.md`, `guide.zh.md`, `guide.i18n.yaml` 형식만 허용합니다. 두 검증 게이트 모두 세 번째 언어 접미사를 허용하지 않으므로, 한국어 번역은 일반 독자를 위한 가이드 문서를 중심으로 제공됩니다.

**하네스 루트 문서 3종은 한국어 버전이 제공되지 않습니다.** `CONTRIBUTING.ko.md`, `SAFETY.ko.md`, `BRAND_GUIDELINES.ko.md`는 코드 저장소를 설명하는 문서이므로 이 문서 사이트 저장소에는 적합하지 않습니다. `README.ko.md`는 이 문서 저장소 자체의 README를 번역한 것입니다.

**데스크톱 설치 프로그램의 한국어화 리소스는 이 저장소에서 다루지 않습니다.** `apps/desktop/installer/locales/ko_KR.json` 및 설치 프로그램 구성은 Windows 설치 파일에 빌드되는 NSIS 리소스입니다. 이는 문서도 아니고 클라이언트 플러그인 코드도 아닙니다.

**락파일(Lockfile) 관련 사항:** 이 저장소는 원래 `pnpm-lock.yaml`을 커밋하지 않아 워크플로가 `--frozen-lockfile` 없이 설치하고 pnpm 캐시를 건너뛰도록 되어 있었습니다. 락파일을 커밋하고 두 설정을 다시 활성화하면 빌드 안정성과 속도가 향상됩니다.
