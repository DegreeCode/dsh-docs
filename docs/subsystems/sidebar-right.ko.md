# 오른쪽 사이드바

[English](sidebar-right.md) | [中文](sidebar-right.zh.md) | 한국어

오른쪽 사이드바는 웹 클라이언트의 세션별 도킹 표면입니다. 대화 옆에서 주소가 지정된 콘텐츠(워크스페이스 파일, 디렉터리 트리, 제품 자체 페이지)가 열리고, 분할되고, 떠오르고, 닫히는 패널과 탭의 열입니다. [`dsh-client-ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.md)가 표면, 탭 타입 레지스트리, 내비게이션 서비스를 소유하고, [`dsh-client-ui-dockkit`](../../packages/client/ui-dockkit/README.md)은 그 내부 레이아웃 엔진이며, [`dsh-client-resources`](../../packages/client/resources/README.md)는 주소를 모든 컴포넌트에 대한 라이브 값으로 바꾸고, [`dsh-api-workspace-files`](../../packages/api/workspace-files/README.md)는 호스트 워크스페이스 서비스와 클라이언트 `file` 리소스 제공자를 모두 제공합니다.

이 페이지는 이 하위 시스템의 계약에 대한 참조입니다. 주소, 탭 타입 등록, 내비게이션 서비스, 확장 슬롯과 그 소유자 props, 리소스 모델, Workspace Files 서비스, 배포되는 타입, 그리고 의도적으로 만들지 않은 것이 대상입니다. 레이아웃 엔진과 프레임, 표면이 어떻게 맞물리는지는 [Agent Note](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md)에 있고, 슬롯 메커니즘은 [슬롯 참조](slots.ko.md)에 있습니다.

## 위치와 소유권

도킹 표면은 세션마다 하나 존재하며, 세션 범위 슬롯 스토어에 보관되고 `rightbar.session`이 그립니다. 루트 범위 `rightbar` 컨트롤러는 선택된 세션과 `keepMounted` 본문이 초기화된 백그라운드 세션을 위해 별도의 시트를 유지하며, 포그라운드 대화만 보입니다. 새로 고침은 저장된 레이아웃을 복원합니다([상태](../../packages/client/ui-sidebar-right/README.md#state)). 표면의 모든 변경은 키트의 순수 플래너가 계산한 하나의 기록 항목이며, 도킹된 패널은 결코 비어 있지 않고, 빈 루트 패널은 등록된 가이드 항목에서 선택한 기본 페이지를 받습니다.

탭 타입은 정의의 `id`를 공유하는 두 등록입니다. `ctx.sidebarRightTabs`의 정적 정의가 그 `kind`가 어떤 주소를 여는지 말하고, 키가 지정된 슬롯 등록이 그 본문을 제공합니다. 프레임워크는 라이브 사이드바, 패널, 탭 정보를 위해 `useTabInfo()`를 주입하며, 각 타입은 자체 상태를 자신의 슬롯 스토어에 둡니다. 패키지들은 서로의 선언을 타입으로만 임포트합니다.

| 패키지 | 역할 |
|---|---|
| [`client/ui-sidebar-right`](../../packages/client/ui-sidebar-right/README.md) | 패널과 레일 시트, 레이아웃 스토어, `ctx.sidebarRightTabs`, `ctx.sidebarRight`, Tab 도메인, 가이드 타입 |
| [`client/ui-dockkit`](../../packages/client/ui-dockkit/README.md) | 순수 레이아웃 엔진과 React 표면. `ui-sidebar-right`의 내부 의존성이며 안정적인 인터페이스가 아닙니다 |
| [`client/resources`](../../packages/client/resources/README.md) | `ctx.resources`, `useResource`, 프로토콜 → 값 명단 `ResourceProtocolMap` |
| [`api/workspace-files`](../../packages/api/workspace-files/README.md) | 호스트 `ctx.workspaceFiles`, `workspaceFiles` Remote 네임스페이스, 클라이언트 `file` 리소스 제공자 |
| [`util/workspace-path`](../../packages/util/workspace-path/README.md) | 파일 주소 문법: `fileAddressFor`, `parseFileAddress` |
| [`client/ui-sidebar-documentpreview`](../../packages/client/ui-sidebar-documentpreview/README.md), [`client/ui-sidebar-files`](../../packages/client/ui-sidebar-files/README.md), [`client/ui-sidebar-browser`](../../packages/client/ui-sidebar-browser/README.md) | 배포되는 `text`, `files`, `browser` 타입 |

## 주소

모든 탭은 주소 문자열로 열리며, 그 주소가 탭의 콘텐츠 정체성입니다. 두 계열이 있습니다.

**리소스 주소**는 `dsh-resource://<type>/…` URL입니다. 호스트가 리소스 프로토콜(`ResourceProtocolMap`의 키)을 지정하고 그 뒤의 모든 것은 그 프로토콜 자체의 경로입니다. 하나의 스킴이 모든 프로토콜을 처리하므로, 프로토콜을 추가하면 호스트가 추가될 뿐 스킴은 추가되지 않습니다. `file` 프로토콜의 경로는 범위로 시작합니다. `session/<sessionId>` 뒤에 그 세션의 워크스페이스 루트 기준 상대 경로가 오거나(`dsh-resource://file/session/abc/src/notes.txt`), `absolute` 뒤에 선행 `/`를 제거한 절대 경로가 옵니다(Windows에서는 `dsh-resource://file/absolute/home/ys/notes.txt`, `dsh-resource://file/absolute/C:/x/y.txt`). 모든 id와 경로 세그먼트는 컴포넌트 인코딩되며, `:`는 드라이브 문자를 위해 그대로 둡니다. `fileAddressFor(sessionId, cwd, path)`가 이를 만들고(상대 경로나 워크스페이스 안의 절대 경로는 `session` 상대가 되고, 그 밖의 절대 경로는 `absolute`가 됩니다), `parseFileAddress(address)`가 이를 다시 읽거나 `undefined`를 반환합니다([문법](../../packages/util/workspace-path/README.md)).

**페이지 주소**는 리소스가 아니라 종류로 열린 탭에 대해 사이드바가 기록하는 것입니다. `sidebar://<kind>` 형태이며, `openTab(kind)`가 실행될 때 사이드바 자신이 기록합니다. 호출자는 이를 직접 만들지 않으며(가이드와 파일 트리는 `openTab('guide')`와 `openTab('files')`로 열립니다), 다른 내비게이션 주소는 존재하지 않습니다([만들지 않음](#not-built)).

탭 정체성은 `(kind, address)` 쌍입니다. 레지스트리의 클레임은 주소를 기록의 `contentId`로 그대로 사용하므로, 같은 타입으로 같은 주소를 열면 기존 탭을 찾고, 같은 주소를 두 타입으로 열면 탭 두 개가 됩니다.

## 탭 타입 등록

`ctx.sidebarRightTabs.register(definition)`는 호출자의 수명 동안 타입 구현 하나를 등록하고 디스포저를 반환합니다. 호출자는 이를 자신의 `ctx.effect` 안에서 보유하므로 구현은 이를 기여한 플러그인과 정확히 같은 수명을 가지며, 같은 `id`를 두 번 등록하면 예외가 발생합니다([확장 시트](../../packages/client/ui-sidebar-right/README.md#extension-seats)). 정의는 정적입니다. 런타임 훅도, 탭별이나 세션별 무언가도 없습니다.

| 필드 | 의미 |
|---|---|
| `id` | 구현의 정체성이며 모든 등록에 걸쳐 유일합니다. 패키지 이름이 자연스러운 값입니다(`@deepseek-ai/dsh-client-ui-sidebar-files`). 본문과 제목이 이 키 아래 등록됩니다. |
| `kind` | 타입의 판별자입니다. 그 탭이 무엇인지, `openTab`이 무엇을 지목하는지를 나타냅니다. 유일하지 않으며, 확장이 내장 타입의 종류를 넘겨받을 수 있습니다. 배포되는 종류는 `guide`, `text`, `files`입니다. |
| `patterns` | 타입이 인식하는 선택적 리소스 주소 글롭입니다. 종류로 열리는 페이지 타입은 이를 생략합니다. `:`가 포함된 패턴은 주소 전체를 일치시키고(`dsh-resource://file/**`), 포함하지 않는 패턴은 URL의 경로를 임의 깊이에서 일치시키며(`*.md`), URL이 아닌 주소는 그런 패턴에 일치하지 않습니다. 일치는 대소문자를 구분하지 않고 점 파일을 숨기지 않으며, 문법은 picomatch의 POSIX 방언입니다. |
| `priority` | 세 가지 리터럴 밴드 중 하나입니다. `extension`(기본값이자 최상위: 제품 밖의 타입이 모든 배포 뷰어보다 우선합니다), `builtin`(제품과 함께 배포되는 타입), `fallback`(더 구체적인 것이 이겨야 하는 순수 콘텐츠 뷰어)입니다. |
| `canOpen(address)` | 글롭 일치에 대한 선택적 동기 거부입니다. 모든 라우팅 결정에서 실행됩니다. |
| `title(address)` | 칩의 텍스트이며, 탭이 열릴 때 레이아웃 기록에 캡처되고 다시 쓰이지 않습니다. |
| `keepMounted` | 숨김, 세션 전환, 도킹에 걸쳐 방문한 본문을 선택적으로 지연 보유합니다. 소유 View가 세션 참조를 보유합니다. |
| `guide` | 가이드 페이지를 위한 선택적 항목 상자입니다: `{ order, title(), description?(), icon? }`. 상자를 고르면 기여한 타입이 페이지로 열리며, 생략하면 페이지에 나오지 않습니다. |

주소 전체 패턴은 원시 주소를 일치시킵니다. picomatch 글롭스타(`**`)는 `dot: true`에서도 독립적인 `.`과 `..` 세그먼트를 제외하며, 이 옵션은 점 파일을 포함시키지만 그 제외를 바꾸지는 않습니다. 리소스별 코드가 주소를 파싱하고, 호스트가 파일 읽기 권한을 강제합니다.

라우팅은 순위가 매겨진 클레임입니다. `candidates(address)`는 패턴이 일치하고 `canOpen`이 거부하지 않는 타입의 순위를 매깁니다. 밴드, 그다음 가장 긴 일치 패턴의 길이, 그다음 등록 순서입니다. `claim(address, kind?)`는 첫 후보를 고르거나, 이름이 지정된 `kind`를 곧바로 고르며(글롭은 건너뛰고 `canOpen`은 여전히 적용됩니다) `{ kind, contentId: address, title }`를 반환합니다. 어떤 타입도 클레임하지 않는 주소는 예외를 던집니다. 배선 실수이지 사용자 오류가 아닙니다.

하나의 `kind`가 `builtin` 등록 하나와 `extension` 등록 하나를 동시에 가질 수 있습니다. 클레임, `get(kind)`, `openTab(kind)`, 가이드 페이지에서는 확장이 적용되며, 시트는 적용 중인 정의의 `id` 아래에서 탭의 본문과 제목을 찾으므로 슬롯 우선순위는 관여하지 않습니다. 확장이 등록 해제되면 내장이 다시 작동합니다. 그 밖의 모든 종류 충돌과 모든 중복 `id`는 예외를 던집니다.

```ts ignore-check
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

export const inject = ['sidebarRightTabs', 'slots']

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.sidebarRightTabs.register({
    id: '@acme/dsh-client-ui-image',
    kind: 'image',
    patterns: ['*.png', '*.jpg', '*.gif', '*.svg'],
    canOpen: address => address.startsWith('dsh-resource://file/'),
    title: address => address.slice(address.lastIndexOf('/') + 1),
  }), 'image type')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: '@acme/dsh-client-ui-image' },
    ImageBody,
  )), 'image body')
}
```

## 내비게이션: `ctx.sidebarRight`

두 가지 열기가 내비게이션 컨트롤러이며, 이 열로 들어오는 모든 경로가 그중 하나를 호출합니다. `dsh-resource://` 주소에는 `openResource(address, options?)`를(대화의 파일 링크, 도구 행의 행 참조, 파일 트리의 행), 페이지에는 `openTab(kind, options?)`를(스트립의 추가 컨트롤, 가이드 항목 상자, 어시스턴트 Markdown의 HTTP(S) 링크) 씁니다. 둘 다 네 단계를 하나의 기록 항목으로 실행합니다. 클레임(레지스트리가 리소스의 타입 순위를 매기거나, 이름이 지정된 `kind`의 적용 중인 구현이 응답) → 같은 `(kind, address)`를 이미 보여 주는 탭으로 포커스 → 아니면 새 탭 배치 → 열 확장. 그런 다음 Tab 도메인에 내비게이션을 기록합니다([서비스](../../packages/client/ui-sidebar-right/README.md#ctxsidebarright)). 사용자가 볼 수 없는 콘텐츠는 열리지 않으므로 접힌 열은 같은 단계에서 펼쳐집니다. `openResource`는 `dsh-resource://` 밖의 주소나 어떤 타입도 클레임하지 않는 주소에 대해 예외를 던지고, `openTab`은 아무것도 등록하지 않은 종류에 대해 예외를 던집니다. 둘 다 배선 실수이지 사용자 오류가 아닙니다.

| 옵션 | 의미 |
|---|---|
| `paneId` | 새 탭을 이 패널에 놓습니다. 기본값은 활성 도킹 패널이며, 떠 있는 패널이 활성일 때는 첫 번째 도킹 패널입니다. |
| `replaceTab` | 이 탭의 패널과 스트립 슬롯을 넘겨받고 같은 단계에서 그 탭을 닫습니다. 떠 있는 탭은 자리를 빌려주지 않으므로 새 탭은 배치되지 않은 것처럼 놓입니다. |
| `revealIfOpened` | 기본값 `true`입니다. 같은 `(kind, address)`를 이미 보여 주는 탭이 있으면 그 탭에 포커스하고 `params`를 전달합니다. `false`는 무조건 다른 탭을 엽니다. |
| `preferNewPane` | 일반 패널 예산과 공간 규칙 아래 새 도킹 패널을 선호합니다. 분할할 수 없으면 대상 패널로 폴백합니다. `replaceTab`과 함께 쓰면 무시됩니다. |
| `kind`(`openResource` 전용) | 클레임 순위 대신 여는 타입을 지정합니다. 적용 중인 구현이 주소를 열고, 그 `canOpen`은 여전히 적용됩니다. |
| `params` | 본문을 위한 내비게이션 매개변수이며 `navigation.params`로 전달됩니다. `openResource`는 병합 확장 가능한 `SidebarRightResourceParamsMap`을 통해 리소스 타입별로 타입을 붙이고(텍스트 미리 보기는 `{ line?: number }`를 선언합니다), `openTab<K>`는 `SidebarRightTabParamsMap`을 통해 종류별로 타입을 붙이며, 선언이 없는 종류에는 `undefined`입니다. 본문은 둘의 합집합인 `SidebarRightNavigationParams`를 읽습니다. 값은 관례상 JSON 형태이며 런타임에서 검증되지 않습니다. |

배치는 호출자의 옵션이지 타입의 속성이 아닙니다. 대화는 `openResource(fileAddressFor(sessionId, cwd, path))`를 호출하고, `read` 도구 행에서는 호출의 1부터 시작하는 `offset`에서 `{ params: { line } }`을 추가합니다. 가이드 항목 상자는 `tab.actions.openTab(entry.kind, { replaceTab: true })`를 호출하고, 파일 트리 행은 `tab.actions.openResource(address)`를 호출하며, 스트립의 추가 컨트롤은 `openTab('guide', { paneId, revealIfOpened: false })`를 호출합니다.

`close(tabId)`는 탭을 닫고, `active()`는 활성 패널의 활성 탭을 반환하며, `isExpanded()`와 `toggleExpanded()`는 열을 읽고 뒤집고, 그 뒤집기는 시퀀스에 기록됩니다. 읽기는 세션이 없는 경우 `undefined`나 `false`로 답합니다. 쓰기는 마운트된 세션 표면이 필요하며, 아무도 그리지 않는 표면에 쓰지 않고 없으면 예외를 던집니다.

`focus(tabId)`는 탭을 그 패널의 활성 탭으로 만들고, `split(paneId?)`은 활성 도킹 패널이나 이름이 지정된 패널을 분할하고 새 패널 id를 반환하며, 패널 예산이나 열 너비가 분할을 막으면 아무것도 기록하지 않고 `undefined`를 반환합니다. `float(tabId, rect?)`는 탭을 떠 있는 패널로 들어 올리고, `dock(paneId)`는 떠 있는 패널을 도킹 영역으로 되돌립니다. 네 가지 모두 스토어의 기존 액션을 실행하고 각각 하나의 기록 항목을 남깁니다. 대상이 없거나 이미 요청된 상태면 무변경이며, `open`과 마찬가지로 마운트된 세션 표면 없이는 예외를 던집니다. `TabId`, `PaneId`, `TabRecord`, `FloatRect`는 패키지의 `/client` 진입점에서 다시 내보내므로 호출자가 dockkit을 임포트할 필요가 없습니다.

`focusedTarget(element?)`는 임베딩 iframe을 포함해 라이브 DOM 포커스 아래의 보이는 페이지를 캡처하며, 사이드바 마크업 밖이거나 낡은 경우에는 대상을 내놓지 않습니다. `commandTarget(element?)`는 사이드바 밖에서 시작된 열기에 대해 마운트된 세션의 활성 도킹 패널도 허용합니다. `SidebarRightTarget`은 세션, 패널, 호스트, 탭 발생, 내비게이션 리비전을 캡처합니다. `isTargetCurrent(target)`는 실행 전에 그 정체성을 확인하므로, 기록을 다시 열거나 그리로 내비게이션하면 캡처된 액션이 무효가 됩니다. 다른 페이지로 대상을 바꾸는 일은 없습니다. 닫기와 배치 결과는 [컨트롤러 메서드](../../packages/client/ui-sidebar-right/src/client/service.ts)를 참고하세요.

## 슬롯과 소유자 props

사이드바는 네 개의 확장 슬롯을 선언하고, 문서 탭은 아래의 추가 키 지정 문서 본문을 선언합니다([계층](slots.ko.md)).

| 슬롯 | 카디널리티 | 목적 |
|---|---|---|
| `sidebar.right.pane.tab` | 정의의 `id`로 키 지정, 세션 범위 | 탭 하나의 본문입니다. 시트는 탭을 그 종류의 적용 중인 구현의 `id`로 디스패치하므로, 등록자는 도킹이든 떠 있든 그 종류의 모든 탭을 받습니다. 구현이 본문을 등록하지 않은 종류는 소유자의 "이것을 볼 수 없습니다" 알림을 렌더링합니다. |
| `sidebar.right.pane.tab.title` | 정의의 `id`로 키 지정, 세션 범위 | 칩의 제목이며 본문과 같은 소유자 공유를 받습니다. 선택 사항입니다. 항목이 없으면 칩은 열 때 캡처한 `title(address)` 텍스트를 보여 주고, 라이브 제목이 있는 타입은 이곳에서 자체 스토어를 읽습니다. |
| `sidebar.right.tab.guide` | 체인, 세션 범위 | 탭을 대체하지 않고 가이드 탭의 내용을 대체합니다. 거절하지 않는 첫 항목이 본문을 가져가고, 그렇지 않으면 배포되는 가이드가 렌더링됩니다. |
| `sidebar.right.tab.menu.item` | 목록, 세션 범위 | 키트 자체의 레이아웃 액션 뒤에 덧붙는 콘텐츠 수준 액션입니다. 동작하는 항목은 소유자의 `dismiss()`를 호출해야 합니다. |
| `sidebar.right.tab.document` | 문서 구현의 `id`로 키 지정, 세션 범위 | 문서 탭 안에서 선택된 파일 렌더러입니다. 부모가 공유 로딩과 툴바 컨트롤을 소유합니다. |

본문, 제목, 가이드 대체는 프레임워크가 주입하는 `useTabInfo()`를 받습니다. 이는 `{ sidebar, panel, tab }`을 반환합니다. `sidebar`는 `expanded`와 `fullscreen`을 담고, `panel.id`는 담고 있는 패널을 지목하며, `tab`은 기록 필드에 `visible`, `navigation`, `signal`, `actions`를 더해 담습니다. 모든 탭은 포그라운드 세션을 요구합니다. 도킹된 본문은 확장과 선택도 요구하고, 도킹된 제목은 확장을 요구하며, 포그라운드 떠 있는 탭은 접힘에서도 살아남습니다. `signal`은 기록이 사라지거나 플러그인이 언로드될 때 중단되고, 숨김이나 세션 전환에서는 중단되지 않습니다. `tab.actions`는 탭 자체의 세션에 바인딩된 `openResource`, `openTab`, `close`를 제공합니다. 열기 배치는 현재 패널이 기본이고, `revealIfOpened`는 기본값이 `true`이며, `replaceTab: true`는 같은 기록 항목에서 이 기록을 대체합니다. 메뉴 항목은 평범한 `tab`과 `dismiss` 소유자 매개변수를 유지합니다.

`navigation.revision`은 `params`가 바뀌었는지와 무관하게 그 탭으로의 모든 내비게이션에서 증가하므로, 본문은 "다시 내비게이션됨"만으로 동작할 수 있습니다. 주소로 연 탭에서는 `1`이고, 아무도 주소로 열지 않은 기록(미리 심어진 가이드나 실행 취소로 복원된 탭)에서는 `0`입니다. Tab 도메인은 열린 기록마다 발생 하나를 보유합니다. 나타난 기록은 리소스 모델에 고정되므로 탭을 전환해도 콘텐츠를 버리지 않고 본문만 언마운트하고, 사라진 기록은 중단되어 버려지며, 실행 취소로 복원된 기록은 새 발생입니다([Tab 도메인](../../packages/client/ui-sidebar-right/README.md#the-tab-domain)).

`tab.actions.bindCommands(commands)`는 마운트된 본문을 위해 `SidebarRightTabCommands`, 현재로선 선택적 `refresh` 콜백을 기여합니다. 생략한 연산은 사용할 수 없으며, 반환된 디스포저는 더 새 본문의 커맨드를 제거하지 않고 그 등록만 해제합니다. 탭 수명도 이들을 해제합니다. `tab.refreshShortcut`은 페이지 컨트롤을 위한 실제 새로 고침 카탈로그 항목을 제공하며, 항목이 없으면 선택 사항입니다. 이 필드들은 [슬롯 소유자 타입](../../packages/client/ui-sidebar-right/src/client/contract/slots.ts)에 선언되어 있습니다.

## 문서 렌더러

`text` 탭은 공유 Document Preview 소유자입니다. 그 [루트 등록](../../packages/client/ui-sidebar-documentpreview/src/client/index.ts)이 `sidebar.right.tab.document`를 선언하고 `ctx.documentPreviews`를 제공합니다. 렌더러는 자신의 효과에서 `DocumentPreviewDefinition` 메타데이터를 등록한 뒤 `ctx.slots.inject('sidebar.right.tab.document', ...)`를 통해 기다리고, `key: definition.id`와 로케일 네임스페이스로 컴포넌트를 등록합니다. 렌더러는 자체 본문을 등록하고 자식 슬롯을 통해 공유 프레젠테이션을 재사용할 수 있습니다. 렌더러를 바꿔도 탭이나 리소스 주소는 바뀌지 않으며, [확장 결정](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md)이 미리 보기 정책을 리소스 소유권과 분리합니다.

[레지스트리](../../packages/client/ui-sidebar-documentpreview/src/client/document/registry.ts)는 고유한 `id`, `extensions`, 지역화된 `title()`, `loading`, 선택적 `priority`, 선택적 `wrap`을 기록합니다. 대소문자를 구분하지 않는 접미사 일치는 `extension`(기본값)을 `builtin`보다 앞세우고, 그다음 더 긴 접미사를 더 짧은 것보다, 그다음 등록 순서를 따릅니다. 탭 종류 대체와 달리 레지스트리는 모든 구현을 사용 가능한 상태로 유지하며, 툴바가 일치하는 대안을 나열하고 탭별로 선택을 기억합니다. 알 수 없는 확장자는 순수 텍스트를 사용합니다. `binaryExtensions`에 선언된 접미사는 [패키지 README](../../packages/client/ui-sidebar-documentpreview/README.md#what-it-registers)에 설명된 대로 순수 텍스트 대안을 억제합니다. `loading`은 `text-pages`, `bytes-complete`, `renderer` 중 하나이고, `wrap`은 공유 소스 줄바꿈 컨트롤 지원을 알립니다.

[`DocumentPreviewProps`](../../packages/client/ui-sidebar-documentpreview/src/client/document/contract.ts)는 `PropsRuntime<'sidebar.right.tab.document'>`에서 파생됩니다. 소유자는 원래 `resourceAddress`, `content`, 현재 `wrap`, `addResource` / `setResources` 의존성 콜백을 제공합니다. 텍스트 콘텐츠는 누적 `text`와 함께 `{ kind: 'text', text, pages: [{ offset, text, lines }], eof }`이고, 완전한 바이트는 `Uint8Array<ArrayBuffer>` 데이터와 함께 `{ kind: 'bytes', data }`입니다. 이 일시적 버퍼는 읽기 전용으로 빌려온 것이며 영속 레이아웃이나 세션 JSON에 들어가서는 안 됩니다. PDF는 Worker 전송 전에 바이트를 복사해 소유자의 버퍼를 보존합니다. 자식은 같은 프레임워크 바인딩 `useTabInfo`와 전역 메타데이터 전용 `useResource`를 받습니다. 부모는 텍스트를 `remote.workspaceFiles.read`로, 바이트를 `remote.workspaceFiles.readBytes`로 읽고, 페이지 추가, 탭별 새로 고침, 로딩 상태를 소유합니다. HTML은 같은 바이트 판독기에 `baseFile`을 전달하며, 경로는 호스트 코드가 해석합니다. Markdown과 코드는 추가에 걸쳐 증분 렌더러 하나를 유지하고 EOF에서 완료(settle)하며, HTML과 PDF는 완전한 바이트를 받습니다.

미리 보기는 로드한 버전과 읽기가 시작될 때 관찰한 버전을 기록합니다. 자동 새로 고침은 기본적으로 활성화되며, 초기 멤버 메타데이터가 기준선을 세우고 이후 변경이 탭을 다시 로드합니다. 새로 고침은 그 탭만 다시 읽고 공유 메타데이터나 다른 탭의 콘텐츠를 바꾸지 않습니다. 읽기는 트랜잭션이 아니며, 버전은 순서가 있는 타임스탬프가 아니라 불투명한 동등성 토큰입니다([리소스 관찰과 Preview RPC](../../.agents/notes/implemented/architecture/2026-09-08-document-preview-operations.md)).

로딩을 소유하는 렌더러는 파일 바이트 대신 `{ kind: 'renderer', revision, loaded, failed, reload }`를 받습니다. 본문은 주입된 면을 호출하고, 리비전 변경과 언마운트에서 취소하며, 표시 중인 소스 버전을 `loaded(version)`으로 보고합니다. 로드 실패는 `failed()`를 호출해 이후 파일 변경이 재시도할 수 있게 합니다. 부모는 낡은 보고를 무시하고 공유 재로드와 소스 변경 컨트롤을 유지합니다. Office는 이 모드를 사용해 [호스트 렌더링 PDF](office-to-pdf.ko.md)를 요청하며, 그 면은 변환된 바이트, 폰트 메타데이터, 실패를 자체 스토어에 쓰고 본문은 중첩된 PDF 뷰를 렌더링합니다. `OfficeFontAction`은 `sidebar.right.tab.document.action`을 통해 재로드 전에 누락 폰트 경고를 렌더링합니다. 로딩 수명 주기는 [패키지 README](../../packages/client/ui-sidebar-documentpreview/README.md#what-it-registers)가 정의합니다.

## 리소스 모델

모델은 [클라이언트 리소스](client-resources.ko.md)에 문서화되어 있으며, 이 절은 사이드바가 의존하는 바를 밝힙니다. 리소스는 하나의 주소이고, 리소스 주소는 소문자화한 호스트가 프로토콜 키인 `dsh-resource://<type>/…` URL입니다. 프로토콜을 소유한 클라이언트 패키지가 자신의 수명 동안 `ctx.resources.register(provider)`로 제공자 하나를 등록하며, 같은 프로토콜의 두 번째 제공자는 예외를 던집니다([프로토콜 제공](../../packages/client/resources/README.md#provide-a-protocol)). 제공자는 `{ protocol, open(address, { signal }) }`입니다. `open`은 `RemoteResult` 프레임을 산출하고(현재 상태가 먼저, 이후 변경마다 프레임 하나), `signal`이 중단되면 멈춥니다. 실패는 `{ ok: false, error }` 프레임이며 결코 예외가 아니고, 스트림 내부의 예외는 모델이 잡지 않는 프로그래밍 오류입니다.

`useResource<P>(address)`는 범위와 무관하게 모든 슬롯 컴포넌트에 있는 전역 표준 prop입니다. `{ status, value, failure }`를 반환합니다. 주소의 프로토콜에 제공자가 없거나 주소가 리소스 주소가 아니면(`sidebar://guide`는 리소스를 지목하지 않습니다) `none`, 첫 프레임까지는 `loading`, 최신 `ok` 값이 있으면 `live`, 최신 프레임의 실패가 마지막 값 옆에 있으면 `failed`입니다. ([리소스 읽기](../../packages/client/resources/README.md#read-a-resource)).

리소스는 보유자가 있는 동안 열린 상태로 유지됩니다. 구독한 `useResource`나 `ctx.resources.pin(address, signal)`이 보유자입니다. 첫 보유자가 제공자의 스트림을 열고, 이후 보유자는 이를 공유하며 최신 값을 즉시 읽고, 마지막 해제가 스트림을 중단하고 값을 버립니다. 스트림은 콘텐츠가 아니라 메타데이터를 나릅니다. `file` 값은 `{ absolutePath, version, bytes? }`이며, 소비자는 Workspace Files 서비스를 통해 파일 텍스트를 페이지 단위로 직접 읽습니다([수명 주기](../../packages/client/resources/README.md#lifecycle)).

## Workspace Files

호스트 `ctx.workspaceFiles` 서비스와 생성된 `workspaceFiles` Remote 네임스페이스는 세션 파일 시스템 백엔드가 허용하는 파일을 읽습니다. `stat(path)`는 `{ absolutePath, version, bytes? }`를 반환하고, `read(path, { offset?, limit? })`는 줄 한 페이지를(`offset`은 1부터, `limit`은 설정된 페이지 크기로 상한) `{ …stat, offset, text, eof }`로 반환하며, `readBytes(path, { range?, baseFile? })`는 `maxFileBytes` 이하의 완전한 파일이나 `maxBytes` 이하의 바이트 창을 네이티브 `Uint8Array` 데이터와 함께 `{ …stat, offset, data, eof }`로 반환합니다. 선택적 `range`는 0부터 시작하는 `offset`과 바이트 `length`를 쓰고, `baseFile`은 다른 파일의 디렉터리에서 상대 대상을 해석합니다. `list(path)`는 워크스페이스 루트 안에 머물며 디렉터리의 직접 자식(`name`, `type: 'file' | 'directory' | 'other'`, `size?`)을 설정된 상한으로 잘라 `truncated`를 설정해 반환합니다. `changes(path)`는 대상 하나를 감시하며, 호스트가 그 타입을 결정하고 디렉터리를 워크스페이스로 제한합니다. 구독하면 `{ kind: 'ready' }`를 한 번 산출하고, 이후 페이로드가 `{ absolutePath, version }`이나 `{ absolutePath, absent: true }`인 `{ kind: 'change', change }` 프레임을 산출합니다([README](../../packages/api/workspace-files/README.md#use-this-package)). 파일 읽기는 최종 심볼릭 링크를 거부하고 전송 상한을 강제하며, `read`는 추가로 UTF-8 텍스트를 요구합니다. 실패는 `workspace-file/*` 코드를 사용합니다([실패](../../packages/api/workspace-files/README.md)).

[`dsh-api-workspace-files`](../../packages/api/workspace-files/README.md)가 `file` 제공자를 등록하며, `ResourceProtocolMap.file`이 `WorkspaceFileStat`을 직접 지목합니다. 세션 주소는 권한을 부여하는 세션과 상대 또는 절대 경로를 담고, 그대로 호스트에 전달되어 해석됩니다. 제공자는 stat 전에 호스트 `ready`를 기다리고 `stat.absolutePath`로 변경을 필터링합니다. 맨 `absolute` 주소는 권한을 부여하는 세션이 없어 현재 세션이나 탭 세션을 빌리지 않고 `workspace-file/unknown-workspace`로 실패합니다. 전역 컴포넌트를 포함한 모든 UI는 같은 완전한 주소에 대한 관찰을 공유합니다. 미리 보기의 Remote 콜백은 그 주소의 세션을 사용하며, `remote.workspaceFiles.readBytes`는 Connection의 바이너리 RPC 전송을 통해 네이티브 바이트를 반환합니다.

## 배포되는 타입

- **`guide`** — `builtin`, `openTab('guide')`로 엽니다. `order` 순서로 기여된 `guide` 항목마다 캡슐 하나가 있고 그 위에 흐린 나침반이 놓입니다. 목록이 짧으면 등록된 설명을 보여 주고, 아이콘이 없는 항목은 모두 배포되는 자리표시자를 씁니다. 캡슐을 고르면 기여한 타입이 가이드 탭 자리에 페이지로 열립니다. 패널은 가이드 탭을 최대 하나만 가지며, 스트립의 추가 컨트롤은 그 패널에 가이드 탭이 없을 때만 나타납니다. 새 패널은 등록된 기본 페이지를 받습니다. 가이드 항목이 하나뿐이면 그 항목이, 항목 수가 하나가 아니면 가이드가 기본입니다([가이드](../../packages/client/ui-sidebar-right/README.md#the-guide)).
- **`text`** — `fallback`, `dsh-resource://file/**`, 세션 주소만 클레임합니다. Document Preview는 `useResource<'file'>`로 메타데이터를 관찰하고, Remote 콜백으로 콘텐츠를 로드하며, 렌더러 선택, 툴바, 탭별 새로 고침, 스크롤, 소스 내비게이션을 소유합니다. 알 수 없는 확장자는 순수 텍스트로 렌더링됩니다([README](../../packages/client/ui-sidebar-documentpreview/README.md)).
- **`files`** — `builtin`, `openTab('files')`로 엽니다. 워크스페이스 디렉터리 트리이며 `list`로 지연 나열되고 확장된 디렉터리별로 감시되며, 파일을 `tab.actions.openResource(fileAddressFor(sessionId, root, path))`로 자체 패널에 엽니다([README](../../packages/client/ui-sidebar-files/README.md)).
- **`browser`** — 다중 인스턴스 `builtin`, `openTab('browser', { params: { url? } })`로 엽니다. 어시스턴트 Markdown이 HTTP(S) 링크를 이곳에서 열지 여부는 채팅의 [링크 기본 설정](../../packages/client/ui-chat/README.md)이 제어합니다. 기본 샌드박스 아래에서 공개 및 루프백 HTTP(S) 대상을 받아들이고, 로컬 파일은 Document Preview에 양보하며, 애플리케이션이 아는 iframe 기록을 사용합니다([README](../../packages/client/ui-sidebar-browser/README.md)).
- **`subagentchat`** — `builtin`, `dsh-resource://subagentchat/session/<child>?parent=<parent>&mode=<mode>`. 리소스 제공자가 보유하고 공유 Conversation Factory를 통해 렌더링되는, 명시적으로 주소가 지정된 서브에이전트 대화입니다([README](../../packages/client/ui-subagent/README.md)).

<a id="not-built"></a>
## 만들지 않음

- 영속성: 레이아웃 상태는 메모리에만 있습니다. 새로 고침하면 모든 세션이 접힌 상태로 시작하고, 한 세션의 탭은 다른 세션에서 보이지 않습니다.
- `ctx.sidebarRight`의 읽기 전용 레이아웃 스냅샷이나 구독: 서비스는 연산만 노출하며, dockkit의 `LayoutState`/`LayoutOp`는 내부입니다.
- 서비스의 기능 탐색 배열(`features`).
- 탭 타입의 `option` 우선순위 밴드: 클레임을 허용하지 않고 탭 타입을 나열하는 것은 없습니다.
- 기록 제목 변경: `title(address)`는 한 번만 캡처되며, 라이브 칩은 기록이 아니라 제목 슬롯에서 옵니다.
- 열 때 탭 구현 지정: `openResource`는 기껏해야 종류를 지목하며, 문서 렌더러 선택은 파일 탭의 툴바에 속합니다.
- 서비스의 주소 조회(`find`): 호출자는 `revealIfOpened`로 열고 표면이 중복을 제거하게 합니다.
- 사이드바 자체의 `sidebar://<kind>` 기록 외의 내비게이션 주소: 그 문법은 내비게이션 컨트롤러 전체를 기다립니다.
- 사용자 대상 실행 취소와 일반적인 타입 간 콘텐츠 내비게이션 스택([보류](../../.agents/notes/implemented/feature/2026-09-04-right-sidebar-docking-infrastructure.md#deferred)). Browser는 자체 페이지 기록만 소유합니다.
