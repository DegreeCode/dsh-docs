# 제품 텔레메트리

[English](product-telemetry.md) | [中文](product-telemetry.zh.md) | 한국어

[제품 텔레메트리 플러그인](../../packages/host/product-telemetry-otel/README.md)은 명시적으로 선택된 분석 이벤트를 OTLP/HTTP로 보냅니다. 그 `productTelemetry` 서비스는 제출만 소유하며, 이벤트가 언제 발생하는지와 어떤 필드가 승인되는지는 제품 소비자가 소유합니다. 내보내기는 세션 데이터나 식별자를 자동으로 수집하지 않습니다. [데스크톱 분석 소비자](../../packages/client/product-analytics/README.md)는 상호 작용과 라이브 컴팩션 이벤트를 선택하고, 캐시된 정적 환경과 사용 가능한 로그인 신원을 더하며, 데스크톱 실행 시점 수집 스위치를 따릅니다. 일반 웹 클라이언트는 제품 이벤트를 수집하지 않습니다.

`ProductTelemetryRecord`는 이벤트 이름, 문자열 본문, Unix 밀리초 타임스탬프를 요구합니다. 속성은 스칼라 문자열, 숫자, 불리언, 그리고 그 값들로 이루어진 1단계 객체(`ProductTelemetryScalar`)를 받습니다. 선택적 심각도는 OTel 심각도 숫자를 사용하며 기본값은 INFO입니다. 관찰 시각은 기록이 큐에 들어갈 때 부여됩니다.

큐 넣기는 동기적이며 전달을 승인하지 않습니다. SDK가 배칭과 재시도를 소유하고, 로컬 진단이 내보내기 실패를 보고합니다. 구성, 종료, 손실 한도는 패키지 README를 참고하세요.

## 기록 타입

```ts type-equiv
/** Scalar values accepted in product attributes. */
type ProductTelemetryScalar = OTelEventScalar
```

```ts type-equiv
/** Caller-selected ordinary analytics record. */
type ProductTelemetryRecord = OTelEventRecord
```

출처: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxproductanalytics--productanalytics"></a>

### `ctx.productAnalytics` — `ProductAnalytics`

Authenticated event intake; disabled instances do not inspect identity or accept new events.

```ts cordis-catalog
/**
 * Read the collection policy.
 * @returns whether this Host currently accepts Desktop analytics.
 */
@Remote enabled(): boolean

/**
 * Stream the effective policy initially and after live configuration edits.
 * @param signal - subscriber lifetime.
 * @returns current policy values until cancellation or service disposal.
 */
@Remote({ mode: 'stream' }) async *watchPolicy(signal: AbortSignal): AsyncIterable<boolean>

/**
 * Submit selected Desktop fields with cached static environment and fresh identity.
 * The first intake waits for bounded environment queries; concurrent intakes share them.
 * Missing identity is omitted; failed environment fields carry fixed reasons.
 * @param event - typed product event without message contents or credentials.
 * @returns after local submission; no delivery or warehouse acknowledgement.
 */
@Remote async report(event: ProductEvent): Promise<void>
```

Source: [`packages/client/product-analytics/src/index.ts`](../../packages/client/product-analytics/src/index.ts)

<a id="ctxproducttelemetry--producttelemetry"></a>

### `ctx.productTelemetry` — `ProductTelemetry`

Host analytics sender. Mounting alone sends nothing; the owning fiber drains it on unload.

```ts cordis-catalog
/**
 * Enqueue one selected product event without waiting for network delivery.
 * Queue admission and shutdown completion are not collector or warehouse acknowledgements.
 * @param record - caller-owned event containing only approved analytics fields.
 */
emit(record: ProductTelemetryRecord): void
```

Source: [`packages/host/product-telemetry-otel/src/index.ts`](../../packages/host/product-telemetry-otel/src/index.ts)
<!-- END GENERATED cordis-surface -->
