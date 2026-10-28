# 6. 조합과 HMR

[English](06-composition-and-hmr.md) | [中文](06-composition-and-hmr.zh.md) | 한국어

지금까지 만든 모든 기능은 플러그인이며, `cordis.yml`이 애플리케이션의 플러그인 트리를 선택합니다. 이 장에서는 그 조합을 바꾸고, 플러그인을 핫 리로드하고, 끝내 로드되지 않는 플러그인을 진단합니다.

## 항목은 이름만으로 이루어지지 않습니다

구성 항목은 `name`과 `config` 외의 메타데이터도 받습니다:

```yaml
- id: greeter          # stable identity for this entry
  name: './greeter.ts'
- id: consumer
  name: './consumer.ts'
  disabled: true       # keep the entry, skip mounting it
```

`id`는 항목에 안정적인 정체성을 부여해, 로더가 기존 항목에 대한 편집과 제거 후 추가를 구별할 수 있게 합니다. `disabled: true`는 항목을 삭제하지 않고 플러그인을 언마운트합니다. 다시 되돌리면 플러그인과 그 서비스를 기다리던 모든 PENDING 항목이 다시 로드됩니다.

그룹은 하나의 단위로 로드되고 언로드되는 하위 항목 목록을 중첩하며, `isolate`는 그룹에 서비스 이름의 자체 인스턴스를 부여합니다. 그래서 두 그룹이 서로 영향을 주지 않고 각기 다르게 구성된 `shell` 제공자를 볼 수 있습니다. 자세한 내용은 [Cordis 입문서](../cordis-primer.ko.md)와 [서비스 격리 예제](../user/develop/framework/service.ko.md#서비스-격리)에서 다룹니다.

## 핫 모듈 교체

언로드가 효과를 해제하고([2장](02-lifecycle-and-effects.ko.md)) 로드가 의존성을 따르므로([3장](03-services.ko.md)), HMR은 실행 중인 플러그인을 언로드한 뒤 다시 로드하는 방식으로 교체할 수 있습니다. `@deepseek-ai/dsh-hmr` 플러그인은 파일을 감시하다가 저장 시 정확히 그 일을 합니다.

`tmp/cordis-tutorial`에서 `cordis.yml`을 작성합니다:

```yaml
- id: logger
  name: '@deepseek-ai/cordis-plugin-logger-console'
- id: timer
  name: '@deepseek-ai/cordis-plugin-timer'
- id: hmr
  name: '@deepseek-ai/dsh-hmr'
  config:
    root: ['.']
- id: hello
  name: './hello.ts'
```

목록에 지원 플러그인 두 개가 추가되었습니다. HMR은 Cordis 로거 서비스를 통해 로그를 남기므로 콘솔 익스포터가 없으면 그 메시지를 볼 수 없고, 디바운싱을 위해 `timer` 서비스를 `inject`합니다. `@deepseek-ai/cordis-plugin-timer`가 없으면 HMR은 아무 소리도 없이 영원히 PENDING에 머뭅니다. 그 침묵이 다음 절의 주제입니다.

HMR은 Loader의 네이티브 도우미를 통해 Node의 로더 내부를 읽습니다. Cordis를 tsx 아래에서 실행합니다:

```sh
node --import tsx ../../vendor/cordis/bin.js
```

이제 `hello.ts`를 편집해 로그 메시지를 바꾸고 저장합니다:

```
hello from my first plugin
2026-07-22 15:44:36 [I] hmr watching [ '.' ]
2026-07-22 15:44:39 [I] hmr reload plugin at hello.ts
hello from my EDITED plugin
```

이전 인스턴스가 언로드되고(모든 효과가 되돌려짐) 새 코드가 로드되었으며 `apply`가 다시 실행되었습니다. Ctrl-C로 프로세스를 중지합니다. `cordis.yml` 자체를 편집하는 것도 반영됩니다. 로더는 `id`를 기준으로 항목을 비교해 변경된 것만 마운트, 언마운트, 재구성합니다. 위 항목들에 명시적인 `id`가 있는 이유가 여기 있습니다. id가 없는 항목은 읽을 때마다 생성된 id를 받으므로, 구성 파일을 편집할 때마다 제거 후 추가로 간주되어 자신의 줄이 바뀌지 않았어도 다시 마운트됩니다.

## 로드되지 않는 플러그인 진단하기

의존성 기반 로딩의 이면입니다. `inject`가 아무도 제공하지 않는 서비스를 가리키는 플러그인은 아무것도 출력하지 않은 채 영원히 기다립니다. 오류도 없습니다. 제공자가 나중에 마운트될 수 있으므로 PENDING은 정당한 상태입니다.

상태를 직접 확인할 수 있습니다. 모든 컨텍스트는 플러그인 레지스트리를 열거할 수 있습니다. `diagnose.ts`를 만듭니다:

```ts
import { FiberState, type Context } from '@deepseek-ai/cordis'

export const name = 'diagnose'

export function apply(ctx: Context) {
  setTimeout(() => {
    for (const runtime of ctx.registry.values()) {
      for (const fiber of runtime.fibers) {
        if (fiber.state === FiberState.PENDING) {
          console.log(`${fiber.name} is PENDING — a required service is missing`)
        }
      }
    }
  }, 500)
}
```

그리고 충족할 수 없는 의존성을 가진 플러그인 `needs-timer.ts`입니다:

```ts
import type { Context } from '@deepseek-ai/cordis'

export const name = 'needs-timer'
export const inject = ['timer']

export function apply(ctx: Context) {
  console.log('needs-timer loaded')
}
```

```yaml
- name: './needs-timer.ts'
- name: './diagnose.ts'
```

실행합니다(그냥 `node --import tsx ../../vendor/cordis/bin.js`를 쓰고 Ctrl-C로 중지).

```
needs-timer is PENDING — a required service is missing
```

`inject: ['timer']`에는 제공자가 없습니다. 목록에 `- name: '@deepseek-ai/cordis-plugin-timer'`를 추가하면 플러그인이 로드됩니다. 플러그인이 아무 동작도, 아무 보고도 하지 않으면 fiber 상태를 살펴보세요. PENDING 필터 없이 순회하면 로더 자체의 플러그인(Loader, Include)도 ACTIVE fiber로 나타나는데, 이는 플러그인이 구성 파일 자체를 마운트하기 때문입니다.

다음: [하네스 실전 연동](07-into-the-harness.ko.md) — 실제 하네스 서비스에 같은 패턴 적용하기.

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
