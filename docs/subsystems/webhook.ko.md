# 웹훅 런타임

[English](webhook.md) | [中文](webhook.zh.md) | 한국어

웹훅 하위 시스템은 인증된 외부 전달을 선택적인 일반 루트 세션으로 바꿉니다. 제공자 어댑터는 인증과 일반 JSON 수신을 소유하고, 신뢰된 프로그램 규칙은 조건과 외부 호출을 소유하며, `ctx.webhookRuntime`은 콜백 수명과 워크스페이스 기반 세션 생성을 소유합니다. [과거 구현 결정](../../.agents/notes/archived/feature/2026-08-22-fire-and-forget-webhook-sessions.md)이 런타임이 전달 상태나 완료 상태를 유지하지 않는 이유를 기록합니다.

## 공유 값

`WebhookRuleId`, `WebhookSourceId`, `WebhookDeliveryId`는 불투명 문자열입니다. 전달 id는 제공자의 식별자만 기록하며, 런타임은 이를 저장하지도 중복 제거하지도 않습니다.

`WebhookEventMap`은 제공자 종류별로 병합 확장 가능합니다. `WebhookEventOf<K>`는 알려진 제공자 이벤트를 선택하고 그 밖에는 일반 무손실 JSON을 허용하므로, 런타임 패키지를 바꾸지 않고 저장소 밖 어댑터를 둘 수 있습니다.

`VerifiedWebhookDelivery<K>`는 `kind`, 구성된 `source`, 제공자 `deliveryId`, 정규화된 `event`, 음이 아닌 안전한 정수 `receivedAt`을 담습니다. 런타임은 값을 둘 이상의 규칙에 디스패치하기 전에 전체를 검증하고 분리하고 동결합니다.

`WebhookRule<K>`는 고유 id, 제공자 종류, `run(delivery, signal)`을 담습니다. 콜백은 임의의 신뢰된 코드를 실행할 수 있습니다. `null`이나 `WebhookSessionRequest` 하나를 반환하며, 등록이 언로드될 때 멈춰야 하는 비동기 작업을 위해 신호를 관찰해야 합니다.

`WebhookSessionRequest`는 절대 `workspacePath`, 제목, 텍스트 프롬프트, 에이전트 프리셋, 권한 프리셋을 요구합니다. 선택적 `model`은 명시적 제공자·모델 라우트와 선택적 출력 토큰 상한을 지목하고 그 어댑터의 추론 기본값을 사용합니다. 생략하면 첫 요청이 영속 헤더를 기록할 때까지 추론 노력 수준을 포함한 현재 배포 선택 전체를 스냅샷합니다.

## 발사 후 망각(fire-and-forget) 디스패치

`dispatch()`는 일치하는 규칙을 스냅샷하고 각각을 독립적으로 스케줄하며, 각 콜백의 완료(settle)를 기다리지 않고 즉시 반환합니다. 예외와 거부는 규칙별로 격리됩니다. 등록 디스포즈는 그 규칙을 제거한 뒤 활성 호출을 중단하고 비우므로, 이후 전달이 언로드 중인 코드에 유입되지 않습니다.

런타임에는 큐도, 재시도도, 중복 제거도, 실행 상태도, 충돌 재생도, 에이전트 상태 리스너도, 완료 결과도 없습니다. 반복 전달은 반복 세션을 만들 수 있습니다. 유일한 활성 연산 표는 비공개 정리 장부이며 프로세스와 함께 사라집니다.

## 세션 생성

null이 아닌 결과는 비동기 사전 검사 전에 스냅샷됩니다. 런타임은 권한과 에이전트 프리셋을 검증하고, 정규 워크스페이스를 해석하거나 생성하며, 세션 cwd가 그 워크스페이스 경로와 같은 에이전트를 만들고, 게시 전에 선택된 에이전트 프리셋을 마운트하며, 권한·제목·초기 후속 호출을 적용하기 전에 세션을 영속적으로 붙입니다.

후속 호출은 `source.kind: "webhook"`과 제공자·소스·전달·규칙 식별자를 가진 일반 영속 사용자 역할 메시지입니다. 그 인박스 삽입이 수락되면 웹훅 연산이 커밋됩니다. 런타임은 특별히 플러시하거나 턴을 기다리지 않으며, 이후에는 일반 세션 영속성과 에이전트 수명 주기가 적용됩니다.

첨부 실패는 프롬프트가 존재하기 전에 새 에이전트를 디스포즈합니다. 첨부와 프롬프트 허용 사이의 실패는 원래 오류를 대체하지 않고 워크스페이스 분리와 에이전트 디스포즈를 시도합니다. 사전 검사 중 자동 생성된 워크스페이스는 다른 동시 호출자가 이미 사용 중일 수 있으므로 남습니다.

## GitHub 어댑터

`@deepseek-ai/dsh-webhook-github`는 주입된 WebServer에 정확한 라우트를 등록하고, 요청마다 자격 증명 참조를 해석하며, 파싱 전에 손대지 않은 `application/json` 본문을 검증하고, 메모리 내 디스패치 직후 `202`를 반환합니다. 그 정규화된 이벤트는 서명된 무손실 JSON 객체를 보장하며, 규칙이 자신이 소비하는 이벤트별 필드를 검증합니다.

[GitHub 리뷰 가이드](../user/guide/github-review.ko.md)는 이 라우트를 격리된 두 번째 WebServer에 마운트하므로, 웹훅 인그레스를 노출해도 브라우저 API가 노출되지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxwebhookruntime--webhookruntime"></a>

### `ctx.webhookRuntime` — `WebhookRuntime`

Fire-and-forget rule runtime. Session creation is the only built-in action.

```ts cordis-catalog
/**
 * Register one trusted programmatic rule.
 * @param rule - unique id, provider kind, and arbitrary callback.
 * @returns awaitable effect disposer that aborts and drains this rule's active callbacks.
 */
register<K extends string>(rule: WebhookRule<K>): () => Promise<void>

/**
 * Start every currently matching rule and return before any callback settles.
 * @param delivery - authenticated provider data; snapshotted before dispatch.
 * @throws synchronously when the runtime is closing or the delivery is malformed.
 */
dispatch<K extends string>(delivery: VerifiedWebhookDelivery<K>): void
```

Source: [`packages/experimental/webhook/src/index.ts`](../../packages/experimental/webhook/src/index.ts)
<!-- END GENERATED cordis-surface -->
