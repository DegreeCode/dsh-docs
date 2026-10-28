# 영속 첨부

[English](attachment.md) | [中文](attachment.zh.md) | 한국어

첨부 seam은 바이너리 이미지와 일반 파일의 소유권을 세션 로그에서 분리합니다. 생산자가 [`ctx.attachments`](#ctxattachments--attachmentstore-abstract-seam)에 바이트를 넘기고, 서비스는 객체가 영속된 뒤에만 불변 콘텐츠 주소 지정 참조를 게시합니다. 세션 이벤트와 모델이 보는 첨부 블록은 그 참조와 메타데이터를 담고, 브라우저 객체 URL, 호스트 임시 경로, 제공자 URL, base64 페이로드는 절대 담지 않습니다. 독립적인 [`ctx.fileUploads`](#ctxfileuploads--fileuploads) 서비스는 브라우저 파일 전송과 스테이징된 영수증을 수신 Agent에 묶습니다.

보내지 않은 브라우저 초안은 메모리에 남을 수 있고 네이티브 클라이언트는 운영체제 임시 저장소에 스테이징할 수 있습니다. 브라우저의 일반 파일은 스테이징된 프롬프트 영수증을 받기 전에 영속됩니다. 호스트가 사용자 메시지를 수용하면 그 이미지는 사용자 이벤트가 추가되기 전에 `<DSH_HOME>/attachments/v1` 아래로 이동합니다. 구조화된 모델 이미지 출력도 같은 이벤트 이전 영속 규칙을 따릅니다.

출처: [`packages/attachment/attachment/src/types.ts`](../../packages/attachment/attachment/src/types.ts)

## 정체성과 검증된 메타데이터

`AttachmentId`는 브랜드가 붙은 불투명 문자열입니다. 로컬 백엔드는 현재 `sha256:<digest>`를 내보내지만, 소비자는 그 표현을 파싱하거나 그것에서 파일시스템 경로를 도출하면 안 됩니다. 소비자는 첨부 제공자에게 `imageHostPath()`로 객체 위치를 물을 수 있고, 그다음 모델 도구가 그 호스트 경로를 읽을 수 있는지 현재 실행 파일시스템으로 판단해야 합니다.

```ts type-equiv
/** Raster image formats accepted by the version-one attachment path. */
type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
```

```ts type-equiv
/** Durable, serializable reference to one immutable normalized image. */
interface ImageAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: AttachmentId
  /** Media type verified from the stored bytes. */
  mediaType: ImageMediaType
  /** Exact encoded byte length. */
  bytes: number
  /** Intrinsic encoded width in pixels. */
  width: number
  /** Intrinsic encoded height in pixels. */
  height: number
  /** Optional display name stripped of local path information. */
  name?: string
  /**
   * Input dimensions after applying EXIF orientation and before normalization
   * scaling. Present only when normalization reduced the image.
   */
  originalDimensions?: {
    width: number
    height: number
  }
}
```

```ts type-equiv
/** Deployment-resolved limits used by upload admission and request buffering. */
interface ImageAttachmentLimits {
  maxImageBytes: number
  maxImagesPerMessage: number
  maxMessageImageBytes: number
  maxImagePixels: number
  /** Maximum intrinsic width and maximum intrinsic height in pixels for one image. */
  maxImageDimension: number
  mediaTypes: readonly ImageMediaType[]
}
```

로컬 백엔드는 메시지당 최대 이미지 20개와 인코딩된 소스 데이터 200 MiB를 허용합니다. 소스 하나는 최대 50 MiB, 64,000,000 픽셀, 한 변 65,535 픽셀을 쓸 수 있습니다. 이 소스 한도는 독립적인 정규화 단계보다 앞서며, 그 단계는 기본으로 긴 변을 2048픽셀로, 인코딩 데이터를 4 MiB로 제한합니다.

참조는 고유 크기와 인코딩 길이를 기록하므로 클라이언트가 먼저 디코딩하지 않고 이력을 배치할 수 있습니다. 반면 모든 권위 있는 읽기는 여전히 다이제스트, 미디어 시그니처, 크기, 메타데이터를 객체와 다시 대조합니다.

## 커밋과 검증된 읽기 페이로드

```ts type-equiv
/**
 * Browser-submitted prompt content accepted by Host prompt endpoints; the
 * accepting Host promotes image parts to durable references through
 * `ctx.attachments.admitPromptContent()` before any message is created, so a wire caller can
 * never cite an attachment it did not upload.
 */
type PromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | {
    readonly type: 'image'
    readonly mediaType: ImageMediaType
    readonly data: string
    readonly name?: string
  }
```

```ts type-equiv
/**
 * Host prompt content whose upload receipts are resolved. An image part
 * carries encoded bytes awaiting admission, or references an image this
 * service already stored for an upload the same Session staged, with
 * `encodedBytes` holding the byte length of that upload.
 */
type AttachmentAdmissionPart =
  | PromptContentPart
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
  | { readonly type: 'image'; readonly attachment: ImageAttachmentRef; readonly encodedBytes: number }
```

```ts type-equiv
/** Host-admitted prompt content with every attachment represented by its durable reference. */
type AdmittedPromptContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly attachment: ImageAttachmentRef }
  | { readonly type: 'file'; readonly attachment: FileAttachmentRef }
```

```ts type-equiv
/** Base64-encoded image upload accompanying one wire request. */
interface EncodedImageAttachment {
  /** Declared media type, verified against the decoded bytes during admission. */
  mediaType: ImageMediaType
  /** Canonical base64 encoding of the image bytes. */
  data: string
  /** Optional display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Request to validate and durably commit one image. */
interface SaveImageAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against fully decoded bytes. */
  mediaType: ImageMediaType
  /** Optional browser/provider display name; it is never interpreted as a path. */
  name?: string
}
```

```ts type-equiv
/** Stored image bytes returned after reference and digest verification. */
interface StoredImageAttachment {
  ref: ImageAttachmentRef
  data: Uint8Array
}
```

```ts type-equiv
/** Deterministic request-image target selected by one exact model route for one attachment. */
interface ImageRequestTarget {
  /** Target width in pixels; a target above the source keeps the source width. */
  width: number
  /** Target height in pixels; a target above the source keeps the source height. */
  height: number
  /** Encoded-byte target before base64 expansion or Files API upload; the smallest quality-ladder output is kept when no quality fits. */
  maxBytes: number
}
```

```ts type-equiv
/** Integer width and height of one projected image. */
interface ProjectedDimensions {
  width: number
  height: number
}
```

```ts type-equiv
/** Cached request version derived from one provider-independent normalized attachment. */
interface RequestImageAttachment {
  /** Cache and upload-index key over the attachment id, policy, and fixed encoder parameters. */
  variantId: ImageVariantId
  /** Durable normalized attachment from which this request version was derived. */
  attachment: ImageAttachmentRef
  /** Encoded request bytes. */
  data: Uint8Array
  mediaType: ImageMediaType
  bytes: number
  width: number
  height: number
  /** Provider-compatible sample depth proven after request encoding. */
  depth: 'uchar'
  /** Provider-compatible color space proven after request encoding. */
  space: 'srgb'
  /** Whether the encoded request version retains an alpha channel. */
  hasAlpha: boolean
}
```

`saveImage()`는 제공자 독립적인 정규화 첨부를 준비하고 원자적으로 커밋한 뒤 `ImageAttachmentRef`를 반환합니다. `saveImages()`는 배치를 게시하기 전에 검증된 모든 첨부를 한 번씩 준비하므로, 검증 거부가 부분 객체를 남기지 않고 게시가 디코딩이나 품질 선택을 반복하지 않습니다. `admitPromptContent()`는 업로드 영수증 해석 후 완전한 순서 있는 Host 프롬프트를 받아, base64 이미지 업로드를 영속 참조로 바꾸고, 영속 파일 참조와 이미 저장된 이미지는 그대로 통과시키며, 모든 이미지를 메시지당 이미지 수와 총 바이트 한도에 계산합니다(저장된 이미지는 그 업로드의 바이트로 계산). `admitEncodedImages()`는 다른 와이어 항목을 지원하고 개수, 총 바이트, 순서 있는 배치 허용을 `saveImages()`에 위임합니다. `admitEncodedFile()`은 인코딩된 프로토콜 어댑터에 같은 서비스 소유 정규 base64 허용을 제공하며, `isAttachmentError()`는 그런 어댑터가 구현 헬퍼를 가져오지 않고도 안정적인 첨부 실패를 인식하게 합니다. `readImage()`는 허용된 세션 경로에서 정규화된 첨부를 검증합니다. `imageHostPath()`는 제공자 소유 호스트 객체 위치만 노출하며, 현재 도구 실행 세계가 이를 읽을 수 있는지는 결정하지 않습니다. `readImageRequest()`는 라우트가 고른 정확한 대상 크기와 인코딩 바이트 대상에서 결정적인 요청 버전 하나를 도출하고 캐시합니다. 그 버전은 인코딩된 바이트와 메타데이터를 담지만 실행 세계 경로는 담지 않습니다. 새 항목은 게시 전에 완전히 디코딩되고, 캐시 적중은 경계가 있는 메타데이터 프로브를 씁니다. 호출자는 순서 있는 배치가 필요할 때 단수 메서드에 `Promise.all`을 사용합니다. 로컬 구현은 선호 후보를 지연 인코딩하고, 같은 요청 정체성을 단일 실행으로 합치며, 각 대기자가 독립적으로 취소하게 하고, 대기자가 남지 않으면 공유 작업을 멈추며, 모든 변환을 인스턴스 수준 리미터로 제한합니다(기본값은 동시 변환 두 개). 서비스는 보존 중립적입니다. 재개되고 fork된 세션은 객체를 공유할 수 있으므로 참조 인지 가비지 수집은 한 세션의 삭제에 묶이지 않고 미뤄집니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxattachments--attachmentstore-abstract-seam"></a>

### `ctx.attachments` — `AttachmentStore` (abstract seam)

Immutable binary attachment service. Implementations validate bytes before publishing a reference.

```ts cordis-catalog
/**
 * Validate one image without persisting it.
 * Batch callers validate every member before saving any member.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns completion after the encoded raster has been fully decoded.
 */
abstract validateImage(input: SaveImageAttachment): Promise<void>

/**
 * Validate and durably commit one ordered image batch.
 * @param inputs - encoded images in owning-message order.
 * @returns durable normalized attachment references in the same order after every member succeeds.
 */
async saveImages(inputs: readonly SaveImageAttachment[]): Promise<readonly ImageAttachmentRef[]>

/**
 * Admit one Host prompt and replace each encoded image with its durable reference.
 * Text, durable file references, and already stored images pass through unchanged.
 * Every image part counts toward `maxImagesPerMessage` and `maxMessageImageBytes`;
 * a stored image counts the bytes of the upload that stored it. Refused content
 * starts no writes. A prompt without encoded images performs no storage operation.
 * @param content - prompt parts in message order after upload receipt resolution.
 * @returns admitted prompt parts in the same order as `content`.
 * @throws AttachmentError when the image batch is refused.
 */
async admitPromptContent( content: readonly AttachmentAdmissionPart[], ): Promise<AdmittedPromptContentPart[]>

/**
 * Decode and durably commit one canonical base64 file upload.
 * @param input - canonical base64 bytes and optional display name.
 * @returns the durable content-addressed file reference.
 * @throws AttachmentError when the encoding or storage operation is refused.
 */
admitEncodedFile(input: EncodedFileAttachment): Promise<FileAttachmentRef>

/**
 * Identify a failure emitted by this attachment capability by its stable code.
 * @param error - value caught from an attachment operation.
 * @returns whether the value is an attachment failure.
 */
isAttachmentError(error: unknown): error is AttachmentError

/**
 * Validate and durably commit one image before its owning session event is appended.
 * The returned reference describes the persisted normalized image. When
 * normalization reduces the raster, its `originalDimensions` records the
 * orientation-applied input dimensions.
 * @param input - encoded bytes, declared media type, and optional display name.
 * @returns the durable content-addressed normalized image reference.
 */
abstract saveImage(input: SaveImageAttachment): Promise<ImageAttachmentRef>

/**
 * Read one image and verify that bytes still match the recorded reference.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend read and verification work.
 * @returns the verified bytes and normalized attachment reference.
 * @throws the signal reason when aborted, or a storage error when verification fails.
 */
abstract readImage(ref: ImageAttachmentRef, signal?: AbortSignal): Promise<StoredImageAttachment>

/**
 * Locate the provider-owned normalized object in the harness host filesystem.
 * @param ref - durable normalized attachment reference.
 * @returns an absolute host path, or undefined when this backend is not host-file-backed.
 * @throws an AttachmentError when the durable reference is invalid.
 */
imageHostPath(ref: ImageAttachmentRef): string | undefined

/**
 * Durably commit one file byte-for-byte before its owning session event is
 * appended. Files carry no admission limits: any byte content and length is
 * accepted, and the stored object is the exact submitted bytes. Backends
 * without verbatim file storage keep this default rejection.
 * @param input - exact bytes and optional display name.
 * @returns the durable content-addressed file reference.
 */
saveFile(input: SaveFileAttachment): Promise<FileAttachmentRef>

/**
 * Durably commit one file byte-for-byte from bounded chunks. Providers must
 * apply backpressure and must not collect the complete file in memory.
 * Backends without streamed verbatim storage keep this default rejection.
 * @param input - ordered exact bytes, optional cancellation, and display name.
 * @returns the durable content-addressed file reference.
 */
saveFileStream(input: SaveFileStreamAttachment): Promise<FileAttachmentRef>

/**
 * Read and verify one verbatim stored file as bounded chunks. Providers must
 * not collect the complete file in memory. Backends without verbatim file
 * reads keep this default rejection.
 * @param ref - durable reference from the session log.
 * @param signal - optional cancellation for backend reads and verification work.
 * @returns exact file bytes in order; integrity failures reject the iteration.
 */
async *readFileStream( ref: FileAttachmentRef, signal?: AbortSignal, ): AsyncIterable<Uint8Array>

/**
 * Locate the verbatim stored file object in the harness host filesystem.
 * @param ref - durable file reference.
 * @returns an absolute host path, or undefined when this backend is not host-file-backed.
 * @throws an AttachmentError when the durable reference is invalid.
 */
fileHostPath(ref: FileAttachmentRef): string | undefined

/**
 * Generate or read one deterministic model-request version from the stored normalized image.
 * @param ref - durable provider-independent normalized attachment reference.
 * @param target - route-chosen dimensions and byte target; an unmet byte target yields the smallest ladder output.
 * @param signal - optional cancellation.
 * @returns request bytes and the cache/upload identity covering every transform input.
 */
readImageRequest( ref: ImageAttachmentRef, target: ImageRequestTarget, signal?: AbortSignal, ): Promise<RequestImageAttachment>
```

Source: [`packages/attachment/attachment/src/index.ts`](../../packages/attachment/attachment/src/index.ts)

<a id="ctxfileuploads--fileuploads"></a>

### `ctx.fileUploads` — `FileUploads`

Host service owning upload storage and receipts keyed by each receiving Agent's exact Session.

```ts cordis-catalog
/**
 * Register the ordinary-Session resolver used when a raw upload addresses a cold Session.
 * @param resolve - resolver that returns the exact live Agent or throws a Remote error.
 * @returns disposer removing this resolver.
 */
registerAgentResolver(resolve: AgentResolver): () => void

/**
 * Persist one encoded upload and stage it under the Agent receiver selected by Typert.
 * @param agent - receiving Agent resolved from the Remote Agent scope.
 * @param request - canonical base64 bytes and optional display name.
 * @param signal - caller cancellation before storage begins.
 * @returns the staged receipt and durable file reference.
 */
@Remote('upload') async upload(agent: Agent, request: EncodedFileUploadRequest, signal: AbortSignal): Promise<FileUploadValue>

/**
 * Persist raw chunks for one Session without aggregating the upload.
 * @param request - Session identity, ordered bytes, cancellation, and optional display name.
 * @returns the staged receipt and durable file reference.
 */
async uploadStream(request: { readonly sessionId: SessionId readonly data: AsyncIterable<Uint8Array> readonly signal?: AbortSignal readonly name?: string }): Promise<FileUploadValue>

/**
 * Persist one prompt image for a Session: read at most the smaller of the
 * deployment's per-image and per-message byte limits, then validate,
 * normalize, and store the image the way prompt admission does, so a later
 * prompt cites it by receipt.
 * Cancellation before storage begins stores nothing; a cancelled upload
 * never receives a receipt, although an image whose storage already began
 * stays in the content-addressed store.
 * @param request - Session identity, ordered bytes, the declared media type that this deployment
 * must accept, cancellation, and optional display name.
 * @returns the staged receipt and durable normalized image reference.
 */
async uploadImageStream(request: { readonly sessionId: SessionId readonly data: AsyncIterable<Uint8Array> readonly mediaType: string readonly signal?: AbortSignal readonly name?: string }): Promise<ImageUploadValue>

/**
 * Resolve one staged receipt for the receiving Agent's exact Session.
 * @param agent - receiving Agent.
 * @param receiptId - opaque receipt minted for one completed upload.
 * @returns the staged file or image, or `undefined` for an unknown or foreign receipt.
 */
resolve(agent: Agent, receiptId: FileUploadReceiptId): StagedAttachment | undefined

/**
 * Bind receipts while one prompt enters an Agent inbox.
 * Disposal restores every prior binding unless the caller commits successful delivery.
 * @param agent - receiving Agent.
 * @param receiptIds - distinct staged receipts referenced by the prompt.
 * @param requestId - prompt identity later observed in queue or history.
 * @returns binding kept after commit until queue or history observation retires its receipts.
 */
bindPrompt( agent: Agent, receiptIds: readonly FileUploadReceiptId[], requestId: string, ): PromptFileBinding

/**
 * Retire every receipt accepted by one removed queue occurrence.
 * @param agent - receiving Agent.
 * @param requestId - prompt identity carried by the queue occurrence.
 */
retirePrompt(agent: Agent, requestId: string): void
```

Types: [Agent](core.ko.md) · [SessionId](core.ko.md)

Source: [`packages/client/file-upload/src/index.ts`](../../packages/client/file-upload/src/index.ts)
<!-- END GENERATED cordis-surface -->
