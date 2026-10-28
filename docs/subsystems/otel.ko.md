# OTel 보고

[English](otel.md) | [中文](otel.zh.md) | 한국어

[OTel 플러그인](../../packages/telemetry/otel/README.md)은 독립적인 일반 이벤트 채널과 세션 로그 채널을 위한 공유 팩토리인 `ctx.otel`을 등록합니다. 전송과 SDK 배칭 구현을 소유합니다. 업무 소비자는 서비스를 주입하고 명시적 전송·리소스·스코프 옵션을 제공하며, 반환된 각 채널의 종료를 소유합니다.

UI 피드백은 기존 Remote API를 통해 세션 피드백 서비스에 도달합니다. 피드백 기록은 OTel 채널로 보고하기 전에 세션 어댑터의 정규 프리픽스 캡처와 리댁션을 승인합니다. 일반 제품 소비자는 제품 어댑터를 통해 선택된 필드를 제출합니다. 공유 서비스에는 자동 신원 정책도 캡처 정책도 없으며, 채널은 결코 큐나 요청을 공유하지 않습니다.

[제품 어댑터](../../packages/host/product-telemetry-otel/README.md)와 [세션 어댑터](../../packages/session/session-telemetry-otel/README.md)는 각자의 배포 구성과 디스포즈 기한을 유지합니다. 소비자는 종료 후 채널을 재사용해서는 안 됩니다. OTel 서비스만 마운트하면 제공자도 전송도 할당되지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxotel--otel"></a>

### `ctx.otel` — `OTel`

Shared transport provider. Mounting creates no queue, identity, or network connection.

```ts cordis-catalog
/**
 * Create an independent ordinary-event channel with count-based batching.
 * The injected consumer must drain it during its fiber disposal.
 * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
 * @returns the caller-owned channel; no state is shared with other channels.
 */
createEventReporter(options: EventLogOptions): EventLogReporter

/**
 * Create an independent byte-bounded Session-log channel.
 * Authorization and redaction precede reporting; the consumer owns shutdown and its outer deadline.
 * @param options - transport, scope, resource, queue, and diagnostic settings selected by the consumer.
 * @returns the caller-owned channel, preserving complete accepted events within the request byte ceiling.
 */
createSessionLogReporter(options: SessionLogOptions): SessionLogReporter
```

Source: [`packages/telemetry/otel/src/index.ts`](../../packages/telemetry/otel/src/index.ts)
<!-- END GENERATED cordis-surface -->
