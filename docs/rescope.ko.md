# 벤더링된 패키지 rescope

[English](rescope.md) | [中文](rescope.zh.md) | 한국어

Cordis 프레임워크와 그 기반 라이브러리는 [`vendor/`](../vendor/README.md) 아래에 벤더링되어 `@deepseek-ai` 스코프로 게시됩니다. 모든 하네스 패키지가 프레임워크를 peer 의존성으로 선언하기 때문입니다. 하네스를 게시하면 이 계층도 함께 게시되고, 업스트림 이름으로 게시하면 그 이름들을 레지스트리에서 선점하게 됩니다. 이 페이지는 이름 매핑이며, 결정과 그 결과는 [rescope Agent Note](../.agents/notes/archived/process/2026-08-10-vendor-package-rescope.md)에, 업스트림 커밋은 [`vendor/README.md`](../vendor/README.md)에 있습니다.

## 이름 매핑

| 디렉터리 | 업스트림 이름 | 게시 이름 | 업스트림 버전 | 역할 |
|---|---|---|---|---|
| `vendor/cordis/` | `cordis` | `@deepseek-ai/cordis` | 4.0.0-rc.7 | 프레임워크 코어: `Context`, `Service`, `Fiber`, 이벤트 |
| `vendor/cosmokit/` | `cosmokit` | `@deepseek-ai/cosmokit` | 1.8.1 | 프레임워크와 Schemastery가 기반으로 삼는 공유 유틸리티 |
| `vendor/schemastery/` | `schemastery` | `@deepseek-ai/schemastery` | 3.18.0 | 모든 플러그인의 `Config` 뒤에 있는 구성 스키마(`Schema`) |
| `vendor/loader/` | `@cordisjs/plugin-loader` | `@deepseek-ai/cordis-plugin-loader` | 1.0.0-rc.5 | `cordis.yml` 로딩, 플러그인 해석, 저장소 캐시 |
| `vendor/include/` | `@cordisjs/plugin-include` | `@deepseek-ai/cordis-plugin-include` | 1.0.4 | 구성 include와 패치 오버레이 |
| `vendor/group/` | `@cordisjs/plugin-group` | `@deepseek-ai/cordis-plugin-group` | 1.0.0 | 중첩 플러그인 그룹 |
| `vendor/timer/` | `@cordisjs/plugin-timer` | `@deepseek-ai/cordis-plugin-timer` | 1.1.2 | `ctx`의 폐기 인지 타이머 |
| `vendor/hmr/` | `@cordisjs/plugin-hmr` | `@deepseek-ai/cordis-plugin-hmr` | 1.0.15 | 플러그인과 구성의 핫 모듈 교체 |
| `vendor/logger-console/` | `@cordisjs/plugin-logger-console` | `@deepseek-ai/cordis-plugin-logger-console` | 1.0.0 | 콘솔 로거 익스포터 |

하위 경로 export는 경로를 유지합니다: `@cordisjs/plugin-loader/repository`는 `@deepseek-ai/cordis-plugin-loader/repository`가 됩니다.

## 이름 변경이 건드리지 않는 것

- **디렉터리 이름과 업스트림 소스 버전.** `vendor/hmr/`는 `vendor/hmr/`로 남고, 표는 고정된 소스 스냅샷의 업스트림 버전을 기록하므로 매니페스트는 업스트림 스냅샷처럼 읽힙니다. 벤더링된 `package.json`의 자체 `version` 필드는 하네스가 릴리스한 매니페스트 버전이며, `pnpm run release:vendor`가 올리고 재동기화가 업스트림 버전으로 되돌립니다.
- **의존성 범위.** 이름 변경은 범위를 바꾸지 않고 의존성 키를 바꿉니다. 워크스페이스 매니페스트는 `workspace:` 프로토콜을 사용하며, [저장소 규칙](../AGENTS.md#conventions)이 정확한 DSH 참조와 vendor/네이티브 틸드 범위를 구분합니다.
- **Loader의 `cordis:` 내장 접두사.** `cordis:include`와 `cordis:group`은 패키지 이름이 아니라 프로토콜 접두사입니다.
- **`cordis.yml` 구성 패밀리**, 즉 `*.cordis.yml`, `*.cordis.snapshot.yml`, `cordis.patch.yml`을 포함합니다.
- **이름 자체에 그 단어를 담은 하네스 패키지**, 예를 들어 `@deepseek-ai/dsh-tool-cordis`.
- **업스트림 런타임 식별자**, 예를 들어 Schemastery의 `Symbol.for('schemastery')`와 그 `vendor:` 메타데이터 필드.
- **제품 식별자.** `GENERIC_SKIPS`의 파일은 나열된 업스트림 이름에 대해 프리셋 id, 이벤트 이름, 디렉터리 그룹 이름, 로케일 또는 입력 소스 키를 유지합니다. 소스 import, export, 모듈 선언, JSDoc import 타입은 JavaScript/TypeScript 펜스를 포함해 양방향으로 여전히 바뀝니다. YAML 플러그인 `name:` 값도 바뀝니다. 나열된 이름의 다른 문자열 용도는 그대로 남고, 다른 라이브러리 이름은 계속 검사됩니다.
- **재작성 픽스처.** `scripts/rescope-vendor.spec.ts`와 `scripts/gen-third-party-notices.spec.ts`는 두 패키지 표기를 테스트 데이터로 유지합니다.
- **`docs/` 외부의 일반 본문 텍스트.** `vendor/*/README.md`, 패키지 README, Agent Note는 작성 당시의 원본 명칭을 그대로 유지합니다. 해당 문서에서 단독으로 쓰인 `cordis`는 Python SDK의 옵션 이름이거나 agent-preset id일 수도 있습니다. `docs/` 내부에서는 위에서 언급한 검증된 식별자를 제외하고 일반 텍스트와 Markdown 코드 블록 모두 토큰 규칙을 엄격히 준수합니다.

## 코드에서 바꿔야 하는 것

| 사이트 | 이전 | 이후 |
|---|---|---|
| 모듈 import | `import { Context } from 'cordis'` | `import { Context } from '@deepseek-ai/cordis'` |
| 타입 지정 이벤트 병합 | `declare module 'cordis'` | `declare module '@deepseek-ai/cordis'` |
| `package.json` 의존성 키 | `"@cordisjs/plugin-hmr": "^1.0.15"` | `"@deepseek-ai/cordis-plugin-hmr": "^1.0.15"` |
| `cordis.yml` 플러그인 엔트리 | `name: '@cordisjs/plugin-include'` | `name: '@deepseek-ai/cordis-plugin-include'` |

## 적용, 검증, 되돌리기

[`scripts/rescope-vendor.ts`](../scripts/rescope-vendor.ts)가 위의 매핑을 소유하고 이름 변경을 수행하므로 어떤 참조도 손으로 바꾸지 않습니다:

```sh
pnpm run rescope-vendor            # report what would change
pnpm run rescope-vendor --apply    # rewrite every reference
pnpm run rescope-vendor:check      # assert the post-state; runs in the hygiene gate
pnpm run rescope-vendor --apply --reverse   # return to the upstream names
```

업스트림 동기화 후 다시 적용하고([절차](../vendor/README.md)), 그다음 출력되는 재생성을 따르세요: 잠금 파일은 `pnpm install`, `pnpm run gen-third-party-notices`, 그리고 건드린 이중 언어 쌍은 `pnpm run verify-translation-pairing --write`입니다.
