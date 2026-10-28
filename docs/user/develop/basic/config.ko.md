# 플러그인 구성

[English](config.md) | [中文](config.zh.md) | 한국어

`cordis.yml`을 통해 플러그인에 필요한 구성을 전달받아 활용하는 방법을 설명합니다.

## Config 타입 정의

`Config` 타입과 같은 이름의 Schemastery 스키마를 내보냅니다. 기본값은 스키마 필드에 직접 둡니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'my-plugin'

export interface Config {
  greeting: string
  maxRetries: number
  verbose?: boolean
}

export const Config: Schema<Config> = Schema.object({
  greeting: Schema.string().default('Hello'),
  maxRetries: Schema.number().default(3),
  verbose: Schema.boolean().default(false),
})

export function apply(ctx: Context, config: Config) {
  console.log(config.greeting)  // User value or schema default.
}
```

`scratch-plugin/cordis.yml`의 삽입된 로컬 플러그인 행에 구성을 추가합니다:

```yaml
- insert:
    - id: hello
      name: './src/my-plugin.ts'
      config:
        greeting: 'Hi there'
        maxRetries: 5
```

플러그인을 로드할 때 Cordis는 내보낸 스키마를 통해 구성을 검증하고 기본값을 자동으로 채웁니다. `Config`로 일반 plain object를 내보내지 마세요. Cordis가 요구하는 Standard Schema 인터페이스를 만족하지 못합니다.

## 스키마 검증

더 엄격한 검증이 필요하면 Schemastery를 사용합니다:

```ts
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'

export const name = 'validated-plugin'

export interface Config {
  apiKey: string
  timeout: number
  mode: 'fast' | 'accurate'
}

export const Config = Schema.object({
  apiKey: Schema.string().required(),
  timeout: Schema.number().default(30000),
  mode: Schema.union(['fast', 'accurate']).default('fast'),
})

export function apply(ctx: Context, config: Config) {
  // config is validated and type-safe.
}
```

스키마 검증은 플러그인이 로드되는 과정에서 실행됩니다. 구성이 잘못되면 원인을 파악할 수 있는 명확한 오류 메시지와 함께 로드가 실패합니다.

## 설계 원칙

### 조정 가능한 값을 하드코딩하지 않기

Harness는 **서로 다른 배포 환경에서 다르게 설정할 필요가 있는 모든 값을 구성 필드로 분리할 것을 강력히 권장합니다**.

```ts
// Wrong: hardcoded timeout.
const TIMEOUT = 30000

// Correct: configurable.
export interface Config {
  timeoutMs: number  // Defaults to 30000.
}
```

`cordis.yml`을 통해 소스 코드를 직접 수정하지 않고도 값을 바꿀 수 있는지가 좋은 설계의 판단 기준입니다.

### 잘못된 구성은 명확하게 조기 실패하기

자체 완결적인 유효성 제약은 스키마에 표현하여, 잘못된 설정이 전달되었을 때 플러그인 로드 시점에 즉시 실패하도록 만드세요. 서비스나 등록된 리소스에 대한 참조는 의존성 주입을 통해 해결해야 합니다. [서비스 가이드](../framework/service.ko.md)에서 관련 규약을 설명합니다.

## HMR과 함께 작업하기

구성을 수정하면 플러그인이 핫 리로드(Hot Reload)됩니다. 프레임워크가 이전 인스턴스를 언로드하고 새 인스턴스를 자동으로 로드합니다. 모든 등록은 effect로 동작하여 자체 정리되므로, 교체 후에도 이전 인스턴스의 잔여물이 남지 않습니다.

## 다음 단계

- [플러그인 패키징 및 설치](./publish.ko.md) — 플러그인을 설치 가능한 패키지로 배포합니다
- [플러그인과 수명 주기](../framework/index.ko.md) — 전체 플러그인 수명 주기를 이해합니다
- [서비스와 의존성](../framework/service.ko.md) — 다른 플러그인에 서비스를 제공합니다
