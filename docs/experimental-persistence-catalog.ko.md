<!-- Korean rendering of the page `pnpm run gen-persistence-catalog` generates in English.
     That generator emits English and Chinese only, so bring this file along
     when the generated English page changes. -->

# 실험적 플러그인 레코드 카탈로그

[English](experimental-persistence-catalog.md) | [中文](experimental-persistence-catalog.zh.md) | 한국어

이 현재 소스의 PluginRecordMap 선언들은 실험 패키지가 소유한 무시 가능한(ignorable) 로그 전용 레코드를 설명합니다. 페이로드 주석은 참조 타입을 펼치지 않고 소유 소스로 연결됩니다. 레코드는 알려진 이벤트 집합, 영속화 스키마 핑거프린트, 호환성 이력 밖에 남으며, 형식 마이그레이션은 이를 최선 노력 기준으로 보유합니다.

`pnpm run gen-persistence-catalog`를 실행하면 두 영속화 카탈로그, 그 언어 쌍, 관련 아티팩트가 다시 생성됩니다. `pnpm run verify-persistence-catalog`는 모든 생성 파일을 검사합니다.

공유 세션 이벤트 선언과 해석된 스키마는 [세션 영속화 이벤트 카탈로그](persistence-catalog.ko.md)에 있습니다.

| 레코드 | 소유 패키지 | 목적 | 페이로드와 소스 |
|---|---|---|---|
| `plugin:action-cards/decision` | `@deepseek-ai/dsh-action-cards` | Dismissals and kind-defined progress of action cards. | <code>ActionCardDecision</code> · [`packages/experimental/action-cards/src/types.ts`](../packages/experimental/action-cards/src/types.ts) |
| `plugin:translator/request` | `@deepseek-ai/dsh-experimental-translator` | Provider-independent translation input, retained before dispatch. | <code>TranslationRequestRecord</code> · [`packages/experimental/translator/src/types.ts`](../packages/experimental/translator/src/types.ts) |
| `plugin:translator/result` | `@deepseek-ai/dsh-experimental-translator` | Successful translation, retained before it is returned to the consumer. | <code>TranslationResultRecord</code> · [`packages/experimental/translator/src/types.ts`](../packages/experimental/translator/src/types.ts) |
