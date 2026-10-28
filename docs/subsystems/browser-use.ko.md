# 브라우저 사용

[English](browser-use.md) | [中文](browser-use.zh.md) | 한국어

브라우저 사용은 모델이 구성된 백엔드를 통해 웹 페이지를 검사하고 조작하게 합니다. DSH가 작업 루프를 소유하고, 제공자는 브라우저 연산을 제공하며 하나의 라이브 세션 턴에 걸쳐 브라우저 상태를 유지합니다.

## 제공자 선택

같은 조합에 [`dsh-browser-use`](../../packages/browser-use/browser-use/README.md)와 제공자 하나를 마운트하세요. 제공자들은 실험적인 공개 npm 패키지이며 명시적 활성화가 필요합니다. 초기 브라우저 엔진은 Chromium입니다.

| 제공자 | 통합 |
|---|---|
| [Playwright MCP](../../packages/experimental/browser-use-playwright-mcp/README.md) | Playwright의 브라우저 제어 MCP 도구 |
| [Chrome DevTools MCP](../../packages/experimental/browser-use-chrome-devtools-mcp/README.md) | MCP를 통한 Chrome DevTools 검사와 제어 |
| [Stagehand](../../packages/experimental/browser-use-stagehand-native/README.md) | AI 지원 동작, 관찰, 추출을 갖춘 네이티브 브라우저 연산 |

공유 서비스는 이름만 등록하고 같은 이름의 다른 인스턴스를 포함해 두 번째 제공자를 거부합니다. 공통 브라우저 연산 메서드도, 브라우저 리소스도, 모델이 제어하는 선택자도 없습니다. 프로필이나 프리셋의 제공자 구성이 그 활성화에 대해 실행(launch) 또는 첨부(attachment)를 선택합니다.

## 세션 소유권

실행된 브라우저는 그것을 사용하는 정확한 라이브 에이전트와 세션에 속합니다. 턴에 걸친 호출은 그 브라우저를 재사용합니다. 세션 런타임을 디스포즈하면 실행된 리소스가 닫히고, 세션을 다시 로드하거나 포크하면 새 브라우저 상태로 시작합니다. 브라우저 프로필과 로그인 상태는 세션 로그에서 복원되지 않습니다.

첨부된 브라우저는 외부 소유로 남습니다. 제공자는 그 제공자 인스턴스 안에서 한 세션을 위해 이를 예약하고, 기존 브라우저 상태를 보존하며, 다른 세션의 동시 첨부를 거부합니다. 정리는 연결을 끊고 외부 브라우저는 계속 실행되게 둡니다. 별도 DSH 프로세스와 다른 클라이언트는 이 예약 밖에 있습니다.

제공자 종료는 도구 허용을 멈추고, 공유 제공자 등록을 해제하기 전에 소유 작업과 리소스 정리를 기다립니다. 취소는 이미 전달된 브라우저 동작을 되돌릴 수 없습니다.

## MCP 초기화

MCP 제공자는 제공자가 로드된 뒤 생성된 각 라이브 에이전트에 대해 클라이언트 하나를 초기화합니다. 기존 직렬 `agent/created` 이벤트는 생성이나 재개가 완료되고 큐에 쌓인 입력이 실행되기 전에 연결과 탐색을 기다립니다. 클라이언트는 턴에 걸쳐 세션과 함께 남습니다. 시작 실패나 취소는 생성이나 재개를 거부하고 클라이언트 정리를 촉발합니다.

첨부가 사용 중이면 그 활성화는 브라우저 없이 계속되고 이후 턴에서 재시도하지 않습니다. 해제 후에는 새로 생성되거나 재개된 활성화가 이를 획득할 수 있습니다. 제공자를 로드하거나 다시 로드해도 이미 활성인 세션을 채택하지 않으며, [공유 런타임](../../packages/experimental/browser-use-runtime/README.md)이 이 초기화 규칙을 소유합니다.

## 도구와 기록된 결과

제공자 도구는 일반 DSH 실행 파이프라인과 세션 로그를 사용합니다. 제공자는 자체 도구 스키마, 결과 렌더링, 이미지 지원, 구성, 업스트림 한도를 소유하며, 공유 서비스는 모델 가시 콘텐츠를 더하지 않습니다. Stagehand의 AI 지원 연산은 명시적으로 구성된 네이티브 모델을 사용하고 DSH는 작업 루프를 유지합니다. DSH 모델 라우팅, 자격 증명 재사용, 기반 추론 요청·응답 캡처, 세션 사용량 집계 통합은 보류되며, 반환된 SDK 데이터와 메타데이터는 평범한 기록된 도구 결과로 남습니다.

브라우저 MCP 연결은 [리소스와 서버 지침](mcp.ko.md)도 노출합니다. 브라우저 서버로 향하는 리소스 호출은 그 세션 큐를 사용하고 다른 세션을 거부하며, 서버 지침은 소유 세션에 대해서만 조립됩니다.

[결정 기록](../../.agents/notes/implemented/architecture/2026-09-12-browser-use-provider-registration.md)이 등록 전용 서비스와 세션별 소유권을 설명합니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxbrowseruse--browseruseregistry"></a>

### `ctx.browserUse` — `BrowserUseRegistry`

Owns one optional provider registration in the shared browser-use service.

```ts cordis-catalog
/**
 * Reserve the sole provider slot until the contribution is disposed.
 * A second registration fails even when it repeats the current name. Providers
 * must stop their tools and await owned work before releasing this registration.
 * @param name - provider-owned name used in registration diagnostics.
 * @returns the effect disposer for this exact registration.
 */
register(name: BrowserUseProviderName): () => Promise<void>
```

Source: [`packages/browser-use/browser-use/src/index.ts`](../../packages/browser-use/browser-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
