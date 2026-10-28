# 개발 가이드

[English](development.md) | [中文](development.zh.md) | 한국어

환경 구축 자습서는 새 기여자가 사전 준비 사항부터 검증을 통과한 온전한 로컬 개발 환경을 구축하기까지의 전 과정을 안내합니다. 뒤이은 기여자 참조 섹션에서는 저장소 구조, 일상적인 개발 워크플로, CI 구성을 설명합니다. 구체적인 설계 배경과 구현 세부 사항은 링크된 각 Agent Note와 스크립트에서 다룹니다.

## 환경 구축 자습서

### 사전 준비 사항

- Node.js 24.9 이상. CI는 24.9, 최신 24, 26을 다룹니다. 자세한 내용은 [Node 엔진 하한 Agent Note](../.agents/notes/implemented/process/2026-10-15-node-24-runtime-floor.md)를 참고하세요.
- Node.js TypeScript 타입 스트리핑 활성화. 저장소 빌드 스크립트는 tsdown의 네이티브 구성 로더로 `tsdown.config.ts`를 로드하므로 `NODE_OPTIONS`에 `--no-experimental-strip-types`가 있거나 Node.js 빌드에 TypeScript 지원이 없으면 실패합니다. `pnpm run build`가 이를 먼저 확인하고 원인을 알려 줍니다.
- Corepack이 활성화된 pnpm. 저장소는 `package.json`에서 `pnpm@11.28.5`를 고정합니다. `pnpm --version`이 Corepack을 통해 해석되지 않으면 `corepack enable`을 실행하세요.
- Git 2.26 이상. 훅 설정이 Git의 worktree 전용 구성 확장을 활성화합니다.
- 선택 사항: Web, headless, ACP 자동화 데모와 실제 API e2e 테스트를 위한 DeepSeek API 키.

### Windows와 WSL 2

Windows 환경에서는 Windows 네이티브 도구 체인을 직접 사용하거나 WSL 2(Linux용 Windows 하위 시스템) 환경을 활용할 수 있습니다. WSL 2는 Linux 환경에서의 동작을 검증하거나, 네이티브 의존성 컴파일 또는 파일시스템 권한 문제로 Windows 네이티브 개발이 원활하지 않을 때 유용합니다. 두 환경은 각각 독립된 런타임, 빌드 도구, 권한 체계를 요구하며, WSL 사용 여부는 선택 사항입니다.

소스 코드 체크아웃 경로, 설치된 의존성 패키지, 빌드 도구 체인은 반드시 동일한 파일시스템 환경에 두어야 합니다. WSL 2를 사용할 때는 저장소를 Linux 파일시스템에 두고, 네이티브 Windows 도구를 사용할 때는 Windows 파일시스템에 두세요. Windows와 Linux 파일시스템 간 교차 접근은 Git 작업, 의존성 설치, 프로젝트 빌드 등 I/O 집약적인 작업에서 심각한 성능 저하를 유발합니다. 자세한 내용은 Microsoft의 [파일 저장소 및 성능 지침](https://learn.microsoft.com/en-us/windows/wsl/filesystems#file-storage-and-performance-across-file-systems)을 참고하세요.

운영체제마다 네이티브 바이너리와 심볼릭 링크 구조가 다를 수 있으므로 각 환경마다 의존성을 독립적으로 설치해야 합니다. 테스트 결과는 테스트를 직접 실행한 환경에만 유효하며, Windows 고유 동작은 반드시 네이티브 Windows 환경에서 직접 검증해야 합니다.

### 최초 구축

pnpm은 엄격한 심볼릭 링크 링커를 사용하므로 선언되지 않은 의존성은 호이스팅에 기대지 않고 실패합니다. 의존성 빌드 스크립트는 `pnpm-workspace.yaml`에 명시적으로 허용 목록으로 두세요.

저장소 루트에서 의존성을 설치합니다:

```sh
pnpm install
```

설치 과정은 `scripts/install-lefthook.mjs`를 통해 worktree 로컬 Lefthook 훅도 구성합니다. 훅 경로 안전 규약은 [worktree 로컬 훅 Agent Note](../.agents/notes/implemented/process/2026-07-27-worktree-local-lefthook.md)가 소유합니다.

[DevTools 프런트엔드](../packages/experimental/inspector/README.md#use-this-package)는 고정된 npm 소스 패키지와 Vite로 로컬에서 컴파일됩니다. 의존성이 설치된 뒤에는 이 빌드에 네트워크 접근이나 브라우저 설치가 필요하지 않습니다. 워크스페이스와 게시 패키지 설치 모두 DevTools 리소스 다운로드 훅을 실행하지 않으며, 게시된 Inspector 패키지에는 빌드된 프런트엔드가 들어 있습니다.

의존성이 캐시에서 복원되었거나 `postinstall`이 건너뛰어져 훅이 없다면 직접 설치하세요:

```sh
node scripts/install-lefthook.mjs
```

래퍼 스크립트가 기존 Git 구성을 거부하거나 오래된 락(lock)을 보고하는 경우, 임의로 worktree 메타데이터를 직접 수정하지 말고 출력된 진단 메시지와 링크된 Agent Note의 지침을 따르세요. 체크아웃 디렉터리 위치를 변경한 후에는 래퍼를 다시 실행하여 해당 경로 설정을 새로 갱신해야 합니다.

새 클론 후 타입 검사를 한 번 실행합니다:

```sh
pnpm run typecheck
```

`pnpm run typecheck`가 성공적으로 종료되면 구축이 완료됩니다.

## 기여자 참조

### TypeScript 프로젝트 레이아웃

이 저장소는 분리된 Host 및 Client 집계(aggregate) TypeScript 설정을 사용합니다. 일반 패키지는 반드시 둘 중 정확히 하나의 집계 설정에만 등록되어야 합니다. Host 패키지는 `tsconfig.host.json`에, Client 패키지는 `tsconfig.client.json`에 등록됩니다. 예외적으로 3개 패키지(`host/webserver`, `compaction/compaction`, `typert/registry`)는 두 집계 설정 모두에서 공유 리프(leaf) 프로젝트로 참조하므로 양쪽 환경에서 동일한 소스를 각각 타입 검사합니다.

| 설정 파일 | 담당 역할 | 독립 Program을 생성하는가? |
|---|---|---|
| `tsconfig.json` | 솔루션 루트: base를 `extends`하고 `files: []`와 두 애그리게이트에 대한 참조를 가집니다. tsserver 검색 진입점이자 전체 Project Reference 그래프를 명시적으로 실행할 때의 진입점이며, 상속된 `paths`를 통해 `scripts/`를 실행하는 tsx의 해석 구성이기도 합니다. | 아니요 |
| `tsconfig.host.json` | Host 애그리게이트: Host 패키지, 예제, 테스트, 스크립트, website, 그리고 `api/remotes`의 예외적 Host project. | 예 |
| `tsconfig.client.json` | Client 애그리게이트: `packages/client/*` 패키지와 그 테스트, `apps/web`, 그리고 `api/remotes`의 예외적 Client project. | 예 |
| `tsconfig.base.json` | 공유 compilerOptions와 소스 `paths` 맵. 각 vitest 구성이 vite-tsconfig-paths를 향하게 하는 해석 파사드이기도 합니다. `include`가 없으므로 `paths`가 모든 importer에 적용됩니다. | 아니요 |
| `tsconfig.base.client.json` | 브라우저 컴파일 설정(`jsx`, DOM 라이브러리, `types: []`)으로, Client 애그리게이트와 모든 `packages/client/*` 패키지가 확장합니다. | 아니요 |

Host와 Client가 두 애그리게이트 program으로 남는 이유는 양쪽이 같은 키 아래 서로 다른 서비스로 cordis `Context` 인터페이스를 선언 병합하기 때문입니다. 하나의 program이 두 병합을 모두 보면 충돌을 보고합니다. 이 충돌은 `ts.Program` 내부에서만 존재하며 모듈 해석은 결코 이를 트리거하지 않으므로, 솔루션이 두 애그리게이트를 모두 참조하고 하나의 paths 파사드가 양쪽을 아우를 수 있습니다. 이에 따라 세 가지 원칙이 따릅니다:

- `tsconfig.base.json`에는 `include`나 `files`를 절대 추가하지 않습니다. 추가하면 이를 확장하는 모든 패키지 프로젝트로 새어 들어가 파사드의 전체 일치 범위를 좁힙니다.
- 저장소 전체 `ts.Program`을 구성하는 스크립트는 `tsconfig.host.json` 또는 `tsconfig.client.json`을 명시적으로 시드로 사용합니다. 루트 솔루션은 절대 시드로 쓰지 않습니다. 두 애그리게이트를 하나의 program으로 평탄화하면 `Context` 병합 충돌이 발생하기 때문입니다.
- 새 패키지는 정확히 하나의 애그리게이트에 등록합니다. 위의 분리 패키지만 두 리프 구성을 모두 가지며, 공유 리프는 양쪽이 같은 소스를 타입 검사해야 하므로 두 애그리게이트에 모두 등록됩니다. Node 로더 진입점과 브라우저 진입점을 모두 갖는 것은 패키지를 분리할 이유가 아닙니다. 일반 Client 플러그인은 Client 빌드 단계에서 두 런타임 아티팩트를 모두 생성합니다.

Host와 Client tsconfig를 분리한 패키지는 일곱 개입니다: `api/remotes`, `api/gateway`, `api/session-controller`, `api/workspace-controller`, `client/connection`, `session-query/session-log-export`, `experimental/liveshare-protocol`. `api/remotes`의 Host 진입점은 Host Typert 그래프에 참여하고 Client 진입점은 생성된 `/remote` 선언을 import합니다. `session-log-export`는 Node 아카이브 생성을 브라우저 controller 밖에 둡니다. `liveshare-protocol`은 Node 와이어 코덱을 Host 리프에, 브라우저 뷰어 캐리어를 Client 리프에 둡니다. 따라서 분리된 각 패키지 루트 `tsconfig.json`은 솔루션일 뿐이며, 두 애그리게이트와 직접 소비자는 각각 `tsconfig.host.json` 또는 `tsconfig.client.json`을 참조합니다. 워크스페이스 `constraints` 게이트는 도달 가능한 Project Reference 그래프를 순회하며 각 참조 프로젝트 자체의 컴파일러 페이스(face)를 검사합니다. 단일 구성 대상은 어느 페이스에서든 유효하지만, 분리된 대상은 솔루션 루트나 반대쪽 리프가 아니라 일치하는 리프를 지정해야 합니다. 이 게이트는 두 리프 구성이 모두 존재하는 것으로 분리 패키지를 발견하므로 새 분리 패키지가 자동으로 게이트에 포함됩니다. [`api-remotes` README](../packages/api/remotes/README.md)와 [`session-log-export` README](../packages/session-query/session-log-export/README.md)가 각각의 분리를 설명합니다.

`pnpm run build:artifacts`는 모든 아티팩트를 내보내며, 각 컴파일러 페이스의 패키지 참조만 검사하고 컴파일합니다. Client 컴파일은 Host 및 Desktop 번들링이 끝나기를 기다립니다. 분리된 컴파일러 페이스가 그 번들이 읽는 공유 `lib/types` 파일을 다시 쓰기 때문입니다. Client 번들링은 Client 컴파일 뒤에 이어집니다. 아티팩트 순서는 다음과 같습니다:

```sh
pnpm run build:native-system
pnpm exec tsx scripts/generate-typert.ts
tsc -b <tsconfig.host.json references>
tsdown --env.DSH_BUILD_FACE host
pnpm --filter @deepseek-ai/dsh-desktop run bundle
tsc -b <tsconfig.client.json references>
tsdown --env.DSH_BUILD_FACE client
pnpm run build:web
```

`pnpm run build:check`는 `tsc -p tsconfig.host.json`과 `tsc -p tsconfig.client.json`만 동시에 실행합니다. project 모드는 디스크에 이미 있는 패키지 선언을 기준으로 각 애그리게이트의 저장소 전체 테스트 및 스크립트 program을 검사하고 참조를 컴파일하지 않으므로, `build:check`는 누락되거나 오래된 `build:artifacts` 출력을 감지하지도 다시 빌드하지도 않습니다. 누락된 출력은 컴파일러 오류로 드러납니다. `pnpm run build`는 두 단계 집합을 하나의 [스케줄링된](../scripts/run-gates.ts) 의존성 그래프로 실행합니다. 각 애그리게이트 검사는 해당 페이스의 패키지 컴파일이 끝나는 즉시 시작해 남은 아티팩트 단계와 겹쳐 진행됩니다. 세 명령 모두에서 `DSH_GATE_CONCURRENCY`가 동시 단계 수를 제한하고(`1`이면 의존성 순서로 실행), `DSH_GATE_FAIL_FAST=1`은 첫 실패에서 남은 단계를 중단합니다. 그렇지 않으면 실패는 그 의존 대상만 건너뛰므로 독립적인 오류가 모두 보고됩니다. 실패한 단계는 자체 출력을 인쇄하며, 어떤 실패든 client 빌드 기록을 쓰지 않고 0이 아닌 상태로 종료합니다.

변경에 필요한 것에 따라 명령을 선택하세요:

| 상황 | 명령 |
|---|---|
| 패키지 소스를 반복 수정하며 실행 가능한 아티팩트가 필요함 | `pnpm run build:artifacts`; `dev:web`과 `dev:desktop`은 실행 전에 이를 먼저 수행합니다 |
| 테스트, 스크립트, 벤치마크 또는 website 코드의 타입 검사 | 최신 `build:artifacts` 이후 `pnpm run build:check`; 패키지 소스가 바뀌었으면 먼저 `build:artifacts`를 다시 실행 |
| TypeScript 작업 완료를 선언하기 전 | 최신 `build:artifacts` 이후 `pnpm run build:check`, 또는 `pnpm run build` |
| CI 필수 빌드 레인이 수행하는 완전한 검증 | `pnpm run build` |
| Web 및 Desktop 아티팩트 없는 타입 검사 | `pnpm run typecheck` |
| 린트 또는 문서 코드 블록 검사 | `pnpm run lint` 또는 `pnpm run doc-typecheck`; 각각 `host-contracts`를 스스로 준비 |

PR 아티팩트 빌더는 `build:artifacts`를 실행합니다. 필수 Linux 및 Windows 일반 빌드와 공개 `typecheck`는 저장소 전체 테스트 및 스크립트 program도 검사합니다. CI 벤치마크 준비는 일회용 라이브러리 출력에 `--noCheck`를 추가로 사용하며 진단은 그 필수 빌드에 의존하고, 다른 아티팩트 빌더는 패키지 검사를 유지합니다([근거](../.agents/notes/implemented/process/2026-10-05-pr-artifact-typechecks.md)).

두 tsdown 패스는 `vendor/*`, `packages/*/*`, `apps/cli`를 일치시키며, Host 패스는 `apps/desktop-host`도 일치시킵니다. 어느 패스도 빌드 아티팩트를 스캔해 Client 패키지를 발견하지 않고 Host/Client 패키지 필터 목록을 유지하지도 않습니다. 패키지 로컬 tsdown 구성은 `DSH_BUILD_FACE`를 통해 현재 단계의 항목을 선택합니다. 일반 Client 플러그인은 Client 단계에서 Node 로더와 브라우저 번들을 모두 생성하고, `api-remotes`는 `hostPhase: true`를 사용해 Host 진입점을 일찍 생성하고 Client 단계에서는 브라우저 번들만 생성합니다. tsdown은 앞선 tsc 단계가 `lib/types`에 내보낸 JavaScript만 소비합니다. tsdown은 일치하는 워크스페이스 멤버를 동시에 빌드하므로, 메인 번들이 워크스페이스 devDependencies를 그 `lib/` 출력에서 인라인하는 `apps/desktop`은 Host 패스 이후 자체 단계에서 번들됩니다([Desktop README](../apps/desktop/README.md#bundled-workspace-dependencies)).

Typert는 `tsconfig.host.json`을 통해 Host 타입을 분석하고 패키지 컴파일 전에 Host 리플렉션과 Host-for-Client Remote 선언을 생성합니다. 소스만 사용하는 [`generate-typert.ts`](../scripts/generate-typert.ts) 패스는 빌드 출력이 필요한 워크스페이스 import를 거부하며, 생성된 선언으로 되돌아오는 메타데이터 의존성도 포함합니다. Host tsdown은 메타데이터를 다시 생성하지 않고 소스 데코레이터를 낮추며, Client tsdown도 기존 메타데이터를 소비합니다. `pnpm run typecheck`는 메타데이터를 생성하고, 참조 순서로 Host 및 Client 패키지를 컴파일하며, 각 애그리게이트의 패키지 컴파일 후 `tsc -b`로 검사합니다. 이 명령은 네이티브 애드온, 번들, Web, client 빌드 기록을 건너뜁니다. `lint`, `lint:fix`, `doc-typecheck`는 `compile-referenced-projects.ts host-contracts`를 통해 메타데이터와 Host 패키지 선언을 준비하며, 생성 실패는 의존 컴파일을 중단합니다. 이 선언 전용 명령은 런타임 번들을 갱신하지 않으므로, 빌드된 출력을 실행하거나 테스트하기 전에 `build:artifacts`를 실행하세요.

`pnpm run build`와 `build:artifacts`는 루트 패키지 버전, 일곱 글자 소스 commit, Git이 로컬 변경을 보고할 때의 더티(dirty) 표시를 내장하며, 호출자가 제공한 다른 `DSH_CLIENT_*` 값도 상속합니다. `pnpm run build:official`은 CI 및 릴리스 아티팩트 빌드의 크로스 플랫폼 로컬 등가물이며 로컬 더티 표시를 생략합니다. 성공한 각 `build` 또는 `build:artifacts`는 정확한 공개 값을 Vite 출력 및 동적 클라이언트 번들에 묶는 gitignore된 기록을 씁니다. 릴리스 패킹과 빌드된 Web 테스트는 기록이 없거나 이후 부분 빌드로 아티팩트가 바뀐 경우 이를 거부합니다. `pnpm run dev:web`은 먼저 `build:artifacts`를 실행하고(`--skip-build`는 기존 아티팩트 트리를 재사용), 현재 버전과 Git 상태를 한 번 샘플링해 세션의 모든 watcher 단계에 그 환경을 공유합니다. watcher 단계가 기록된 아티팩트를 다시 쓰기 때문에 완전한 빌드 기록은 검증하지 않습니다.

`pnpm run build --profile local`은 로컬 클라이언트 브랜딩을 명시적으로 선택하고, 저장소 버전, commit, 더티 메타데이터를 보존하며, 상속된 클라이언트 제목과 기타 공개 재정의를 버립니다. `build:official`은 정확한 공식 값을 유지합니다. [Desktop 패키징](../apps/desktop/packaging/README.md#configuration-and-local-builds)은 서명 모드별로 프로필을 선택합니다.

정적 분석과 테스트는 base `paths` 맵을 통해 워크스페이스 import를 `src`로 해석하며 클린 트리에서 통과해야 합니다. 빌드된 `lib/` 출력을 소비하는 게이트는 그 의존성을 명시적으로 선언합니다. 생성된 Host-for-Client Remote 선언은 의도된 예외입니다. 공개 `typecheck`, `lint`, `doc-typecheck` 명령은 이를 먼저 생성하고, 내부 `*:contracts-ready` 스크립트는 이를 호출하는 공개 명령이나 스케줄러 게이트가 이미 Typert 계약 생성 단계나 완전한 빌드에 의존한다고 가정합니다. 게이트 준비 규약은 [Typert Remote 노트](../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md)를 참고하세요.

비즈니스 서비스는 Host에서 `@Remote` 또는 `@RemoteScope`로 호출 가능한 메서드를 선언합니다. Host 빌드는 Host-for-Client 타입과 런타임 기여를 생성하고, Client의 `api-remotes` 조합이 그 기여를 `ctx.remote` 및 범위 지정된 `agentCtx.remote` 네임스페이스 아래에 로드합니다. 양쪽의 생성 아티팩트, 그 조립 관계, SRC 개발 폴백, Web 빌드 순서는 [API Gateway](api-gateway.ko.md)를 참고하세요.

관련 로컬 검사가 빌드된 패키지 출력을 소비한다면 먼저 한 번 빌드하세요:

```sh
pnpm run build
```

`pnpm run hygiene`에는 빌드된 `lib/*.js` 파일에 대해 패키지 진입점을 검증하는 `publint`와, 임시 NodeNext 소비자에 대해 빌드된 선언을 검증하는 `verify-node-next-types`가 포함됩니다. 새 worktree에는 `pnpm run build`가 실행되기 전까지 번들된 JS나 선언이 없습니다. 일반 커밋과 푸시는 선택한 검사가 그 빌드를 소비하지 않는 한 빌드를 요구하지 않습니다.

### 환경 변수

실제 DeepSeek 어댑터와 키 기반 에이전트 데모는 환경이나 저장소 루트의 gitignore된 `.env`에서 자격 증명을 읽습니다:

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://... # optional
```

`DEEPSEEK_BASE_URL`은 선택 사항이며 기본값은 공개 공식 API 엔드포인트입니다. 실제 API 키 등의 자격 증명은 절대로 Git에 커밋해서는 안 됩니다. `DEEPSEEK_API_KEY`가 설정되어 있지 않으면 실제 API를 호출하는 e2e 테스트 스위트는 자동으로 실행을 건너뜁니다.

### Git 통합

`.i18n.yaml` 기록은 Git의 기본 텍스트 병합을 사용합니다. 기록은 두 브랜치가 같은 제목 섹션에서 언어별 콘텐츠를 모두 변경했을 때만 충돌합니다. Markdown을 해결한 뒤 `pnpm run verify-translation-pairing --write <pair>`를 다시 실행하세요. `pre-merge-commit`이 깨끗한 병합을 거부하면 Git은 커밋 없이 완전한 결과를 스테이징된 상태로 남깁니다. 실패를 복구하고 `git commit`을 실행하거나 `git merge --abort`를 실행하세요.

lefthook은 `lefthook.yml`에 빠른 로컬 체크포인트로 구성됩니다:

- `pre-commit`은 스테이징된 소유자 blob에 대해 스테이징된 페어링 기록을 검증하고, 프로젝트를 로드하지 않는 `.oxlintrc.staged.json` 프로필로 스테이징된 파일을 검증하며 Oxlint 수정을 한 번의 제한된 재시도로 적용하고, 스테이징된 diff의 공백 오류를 검사하고, pi-ai 제공자 메타데이터의 입력이나 생성 파일이 스테이징되었을 때 이를 검사하며, 벤더 매니페스트 가드를 실행합니다.
- `pre-merge-commit`은 Git이 자동 병합 커밋을 만들기 전에 같은 인덱스 기반 페어링 검사를 수행합니다.
- `pre-push`는 `pnpm run typecheck`를 실행하며, 이 명령은 번들링 없이 Typert 계약을 생성한 뒤 Client TypeScript 검사를 수행하고 두 애그리게이트를 모두 검사합니다.

벤더 매니페스트 가드는 `vendor/*/src` 아래의 변경이 해당 `vendor/README.md` 매니페스트 갱신과 함께 스테이징되었는지 검사합니다. 벤더링된 코드를 편집하기 전에 `vendor/README.md`를 읽으세요.

pi-ai 검사는 예상 메타데이터를 메모리에서 다시 생성합니다. 오래된 데이터는 파일을 다시 쓰거나 스테이징하지 않고 거부합니다. pi-ai 의존성이나 생성기를 바꾼 뒤에는 패키지의 [제공자 메타데이터 갱신 단계](../packages/llm/llm-pi-ai/README.md#generated-provider-metadata)를 따르세요.

범위가 한정된 페어링 및 제공자 메타데이터 검사를 제외하면, 이 훅은 의도적으로 테스트, 스냅샷, 문서 검사, 빌드, hygiene을 실행하지 않습니다. 기여자는 [변경된 동작과 관련된 검사](../AGENTS.md#run-relevant-checks-locally)를 한 번 실행하며, 포괄적 커버리지, 빌드된 아티팩트 스모크 테스트, Node 24.9·최신 24·26 호환성 매트릭스는 CI가 소유합니다.

기여자는 `pnpm run check:all`로 포괄적인 로컬 게이트 집합을 선택적으로 실행할 수 있습니다. 이 명령은 Git 훅과 무관하며 에이전트 지침이 아닙니다.

CI 밖에서(`CI`가 `true`가 아님) 기본 워커 수는 [로컬 워커 예산](../scripts/parallelism.ts)을 따릅니다: 게이트 스케줄러, `build`, `typecheck`, Oxlint, publint는 12이고, Vitest 포크와 로컬 커버리지는 48입니다. `doc-sync`, `test:docs`, `hygiene`, `check:all`은 CI에서도 한 번에 최대 8개 게이트를 실행합니다. `os.availableParallelism()`은 컨테이너의 CPU 할당량이 아니라 호스트 CPU를 보고하므로, 상한이 없는 기본값은 공유 호스트를 과다 구독합니다. CI는 러너의 CPU 수를 유지합니다. `DSH_GATE_CONCURRENCY`, `DSH_OXLINT_THREADS`, `DSH_COVERAGE_MAX_WORKERS`, Vitest `--maxWorkers`가 기본값을 재정의합니다.

### CI 게이트

키 없는(keyless) [CI 워크플로](../.github/workflows/ci.yml)는 독립 게이트를 넓은 레인으로 묶고 지원되는 Node 버전 전반에서 더 작은 호환성 신호를 실행합니다. 아티팩트 소비자는 자기 레인 안에서 한 번의 빌드를 기다립니다. 커버리지 파티션은 플랫폼과 러너 풀에 맞춰 범위가 지정된 파일 타이밍을 재사용해 구성된 워커 한도 안에서 작업을 균형 있게 나눕니다. 네이티브 Windows 레인은 별도 [CI Windows 워크플로](../.github/workflows/ci-windows.yml)에서, Python 검사는 별도 [CI Python 워크플로](../.github/workflows/ci-python.yml)에서 실행되며 각각 독립적으로 다시 실행할 수 있습니다. 필수 벤치마크는 표준 GitHub 호스팅 Linux에서 별도로 실행되며, 라우팅과 job 타임아웃은 [벤치마크 러너 참조](../benchmarks/AGENTS.md)가 소유합니다. 별도의 실제 API 워크플로는 구성된 워커 한도로 `pnpm run test:e2e`를 실행합니다. 현재 게이트와 job 목록은 [scripts/run-gates.ts](../scripts/run-gates.ts)와 워크플로 파일을 참고하세요.

자격 증명 없는 dsh 의존성 레이아웃 및 dsh/벤더 팩 리허설은 `DSH_CI_FAILOVER_LINUX=selfhosted`이고 이벤트가 신뢰된 master 푸시 또는 같은 저장소의 포크가 아닌 Dependabot이 아닌 풀 리퀘스트일 때만 기존 Linux 셀프 호스팅 풀을 사용합니다. 수동 디스패치를 포함한 다른 모든 경우에는 `ubuntu-24.94`를 사용하며, 수동 게시는 호스팅 환경에 남습니다. 영속 저장소 격리와 폴백 한도는 [릴리스 리허설 러너 참조](../.agents/notes/implemented/process/2026-07-26-ci-failover-runbook.md)를 참고하세요.

### 일상 명령

루트 [기여자 지침](../AGENTS.md#commands)이 일반 명령을 요약하고, [`package.json`](../package.json)과 [scripts/run-gates.ts](../scripts/run-gates.ts)가 현재 스크립트와 게이트 목록을 소유합니다. 변경된 표면을 커버하는 가장 작은 검사를 선택하세요. 문서 변경은 `pnpm run doc-sync`를 사용하고, 패키지 공개 동작 변경은 소유 README나 JSDoc도 갱신하며, 빌드된 아티팩트 검사에는 `pnpm run build`를 먼저 실행해야 합니다.

### 프로필 실행

이 소스 체크아웃 데모를 사용하기 전에 저장소 빌드를 따로 실행하세요:

```sh
pnpm run build
```

일회성 Headless 코딩 에이전트는 환경이나 저장소 루트 `.env`에 `DEEPSEEK_API_KEY`가 필요합니다:

```sh
pnpm dsh --profile headless "summarize this workspace"
```

PTC 모드 데모는 코드 표시를 활성화한 채 같은 headless 프로필을 실행합니다:

```sh
pnpm run demo:ptc -- "summarize this workspace"
```

### 애플리케이션 명령

Web과 Desktop은 명령 쌍 하나를 공유합니다. `start:*`는 이전 `pnpm run build` 또는 `build:artifacts`의 아티팩트를 실행하고, `dev:*`는 `build:artifacts`를 먼저 실행한 뒤 시작합니다. Web은 Host가 소스에서 실행되고 브라우저는 빌드된 번들을 로드하므로, 소스 수정 시 클라이언트 번들을 계속 다시 빌드합니다:

```sh
pnpm run start:web       # serve built Web artifacts through the source launcher (the same launch as pnpm dsh web)
pnpm run dev:web         # build, serve, and rebuild Web client bundles on source edits
pnpm run start:desktop   # launch built Desktop artifacts
pnpm run dev:desktop     # build, then launch Desktop
```

Web 명령 뒤의 인수는 `dsh web`에 전달됩니다. 예를 들어 `pnpm run dev:web --no-open --port 3081`입니다. `dev:web`은 기존 아티팩트 트리를 재사용하는 `--skip-build`와, 다른 곳에서 시작한 서버 옆에서 재빌드 watcher만 실행하는 `--no-serve`도 받습니다. 두 Web 명령은 일반 Harness 홈을 사용하고, Desktop 명령은 [Desktop README](../apps/desktop/README.md)에 설명된 격리된 개발 홈을 사용합니다. 루트 `Makefile`은 같은 명령을 `make web`, `make dev-web`, `make desktop`, `make dev-desktop`, `make build`로 이름 붙이며, `ARGS='--no-open'`이 옵션을 전달합니다.

### TODO 표시자

코드에서 알려진 문제를 표시하려면 긴급도 순으로 세 가지 주석 태그 중 하나를 사용하세요:

- `FIXME` — 새 릴리스를 차단해야 하는 문제입니다. 리뷰어가 변경을 그래도 병합해도 된다고 명시적으로 동의하지 않는 한, 열린 `FIXME`가 있는 릴리스는 내보내지 않아야 합니다.
- `TODO` — 자원이 확보되는 대로 곧 고쳐야 하는 문제입니다.
- `XXX` — 언젠가 고칠 수도 있는 문제입니다. 우선순위가 가장 낮고 약속이 없습니다.

코드를 검토하는 다른 개발자가 이번 릴리스의 차단 요인과 나중에 처리할 수 있는 작업을 명확히 구분할 수 있도록 긴급도에 맞는 적절한 태그를 사용하세요.

### 타입을 그대로 문서화하기(`ts type-equiv`)

[하위 시스템](subsystems/README.ko.md) 페이지는 소스와 동등한 선언을 원본 JSDoc과 함께 붙여 넣어, 독자가 정확한 타입 정의와 소스 규약을 볼 수 있게 합니다. 소스가 바뀔 때 붙여 넣은 내용이 어긋나지 않도록 ` ```ts type-equiv ` (` ```ts ` 대신)로 펜스하고, 미러링하는 소스 파일과 심벌을 지정해 `scripts/type-equiv.manifest.json`에 등록하세요:

```json
{ "doc": "docs/subsystems/session.md", "symbol": "SessionEvent", "source": "packages/core/session/src/types.ts" }
```

`pnpm run verify-type-equiv`(`doc-sync`의 일부)는 TypeScript 파서로 해당 심벌의 선언과 첨부된 JSDoc을 소스에서 추출하고, 블록이 둘 다와 일치하는지 검증합니다. 구현 본문이 카탈로그에 들어가지 않아야 하는 클래스에는 ` ```ts public-api `를 사용하고 `"projection": "public-api"`를 설정하세요. 검사된 프로젝션은 공개 필드, 생성자, 접근자, 메서드, 원본 클래스/멤버 JSDoc을 유지하면서 구현 본문과 비공개·보호 멤버를 생략합니다. 비교는 공백과 JSDoc이 아닌 주석을 무시하지만 멤버 문서를 포함한 모든 원본 JSDoc을 요구하므로, 독자는 정확한 타입 정의 옆에서 소스 규약을 볼 수 있습니다. 게이트는 문서, 심벌, 프로젝션별로 기본 블록과 매니페스트 항목 사이의 1:1 대응을 강제합니다. 짝을 이루는 `.zh.md` 블록은 추적된 전체 펜스 시퀀스가 바이트 단위로 동일하고 순서도 같을 때만 접미사 없는 형제 파일의 항목을 재사용합니다. `doc-typecheck`는 컴파일 가능한 펜스에 같은 파생 규칙을 적용하면서 두 소스 동등성 펜스 종류를 컴파일과 옵트아웃 비율에서 모두 건너뜁니다. 문서화된 선언이나 그 JSDoc을 변경하면 붙여 넣은 내용을 갱신할 때까지 게이트가 실패하며, 기본 블록을 추가하거나 제거하면 같은 변경에서 매니페스트를 갱신해야 합니다.
