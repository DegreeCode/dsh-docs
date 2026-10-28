# 클라이언트 리소스

[English](client-resources.md) | [中文](client-resources.zh.md) | 한국어

클라이언트 리소스 모델은 어떤 Web Client 컴포넌트든 주소를 라이브 데이터로 바꿉니다. [`dsh-client-resources`](../../packages/client/resources/README.md)가 `ctx.resources` 서비스와 `useResource` 전역 표준 훅을 제공하며, 어떤 종류의 콘텐츠를 소유한 패키지가 그 **프로토콜**에 **제공자** 하나를 등록하고, 컴포넌트는 소유자의 런타임을 가져오지 않고 **주소**로 콘텐츠의 현재 상태를 읽습니다. 오른쪽 Sidebar의 탭이 이 모델의 첫 소비자이며([오른쪽 Sidebar](sidebar-right.ko.md)), 결정 기록은 [클라이언트 리소스 모델 Agent Note](../../.agents/notes/implemented/architecture/2026-09-05-client-resource-model.md)입니다.

이 페이지는 개발자 참조입니다. 주소를 어떻게 쓰는지, 제공자를 어떻게 등록하는지, 리소스를 어떻게 읽는지, 상태와 실패가 무엇을 뜻하는지, 모델이 리소스를 어떻게 붙잡고 해제하는지를 다룹니다.

## 주소

리소스 주소는 `dsh-resource://<type>/…` URL입니다. 호스트가 프로토콜을 지명하며 `ResourceProtocolMap`의 키여야 합니다. 경로는 프로토콜 자신의 것이고 소유자가 각 세그먼트를 퍼센트 인코딩합니다. 범위가 필요한 프로토콜은 경로에 범위를 넣습니다. `file` 프로토콜의 주소는 `dsh-resource://file/session/<sessionId>/<path>`로 읽히며, 여기서 path는 워크스페이스 상대 경로이거나 선행 슬래시를 보존한 절대 경로이고, [`dsh-util-workspace-path`](../../packages/util/workspace-path/README.md)의 `fileAddressFor(sessionId, cwd, path)`로 만들고 `parseFileAddress(address)`로 다시 읽습니다. 모델 자체는 스킴과 호스트만 읽습니다. `protocolOf(address)`는 `dsh-resource://` URL의 소문자화된 호스트를 반환하고 그 밖에는 `undefined`를 반환합니다. 다른 스킴의 주소(Sidebar의 `sidebar://guide`)는 리소스를 지명하지 않고 `none`으로 읽힙니다.

| 주소 | 프로토콜 키 | 읽히는 내용 |
|---|---|---|
| `dsh-resource://file/session/s1/notes/a.md` | `file` | `file` 제공자가 등록되어 있을 때 세션 `s1`의 워크스페이스 루트 아래 `notes/a.md` 메타데이터 |
| `dsh-resource://file/absolute/home/me/notes.md` | `file` | 파싱은 되지만 `workspace-file/unknown-workspace`로 실패: 권한을 부여하는 Session이 없고 현재 Session도 Tab Session도 차용되지 않음 |
| `DSH-RESOURCE://File/session/s1/a` | `file` | 별개 기록: 주소는 문자열로 비교되고, `openResource`는 `fileAddressFor`가 내는 정규 소문자 표기만 받아들임 |
| `dsh-resource://subagentchat/session/c1?parent=p1&mode=continuable` | `subagentchat` | 리소스가 닫힐 때까지 그 값이 `SessionReference`를 소유하는, 주소 지정된 서브에이전트 Conversation |
| `sidebar://guide` | — | `none`: 내비게이션 주소 |
| `/home/me/notes.md` | — | `none`: URL이 아님 |

## 제공자 등록

프로토콜 소유자는 `ResourceProtocolMap`에 값 타입을 선언하고 자기 `ctx.effect` 안에서 제공자 하나를 등록하므로, 프로토콜은 플러그인과 정확히 같은 수명을 갖습니다([프로토콜 제공](../../packages/client/resources/README.md#provide-a-protocol)). `open(address, { signal })`은 `RemoteResult` 프레임 스트림(먼저 현재 상태, 그다음 변경마다 한 프레임)을 반환하고 `signal`이 중단되면 멈춰야 합니다. 실패는 `RemoteFailure`를 담은 `ok: false` 프레임이며, 스트림 안에서 throw하는 것은 프로그래밍 오류이고 잡히지 않습니다.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-client-resources/client'

interface NoteView { readonly title: string; readonly updatedAt: string }

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface ResourceProtocolMap { note: NoteView }
}

export const inject = ['resources', 'remote']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.resources.register<'note'>({
    protocol: 'note',
    async *open(address, { signal }): AsyncIterable<RemoteResult<NoteView>> {
      const id = new URL(address).pathname.slice(1)
      yield await ctx.remote.notes.read(id, signal)
      for await (const change of ctx.remote.notes.follow(id, signal)) yield change
    },
  }), 'my-notes: note resource provider')
}
```

프로토콜에는 제공자가 정확히 하나입니다. 두 번째 등록은 throw합니다. 프로토콜 주소가 이미 붙잡혀 있는 상태에서 등록하면 그 스트림이 즉시 열리고, 제공자를 폐기하면 그 스트림이 끝나고 제공자가 돌아올 때까지 주소는 `none`으로 읽힙니다.

## 리소스 읽기

모든 슬롯 컴포넌트는 범위와 무관하게 props로 `useResource`를 받습니다([Slots](slots.ko.md)). `useResource<P>(address)`는 프로토콜을 타입 인자로 지명하고 주소의 현재 스냅샷을 반환합니다. 구독이 곧 리소스를 붙잡는 일이며, 다른 보유자가 리소스를 살려 둔 상태에서 마운트한 컴포넌트는 스트림을 다시 열지 않고 최신 값을 즉시 읽습니다([리소스 읽기](../../packages/client/resources/README.md#read-a-resource)).

| `status` | 의미 | `value` | `failure` |
|---|---|---|---|
| `none` | 주소의 프로토콜에 제공자가 등록되지 않았거나, 주소가 리소스 주소가 아님 | `undefined` | `undefined` |
| `loading` | 제공자의 스트림이 열려 있고 아직 값을 내지 않음 | `undefined` | `undefined` |
| `live` | 최신 프레임이 성공 | 최신 `ok` 값 | `undefined` |
| `failed` | 최신 프레임이 실패를 보고 | 유지된 마지막 `ok` 값 | 그 프레임의 `RemoteFailure` |

```tsx ignore-check
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-api-workspace-files/client'

type Props = PropsRuntime<'sidebar.right.pane.tab'>

export function FileHeader({ useTabInfo, useResource, t }: Props) {
  const { tab } = useTabInfo()
  const meta = useResource<'file'>(tab.contentId)
  if (meta.status === 'failed') return <p role="alert">{t('failed', { code: meta.failure.code })}</p>
  return (
    <header>
      {tab.title}
    </header>
  )
}
```

소비자는 `failed`를 스스로 표현합니다. 모델은 실패 옆에 마지막 값을 유지하므로 본문이 빈 화면 대신 알림과 함께 오래된 콘텐츠를 보여줄 수 있고, 다음 `ok` 프레임이 실패를 지웁니다. 모델 안의 어떤 것도 사용자 가시 텍스트를 만들지 않습니다.

## 붙잡기와 해제

리소스는 보유자가 있는 동안 살아 있습니다. 구독한 `useResource` 또는 핀입니다. `ctx.resources.pin(address, signal)`은 `signal`이 중단될 때까지 구독하지 않고 리소스를 열어 두며, 이미 중단된 시그널은 아무것도 핀하지 않습니다. 오른쪽 Sidebar는 열린 각 탭 기록의 주소를 그 기록의 수명 동안 핀하므로, 탭을 전환해도 스트림을 닫지 않고 본문만 언마운트됩니다. 첫 보유자가 제공자 스트림을 열고, 마지막 해제가 이를 중단하고, 값을 버리고, 스냅샷을 `loading`(제공자 있음) 또는 `none`(없음)으로 되돌립니다. 그 해제 후 제공자가 내는 프레임은 버려지고 이터레이터가 반환됩니다. `ctx.resources.source(address)`는 훅 뒤의 순수 관찰 가능 객체로 주소별로 참조가 안정적이며 React 밖 호출자를 위한 것입니다. 그 스냅샷을 읽는 것은 리소스를 붙잡지 않습니다([수명 주기](../../packages/client/resources/README.md#lifecycle)).

대부분의 스트림은 콘텐츠가 아니라 메타데이터를 담습니다. `file` 제공자의 값은 `WorkspaceFileStat { absolutePath, version, bytes? }`입니다. 첫 프레임은 Host `stat`에서 오고, 이후 관찰이 버전을 갱신합니다. 소비자는 Workspace Files Remote 네임스페이스를 통해 콘텐츠를 읽고, Preview는 탭별로 새로 고침을 독립적으로 소유합니다([`dsh-api-workspace-files`](../../packages/api/workspace-files/README.md)). `subagentchat` 제공자는 주소 지정된 Session을 유지하고 그 `SessionReference`를 내며, 리소스 시그널이 중단되면 그 참조를 해제합니다.

## 한도

기록은 페이지 수명 동안 살아 있습니다. 주소의 기록은 마지막 보유자가 떠난 뒤에도 남으며 스트림도 값도 붙잡지 않으므로, 메모리는 한 번이라도 읽은 서로 다른 주소의 수에 비례해 늘어납니다. `signal`을 무시하는 제공자는 다음 프레임까지 계속 실행됩니다. 실패 타입은 Remote 면의 `RemoteFailure`이므로 소스가 Remote 호출이 아닌 제공자도 이를 만들어야 합니다. 프로토콜을 잘못 쓰거나 주소가 잘못된 경우에는 다른 진단 없이 `none`으로 읽힙니다.
