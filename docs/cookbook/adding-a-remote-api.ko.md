# 쿡북: Remote API 추가

[English](adding-a-remote-api.md) | [中文](adding-a-remote-api.zh.md) | 한국어

`ctx.remote` 엔드포인트를 추가하거나 바꾸는 데는 이 페이지의 다섯 단계가 필요합니다. 즉 메서드를 선언하고, 그 실패를 선언하고, 패키지에 등록하고, 클라이언트에서 소비하고, 테스트합니다. 데코레이터 시맨틱, 조회 해석, 생성 파이프라인, `/api` 라우트는 메커니즘이며 [API 게이트웨이 참조](../api-gateway.ko.md)에 속합니다. 이 페이지는 각 단계의 행동과 그 행동이 만족해야 하는 관례를 제공합니다. 프로그래밍 인터페이스가 왜 이렇게 생겼는지는 [Typert Remote 메서드 호출 Agent Note](../../.agents/notes/implemented/architecture/2026-08-02-typert-remote-method-calls.md)에, 실패가 왜 하나의 `RemoteError`와 코드 표인지는 [실패 어휘 Agent Note](../../.agents/notes/implemented/architecture/2026-08-28-ctx-remote-failure-vocabulary.md)에 있습니다.

## 1. API 선언

소유자는 호스트 측 Cordis 서비스입니다. 즉 `TypertRemoteService`를 확장해 서비스 키와 와이어 네임스페이스를 함께 묶고, 노출할 메서드에 `@Remote`를 붙입니다. 시그니처가 이미 와이어 관례를 만족하면 비즈니스 메서드 자체에 표시하고, 모양을 바꿔야 할 때(`signal` 추가, 매개변수 순서 변경, 다른 이름으로 내보내기)만 `remoteExport*` 어댑터를 작성하며, 그 어댑터가 이름을 바꾸지 않은 비즈니스 메서드를 호출하게 하세요. 조회 객체(`Agent`, `Session`)는 최상위 매개변수 위치에만 올 수 있고, 협력적 취소를 지원하는 메서드는 마지막 매개변수로 `signal: AbortSignal`을 받습니다.

```ts
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** One stored note as a Client reads it. */
export interface NoteRow {
  readonly noteId: string
  readonly title: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    notesController: NotesController
  }
}

export class NotesController extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'notesController', { namespace: 'notes' })
  }

  /**
   * @param agent - lookup parameter the Gateway resolves from its wire identity.
   * @param signal - carrier cancellation, always the final parameter.
   * @returns the notes this Agent's session owns.
   */
  @Remote('list')
  async remoteExportList(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    return await this.list(agent, signal)
  }

  /** The in-process API the adapter above delegates to, unchanged by it. */
  async list(agent: Agent, signal: AbortSignal): Promise<NoteRow[]> {
    signal.throwIfAborted()
    return await Promise.resolve([{ noteId: `${agent.id}-1`, title: 'draft' }])
  }
}
```

## 2. 실패 선언

Remote 오류 처리는 단일 `RemoteError` 클래스로 통일되어 있습니다. 도메인 코드를 선언 병합으로 `RemoteErrorDetailsMap`에 등록하고, 실패 지점에서 `throw new RemoteError(code, message, details)`를 던집니다. 별도의 도메인 오류 클래스 계층을 새로 만들거나 종료 매핑 함수를 작성하지 마세요. 이 엔드포인트와 무관한 예외는 미리 분류되지 않으며, 게이트웨이가 이를 `gateway/internal`로 일괄 변환합니다. 임의의 제공자 예외를 특정 도메인 코드 하나로 분류할 때만 `catch`를 작성하고 원래 예외를 `cause`로 담으세요.

코드는 `<domain>/<reason>`으로 표기되며, 그 선언에는 네 가지 배치 규칙이 있습니다:

- 생산자가 하나뿐이면 던지는 곳 옆, 그 생산 패키지에 선언합니다.
- 여러 패키지가 생산하면 둘 다 의존하는 가장 낮은 도메인 패키지에 선언합니다(`session/not-found`는 `core/session`에, `workspace/not-found`는 `dsh-workspace`에).
- 전송 계층(캐리어) 코드 `gateway/bad-request`, `gateway/cancelled`, `gateway/internal`은 프로토콜에 선언되고 게이트웨이 인프라 코드는 게이트웨이에 선언됩니다. 이미 정의된 코드를 재사용하고 중복 정의하지 마세요.
- 네트워크(와이어)를 건너지 않는 로컬 실패는 코드 표에 넣지 않고 호출자 자신의 타입으로 표현합니다.

```ts
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** No stored note carries that id. */
    'note/not-found': { readonly noteId: string }
    /** The store refused an otherwise valid write. */
    'note/rejected': { readonly noteId: string }
  }
}

declare const stored: ReadonlyMap<string, string>
declare function persist(noteId: string, title: string): Promise<void>

export async function rename(noteId: string, title: string): Promise<void> {
  if (!stored.has(noteId)) {
    throw new RemoteError('note/not-found', `no note "${noteId}"`, { noteId })
  }
  try {
    await persist(noteId, title)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new RemoteError('note/rejected', message, { noteId }, { cause: error })
  }
}
```

## 3. 패키지에 등록

`@Remote`는 Loader 엔트리 플러그인 패키지에 있어야 하며, 소유자가 추상 seam이면 컨트롤러는 `packages/api/` 아래의 대응 패키지에 둡니다. 매니페스트에는 생성된 두 엔트리와 프로토콜 피어 의존성이 추가되며, 클라이언트 쪽에서는 `@deepseek-ai/dsh-api-remotes` 조립이 그 기여를 마운트하고 소비자에게 필요한 타입 어휘를 다시 내보냅니다. 각 엔트리가 어떤 생성 아티팩트를 가리키는지, 생성 파이프라인이 어떤 순서로 돌아가는지는 [API 게이트웨이 참조](../api-gateway.ko.md)에 있습니다.

```json
{
  "exports": {
    "./typert": { "types": "./lib/typert.host.d.ts", "default": "./lib/typert.host.js" },
    "./remote": { "types": "./lib/typert.remote-client.d.ts", "default": "./lib/typert.remote-client.js" }
  },
  "peerDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" },
  "devDependencies": { "@deepseek-ai/dsh-typert-protocol": "workspace:*" }
}
```

시그니처, 코드 표, 네임스페이스, 익스포트 이름을 바꾼 뒤에는 `pnpm run build:lib`을 다시 실행하세요. 클라이언트에 새 선언과 코덱을 넘겨 주는 것이 바로 그것이기 때문입니다. 구현 본문만 바꾸면 재생성이 필요 없습니다.

## 4. 클라이언트에서 소비

호출하는 플러그인은 `inject`에 `remote`와 `remote.<namespace>`를 모두 선언하고, 호출 지점은 `ctx.remote.<namespace>.<method>(...)`를 직접 씁니다. 즉 `Pick<ClientRemote, …>` 축소도, 손으로 쓴 메서드 시그니처도, 와이어 중계 객체도 없습니다. 결과는 `RemoteResult<T>`이므로 `if (!result.ok)`로 제자리에서 분기하고 `instanceof` 대신 `code`로 판별하세요. 코드 분기 자체가 `details`를 좁힙니다. 예외 흐름 지점은 `throw result.error`를 씁니다(실제 Error입니다). 잡는 쪽은 `isRemoteFailure`로 Remote 실패와 로컬 결함을 구분하고 결함은 다시 던집니다. 방어적 catch를 쓰지 마세요. Remote 호출은 거부되지 않으며, 조립 실수는 크래시해야 합니다.

고정 호스트 사실은 `ctx.remote.$host`에서 옵니다. `home`과 `isLoopback`은 구독도 세대 카운터도 없는 순수 읽기이며, `home`은 첫 준비 프레임 전까지 `undefined`입니다. 재연결 후에는 `ctx.on('connection/reset')`이나 도메인 자체의 remote 이벤트로 새로 고치세요. 호출자가 단항 호출을 중단하면 결과는 던지기가 아니라 오류 분기의 `gateway/cancelled`입니다.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import { isRemoteFailure } from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'

export const inject = ['remote', 'remote.notes']

declare const ctx: Context

/** Store-side read: the error branch is handled where the code is meaningful. */
export async function noteTitles(): Promise<readonly string[]> {
  const result = await ctx.remote.notes.list()
  if (!result.ok) {
    if (result.error.code === 'note/not-found') return []
    throw result.error
  }
  return result.value.map(row => row.title)
}

/** Action-side: a Remote failure becomes copy; a local fault keeps crashing. */
export async function renderTitles(): Promise<string> {
  try {
    return (await noteTitles()).join(', ')
  } catch (error: unknown) {
    if (!isRemoteFailure(error)) throw error
    return `unavailable (${error.code})`
  }
}

/** Fixed Host facts as plain reads. */
export function hostLabel(): string {
  const { home, isLoopback } = ctx.remote.$host
  return home ?? (isLoopback ? 'local host' : 'remote host')
}
```

## 5. 테스트

소유자 쪽에서는 던져진 코드를 단언하세요. 잡은 뒤 `remoteErrorOf`로 실패를 복구하고, 관심 있는 `code`와 details 필드를 `toMatchObject`로 비교합니다. 오류 객체를 `toEqual`로 깊이 비교하지 말고 `instanceof`도 단언하지 마세요.

```ts
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { expect, it } from 'vitest'

declare function rename(noteId: string, title: string): Promise<void>

it('refuses an unknown note before writing', async () => {
  const failure = await rename('n-404', 'fresh title').catch((error: unknown) => error)

  expect(remoteErrorOf(failure)).toMatchObject({
    code: 'note/not-found',
    details: { noteId: 'n-404' },
  })
})
```

클라이언트 측 대역(double)은 실제 인스턴스를 반환합니다. `RemoteError`와 `TestRemote` 값 import는 `@deepseek-ai/dsh-client-test-runtime`에서 가져오세요. `api-remotes` 파사드에서 값 import를 하면 빌드되지 않은 조립 체인을 로드하게 됩니다. `TestRemote.$host`는 스펙이 직접 할당하는 평범한 필드입니다.

```ts ignore-check
import { Context } from '@deepseek-ai/cordis'
import { RemoteError, TestRemote } from '@deepseek-ai/dsh-client-test-runtime'
import { expect, it } from 'vitest'

it('renders the failure code the Host reported', async () => {
  const ctx = new Context()
  const remote = new TestRemote(ctx, {
    notes: {
      list: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('note/not-found', 'no note "n-404"', { noteId: 'n-404' }),
      }),
    },
  })
  remote.$host = { home: '/home/fixture', isLoopback: true }

  await expect(ctx.remote.notes.list()).resolves.toMatchObject({ error: { code: 'note/not-found' } })
})
```

## 검증

1. `pnpm run build:lib`: 시그니처, 코드 표, 네임스페이스, 익스포트 이름이 바뀌면 필수입니다. 클라이언트 선언과 코덱을 생성하기 때문입니다.
2. `pnpm run typecheck`: 호스트와 클라이언트 프로그램 모두이며, 도달할 수 없는 패키지에 병합된 코드는 여기서 빨간불이 됩니다.
3. 양쪽 스펙을 이름으로 실행하세요: `npx vitest run <owner spec> <client spec>`.
4. 엔드포인트가 제품 노출 표면에 닿으면 [테스트 정책](../testing.ko.md)에 따라 recorded-session 스냅샷을 추가합니다.
