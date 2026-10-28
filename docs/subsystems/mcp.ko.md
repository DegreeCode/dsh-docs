# MCP

[English](mcp.md) | [中文](mcp.zh.md) | 한국어

## 요약

모델 컨텍스트 프로토콜(MCP)은 모델을 외부 서버가 제공하는 도구에 연결합니다. 구성된 각 서버는 취소, 권한 검사, 기록된 결과, 지원되는 이미지 출력을 갖춘 평범한 하네스 도구를 기여합니다. 공유 도구는 서버가 호출자의 범위에 구성되어 있을 때 리소스를 발견하고 읽으며, 서버 지시는 기록된 시스템 프롬프트에 합류합니다. 공식 SDK가 현대 또는 지원되는 레거시 프로토콜 리비전을 협상합니다. 이 참조는 MCP 패키지 그룹의 책임, 범위, 구성 선택을 다루며, 서버 구성은 [클라이언트 README](../../packages/mcp/mcp-client/README.md)가 소유합니다.

## 목차

- [구성](#configuration)
- [책임과 범위](#responsibilities-and-scope)
- [프로토콜과 결과](#protocol-and-results)
- [리소스와 지시](#resources-and-instructions)
- [리소스 제공자 타입](#resource-provider-types)
- [한도](#limits)
- [더 읽을거리](#further-reading)

-----

<a id="configuration"></a>
## 구성

MCP 서버는 옵트인입니다. 의도한 Cordis 범위에 서버마다 `@deepseek-ai/dsh-mcp-client` 항목 하나를 구성하세요. 모든 배포 프로필이 [도구 레지스트리](tools.ko.md)를 제공하고 공유 리소스 서비스를 한 번 마운트하므로, 사용자는 클라이언트 항목만 구성합니다. 가시적인 구성 서버가 없는 호출자는 네이티브와 PTC 모드 모두에서 MCP 프롬프트 텍스트나 도구를 받지 않습니다.

| 선택 | 구성 소유자 |
|---|---|
| 서버 정체성, 로컬 프로세스 또는 HTTP 엔드포인트, 자격 증명, 프로세스 환경 | [클라이언트 구성](../../packages/mcp/mcp-client/README.md#use-this-package) |
| 도구·리소스 요청 타임아웃, 시작 실패 정책, 재연결 | [클라이언트 구성](../../packages/mcp/mcp-client/README.md#use-this-package) |
| 리소스 발견과 읽기 | [MCP 리소스 서비스](../../packages/mcp/mcp-resources/README.md#use-this-package)가 배포 프로필에 포함되며 구성 필드가 없습니다 |
| 서버 지시 크기 한도 | 클라이언트 `maxInstructionBytes`. 구성이 [시스템 프롬프트 조립](system-prompt.ko.md)을 제공합니다 |
| 권한 결정과 지원되는 이미지 출력 | [도구 실행](tools.ko.md)과 [첨부](attachment.ko.md) |

프로토콜 협상은 SDK가 지원하는 리비전을 따르며, 프로토콜 리비전을 강제하는 제품 설정은 없습니다. 허용되는 클라이언트 필드와 기본값은 [구성 카탈로그](../config-catalog.ko.md#deepseek-aidsh-mcp-client)에 나열되어 있습니다.

-----

<a id="responsibilities-and-scope"></a>
## 책임과 범위

클라이언트는 서버별 연결 플러그인이자 하네스 도구 레지스트리의 소비자입니다. 공유 `ctx.mcp` 서비스를 게시하지 않습니다. 외부 서버가 MCP 작업을 구현하고, SDK가 프로토콜 교환을 소유하며, 클라이언트가 발견된 도구를 하네스 실행에 맞게 적응시킵니다.

`mcp-resources`는 공유 리소스 도구를 소유하고 호출자의 범위에서 제공자를 선택합니다. 각 MCP 클라이언트는 자기 연결을 통해 리소스 작업을 제공합니다. 범위의 첫 제공자가 로컬 공유 도구를 활성화하고, 마지막 제공자를 제거하면 그것들도 제거되며, 상속된 제공자는 계속 보입니다. 서비스는 어떤 한 클라이언트와도 무관하게 이 도구 등록을 소유합니다. 가시적인 클라이언트 항목이 활성인 동안에는 연결 실패가 공유 리소스 도구를 제거하지 않습니다.

구성된 `serverName`은 등록 범위에서 서버를 식별합니다. 그 범위의 두 항목은 같은 이름을 예약할 수 없고, 별개 Agent 범위는 이를 재사용할 수 있습니다. 공개 도구 이름에 구성된 서버 이름이 포함되므로 서로 다른 서버의 동명 도구도 구분됩니다. 등록 effect가 이름과 발견된 도구를 소유하며, 플러그인 폐기가 연결을 닫고 그 기여를 제거합니다.

[네이티브 Cua Driver 제공자](../../packages/experimental/computer-use-cua-driver-native/README.md)는 MCP 연결을 열지 않고 클라이언트가 내보내는 결과 어댑터를 공유합니다. 데스크톱 제공자 선택은 [computer-use 하위 시스템](computer-use.ko.md)에 속합니다.

-----

<a id="protocol-and-results"></a>
## 프로토콜과 결과

stdio와 Streamable HTTP 모두 공식 SDK의 협상, 발견, 프로토콜 검증, 취소를 사용합니다. 도구 목록 변경은 레거시 알림이나 현대 구독을 통해 발견을 촉발합니다. 새로 고침이 실패하면 이전 도구 세대가 유지되고, 연결 복구는 [클라이언트 수명 주기](../../packages/mcp/mcp-client/README.md#use-this-package)를 따릅니다.

결과 어댑터는 프로그래밍 방식 호출자를 위해 정규 MCP JSON을 유지하고 평범한 도구 콘텐츠를 준비합니다. 지원되는 이미지는 첨부 시스템을 사용하고, 지원되지 않는 풍부한 콘텐츠는 명시적 텍스트 진단을 만듭니다. 정책 실패와 대체된 결과에 대해서는 도구 레지스트리가 계속 권위입니다. 기록과 최종 표현은 [도구 계약](tools.ko.md)이 소유하고, MCP 전용 투영 세부 사항은 [클라이언트 결과 참조](../../packages/mcp/mcp-client/README.md#use-this-package)가 소유합니다.

-----

<a id="resources-and-instructions"></a>
## 리소스와 지시

리소스 호출은 명시적으로 구성된 서버 이름을 요구합니다. 시스템 프롬프트 조립을 사용할 수 있을 때 리소스 서비스는 디스패치에 쓰는 것과 같은 레지스트리에서 호출자 가시 이름을 나열하며, 도구나 지시가 없는 서버도 포함합니다. 공유 레지스트리는 디스패치 전에 호출 Agent의 범위에서 그 이름을 해석하므로, 사용할 수 없는 서버는 네트워크 요청 없이 실패합니다. 발견과 읽기는 요청 시 수행되며, 도구 없이 리소스만 노출하는 서버도 포함됩니다. 페이지네이션과 콘텐츠 렌더링은 [리소스 패키지](../../packages/mcp/mcp-resources/README.md)가 소유하고, 그 생성된 도구 스키마는 [도구 카탈로그](../tool-catalog.ko.md#deepseek-aidsh-mcp-resources)에 있습니다.

리소스 제공자는 연결 소유로 남습니다. 범위 폐기는 등록을 제거하고, MCP 클라이언트가 취소와 복구를 제어합니다. 정규 결과는 프로그래밍 방식 호출자를 위해 완전한 JSON을 유지하고, 텍스트 투영은 바이너리 블롭을 설명으로 대체합니다. 반환된 텍스트는 일반 도구 이력에 들어가며, 서버가 연결되었다는 이유만으로 콘텐츠를 가져오지는 않습니다.

시스템 프롬프트 조립이 구성되면 클라이언트는 비어 있지 않은 서버 지시를 범위 지정되고 서버 귀속된 섹션으로 게시합니다. 지시는 리터럴 텍스트로 남고 게시 전에 구성된 크기 한도를 통과합니다. 교체 연결은 발견이 성공한 뒤에만 지시를 게시하며, 지시가 없으면 섹션을 추가하지 않습니다. 조립과 기록은 [시스템 프롬프트 하위 시스템](system-prompt.ko.md)이 소유합니다.

-----

<a id="resource-provider-types"></a>
## 리소스 제공자 타입

연결 제공자는 하나의 작업과 원래 도구 실행을 받으며, 여기에는 호출자와 취소 시그널이 포함됩니다.

```ts type-equiv
/** One supported resource operation, with server-owned cursors and URIs. */
type McpResourceRequest =
  | { method: 'resources/list' | 'resources/templates/list'; cursor?: string }
  | { method: 'resources/read'; uri: string }
```

```ts type-equiv
/** One configured server's resource access, owned by its MCP connection plugin. */
interface McpResourceProvider {
  /**
   * Run an operation against one live connection generation.
   * @param request - MCP resource method and parameters.
   * @param exec - caller identity and cancellation for this invocation.
   * @returns the protocol result as lossless JSON.
   */
  request(request: McpResourceRequest, exec: ToolExecution): Promise<JsonValue>
}
```

-----

<a id="limits"></a>
## 한도

MCP 프롬프트 템플릿, 사람 입력 유도, 작업 기반 실행, 리소스 구독은 지원되지 않습니다. 리소스 도구는 호출자 가시 구성 서버를 요구하며, 바이너리 리소스는 모델을 위한 텍스트 설명을 갖는 프로그래밍 방식 데이터로 남습니다. 도구 기능이 없는 서버는 빈 도구 집합으로 연결됩니다. 연결과 발견 타임아웃은 SDK를 따르며, 클라이언트에는 이를 위한 별도 설정이 없습니다.

-----

<a id="further-reading"></a>
## 더 읽을거리

- [MCP 패키지 그룹](../../packages/mcp/README.md) — 패키지 진입점.
- [MCP 리소스](../../packages/mcp/mcp-resources/README.md) — 공유 도구와 리소스 제공자 시맨틱.
- [리소스 가시성 참조](../../packages/mcp/mcp-resources/README.md) — 공유 프로필 마운트와 구성 서버로부터의 가시성.
- [서드파티 메모리 서버](../user/guide/mcp-memory.ko.md) — 제품 구성 가이드.
- [프로토콜 협상 참조](../../packages/mcp/mcp-client/README.md) — SDK 소유권과 호환성 결정.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxmcpresources--mcpresourceruntime"></a>

### `ctx.mcpResources` — `McpResourceRuntime`

Scoped resource access plus three tools shared by configured MCP servers.

```ts cordis-catalog
/**
 * Register one server and expose resource tools while that scope has providers.
 * @param server - configured server name, unique in this scope.
 * @param provider - connection-owned resource operations.
 * @returns the effect disposer for this exact registration.
 */
register(server: string, provider: McpResourceProvider): () => void
```

Source: [`packages/mcp/mcp-resources/src/index.ts`](../../packages/mcp/mcp-resources/src/index.ts)
<!-- END GENERATED cordis-surface -->
