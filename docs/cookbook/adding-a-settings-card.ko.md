# 쿡북: 라이브 구성 폼

[English](adding-a-settings-card.md) | [中文](adding-a-settings-card.zh.md) | 한국어

플러그인 Config 스키마에 라이브 필드를 선언하고, 제품이 소유한 설정 카드를 통해 노출합니다. 내보낸 `Config` 인터페이스는 각 `Volatile<T>` 참조를 포함해 플러그인이 받는 값을 설명합니다.

## 1. 라이브 필드 선언

```ts
import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'

export interface Config {
  endpoint: Volatile<string | undefined>
  retries: Volatile<number>
}

export const Config = z.object({
  endpoint: z.string().volatile(),
  retries: z.number().step(1).min(0).default(3).volatile(),
})

export function apply(ctx: Context, config: Config): void {
  ctx.on('loader/volatile-update', () => {
    ctx.logger.info('Retry limit: %d', config.retries.get())
  })
}
```

작업을 시작할 때 `.get()`으로 값을 읽습니다. 일관된 스냅샷이 필요한 요청은 값을 한 번만 캡처합니다. 필드 간 Config 검증에는 `.check()`를 사용하세요. 이 검사는 영속화 전에 호스트에서 실행되며 직렬화된 폼 스키마에서는 제외됩니다.

## 2. 플러그인 구성

인스턴스마다 고유한 프로필 엔트리 id를 부여하세요. base 번들이 설정과 config-editor를 마운트합니다. 사용자 지정 프로필의 경우 같은 서비스를 마운트하기 전에 해당 패키지 README를 참고하세요.

`role('secret')`은 값을 폼 응답에서 제외합니다. 자격 증명 도메인이 관리하는 값에는 자격 증명 참조를 사용하세요. 일반 필드는 설정 스키마에서 제외됩니다.

## 3. 편집 검증

플러그인에서 필드를 바꾸고 저장합니다. 프로필 패치, 다음 소비자 작업, 변경되지 않은 플러그인 인스턴스 동일성, 재시작 후 복원을 확인하세요. 잘못된 값을 거부하고 파일과 라이브 값 어느 쪽도 바뀌지 않았는지 확인합니다.

사용자 지정 플러그인 페이지는 플러그인 페이지 소유자로부터 `form.state`와 `form.mutate(operations, expectedRevision)`를 받습니다. 호스트는 전체 Config를 검증하고 ConfigEditor와 volatile HMR을 통해 편집을 적용합니다. 기존 카드 예제는 [플러그인 설정 패키지](../../packages/client/ui-settings-plugins/README.md)가 소유합니다.

## 4. 다른 플러그인 페이지에 기여

자신이 직접 소유하지 않은 번들, 행(row), 공식 플러그인에 UI 요소를 기여하려는 플러그인은 `plugins.detail.actions`(페이지 상단 컨트롤), `plugins.detail.badge`(제목 옆 배지), `plugins.detail.section`(페이지 본문 하단 섹션) 중 하나에 등록합니다. 모든 엔트리는 페이지의 `subject` — `{ kind: 'bundle', pkg }`, `{ kind: 'row', pkg, row }`, `{ kind: 'item', id }` — 와 함께 렌더링되며, 다룰 내용이 없는 subject에는 null을 반환합니다:

```tsx ignore-check
ctx.slots.inject('plugins.detail.badge', () => ctx.slots.register({
  name: 'plugins.detail.badge',
  id: 'acme-update',
  locale: 'acmeUpdate',
}, ({ t, subject }) => subject.kind === 'bundle' && hasUpdate(subject.pkg) ? <Tag tone="info">{t('update')}</Tag> : null))
```

## 5. 브라우저 클라이언트 연동(클라이언트 번들 마운트)

브라우저 측 코드는 [클라이언트 모듈 시스템](../../packages/client/modules)이 페이지에 제공합니다. 이 시스템은 활성화된 Loader 엔트리 중 `dsh.client`를 선언한 패키지를 스캔해 각 패키지가 빌드한 `./client` 익스포트를 제공합니다. 다만 패키지의 클라이언트 번들은 지정자가 순수 패키지 이름인 Loader 행에 연결됩니다. 하위 경로 익스포트로 마운트한 행은 클라이언트 번들을 갖지 않으므로, 한 패키지를 여러 행으로 나눈 번들은 클라이언트 코드를 루트 행에 두게 되고, 그 행이 비활성화되면 등록된 모든 페이지 UI가 사라집니다. 다른 행보다 긴 수명 주기를 유지해야 하는 페이지를 가진 서브플러그인은 독립된 패키지로 배포하세요.

빌드된 `./client` 파일은 클라이언트 모듈 시스템의 lazy-CJS 팩토리 형식이어야 합니다. 즉 패키지 이름과 함께 페이지의 모듈 로더가 있는 `factory(require)`를 등록하는 스크립트 하나이며, [클라이언트 모듈 시스템 README](../../packages/client/modules/README.md)에 설명되어 있습니다. 이를 출력하는 `clientBundle` tsdown 프리셋은 게시 패키지가 아니라 `packages/client/tsdown.client.ts`에 있으므로, 이 저장소 밖의 패키지는 그 빌드를 직접 재현해야 합니다.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "dsh": { "client": { "platform": "web", "inject": ["@deepseek-ai/dsh-client-ui-settings"] } }
}
```

내장 네임스페이스용 동반 패키지는 빈 호스트 `apply`를 가진 클라이언트 전용 패키지에 같은 브라우저 반쪽을 담은 것이며, 웹 구성의 플러그인 명단([`packages/bundle/web-app/cordis.patch.yml`](../../packages/bundle/web-app/cordis.patch.yml))에 등록되고 `ctx.configForms.whileServed`를 통해 `plugins.item`에 등록되므로, 호스트가 그 네임스페이스를 제공하는 동안에만 페이지가 존재합니다.
