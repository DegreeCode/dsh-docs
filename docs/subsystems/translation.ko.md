# 텍스트 번역

[English](translation.md) | [中文](translation.zh.md) | 한국어

실험적인 [번역기](../../packages/experimental/translator/README.md)는 익명 브라우저 엔드포인트나 명시적으로 선택한 유료 네이티브 Flash 라우트를 통해 텍스트를 번역합니다. 표시, 스케줄링, 세션 활성화는 소비자가 소유하며, 세션에 묶인 요청은 활성 세션 기록기를 통해 재사용 가능한 결과를 보유합니다.

## 요청과 결과

`TranslationProvider`는 `bing`, `google`, `deepseek-account`, `deepseek-official` 중 하나를 선택합니다. `TranslationRequest`는 `text`, `targetLanguage`, 선택적 `sourceLanguage`, `provider`, 브랜드 `sessionId`를 제공합니다. `resolve()`는 명시적 라우팅을 `TranslationSpec`에 캡처합니다. 구성된 제공자의 기본값은 Bing이고, 생략된 원본 언어는 자동 감지를 사용합니다. 일반적인 중국어 로케일 태그는 선택된 제공자의 언어 코드로 매핑됩니다. `translate()`는 해석된 제공자의 일반 텍스트를 반환합니다.

이 서비스는 구성된 `maxTextChars`를 노출하며, UTF-16 코드 단위로 측정합니다. 소비자는 번역을 요청하기 전에 더 긴 입력을 나눕니다. 각 호출은 응답 바이트를 제한하고 응답 본문 읽기를 기한에 포함합니다. 호출자 취소와 서비스 디스포즈는 수락된 요청을 중단하며, 디스포즈는 진행 중인 요청들이 완료(settle)될 때까지 대기합니다.

## 실패와 데이터 처리

`TranslationError`는 텍스트 한도, HTTP 실패, 유효하지 않은 응답, 응답 한도, 자체 기한, 요청 실패를 구분하는 `TranslationErrorCode`를 담습니다. `TRANSLATION_SESSION_REQUIRED`는 없는 영속 백엔드나 세션을 거부하고, `TRANSLATION_SESSION_INACTIVE`는 제공자 디스패치 전에 캐시되지 않은 비활성 세션을 거부하며, `TRANSLATION_STORAGE_ERROR`는 유효하지 않은 저장 기록이나 실패한 내구성을 거부합니다. 제공자 진단은 제출된 텍스트와 응답 본문을 생략합니다. 실패한 호출은 다른 제공자를 선택하지 않습니다. 응답은 외부 JSON으로 검증되고 리다이렉트는 거부됩니다.

`TRANSLATION_UNAVAILABLE`는 디스패치 전에 활성 내장 소유자나 등록된 라우트가 없는 경우, 자격 증명이 구성되지 않은 경우, 정확한 `deepseek-flash` 카탈로그 구성원이 없는 경우, 소유자·모델 구성(Official `models` 또는 Account `modelOverrides`)이나 Official 자격 증명 참조가 바뀐 경우, 제공자가 철회된 경우, 또는 추론 노력 수준이 `off`가 아닌 준비된 호출을 거부합니다. 사유가 `error`인 네이티브 `finish`는 `TRANSLATION_REQUEST_FAILED`로, 없거나 그 밖의 `stop`이 아닌 finish는 `TRANSLATION_INVALID_RESPONSE`로 매핑됩니다.

Google은 원본 텍스트를 form POST 본문으로 받고, Bing은 JSON POST 본문으로 받습니다. 둘 다 원격 서비스입니다. 그 익명 엔드포인트는 지원되는 개발자 가용성이나 할당량 보장을 제공하지 않습니다. 지역별 연결성은 사용자의 네트워크에서 확인해야 합니다.

## 영속 번역

세션에 묶인 호출은 모든 제공자에 대해 `plugin:translator/request`와 `plugin:translator/result`를 사용합니다. 요청은 정확한 원본, 언어 태그, 선택된 제공자, 레시피 정체성을 유지하고, 성공한 결과는 자신의 요청 시퀀스를 참조합니다. 선택적 요청 메타데이터는 이 기록 타입을 바꾸지 않고 제공자별 세부 사항을 담습니다. 번역기는 외부 디스패치 전에 요청을, 반환 전에 완료된 결과를 체크포인트합니다. 읽기 전용 캐시 조회가 제공자 작업보다 앞서고 라이브 세션이 필요하지 않으며, 실패와 미완료 시도는 재사용 가능한 텍스트를 제공하지 않습니다. 새 기록은 활성 세션의 기존 기록기를 사용합니다. 번역기는 쓰기 핸들을 열지 않고 세션을 활성화하지도 않습니다. 번역 기록은 원래 이벤트와 모델 입력을 보존합니다. 세션이 없는 익명 호출은 무상태로 남고, 유료 라우트는 세션을 요구합니다. 향후 형식 마이그레이션에 걸친 실험적 기록 보유는 최선 노력입니다.

유료 캐시 미스에는 활성 내장 Account 또는 Official 소유자, 구성된 자격 증명, 정확한 `deepseek-flash` 카탈로그 구성원이 필요합니다. 이름과 버전 레이블은 무관하며 pi-ai는 제외됩니다. 각 미스는 사고(thinking)를 끈 별도의 텍스트 전용 질의를 준비합니다. 그 정확한 구성, 시스템, 고유 사용자 조각은 같은 요청 기록의 선택적 `metadata.modelRequest`를 차지합니다. 저장된 결과는 이 허용 전에 읽히므로, 자격 증명이 없어도 기존 번역이 무효가 되지 않습니다. 네이티브 요청 확장은 메인 세션 정체성을 받지 않으며 그 전체 로그를 업로드할 수 없습니다.

## 추론 표시

[선택적 번들](../../packages/experimental/cot-translation-bundle/README.md)이 번역기를 [GUI 소비자](../../packages/experimental/client-ui-cot-translation/README.md)와 조합합니다. 그 `cotTranslation` Remote는 인증된 브라우저 호출을 제공합니다. 세션이 비활성이고 저장된 결과가 없으면 호스트는 일반 세션 컨트롤러 활성화에 합류해 한 번 재시도합니다. 활성화는 일반 프리셋 훅, 재개 마커, 중단된 턴 복구를 유지하며, 취소는 공유 활성화를 취소하지 않고 호출자의 대기를 멈추고 이후 번역 호출을 막습니다. 번들 설정은 번역 서비스와 대상 언어를 선택하며, `auto`는 활성 인터페이스 언어를 따릅니다.

`CotTranslationPreferences`는 허용된 제공자와 대상 언어를 담습니다. `CotTranslationSnapshot`은 이 기본 설정을 번역기의 현재 `maxTextChars` 및 자격 있는 제공자 ID와 짝짓습니다. 브라우저는 번역 컨트롤을 등록하기 전에 이 호스트 스냅샷을 읽으며, 로컬 설정 저장소를 사용할 수 없을 때도 그렇게 합니다. 허용된 설정 갱신과 재연결은 두 값을 모두 새로 고치고, 요청 한도가 바뀌면 확장된 텍스트를 다시 취소하고 나눕니다.

GUI는 세션 범위 `conversation.chat.reasoning.body` 단일 슬롯에 등록해 Chat의 기본 항목을 대체합니다. 두 항목 모두 공식 `conversation.chat.reasoning.content` Factory를 재사용하며, 번역 래퍼는 표시 텍스트를 선택하고 자체 툴바와 뷰 상태를 소유하며 Markdown 렌더링을 중복하지 않고 지역화된 레이블을 제공합니다. 활성화된 동안 GUI는 완료된 문단과 긴 스트리밍 문단의 요청 크기 프리픽스를 확장 후에만 번역하고, 완료된 결과는 현재 세션에서 복원합니다. 그 로컬 캐시는 그 펼침만 최적화합니다. 끝나지 않은 꼬리는 원문으로 남습니다. 원문은 계속 접근할 수 있습니다. 펼침을 닫거나 제공자나 언어를 바꾸거나 언로드하면 미완료 호출을 취소하고 늦은 결과를 배제합니다. 제공자 실패는 원문을 보존하고 명시적 재시도를 요구하며, 번역된 텍스트는 원래 세션 이벤트나 모델 입력을 결코 대체하지 않습니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcottranslation--cottranslationcontroller"></a>

### `ctx.cotTranslation` — `CotTranslationController`

Optional reasoning translation delegates Session-bound storage to the translator.

```ts cordis-catalog
/**
 * Read accepted translation preferences and the current request limit without sending text.
 * @param signal - browser query cancellation or Remote contribution withdrawal.
 * @returns authoritative preferences, eligible routes, and maximum UTF-16 text length per request.
 */
@Remote async limits(signal: AbortSignal): Promise<CotTranslationSnapshot>

/**
 * Translate one displayed fragment through the reader's selected provider.
 * @param request - original text and Session identity supplied by the Client; provider and explicit
 * target language match accepted preferences, while auto uses the browser locale.
 * @param signal - browser cancellation or Remote contribution withdrawal.
 * @returns translated text; an uncached inactive Session joins ordinary GUI activation before retry.
 * Failures omit the source and provider response. Cancellation stops this caller's wait, not shared activation.
 */
@Remote async translate(request: TranslationRequest, signal: AbortSignal): Promise<string>
```

Source: [`packages/experimental/client-ui-cot-translation/src/index.ts`](../../packages/experimental/client-ui-cot-translation/src/index.ts)

<a id="ctxtranslator--translator"></a>

### `ctx.translator` — `Translator`

One Host service with explicit routing, cancellation and quiescent unload.

```ts cordis-catalog
/**
 * Inspect eligible native routes without inference; saved results remain readable for unavailable routes.
 * @param signal - optional caller cancellation, combined with service disposal.
 * @returns anonymous choices followed by eligible explicitly selected paid routes.
 */
async availableProviders(signal?: AbortSignal): Promise<readonly TranslationProvider[]>

/**
 * Resolve provider and source-language defaults without sending text.
 * @param request - consumer text, destination and optional routing choices.
 * @returns a complete specification; exceeding `maxTextChars` throws `TRANSLATION_TEXT_LIMIT`.
 */
resolve(request: TranslationRequest): TranslationSpec

/**
 * Translate one resolved specification; the selected provider receives its text.
 * @param spec - complete routing and language choices from `resolve()`.
 * @param signal - optional caller cancellation, combined with service disposal.
 * @returns translated plain text, durably retained before return when a Session is supplied.
 * An uncached supplied Session must be active; otherwise rejects with `TRANSLATION_SESSION_INACTIVE` before dispatch.
 * Rejects provider/storage/limit failures and preserves cancellation reasons.
 */
async translate(spec: TranslationSpec, signal?: AbortSignal): Promise<string>
```

Source: [`packages/experimental/translator/src/index.ts`](../../packages/experimental/translator/src/index.ts)
<!-- END GENERATED cordis-surface -->
