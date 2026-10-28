# 쿡북: LLM 어댑터 추가

[English](adding-an-llm-adapter.md) | [中文](adding-an-llm-adapter.zh.md) | 한국어

새 모델 제공자를 연결하는 방법입니다. 참조 구현은 `packages/llm/llm-deepseek`(직접 HTTP, `eventsource-parser`로 프레임을 나눈 SSE)와 `packages/llm/llm-pi-ai`(LLM 라이브러리 래핑)입니다. 먼저 `packages/llm/llm/src/types.ts`의 `StreamChunk` 문서를 읽으세요. 두 어댑터가 함께 검증한 프로토콜 규칙이 그 문서에 기록되어 있습니다.

## 형태

```ts ignore-check
class MyAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> { … }
}

export const name = 'llm-myprovider'
export const inject = ['llm']
export const Config: z<Config> = z.object({ apiKey: z.string(), … })

export function apply(ctx: Context, config: Config) {
  ctx.llm.registerAdapter(['my-provider'], new MyAdapter(…))
}
```

등록은 효과(effect) 기반이라 HMR에 안전합니다. 제공자 라우트마다 어댑터 하나이며, 중복 등록은 예외를 던지고 다중 라우트 등록은 전부 성공하거나 전부 실패합니다. `options.provider`가 어댑터를 선택하고 `options.model`은 제공자 모델 id이므로, 동적 카탈로그 어댑터는 수명 주기를 다시 구성하지 않고도 새 모델을 서비스할 수 있습니다. 시크릿은 cordis 네이티브 방식입니다. 즉 환경 변수 대체값이 있는 schemastery Config를 쓰고 `!!js process.env.MY_KEY`를 통해 cordis.yml에서 값을 공급합니다. 코드에서 임의로 정한 키 파일을 읽지 마세요.

## 프로토콜 의무(두 구현이 함께 검증한 계약)

- `finish`보다 `usage`를 먼저 내보내고, `finish` 뒤에는 아무것도 내보내지 않습니다. 견고한 방법은 제공자의 스트림 종료 표시가 나올 때까지 finish/usage를 버퍼링한 뒤 플러시하는 것입니다(끝에 usage만 담은 청크를 보내는 제공자도 처리됩니다).
- 도구 호출 `arguments`는 끝까지 원시 JSON 문자열이며, 조각은 `argumentsDelta`로 스트리밍합니다. 제공자가 파싱된 객체를 돌려주면 `block-end`에서 다시 문자열화하세요.
- 블록 `index`는 스트림에서 처음 나타난 순서대로 할당하고, 같은 블록의 모든 델타에 그 index를 재사용합니다.
- 오류 경로는 정확히 두 가지만 허용됩니다. `stream()`에서 던지거나(전송 및 프로토콜 실패 — 안정적인 code가 있는 `LlmError`를 사용), `finish {kind: 'error' | 'aborted'}`로 스트림을 종료하는 것입니다(제공자 인밴드 실패). 소비자는 두 경로를 모두 처리하므로 실패 부류에 따라 선택하고 문서화하세요.
- `options.signal`을 준수하세요(fetch나 사용 중인 SDK로 전달).
- 제공자가 지원할 수 없는 `GenerateOptions` 필드(예: stop 시퀀스가 없는 제공자에 지정한 `stop` 목록)는 조용히 버리지 말고 `LlmError(..., 'UNSUPPORTED_OPTION')`을 던지세요.
- 제공자가 후속 호출에 응답 id, 서명 또는 기타 네이티브 메타데이터를 요구하면 최소한의 무손실 JSON 투영을 `finish.replayState`로 내보내세요. 이력을 재구성할 때 이를 검증하세요. `LlmRuntime`은 과거 제공자 라우트와 대상 제공자 라우트가 현재 정확히 같은 어댑터 인스턴스 소유일 때만 이를 전달하며, 동일 모델·교차 모델·교차 제공자 복원이 적법한지는 어댑터가 결정합니다. 상태가 없을 때 제공자/모델 이름만으로 네이티브 재생을 추론하지 마세요.

제공자별 생각/추론(thinking/reasoning) 모드 토글은 어댑터의 Config에 위치합니다. 정확한 모델 메타데이터는 하나의 제공자 중립 기능 seam을 사용합니다. 즉 제공자/모델 식별자와 선택적 `context`, `reasoning` 필드를 가진 `resolveModel()`을 구현하고, 구성된 `defaultEffort`가 있을 때만 선언하며, 리졸버의 선택적 `AbortSignal`을 준수합니다. 추론 강도는 어댑터가 제공자 요청에 매핑하는 순서가 지정된 불투명 ID입니다. 지원되는 경우 어댑터가 정의한 `off`를 포함해 신뢰할 수 있는 공식(authoritative) 선택지 목록을 유지하되, 원시 네트워크 전송(wire) 형식을 그대로 노출하거나 지원되지 않는 값으로 강제 변환(clamp)하지 마세요. ID가 와이어 표현과 일치할 필요는 없습니다.

## 구현 구조

와이어 타입, 요청 직렬화, 전송 파싱, 청크 변환, 어댑터 클래스를 서로 독립된 책임으로 유지하세요. [`llm-deepseek`](../../packages/llm/llm-deepseek/README.md)가 참조 구조입니다.

## 검증

어댑터 커버리지, 실제 제공자 검사, 게시된 엔트리 요구 사항을 소유하는 [저장소 테스트 정책](../testing.ko.md)을 따르세요.
