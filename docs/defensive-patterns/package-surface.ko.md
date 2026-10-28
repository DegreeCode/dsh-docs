# 패키지 표면 규칙

[English](package-surface.md) | [中文](package-surface.zh.md) | 한국어

패키지가 무엇을 내보내는지, 어떻게 빌드되는지, 의존성을 어떻게 선언하는지에 대한 규칙입니다. [development.md](../development.ko.md#typescript-프로젝트-레이아웃)는 레이아웃 자체를 설명하고, [packages/AGENTS.md](../../packages/AGENTS.md)는 상시 지침을 담고 있습니다.

## 플러그인 패키지는 Loader가 로드하는 것만 내보냅니다

플러그인 패키지의 진입점은 두 형태 중 하나를 취하며, 둘은 섞이지 않습니다. **함수 플러그인**은 `name`, `inject`, `Config`, `apply`를 이름으로 내보냅니다. `name`, `inject`, `apply`는 소문자이고, `Config`는 대문자이며 `interface`와 그 Schemastery 스키마 값 양쪽으로 나타납니다. **서비스 플러그인**은 서비스 클래스를 기본 내보내기로 내보내며, Loader는 그렇게 로드합니다. 네 가지 옆에 기본 내보내기가 있으면 Loader는 함수 플러그인의 네임스페이스를 버립니다. 그 외에 호스트 엔트리는 다른 패키지가 확장하거나 throw하는 Service Definition 클래스와 오류 타입을 내보낼 수 있으며(기능 seam이 바로 그것을 소비합니다), 테스트 편의 값을 내보내서는 안 됩니다. UI 플러그인 패키지의 `/client` 엔트리는 더 엄격하며 [packages/client/AGENTS.md](../../packages/client/AGENTS.md)가 그 규율을 소유합니다. 같은 패키지의 테스트는 상대 `../src/...` 경로나 `./src/*` 하위 경로로 내부에 접근하므로 테스트 전용 필요가 영구 내보내기가 되지 않습니다. 이 규칙은 테스트 편의가 게시된 API로 굳어지는 것을 막습니다.

- Loader 네 가지와 그 정확한 형태는 [cordis-primer.md](../cordis-primer.ko.md#로더-구성)에 정의되어 있습니다.
- 판단 조건: 함수 플러그인의 엔트리(`src/index.ts`)가 네 가지를 넘어서는 엔터티를 내보내는가? 네 가지 옆에 기본 내보내기가 추가되었거나 두 형태가 섞였는가? `/client` 엔트리가 구현 값을 내보내거나 다른 기능 플러그인이 그 값을 가져오게 하는가? 픽스처가 상대 경로로 다른 패키지에 도달하는가?
- 경계: 제약되는 것은 Loader 플러그인 진입점뿐입니다. 내부 모듈, 헬퍼 함수, 훅은 계속 값을 내보냅니다. 호스트 엔트리의 Service Definition 클래스와 오류 타입은 기대되는 내보내기이며, 테스트 픽스처는 자기 패키지 안에 남습니다. 다른 패키지의 `src`로 들어가는 상대 경로는 `exports` 맵과 패키지 경계 검사를 우회합니다.
- 예외: 기본적으로 없습니다. 진짜 필요한 예외는 도메인 소유자의 확인을 요구합니다.

준수하는 엔트리 — 네 가지 내보내기와, 다섯 번째 내보내기가 아니라 주석으로 기록된 같은 패키지 테스트 경로입니다.

```ts
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

// The plugin entry: the Loader four, and no fifth value
export const name = 'web-app'
export const inject = ['webServer']
export interface Config { /* … */ }
export const Config = z.object({ /* … */ })
export function apply(ctx: Context, config: Config): void { /* … */ }

// A same-package test imports '../src/internal/header.ts' instead of this entry
```

엔트리가 가져서는 안 되는 내보내기를 얻는 세 가지 방식이며, 셋 모두 diff에서 보입니다.

```ts ignore-check
// The entry widened so a test could reach one helper
export { isHeaderLine } from './internal/header.ts'

// Both plugin forms on one entry: the Loader discards the four
export default class WebApp {}

// A fixture reaching into another package by relative path
import { isSurfaceEligibleType } from '../../core/session/src/surface.ts'
```

## 두 가지 패키지 형태, 둘 다 동적 플러그인 패키지

새 패키지는 호스트 패키지이거나 호스트 + 클라이언트 패키지이며, 둘 다 동적 플러그인 패키지입니다. 세 번째 형태는 없고 예외도 없습니다. 셸이 [packages/client/web/src/platform.ts](../../packages/client/web/src/platform.ts)의 `PLATFORM_MODULES`로 초기화하는 정적 클라이언트 라이브러리(`client-store`, `ui-slots`, `ui-primitives`, `ui-dockkit`)와 [packages/util/](../../packages/util/) 아래의 무의존성 라이브러리는 이 규칙보다 앞서며 닫혀 있습니다. 즉 그대로 동작하고, 새 패키지는 결코 그 대열에 합류하지 않습니다. 진짜 양면 패키지만 컴파일러 페이스를 분리하며, 빌드 출력은 `lib`로 가고, `include`, `external`, 로스터 목록은 손으로 쓰는 대신 워크스페이스를 스캔해 도출합니다. 손으로 쓴 목록이나 발명된 컴파일러 페이스는 빌드 출력과 매니페스트를 어긋나게 하고, 이후 모든 패키지가 자기 목록을 유지해야 합니다.

- 판단 조건: 새 패키지가 동적 플러그인 패키지가 아닌 형태로 빌드되는가(정적 링크 번들링, 손으로 쓴 전체 외부화 목록)? 세 번째 `tsconfig` 변형이 있는가? 손으로 쓴 `include`, `external`, 로스터 목록이 있는가?
- 여기 숫자를 믿는 대신 형태를 다시 계산하세요: `packages/*/*` 아래의 `tsconfig.json` 파일을 나열하고, 이어서 `tsconfig.client.json`과 `tsconfig.host.json`도 있는 패키지, 그다음 `dsh.client`를 선언하는 패키지를 나열합니다.
- 경계: 양면 패키지는 `include`나 `exclude`에 나타날 수 있습니다.
- 예외: 없습니다. 승인 경로가 없습니다. 패키지 형태나 컴파일러 페이스 변경은 소유 문서에서 시작하며 도메인 소유자의 확인이 필요합니다.
- 소유자: 컴파일러 페이스는 [development.md](../development.ko.md#typescript-프로젝트-레이아웃), 패키지 그룹은 [packages/README.md](../../packages/README.md), 단계는 [adding-a-package.md](../cookbook/adding-a-package.ko.md)입니다.

두 형태 중 하나에 있는 패키지로, 표준 매니페스트 필드를 갖고 손으로 쓴 external 목록이 없습니다.

```json
{
  "name": "@deepseek-ai/dsh-example",
  "type": "module",
  "main": "lib/index.js",
  "types": "lib/types/index.d.ts",
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" }
  }
}
```

손으로 쓴 `external` 목록 — 그리고 이를 위해 한 패키지 옆에 발명한 `tsconfig.foo.json` — 는 스캔에 도출할 것을 남기지 않으므로 빌드 출력과 매니페스트가 어긋나기 시작합니다.

```json
{ "name": "@deepseek-ai/dsh-example", "external": ["@deepseek-ai/*"] }
```

## `package.json` `exports`는 표준 키 집합을 사용합니다

`package.json`의 `exports` 맵은 표준 키 집합만 사용하며, 표준 키 집합에서는 모든 키가 이미 저장소 전체에서 하나의 의미를 가지므로 패키지가 자기 로컬 목적으로 키를 새로 열지 않습니다. 문서화된 소유자 없이 소수 패키지만 쓰는 키는 선례가 아닙니다. 아래 미문서화 키를 포함해 키를 공식화하려면 같은 변경에서 소유 문서와 검사를 바꿔야 합니다. 작은 공유 키 집합이 있기에 소비자는 이름에서 키의 목적을 추론할 수 있고 스캔은 export 맵을 판단할 수 있습니다.

- 표준 키는 각각 저장소 전체에서 하나의 의미를 가지며 `packages/*/*/package.json`과 `apps/*/package.json` 전반에 적용됩니다: `.`(패키지 엔트리), `./package.json`(툴체인 접근이며 시맨틱 내보내기가 아님), `./src/*`(테스트와 도구를 위한 소스 통과이며 문서화 상태는 아직 미정), `./client`(브라우저 엔트리, `dsh.client` 선언과 짝), `./types`(타입 엔트리), `./typert`(typert 타입 런타임), `./remote`(`@Remote` 호출 표면), `./locale/*.json`(로케일 리소스), `./cordis.patch.yml`(`dsh.bundle`이 선언하는 번들 패치 계층). 개수는 다음 패키지에서 소용없어지므로 여기 나열하지 않으며, 아래 재계산 명령이 출력합니다.
- 그 집합 밖의 키(`./brand`는 5개 패키지, `./worker`는 4개, `./startup`, `./runner`, `./protocol`은 각각 2개, 그리고 다수의 일회성 키)는 문서화된 의미가 없습니다. 이들은 검토 대기 중이며 복사할 패턴이 아닙니다.
- `dsh-tools`는 재사용 가능한 호출 단계와 배치 스케줄링을 위해 `./pipeline`을 추가로 노출합니다. main과 pipeline 번들은 오류 클래스 동일성을 보존하기 위해 런타임 청크를 공유하며, 워크스페이스 제약이 export 대상과 게시 파일을 검사합니다.
- 판단 조건: 변경이 표준 집합 밖의 export 키를 추가하는가?
- 예외: 기본적으로 없습니다. 새 키는 먼저 소유 문서와 검사를 바꾸고 도메인 소유자의 확인을 받습니다.
- 분포를 재계산하세요:

```sh
python3 -c "import json,glob,collections; c=collections.Counter(); [c.update(json.load(open(p)).get('exports',{}).keys()) for p in glob.glob('packages/*/*/package.json')+glob.glob('apps/*/package.json') if isinstance(json.load(open(p)).get('exports'),dict)]; print(c.most_common())"
```

준수하는 맵 — 저장소 전체 의미로 사용된 세 가지 표준 키와, 클라이언트 엔트리도 선언한 패키지입니다.

```json
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" },
    "./types": { "types": "./lib/types/types.d.ts", "default": "./lib/types/types.js" },
    "./src/*": "./src/*",
    "./package.json": "./package.json"
  }
}
```

한 패키지의 로컬 목적을 위해 연 키 — 여기서는 문서화 상태가 미정인 `./brand`와 `./worker` — 는 export 맵을 소비자도 스캔도 읽을 수 없는 패키지별 관례가 되게 합니다.

```json
{
  "exports": {
    ".": "./lib/index.js",
    "./brand": "./lib/brand.js",
    "./worker": "./lib/worker.js"
  }
}
```

## 의존성 선언과 버전 일관성은 의존성 스캔이 강제합니다

의존성 선언과 버전 일관성은 의존성 스캔이 기계적으로 보장합니다. 이 페이지는 `devDependencies`와 `peerDependencies` 필드 규칙도, 패키지 허용 목록도 다시 쓰지 않습니다. 스캔이 실패하면 로컬에서 재현하고 스캔이 지목한 매니페스트를 고치세요. 스캔과 그 정책 파일이 규칙을 소유하기 때문입니다. 변경을 통과시키려고 스캔을 고치거나 정책을 완화하는 것은 정상적인 편집이 아니며 도메인 소유자의 확인이 필요합니다.

- 진입점: [verify-package-dependencies.ts](../../scripts/verify-package-dependencies.ts). `pnpm run verify-package-dependencies`로, `scripts/run-gates.ts`에서는 `package-dependencies` 게이트로, `.github/workflows/release.yml`에서는 직접 실행합니다.
- 정책 소유자: [package-dependency-policy.ts](../../scripts/package-dependency-policy.ts)가 `PACKAGE_DEPENDENCY_POLICY`를 내보내며, 선언 섹션, 버전 형태, 예외가 거기에 정의됩니다. 패키지 수준 맥락은 [packages/README.md](../../packages/README.md)에 있습니다.
- 경계: 이 페이지는 패키지, 필드 규칙, 임계값을 나열하지 않고 대신 소유 파일을 가리킵니다.
- 연결을 찾기: `grep -rn "verify-package-dependencies" package.json .github/workflows scripts/run-gates.ts`.
- 예외: 스캔이나 정책 변경은 도메인 소유자의 확인과 변경에 기록된 사유를 요구합니다.

반복 가능한 절차: 재현하고, 진단을 읽고, 지목된 매니페스트를 고칩니다.

```sh
# 1. Reproduce what CI reports
pnpm run verify-package-dependencies

# 2. The diagnostic names the manifest, the section, the dependency, and the expected range
#    packages/example/package.json: dependencies.@deepseek-ai/dsh-base must use workspace:*, found workspace:~

# 3. The fix goes into the manifest, never into the policy file or the scan
#    "dependencies": { "@deepseek-ai/dsh-base": "workspace:*" }

# 4. Re-run the scan until every package matches the published policy
pnpm run verify-package-dependencies
```

기계적 보장을 잃는 두 가지 방식: 매니페스트 대신 검사를 바꾸거나, 규칙을 이 페이지에 다시 써서 소유자와 어긋나게 하는 것입니다.

```text
Relaxing PACKAGE_DEPENDENCY_POLICY, or dropping the scanned section that fails, to go green
Restating a required-devDependency package list or the field rules on this page instead of linking the policy file
```

## 내부 의존성 문법은 패키지 패밀리를 따릅니다

내부 의존성 문법은 패키지 패밀리를 따릅니다. `@deepseek-ai/dsh`와 `@deepseek-ai/dsh-*`는 `workspace:*`, 다른 모든 내부 패키지는 `workspace:~`를 쓰며, `workspace:^`는 폐기되었습니다. 같은 의존성 이름은 모든 워크스페이스에서 같은 방식으로 표기하며, 불일치는 검토자가 면제할 수 있는 경고가 아니라 확정적 스캔 실패입니다. 균일한 문법은 하나의 해석 경로를 유지하고 의존성의 중복 인스턴스와 그로 인한 해석 차이를 막습니다.

- [verify-package-dependencies.ts](../../scripts/verify-package-dependencies.ts)의 `workspaceRange()`가 판단합니다: `@deepseek-ai/dsh`와 `@deepseek-ai/dsh-*` 패밀리는 `workspace:*`, 다른 모든 내부 패키지는 `workspace:~`를 받습니다. 스캔은 관리되는 매니페스트를 순회하며 같은 의존성 이름의 모든 선언을 비교합니다.
- 경계: 워크스페이스 멤버가 아닌 같은 네임스페이스 패키지는 일반 서드파티 범위를 선언하며 패밀리 규칙 밖입니다. `@deepseek-ai/libreoffice-kit`은 `apps/desktop-host/package.json`(dependencies), `packages/bundle/web-app/package.json`(devDependencies), `packages/document/office-to-pdf/package.json`(dependencies), `packages/skill/skill-office/package.json`(dependencies)에서 `^0.1.5`로 선언됩니다.
- 분포는 여기 다시 쓰지 않으며, 아래 재계산 명령이 `workspace:*`, `workspace:~`, `workspace:^`와 패밀리 규칙 밖의 정확한 범위 선언의 현재 개수를 출력합니다.
- 예외: 스캔이 기계적으로 결정합니다. 진짜 예외는 도메인 소유자의 확인과 변경에 기록된 사유와 함께 스캔과 정책 파일을 바꾸는 것입니다.
- 재계산:

```sh
python3 -c "import json,glob,collections; c=collections.Counter(); [c.update([r]) for p in glob.glob('apps/*/package.json')+glob.glob('packages/*/*/package.json')+glob.glob('vendor/*/package.json') for s in ('dependencies','devDependencies','optionalDependencies','peerDependencies') for n,r in (json.load(open(p)).get(s) or {}).items() if n.startswith('@deepseek-ai/')]; print(c.most_common())"
```

각 패밀리는 그 형태로, 멤버가 아닌 예외는 일반 버전 범위로 남깁니다.

```json
{
  "dependencies": {
    "@deepseek-ai/dsh-base": "workspace:*",
    "@deepseek-ai/cordis": "workspace:~",
    "@deepseek-ai/libreoffice-kit": "^0.1.5"
  },
  "devDependencies": {
    "@deepseek-ai/dsh-typert-registry": "workspace:*"
  }
}
```

`workspace:~`를 쓰는 `dsh-*` 패키지와 외부 범위에 고정된 워크스페이스 멤버 — 각각 확정적 스캔 실패이며, 폐기된 정확한 버전 고정 규칙은 대안으로 쓸 수 없습니다.

```json
{
  "dependencies": {
    "@deepseek-ai/dsh-base": "workspace:~",
    "@deepseek-ai/cordis": "^4.0.0"
  }
}
```

## 새 resolve 훅은 즉시 거부됩니다

새 `resolve` 훅은 기본적으로 거부됩니다. 선호를 피하는 것이 아니라 확정적인 금지입니다. 진짜 필요에는 두 가지 전제가 함께 있어야 합니다. 변경을 촉발한 지정자를 패치하는 것이 아니라 resolve 전략 전체를 다시 감사하는 것, 그리고 무엇이든 반영되기 전에 도메인 소유자의 확인을 받는 것입니다. 이 사례가 특별하다는 작성자 자신의 판단은 확인이 아닙니다.

- 판단 조건: 변경이 `resolve` 훅을 추가하는가, 같은 지정자를 다시 쓰는 기존 훅 주변의 래퍼를 포함해서?
- 경계: 이 규칙은 훅을 추가할 수 있는지 자체를 결정합니다. 해석, 핫 리로드, 플러그인 관리 책임의 분리는 별도로 규율되며 새 훅을 허용하지 않습니다.
- 하나의 해석 경로는 `dsh` 소스 실행이 등록하는 tsx ESM 훅이며, 그 근거는 [소스 실행 Agent Note](../../.agents/notes/implemented/architecture/2026-07-29-dsh-source-launch-tsx-esm.md)에 있습니다.
- 예외: 위의 두 전제만이며, 둘 다 변경에 기록되어야 합니다.

새 해석 동작이 진짜로 필요할 때의 준수 경로이며, 순서가 있습니다.

```text
A new resolve hook is allowed only after both preconditions hold:

1. Re-audit the resolve strategy as a whole — resolution, hot reload, and plugin
   management responsibilities together, not only the specifier at hand.
2. Record the domain owner's confirmation on the change.
3. Only then add the hook, linking both records from the change.

Until both hold, the answer is no; "this case is special" is the author's judgment,
not a confirmation.
```

이 패키지가 기대하는 곳으로 한 지정자가 들어가도록 추가한 훅, 또는 기존 훅 주변의 동등한 래퍼 — 해석 경로에 분기가 생기고 리졸버가 반환하는 것이 더 이상 `node_modules`와 일치하지 않습니다.

```ts ignore-check
// Added so one specifier resolves to the local source copy
export async function resolve(specifier: string, parentURL: string, importAttributes: object) {
  if (specifier === '@deepseek-ai/dsh-example') return { url: localSourceUrl, shortCircuit: true }
  return defaultResolve(specifier, parentURL, importAttributes)
}

// The equivalent shape: wrapping the hook that already exists
const previous = hooks.resolve
hooks.resolve = (specifier, context, next) =>
  pinned.has(specifier) ? pinned.get(specifier) : previous(specifier, context, next)
```

## 패키지 모듈은 모듈 스코프에서 await하지 않습니다

패키지 소스 모듈은 자체 거부를 처리하는 명시적 `main()`처럼 스스로 호출하는 함수 안에서 비동기 작업을 시작하며, 모듈 스코프에서 `await`, `for await`, `await using`을 절대 쓰지 않습니다. 모듈 스코프 대기는 모든 가져오는 쪽의 평가를 기다리게 하고, 거부를 모듈 평가 실패로 바꾸며, 브라우저 워커 이미지의 동기 CommonJS 래퍼로 낮출 수 없습니다.

- [verify-no-top-level-await.ts](../../scripts/verify-no-top-level-await.ts)가 판단하며, `pnpm run verify-no-top-level-await`와 `scripts/run-gates.ts`의 `no-top-level-await` 게이트로 실행됩니다. 이 스크립트는 모든 `packages/*/*/src/**/*.{ts,tsx}` 파일을 파싱하고 선언으로만 실행 파일을 제외합니다: `#!`로 시작하는 소스, 또는 패키지 `bin` 필드가 지정한 `lib/` 출력의 소스입니다.
- 예외: 없습니다.
