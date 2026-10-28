# 5. 구성

[English](05-config.md) | [中文](05-config.zh.md) | 한국어

`cordis.yml`의 각 항목은 `config` 블록을 가질 수 있으며, 플러그인은 `apply`가 실행되기 전에 이를 검증하는 스키마를 선언합니다. 잘못된 구성은 정확한 오류와 함께 로드를 실패시킵니다. 플러그인이 반쯤 구성된 상태로 시작하는 일은 없습니다.

## 구성 가능한 플러그인

`tmp/cordis-tutorial`에서 `config-demo.ts`를 만듭니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'config-demo'

export interface Config {
  greeting: string
  targets: string[]
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  targets: Schema.array(String).default(['world']),
})

export function apply(ctx: Context, config: Config) {
  for (const target of config.targets) {
    console.log(`${config.greeting}, ${target}!`)
  }
}
```

내보낸 `Config`는 같은 이름의 TypeScript 인터페이스이자 런타임 스키마입니다. 소비자는 타입을 얻고 Cordis는 검증기를 얻습니다. 이 저장소는 스키마에 [Schemastery](https://github.com/shigma/schemastery)를 사용합니다. Cordis 자체는 모든 [Standard Schema](https://standardschema.dev/) 검증기를 받아들이므로, `Config`라는 이름으로 내보낸 평범한 객체는 동작하지 않습니다.

구성합니다:

```yaml
- name: './config-demo.ts'
  config:
    targets: ['alpha', 'beta']
```

실행합니다:

```
Hello, alpha!
Hello, beta!
```

`greeting`을 생략했으므로 스키마 기본값이 채워졌습니다. `apply`는 항상 완전하게 검증된 구성을 받습니다.

## 즉시 실패하기

이번에는 잘못된 값을 넣어 봅니다:

```yaml
- name: './config-demo.ts'
  config:
    targets: 'not-an-array'
```

```
ValidationError: invalid config:
  - $.targets expected array but got not-an-array (at targets)
```

플러그인의 fiber는 FAILED가 되고, 이 자습서의 런처는 오류를 출력한 뒤 상태 1로 종료합니다. 또한 플러그인은 스키마상 유효하더라도 사용할 수 없는 리소스나 제공자를 가리키는 구성은 해당 참조를 해석할 수 있는 즉시 거부해야 합니다.

<a id="volatile-fields"></a>
## volatile 필드

플러그인이 작업마다 읽는 필드에는 `.volatile()`을 사용합니다. 해당 필드가 변경되면 플러그인을 다시 마운트하지 않고도 안정적인 참조가 갱신됩니다. 값은 `.get()`으로 읽습니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import Schema from '@deepseek-ai/schemastery'

export const Config = Schema.object({
  greeting: Schema.string().default('Hello').volatile(),
})

export function apply(ctx: Context, config: ReturnType<typeof Config>) {
  ctx.on('loader/volatile-update', () => {
    console.log(config.greeting.get())
  })
}
```

`Config(raw)`를 직접 호출해도 참조가 반환됩니다. 기본값이 없는 선택적 필드에도 참조가 있으며, 값이 없을 때 `.get()`은 `undefined`를 반환합니다. 참조를 유지하거나, `await`를 넘어가는 한 번의 작업 동안만 값을 캡처하세요. 그 값을 이후 작업을 위해 보관해서는 안 됩니다. 객체와 배열 값은 일반 데이터의 분리되고 재귀적으로 동결된 스냅샷이며, 함수, 클래스 인스턴스, 순환 참조는 거부됩니다.

Loader는 스키마가 선언한 volatile 필드를 무시하고 원시 구성을 비교합니다. volatile 필드만 바뀐 경우 플러그인의 `internal/config` 훅을 통해 파싱하고 검증하며, 모든 일반 유효 값이 여전히 같으면 Loader는 새 값을 실행 중인 참조에 커밋하고 변경된 경로를 키 배열로 담은 인스턴스 로컬 `loader/volatile-update`를 한 번 발생시키며, 대상 플러그인의 `internal/update`는 거치지 않습니다. 값이 같으면 알리지 않습니다. 유효하지 않은 후보는 로그를 남기고 다음 활성화까지 실행 중인 참조를 그대로 둡니다. 식 결과가 바뀐 경우를 포함해 일반 유효 값이 바뀌거나 일반 필드가 동시에 바뀌면 기존 업데이트 흐름을 유지하므로 이전 참조는 변경되지 않고 알림도 발생하지 않습니다. Group/Include는 여전히 자식 업데이트를 디스패치합니다. 직접 `fiber.update()`, 코드 교체, 의존성 교체는 자신의 수명 주기를 유지하며, `noSave`는 여전히 직접 업데이트의 영속성을 제어합니다. 알림은 리소스 재구성을 await하지 않고 일반 `emit`을 사용합니다.

volatile 필드는 고정된 객체 경로에 선언하거나 객체나 배열 전체를 volatile로 표시합니다. 배열, 딕셔너리, 유니온 또는 인터섹트 분기, 지연 스키마, 변환 안의 독립적인 참조나 다른 volatile 값 안의 참조는 거부됩니다. 구성 파일에는 일반 값이 저장되며 `simplify()`가 참조를 풀어냅니다. 직렬화된 스키마는 스키마 기반 폼을 위해 필드 타입, 기본값, 역할, volatile 표시를 보존합니다. 기존 설정 소비자는 계속 자신의 설정 인터페이스를 사용합니다.

## 계산되는 구성 값

이 저장소에서 사용하는 로더는 로드 시점에 계산해야 하는 구성 값에 `!!js` 태그를 지원합니다:

```yaml
- name: './config-demo.ts'
  config:
    greeting: !!js process.env.DEMO_GREETING ?? 'Hello'
```

`!!js`는 `config` 안과 항목의 `disabled` 필드에서만 동작합니다. `disabled: !!js ...`는 마운트 결정마다 로더 컨텍스트를 기준으로 평가되므로(이 저장소의 확장) 행이 플랫폼이나 환경에 따라 자신을 제한할 수 있습니다. 나머지 메타데이터(`name`, `id`, `inject`, ...)는 정적으로 유지되며, 이 위치의 식은 평범한 참 같은(truthy) 데이터로 취급됩니다. [로더 구성](../cordis-primer.ko.md#로더-구성)을 참고하세요.

다음: [조합과 HMR](06-composition-and-hmr.ko.md) — `cordis.yml`을 애플리케이션으로 다루기.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
