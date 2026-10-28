# Cordis 자습서

[English](index.md) | [中文](index.zh.md) | 한국어

Cordis는 DeepSeek Harness의 기반이 되는 플러그인 프레임워크입니다. 도구, LLM 어댑터, 파일 접근, 에이전트 루프 자체까지 모든 기능이 공유 컨텍스트에 마운트되는 플러그인으로 이루어진 작은 런타임입니다. 이 자습서는 Cordis를 직접 다루며 배웁니다. 각 장은 이 저장소 안의 스크래치 디렉터리에서 직접 만드는 실행 가능한 예제이며, 마지막에는 실제 하네스 서비스에 연결된 플러그인을 완성합니다.

대상 독자는 에이전트 개발자입니다. 깊은 TypeScript 경험이 없어도 됩니다. 아래의 [TypeScript 참고 사항](#typescript-notes)에서 낯설 수 있는 문법을 설명하고, 모든 장에서 정확한 명령과 예상 출력을 보여 줍니다.

따라 하기 방식 대신 압축된 개념 참고서를 원한다면 [Cordis 입문서](../cordis-primer.ko.md)를 읽으세요. 전체 API 참조는 [하위 시스템 페이지](../subsystems/core.ko.md)와 [Cordis 코어 API](../cordis-api/context.ko.md) 페이지의 생성된 `cordis-surface` 영역에 있습니다.

아래의 런처가 아니라 `cordis.yml`에서 로드되어 웹 UI에서 구동되는, 하네스 자체를 위한 플러그인을 작성하려면 [첫 Harness 플러그인](../user/develop/basic/index.ko.md)에서 시작하세요.

## 준비

의존성이 설치된 이 저장소의 클론이 필요합니다. 필수 조건은 [개발 가이드](../development.ko.md#환경-구축-자습서)에 나열되어 있습니다. 이 자습서에는 API 키가 필요하지 않으며 모든 예제가 키 없이 실행됩니다.

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
```

각 장에서 사용할 스크래치 디렉터리를 만듭니다. `tmp/`는 gitignore되어 있어 이곳에 작성하는 내용은 버전 관리에 영향을 주지 않습니다:

```sh
mkdir -p tmp/cordis-tutorial
cd tmp/cordis-tutorial
```

모든 장은 이 디렉터리에서 같은 명령을 실행합니다:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

이 단일 파일 런처([vendor/cordis/bin.js](../../vendor/cordis/bin.js) 참고)는 루트 `Context`를 만들고 Loader 플러그인을 마운트한 뒤 현재 디렉터리의 `./cordis.yml`을 로드하도록 지시합니다. 어떤 플러그인이 존재하고 어떻게 구성되는지는 모두 그 YAML 파일에서 오며, 곧 직접 작성하게 됩니다. `--import tsx` 플래그는 구성이 가리키는 TypeScript 파일을 빌드 단계 없이 Node에서 실행할 수 있게 합니다.

## 장 목록

1. [첫 플러그인](01-first-plugin.ko.md) — 플러그인은 함수이며, 로더가 이를 마운트합니다.
2. [수명 주기와 효과](02-lifecycle-and-effects.ko.md) — Cordis가 관리하는 등록은 플러그인이 언로드될 때 되돌려집니다.
3. [서비스](03-services.ko.md) — `ctx`에 기능을 노출하고 `inject`로 의존합니다.
4. [이벤트](04-events.ko.md) — 타입이 지정된 이벤트, 브로드캐스트 디스패치, 워터폴 단락(short-circuit).
5. [구성](05-config.ko.md) — `cordis.yml`에서 읽는 검증된 구성, 잘못된 입력 시 즉시 실패.
6. [조합과 HMR](06-composition-and-hmr.ko.md) — 플러그인 트리로서의 구성 파일, 핫 리로드, 로드되지 않는 플러그인 진단.
7. [하네스 실전 연동](07-into-the-harness.ko.md) — 실제 하네스 서비스에 모델이 호출할 수 있는 도구를 등록합니다.

<a id="typescript-notes"></a>

## TypeScript 참고 사항

예제에서는 일반적인 최신 JavaScript 외에 세 가지 TypeScript 기능을 사용합니다:

- **타입 표기(type annotation)** 는 런타임 동작을 바꾸지 않고 값의 타입을 설명합니다. `ctx: Context`는 `ctx`에 Cordis 컨텍스트 API가 있음을, `who: string`은 텍스트를 받음을, `string[]`은 문자열 배열을 뜻합니다.
- **`import type { Context } from '@deepseek-ai/cordis'`** 는 타입 정보만 가져옵니다. 런타임에는 사라지므로, 타입 표기 목적으로만 `Context`가 필요한 플러그인 파일은 런타임 의존성을 추가하지 않습니다.
- **선언 병합(declaration merging)**(`declare module '@deepseek-ai/cordis' { ... }`)은 Cordis가 이미 선언한 인터페이스에 항목을 추가합니다. 예를 들어 새 `ctx.greeter` 속성이나 이벤트 이름의 타입을 추가합니다. 런타임 연결 코드는 생성되지 않으며, 서비스를 제공하거나 이벤트를 발생시키는 일은 플러그인이 따로 합니다. 3장에서 이 패턴을 자세히 보여 줍니다.

5장에서는 구성 객체의 필드를 설명하는 `interface`와, 스키마가 어떤 객체 필드를 검증하는지 나타내는 `Schema<Config>` 같은 제네릭 타입도 사용합니다. 해당 선언은 보이는 그대로 복사해도 되며, 주변 설명이 각 선언이 무엇과 연결되는지 알려 줍니다.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
