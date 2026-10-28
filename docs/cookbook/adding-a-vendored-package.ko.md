# 쿡북: 벤더링된 패키지 추가

[English](adding-a-vendored-package.md) | [中文](adding-a-vendored-package.zh.md) | 한국어

하네스가 다른 업스트림 Cordis 패키지(예: `@cordisjs/plugin-http`)를 필요로 하면, npm 의존성으로 추가하지 않고 `vendor/` 아래에 고정된 소스로 **벤더링**합니다. [vendor/README.md](../../vendor/README.md)가 그 이유를 설명하고 이미 벤더링된 패키지를 *업데이트*하는 방법을 다룹니다. 이 가이드는 **새** 패키지를 추가할 때 확인할 파일별 체크리스트입니다. (기존 벤더링 집합을 기준으로 검증했으며, 어긋나면 이 문서를 고칩니다.)

## 1. 소스 복사

```
vendor/<dir>/
  package.json     # from upstream; rescope the name, keep exports/type (publishable release member, no private flag)
  tsconfig.json    # extends ../../tsconfig.base.json (see configuration below)
  src/             # the upstream src/ verbatim
  README.md LICENSE # if upstream ships them
```

`tsconfig.json`은 다른 벤더링 패키지를 그대로 따릅니다. 즉 `rootDir: src`, `outDir: lib/types`, 업스트림 코드에 필요한 엄격성 완화, 그리고 import하는 다른 벤더링 패키지마다의 `references` 항목입니다:

```jsonc
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src", "outDir": "lib/types",
    "noUncheckedIndexedAccess": false, "exactOptionalPropertyTypes": false,
    "noImplicitOverride": false, "noUnusedLocals": false, "noUnusedParameters": false
  },
  "include": ["src"],
  "references": [{ "path": "../cordis" }, { "path": "../cosmokit" }]
}
```

`package.json` 불변 조건: `name`을 다시 스코프하고([매핑](../rescope.ko.md)) 업스트림의 `exports`/`type`을 유지하며, 선언 메타데이터를 `lib/types`로 향하게 하고, `.d.ts`와 `.d.ts.map` 선언 출력을 게시하며, cordis 의존성을 업스트림 매니페스트와 일치하게 `peerDependencies`에 나열합니다. 벤더링된 패키지는 게시 가능한 릴리스 멤버이므로 `private: true`를 설정하면 안 되고 `publishConfig.access: public`을 설정해야 합니다. `version` 필드는 하네스 릴리스 순서를 따릅니다([vendor/README.md](../../vendor/README.md) 참고). 업스트림의 전이 의존성도 벤더링되어 있거나 이미 있어야 합니다. 패키지 하나를 벤더링하면 보통 그 의존성 트리도 함께 벤더링하게 됩니다(예: `@cordisjs/plugin-http`는 `@cordisjs/fetch-file`을 끌어옵니다).

벤더링된 TypeScript 소스의 로컬 상대 import/export는 복사 후 명시적 `.ts` 스펙을 사용합니다. 이는 업스트림과 다른 저장소 로컬 빌드 차이입니다. `rewriteRelativeImportExtensions`가 런타임 import는 `.js`로 출력하지만, 선언 파일에는 NodeNext/Node16 TypeScript 소비자가 해석할 수 있는 명시적 `.ts` 스펙이 남습니다.

## 2. 루트 구성에 등록

| 파일 | 변경 |
|---|---|
| `tsconfig.base.json` | `paths`에 `"<npm-name>": ["./vendor/<dir>/src"]` 추가 |
| `tsconfig.host.json` | `references`에 `{ "path": "./vendor/<dir>" }` 추가(`packages/*` 항목보다 앞에. 벤더링 코드는 호스트 집계를 통해서만 그래프에 들어갑니다) |
| `vendor/README.md` | 매니페스트 표에 행 추가(디렉터리, npm 이름, 버전, 업스트림 저장소, 커밋 SHA) 및 로컬 수정 사항 기록 |
| `scripts/publint-all.ts` | 벤더링된 패키지 자체를 이곳에서 게시하는 경우에만(보통 벤더링 의존성은 게시하지 않으므로 건너뜁니다) |

glob으로 자동 처리되므로 편집이 필요 없습니다: 루트 `package.json` 워크스페이스(`vendor/*`), `tsdown.config.ts`, `vitest.config.ts`, `.oxlintrc.json`. 패키지별 `vendor/<dir>/tsdown.config.ts`는 빌드 구성이 루트 기본값과 다를 때만(이중 ESM/CJS 또는 다중 엔트리 — `vendor/schemastery`와 `vendor/logger-console` 참고) 필요하며, 그 엔트리는 `lib/types` 아래 출력된 JS를 읽어야 합니다.

## 3. 매니페스트 가드 주의

`scripts/check-vendor-manifest.sh`(pre-commit 훅)는 `vendor/*/src` 아래 변경이 `vendor/README.md`도 함께 스테이징되지 않으면 실패합니다. 매니페스트 갱신을 소스와 함께 스테이징해야 커밋이 통과합니다.

## 4. 검증

```sh
pnpm install        # registers the workspace
pnpm run typecheck
pnpm run build && pnpm run constraints
```

[테스트 정책](../testing.ko.md)이 선택하는 동작 검사를 실행하세요. 소스 `paths` 맵은 `tsconfig.base.json`에 한 번만 있고 모든 그래프에 적용됩니다. 중요한 격리 경계는 프로젝트 참조 그래프입니다. 벤더링 소스는 자신의 `vendor/<dir>/tsconfig.json`을 통해 참조되어야 하며, 집계의 엄격한 프로그램으로 끌려 들어가면 안 됩니다([레이아웃](../development.ko.md#typescript-프로젝트-레이아웃)).
