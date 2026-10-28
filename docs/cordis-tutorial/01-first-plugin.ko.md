# 1. 첫 플러그인

[English](01-first-plugin.md) | [中文](01-first-plugin.zh.md) | 한국어

여기서 사용하는 로더 구성에서 Cordis 플러그인 모듈은 `apply` 함수를 이름으로 내보냅니다. Cordis가 이를 로드하면 **컨텍스트**, 즉 플러그인이 자신이 기여하는 모든 것을 등록하는 `ctx` 객체와 함께 `apply`를 호출합니다.

## 플러그인 작성

`tmp/cordis-tutorial` 디렉터리([준비](index.ko.md#준비) 참고)에서 `hello.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'hello'

export function apply(ctx: Context) {
  console.log('hello from my first plugin')
}
```

`name` 내보내기는 선택적인 표시용 메타데이터로, 진단 정보에서 플러그인을 식별하는 데 쓰입니다.

## 앱 구성

이 자습서의 런처는 구성을 바탕으로 애플리케이션을 조립합니다. `cordis.yml`을 만듭니다:

```yaml
- name: './hello.ts'
```

이 파일은 플러그인 항목의 목록입니다. `name`은 모듈 지정자(상대 경로 또는 npm 패키지 이름)이며, 로더는 모든 항목을 마운트합니다. 항목은 동시에 시작하므로 목록에서의 위치는 어떤 플러그인이 먼저 로드되는지 보장하지 않습니다. 순서는 파일에서의 위치가 아니라 서비스 의존성(`inject`, [3장](03-services.ko.md))에서 나옵니다.

## 실행

```sh
node --import tsx ../../vendor/cordis/bin.js
```

예상 출력:

```
hello from my first plugin
```

더 이상 실행 중인 것이 없으면 프로세스는 스스로 종료됩니다. 다음이 일어났습니다:

1. 런처가 루트 `Context`를 만들고 **Loader** 플러그인을 마운트했습니다.
2. Loader가 `cordis.yml`을 읽고 `./hello.ts`를 해석해 자식 플러그인으로 마운트했습니다.
3. Cordis가 작성한 `apply(ctx)`를 호출했습니다.

작성한 파일에는 프레임워크 부트스트랩 코드가 없습니다. 플러그인은 자신이 기여하는 바를 기술하고, `cordis.yml`이 애플리케이션을 조립합니다. 예를 들어 [`dsh` 기본 구성](../../packages/bundle/base/cordis.patch.yml)은 배포 오버레이가 패치하는 더 긴 플러그인 조합입니다.

## 나머지 두 가지 플러그인 형태

함수 형태가 가장 흔하지만 Cordis는 세 가지를 받아들입니다:

```ts
import { Service, type Context } from '@deepseek-ai/cordis'

// 1. Function plugin (what you just wrote).
export function apply(ctx: Context) {}

// 2. Object plugin: an object with an `apply` method.
export const objectPlugin = {
  name: 'object-plugin',
  apply(ctx: Context) {},
}

// 3. Class plugin: a Service subclass (covered in chapter 3).
export class MyService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'myTutorialService')
  }
}
```

서비스를 노출해야 할 때까지는 함수 형태를 사용하세요. 클래스 형태가 필요한 시점은 [3장](03-services.ko.md)에서 다룹니다.

## 일부러 깨뜨려 보기

`apply`가 예외를 던지게 합니다:

```ts ignore-check
export function apply(ctx: Context) {
  throw new Error('apply exploded')
}
```

다시 실행하면 프로세스가 해당 오류와 함께 종료됩니다. 플러그인 로드에 실패하면 조용히 건너뛰지 않고 명확하게 오류를 발생시키며 즉시 실패합니다.

미리 알아 두면 좋은 주의점이 하나 있습니다. 모듈을 **해석할 수 없는** 구성 항목(오타가 난 경로나 패키지 이름)은 프로세스를 중단시키지 않고 Cordis 로거 서비스를 통해 보고되며, 부팅 시점에는 콘솔 익스포터가 활성화되기 전이라 해당 로그가 표시되지 않을 수 있습니다. 방금 추가한 항목이 아무런 반응이 없다면 먼저 경로와 패키지 이름의 철자를 확인하세요.

다음: [수명 주기와 효과](02-lifecycle-and-effects.ko.md) — 플러그인이 언로드될 때 일어나는 일.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
