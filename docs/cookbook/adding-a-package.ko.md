# 개발 매뉴얼: 워크스페이스 패키지 추가

[English](adding-a-package.md) | [中文](adding-a-package.zh.md) | 한국어

새로운 `@deepseek-ai/dsh-<name>` 패키지를 생성할 때 확인해야 할 파일별 체크리스트입니다. 이 가이드는 bash 패키지와 어댑터 패키지를 템플릿 기준으로 검증하며, 두 구현과 차이가 생기면 이 문서를 업데이트합니다.

## 1. 패키지 생성

```
packages/<group>/<pkg>/
  package.json     # packages/core/tools 등에서 복사 후 name/description/deps 수정
  tsconfig.json    # ../../../tsconfig.base.json 확장, rootDir: src,
                   # outDir: lib/types, references: ../../../vendor/cosmokit,
                   # ../../../vendor/cordis (Config 사용 시 + ../../../vendor/schemastery,
                   # 각 dsh 의존성마다 + ../../<group>/<dep>)
  src/index.ts     # 서비스 default export 또는 플러그인 (name/inject/apply/Config)
  locale/en.json   # 선택적 표시 메타데이터: meta.title, meta.description, meta.detail
  locale/zh.json   # 동일한 필드를 사용하는 번역 파일
  README.md        # 서비스 API, 이벤트, 확장 지점, 설계 메모,
                   # + 게이트 검증 대상인 Model Experience 컨텍스트 블록 또는 축약형
                   # + 게이트 검증 대상인 "Known Limitations and Deferred Work" 섹션
                   # (또는 scripts/verify-package-readme-limitations.ts 의 화이트리스트 항목)
```

패키지의 역할에 맞는 기존 그룹(`core`, `llm`, `shell`, `compaction`, `subagent`, `todo`, `session`, `client`/`host`, `util`, `test-support`)을 선택하세요. 새 그룹을 추가할 수도 있지만, 새 그룹은 단순 디렉터리 컨테이너 역할만 합니다. 즉, 그룹 루트에는 `package.json`이나 소스 파일이 없어야 하며, 개별 패키지는 반드시 그룹 바로 아래 1단계 깊이에 위치해야 합니다.

`package.json` 불변 규칙(`pnpm run constraints` 및 `scripts/check-workspace-constraints.ts`로 강제): `private: true`, 루트 `package.json`과 일치하는 `version`, `type: module`, `main: "lib/index.js"`, `types: "lib/types/index.d.ts"`, `exports["."].types: "./lib/types/index.d.ts"`, `exports["."].default: "./lib/index.js"`, `@deepseek-ai/cordis`는 peerDependencies와 devDependencies 양쪽 모두에 동일한 버전 범위로 지정합니다. 모든 dsh 피어 의존성 또한 devDependencies에 동일하게 미러링하세요. `@deepseek-ai/schemastery`는 런타임 검증기이므로 agent-loop와 마찬가지로 `dependencies`에 둡니다. `files` 목록에는 `lib/index.js`, `lib/types/**/*.d.ts`, 그리고 게이트가 승인한 패키지별 런타임 산출물만 정확히 포함해야 합니다. 런타임 export가 빌드 출력 트리를 가리키는 패키지는 `lib/types/**/*.js`도 함께 포함합니다. `src`, 선언 맵(`.d.ts.map`), JS 소스 맵(`.js.map`), 오래된 루트 선언 파일은 배포 패키지에 포함하지 마세요. CLI 실행 바이너리가 있는 앱 패키지는 `files`에서 `lib/index.js` 바로 뒤에 `lib/bin.js`를 명시합니다.

패키지 내부의 상대 경로 import는 소스 코드에서 명시적인 `.ts` 확장자를 사용해야 합니다(예: `export * from './types.ts'`). TypeScript 컴파일러는 빌드된 JS 파일에서는 이를 `.js`로 변환하고 선언 파일(`.d.ts`)에서는 `.ts` 명시를 유지하여, NodeNext/Node16 모드의 TypeScript 소비자가 형제 `.d.ts` 파일로 올바르게 해석할 수 있도록 합니다.

## 2. 루트 빌드 설정에 등록

| 설정 파일 | 수정 내용 |
|---|---|
| `tsconfig.base.json` | 기존 그룹에 추가할 때는 수정 불필요. 새 그룹을 만든 경우 `@deepseek-ai/dsh-*` 와일드카드 경로에 `./packages/<group>/*/src` 후보를 추가 |
| `tsconfig.host.json` (Host 패키지) 또는 `tsconfig.client.json` (Client 패키지) | `references` 배열에 `{ "path": "./packages/<group>/<pkg>" }` 추가 — 일반 패키지는 반드시 둘 중 정확히 하나에만 속해야 하며 양쪽 모두에 속할 수 없습니다. `api/remotes`는 Host가 생성한 계약을 Client가 후속 단계에서 소비하는 특수한 빌드 분리를 사용하지만, 신규 패키지는 이를 모방해서는 안 됩니다 ([프로젝트 레이아웃 가이드](../development.ko.md#typescript-프로젝트-레이아웃) 참고). |

`packages/client/*` 패키지는 추가로 `tsconfig.base.json` 대신 `tsconfig.base.client.json`을 확장하며, 클라이언트 플러그인 패키지는 `package.json`에 `dsh.client`를 선언하고 `./client`를 export하며 공유 tsdown 프리셋(`packages/client/tsdown.client.ts`)을 호출합니다. 클라이언트 측 계약은 [packages/client/AGENTS.md](../../packages/client/AGENTS.md)를 참고하세요.

다음 항목들은 glob 패턴이나 패키지 매니페스트 자동 탐색으로 처리되므로 수동 편집이 필요 없습니다: 루트 `package.json`의 workspaces, `scripts/publint-all.ts`, `tsdown.config.ts`, `.oxlintrc.json`, `scripts/check-workspace-constraints.ts`.

## 3. 패키지 토폴로지 결정

교체 가능한 기능인 경우, Service Definition / Service Provider / Consumer 역할이 독립적으로 변경 및 발전해야 한다면 패키지를 분리하세요 (docs/architecture.md의 "기능 seam" 섹션 참고 — shell 3종 패키지가 기본 템플릿입니다). 단일 목적의 플러그인은 하나의 패키지로 유지합니다.

### 명확한 역할 기반의 이름 명명

현재 수행하는 안정적이고 명확한 책임을 기준으로 이름을 짓습니다. 최초의 특정 구현체, 미래의 잠재적 확장 기능, 또는 단순 Cordis 기반 클래스명을 패키지 이름으로 사용하지 마세요. 인터페이스 패키지는 기능 자체의 이름을 명명하고, 구현 패키지는 해당 기능을 구분하는 메커니즘, 프로토콜, 환경 또는 벤더명을 덧붙입니다. 동일 호스트(로컬 환경) 실행이 계약의 필수 조건일 때만 `local`을 접미사로 사용하세요.

단일 엔진, 런타임, 정책, 컨트롤러, 리졸버, 저장소, 또는 단일 활성 구성인 경우에는 단수형 `ctx` 키를 사용합니다. 레지스트리나 여러 이름이 지정된 멤버들을 소유하는 서비스에는 복수형 키를 사용합니다. 클래스의 역할과 키 이름의 단복수는 반드시 일치해야 합니다. 호환되지 않는 호스트 선언과 클라이언트 선언에 동일한 Cordis `Context` 키를 재사용하지 마세요. 두 런타임 컨텍스트를 분리하더라도 TypeScript 선언 병합(declaration merging)은 양쪽 선언을 모두 참조합니다. 자연스러운 복수형 이름이 이미 다른 쪽에 사용 중이라면 역할 접미사를 붙여 명확히 구분하세요.

| 용어 | 권장 사용 상황 | 사용을 피해야 할 상황 |
|---|---|---|
| `Controller` | 명령이나 사용자 의도를 전달받아 기존 도메인 상태나 화면 표시 상태를 변경할 때. | 임의의 작업을 직접 실행하거나, 다수의 제공자 풀을 소유하거나, 단순 표시용 값 변환만 수행할 때. |
| `Store` | 단일 데이터셋을 소유하며 주로 CRUD, 스냅샷, 구독 연산을 제공할 때. | 상태 머신을 검증하거나, 권한을 중재하거나, 작업을 디스패치하거나, 제공자 우선순위를 관리할 때. 단순히 Map 객체를 가지고 있다고 해서 클래스가 Store가 되는 것은 아닙니다. |
| `Directory` | 탐색이나 선택을 위해 항목 목록과 메타데이터를 노출할 때. | 생산자가 임의의 구현체를 등록하거나, 호출자가 해당 디렉터리를 통해 실제 작업을 실행할 때. |
| `Presenter` | 도메인 데이터나 도구 인자를 화면 렌더링 의도(render intent)로 순수 변환할 때. | I/O 작업을 수행하거나, 이벤트를 구독하거나, 상태를 변경하거나, 수명 주기를 소유할 때. |
| `Registry` | 이름이 지정된 동적 등록 항목 집합과 조회, 중복/우선순위 규칙, 수명 주기, 폐기(disposal)를 소유할 때. | 주된 역할이 디스패치, 실행, 취소, 정책 결정, 또는 워크플로 오케스트레이션일 때. |
| `Runtime` | 실시간 작업을 실행하고 여러 호출 전반에서 디스패치, 취소, 제공자 조율, 작업 수명 주기를 소유할 때. | 단순 레코드만 보관하거나, 카탈로그를 반환하거나, 단일 값을 계산하거나, 설정을 보관할 때. |
| `Resolver` | 전달된 입력값으로부터 답을 계산하거나 찾되, 그 결과의 수명 주기는 직접 소유하지 않을 때. | 가변 컬렉션을 관리하거나 장기 실행 작업을 소유할 때. |
| `Binder` | 선언된 인터페이스를 호출자의 컨텍스트나 수명 주기에 바인딩하여 바인딩된 객체를 반환할 때. | 데이터를 컬렉션 형태로 소유하거나, 도메인 상태를 제어하거나, 단순 데이터 변환만 수행할 때. |
| `Engine` | 도메인 알고리즘이나 상태 기반 실행 모델을 직접 구현할 때. | 단순히 제공자를 선택하거나 프로토콜 경계를 넘어 데이터를 전달하기만 할 때. |
| `Policy` | 무엇을 허용하고, 선택하고, 제한하고, 관찰할지 결정할 때. | 결정된 내용을 실행하는 실제 메커니즘을 직접 수행할 때. |
| `Executor` | 특정 기능 영역에서 하나의 명시적인 요청이나 해석된 명세를 실행할 때. | 광범위한 애플리케이션 수명 주기나 제공자 카탈로그를 총괄 소유할 때. |
| `Gateway` | 프로세스, 네트워크, RPC, API 경계를 중계 및 어댑팅할 때. | 동일 프로세스 내 서비스를 등록하거나 메타데이터만 저장할 때. |
| `Provider` | 기능 정의의 구체적인 구현체 하나를 제공할 때. 여러 구현이 존재할 수 있다면 메커니즘이나 벤더명을 수식어로 추가. | 기능 정의 자체이거나, 제공자 레지스트리이거나, 소비자 런타임일 때. |
| `Backend` | 정의된 인터페이스 뒤에서 교체 가능한 저수준 영속성, 전송, 또는 실행 메커니즘을 구현할 때. | 사용자 대상 서비스이거나, 반환된 단일 라이브 리소스 참조일 때. |
| `Handle` | 단일 라이브 리소스를 참조하며 해당 리소스를 제어하거나 관찰할 때. | 전체 리소스 풀을 생성하고 총괄 관리할 때. |
| `Config` | 해석 완료된 구성 값 하나나 엄격히 제한된 단일 레코드 및 그 업데이트 계약을 관리할 때. | 범용 컬렉션을 저장하거나, 작업을 실행하거나, 무관한 여러 설정을 노출할 때. |
| `Service` | 위의 구체적 역할로는 온전히 설명하기 어려운 응집력 있는 도메인 서비스를 소유할 때. | 클래스가 단순히 Cordis `Service`를 상속한다는 이유만으로 이름을 붙일 때. |

`SDK`라는 단어는 공식 지원되는 Python 및 TypeScript SDK가 사용하는 JSON-RPC 클라이언트/서버 프로토콜에만 한정하여 사용합니다. DeepSeek Harness 프로젝트 자체는 agent harness이지 SDK 프로젝트가 아닙니다. 제품명은 항상 표준 표기인 `Typert`를 사용하며, `TypeRT`나 `typeRT`로 쓰지 않습니다.

<a id="4-write-the-package-readme"></a>

## 4. 패키지 README 작성

패키지별 서비스 API, 구성, 이벤트, 확장 지점, 설계 메모를 상단에 배치합니다. [dsh-doc 메타데이터 참조](../../.agents/skills/dsh-doc/references/metadata-links-i18n.md#the-kind-system)에 정의된 4가지 kind 레이블(`group`, `reference`, `library`, `bundle`) 중 패키지의 저장소 내 위치와 진입점 형태에 맞는 값을 frontmatter `kind`로 지정합니다. 각 kind에 따라 적용되는 README 템플릿이 달라집니다. 제한 사항 섹션에는 이 패키지가 직접 소유하는 지속적인 소비자 격차와 유지관리자 관점의 중요한 제약 사항을 기록합니다. 일반적인 정리 작업은 소스 코드 내 TODO나 Agent Note에 남겨둡니다. 간접적인 Model Experience 설명에서는 이 패키지의 기여 항목을 외부에 노출하는 소비자의 이름을 언급할 수 있지만, 해당 소비자의 내부 구현까지 중복 설명하지는 않습니다. 패키지 README의 끝부분은 다음 표준 형식을 따릅니다:

````markdown
## Model Experience

### Request context and condition

#### What the model sees

데이터 종속 필드의 구체적 명세, 앵커가 지정된 자동 생성 카탈로그 링크, 또는 아래 인용문의 소개 문구.

##### Verbatim text for this field, when needed

```markdown
소스 코드에서 그대로 복사한 길이 제한 없는 안정적인 시스템 프롬프트 텍스트, 또는 생성되지 않은 장문 리터럴.
```

#### Token effect

Fixed(고정), conditional(조건부), retained(유지), replaced(대체), capped(상한), 또는 zero-direct(직접 영향 없음) 토큰 영향.

#### KV Cache effect

Append-only(추가 전용), prefix-stable(접두사 안정), replacing(대체), 또는 independent(독립) 동작과 캐시 재사용을 무효화할 수 있는 정확한 조건.

## Known Limitations and Deferred Work

- **소비자 노출 격차** — 누락된 구체적 연산이나 케이스, 그로 인한 영향, 유지관리자 제약 사항.
````

Model Experience 섹션은 실제 구현 내용을 바탕으로 작성합니다. 직접적, 조건부, 상한 지정, 수명 주기, 보조 모델 컨텍스트 항목마다 H3 제목 하나를 사용하고, 그 아래에 위에서 제시한 순서대로 3개의 H4 필드와 필드당 하나의 문단을 작성합니다. 패키지가 소유하는 안정적인 텍스트는 원문 그대로 인용합니다: 시스템 프롬프트 텍스트는 해당 내용을 소개하는 필드(일반적으로 `What the model sees`) 아래에 제목이 지정된 H5 및 `markdown` 코드 블록으로 배치하고, 짧은 리터럴은 명명된 자리표시자와 함께 인라인으로 작성하며, 기타 긴 리터럴은 동일하게 중첩된 코드 블록 형태로 작성합니다. 데이터에 따라 동적으로 바뀌거나 외부 제공자가 소유하는 텍스트만 요약하여 기술합니다. 도구 스키마 항목은 생성된 [도구 카탈로그](../tool-catalog.md)의 앵커 섹션으로 연결하고, 카탈로그에 없는 차이점만 서술합니다. 스코프 제한으로 인해 프롬프트와 스키마 중 하나만 숨겨질 수 있는 경우에는 둘을 별도 항목으로 분리하세요. `KV Cache effect`에서는 추가 전용 증가, 안정적인 반복 접두사, 이전 요청 토큰 대체, 독립적인 모델 요청 여부를 명확히 구분하고, 캐시 재사용을 무효화할 수 있는 패키지 소유 변경 조건을 구체적으로 명시하세요. "무효화하지 않는다"는 표현은 패키지가 이미 재사용 가능한 접두사를 온전히 보존한다는 의미이며, 제공자 측의 캐시 가용성이나 퇴출(eviction) 정책은 패키지 계약 범위 밖입니다. [문장 표준](../../.agents/skills/dsh-prose-standard/SKILL.md)이 완전성과 소유권 규칙을 규정하며, 자동 검증 도구가 필수 섹션 구조를 검사합니다.

컨텍스트 영향이 없거나 소비자가 소유하는 단일 경로만 있는 패키지는 [`SENTENCE_MODEL_EXPERIENCE`](../../scripts/verify-package-readme-model-experience.ts)에 정의된 표준 `None, as ` 또는 `Indirectly, through ` 검증 문구를 작성한 뒤, `KV Cache effect` H4 필드와 비어 있지 않은 문단 하나를 이어 붙입니다. 모델과 무관한 일반 범용 패키지는 대신 `NO_MODEL_EXPERIENCE_SECTION`에 등록할 수 있습니다. 두 경우 모두 다른 패키지의 작업을 장황하게 설명하지 마세요. 제한 사항 [허용 목록](../../scripts/verify-package-readme-limitations.ts)은 별도로 관리됩니다. 설계 배경은 [Model Experience 아카이브 Agent Note](../../.agents/notes/archived/process/2026-07-12-package-model-experience-contract.md)를 참고하세요.

<a id="plugin-display-metadata"></a>

## 5. 선택적 플러그인 표시 메타데이터 추가

npm 패키지 플러그인의 경우 `locale/en.json`에 제목과 설명을 정의합니다. `locale/zh.json`, `locale/ko.json` 등 다른 언어 파일도 동일한 필드를 사용합니다:

```json
{
  "meta": {
    "title": "Workspace Tools",
    "description": "Tools for your workspace."
  }
}
```

기존의 런타임 export 및 배포 파일 설정을 유지하면서 `package.json`에 다음 항목들을 추가합니다:

```json
{
  "exports": {
    "./package.json": "./package.json",
    "./locale/*.json": "./locale/*.json"
  },
  "files": ["locale/*.json"]
}
```

언어 파일들은 `locale/` 디렉터리에 모아두며, `en.json`이 기본 탐색 진입점이 됩니다. 필드는 선택 사항이지만 값이 있는 경우 비어 있지 않은 문자열이어야 합니다. 영어 `meta.title`과 `meta.description`은 문장 첫 단어, 고유 명사, 제품명만 대문자로 표기하는 sentence case를 사용합니다 (예: `Git worktrees`, [작성 규칙](../../.agents/skills/dsh-prose-standard/SKILL.md#required-coverage-by-prose-location) 참고). 런타임 시 누락된 파일이나 필드는 기본 언어로 폴백되지만, 잘못된 형식의 JSON이나 유효하지 않은 필드는 플러그인별 진단 오류를 발생시킵니다. 공식 1차 패키지와 플러그인 템플릿은 `en.json`이나 선택적 `zh.json`에 존재하는 모든 필드를 커버하는 `ja.json`, `es.json`, `fr.json`, `de.json`, `ru.json`, `pt.json`, `ko.json`을 제공해야 하며, 자리표시자, 슬래시 명령, API 필드명은 그대로 유지해야 합니다. 세부 문서 경로는 기존 영어 문서를 가리킬 수 있습니다. `locale/<subpath>/` 아래의 하위 경로 리소스도 동일한 검사를 거칩니다. 영어 설명은 사용자 관점의 동작을 설명하고 마침표로 끝나야 합니다. `pnpm run check:i18n`을 실행하여 JSON 메타데이터와 UI 사전의 완전성을 검증하세요. JSON 검사는 `check:all`, CI 정적 검사 및 위생 검사에서도 함께 실행됩니다.
