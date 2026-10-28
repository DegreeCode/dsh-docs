# Office → PDF

[English](office-to-pdf.md) | [中文](office-to-pdf.zh.md) | 한국어

[문서 패키지 계열](../../packages/document/README.md)이 Node 호스트에서 Office 파일을 PDF로 변환합니다. 소비자는 원본 읽기 권한을 부여하고 프레젠테이션을 소유하며, 공유 제공자는 변환, 경계 있는 허용, 일시적 PDF 재사용을 소유합니다. 이 하위 시스템은 모델 대상 도구도 세션 이벤트도 만들지 않습니다.

## 소유권

| 소유자 | 책임 |
|---|---|
| [office-to-pdf](../../packages/document/office-to-pdf/README.md) | `ctx.officeToPdf`: 공유 LibreOffice 변환, 경계 있는 허용, PDF 캐싱 |
| [웹 번들](../../packages/bundle/web-app/README.md) | 호스트 소비자가 공유하는 구성 가능한 변환 제공자 하나 |
| [Office 미리 보기 클라이언트](../../packages/client/ui-sidebar-documentpreview/README.md#office-preview) | Office 확장자 선택, PDF 재사용, 누락 폰트 알림 |

## 요청과 결과

[`OfficeToPdfRequest`](../../packages/document/office-to-pdf/src/types.ts)는 이미 권한이 부여된 원본 키·버전, 선택적 stat 크기, 지연된 `read(signal, maxBytes)` 콜백, 포그라운드·백그라운드 우선순위, 그리고 `OfficeExtension`(`doc`, `docx`, `xls`, `xlsx`, `ppt`, `pptx`)을 담습니다. `OfficeToPdf.convert(request, signal?)`는 완전한 PDF 결과 하나를 반환합니다. 취소는 호출자와 제공자의 수명을 따르며, 검증·출력·엔진 실패는 분류된 `OfficeToPdfError`로 거부됩니다.

`OfficeToPdfPriority`는 요청된 미리 보기·QA에는 `foreground`, 추측 작업에는 `background`입니다. `OfficeSourceKey`는 호출자가 소유한 권한 부여 원본 로케이터를 브랜드 처리합니다. `OfficeToPdfGeneration`은 제공자 수명을, `OfficeToPdfKey`는 그 콘텐츠 정체성을 브랜드 처리하며, 어느 불투명 값도 소비자가 파싱하지 않습니다.

| 결과 필드 | 의미 |
|---|---|
| `pdf` | 완전한 PDF를 담은, 호출자 소유 `Uint8Array` |
| `missingFonts` | 이 변환에서 사용할 수 없는, 요청된 문서 폰트 패밀리 |
| `cacheKey` | 불투명한 변환기 세대에 확장자·원본 콘텐츠 정체성을 더한 값 |
| `generation` | 제공자 수명. 교체되면 캐시된 PDF 재사용이 무효가 됩니다 |

제공자는 원본 바이트를 할당하기 전에 지연된 읽기를 허용하고, 콘텐츠 정체성으로 변환을 공유하며, 반환 전에 자신의 비공개 스크래치 디렉터리를 제거합니다. 반환된 PDF 바이트는 제공자 디스포즈 후에도 유효합니다. 원본과 PDF 바이트는 세션 저장소에 들어가지 않습니다. 소비자는 권한이 부여된 경계 있는 읽기를 위해 [Workspace Files](../../packages/api/workspace-files/README.md)를 사용할 수 있습니다.

## 미리 보기 읽기

`RenderedDocumentBytes`는 워크스페이스 파일 메타데이터, 네이티브 PDF `data`, `missingFonts`, `generation`을 담고, 원본 소스 정체성이 변환된 PDF와 함께 따라갑니다.

`officeToPdf.render` Remote 메서드는 세션의 [Workspace Files](../../packages/api/workspace-files/README.md) 서비스를 통해 원본 권한과 버전을 확인합니다. 변환 허용 후 `fs.readBytes`가 예약된 바이트 용량 안에서 원시 입력을 제공하며, Office 입력 한도가 이 읽기를 규율합니다. 바이너리 Remote는 PDF를 멀티파트 첨부로 투영하고 클라이언트에서 `ArrayBuffer` 기반 `Uint8Array`를 복원합니다. 원본 접근 실패는 그대로 전달되고, 크기와 엔진 실패는 진단 없이 분류된 사유를 노출합니다. 변환은 에이전트를 활성화하거나 이벤트를 추가하지 않습니다.

`api/remotes` 조립은 변환 서비스의 생성된 Remote 디스크립터를 마운트합니다. 공유 Document Preview 패키지는 Office 형식을 완전 바이트 로딩과 기존 PDF.js Worker로 등록합니다. 각 미리 보기 읽기는 진행 중인 변환이나 캐시된 PDF를 공유하기 전에 렌더러 세대, 원본 권한, 버전을 다시 확인합니다. 연결 재설정과 플러그인 디스포즈는 요청을 취소하고 캐시된 바이트를 지웁니다. 서비스가 없으면 지역화된 구성 안내를 표시합니다.

## 엔진 선택과 한도

외부 [`@deepseek-ai/libreoffice-kit`](https://github.com/deepseek-ai/dsh-libreoffice-kit) Node API가 미리 컴파일된 엔진을 선택합니다. 이 키트는 독립적인 버전과 릴리스 워크플로를 가지며, [릴리스 소유권 결정](../../.agents/notes/implemented/architecture/2026-09-14-independent-libreoffice-kit.md)이 이를 정의합니다. 애플리케이션 빌드는 게시된 npm 패키지를 설치합니다. 애플리케이션 패키징은 대상이 선언한 네이티브 엔진을 요구하며, 키트가 그 대상에 네이티브 엔진을 선언하지 않으면 Node WASM을 요구합니다. 설치와 패키징은 [플랫폼 엔진 참조](../../packages/document/office-to-pdf/README.md)가 정의합니다. 유효하지 않은 메타데이터, 누락된 필수 자산, 변환 오류는 엔진을 바꾸지 않고 거부합니다. 변환은 호스트의 디스크 입력·출력 경로를 사용하며, 브라우저 변환 엔진도 폰트 RPC도 없습니다.

[호스트 제공자 구성](../../packages/document/office-to-pdf/README.md#use-this-package)이 동시성, 기한, 입력·출력 한도, 아카이브 한도, 이미지 해상도, 폰트 접근을 소유합니다. 네이티브·WASM 구현과 자산 배포는 키트 워크스페이스에 속합니다. 시스템 LibreOffice 탐색, 런타임 엔진 다운로드, 영속 PDF 캐싱, 모델 대상 렌더링은 이 제공자 밖입니다.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.ko.md#디스패치-모드), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxofficetopdf--officetopdf"></a>

### `ctx.officeToPdf` — `OfficeToPdf`

A provider lifetime owns all converters, queued calls, and temporary files.

```ts cordis-catalog
/**
 * Convert Office bytes without modifying the source or writing Session events.
 * @param request - authorized metadata and deferred bounded source read.
 * @param signal - caller cancellation; provider disposal also stops active work.
 * @returns caller-owned PDF bytes after conversion and scratch cleanup settle; canceled readers reject independently.
 * @throws {OfficeToPdfError} Invalid input, unusable output, or engine failure; cancellation rejects with its reason.
 */
convert(request: OfficeToPdfRequest, signal?: AbortSignal): Promise<OfficeToPdfResult>

/**
 * Read and convert one Office file using the Session's ordinary filesystem authorization.
 * @param workspaceFileScope - Session header lookup shared with workspaceFiles.
 * @param path - absolute or workspace-relative Office path.
 * @param priority - foreground preview or speculative background work.
 * @param signal - Remote cancellation; disposal also cancels outstanding reads and conversions.
 * @returns complete PDF bytes with original source identity and missing font families.
 */
@Remote async render( workspaceFileScope: WorkspaceFileScope, path: string, priority: OfficeToPdfPriority, signal: AbortSignal, ): Promise<RenderedDocumentBytes>

/**
 * Read the current rendering generation before reusing a Client PDF.
 * @param signal - Remote caller cancellation.
 * @returns provider lifetime, replaced with rendering, font, or engine configuration.
 */
@Remote('generation') getGeneration(signal: AbortSignal): OfficeToPdfGeneration
```

Source: [`packages/document/office-to-pdf/src/index.ts`](../../packages/document/office-to-pdf/src/index.ts)
<!-- END GENERATED cordis-surface -->
