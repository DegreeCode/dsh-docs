---
description: "PR을 열기 전에 세션 영속화 타입 변경을 로컬에서 생성하고, 확인하고, 검증합니다."
---

# 쿡북: 영속화 타입 변경 검토

[English](reviewing-persistence-type-changes.md) | [中文](reviewing-persistence-type-changes.zh.md) | 한국어

## 요약

의존성이 설치된 기여자 체크아웃에서 선언된 세션 영속화 타입을 바꾼 뒤 이 자습서를 사용하세요. 이중 언어 호환성 설명을 제공한 다음, 명령 하나로 변경을 분류하고 그 기록을 생성합니다. [기록 참조](../persistence-changes/README.md)가 파일과 자동 규칙을 설명합니다. 모든 비교 입력은 체크아웃 안에 있으므로 기준 브랜치나 네트워크 접근이 필요하지 않습니다.

## 목차

- [선택 사항: 변경 살펴보기](#generate)
- [1. 변경 기록](#acknowledge)
- [2. 검사, 커밋, 푸시](#verify)
- [수락되지 않은 기록 갱신](#competing-records)
- [개발 노트](#dev-note)

-----

<a id="generate"></a>
## 선택 사항: 변경 살펴보기

기록 전에 미리 보려면 저장소 루트에서 실행하세요:

```sh
pnpm --silent run verify-persistence-changes --json
```

`--silent`는 JSON을 소비할 때 사용하세요. 그러지 않으면 pnpm이 수명 주기 실패 텍스트를 stdout에 덧붙입니다. 실패한 명령도 종료 코드 1로 종료됩니다.

보고된 루트, 경로, 변경 종류, 호환성 검토 요구를 읽으세요. 참조된 타입은 여러 이벤트 다이제스트에 영향을 줄 수 있으므로 영향을 받는 모든 루트를 살펴봐야 합니다. 이력이 새 스키마를 포괄할 때까지 검증은 실패합니다. 오래된 생성 인벤토리도 검증을 실패시키며, 기록 명령이 이를 새로 고칩니다. 필드나 유니언 대안을 재정렬한 뒤 `changes`가 비어 있으면 `pnpm run gen-persistence-catalog`를 실행하고 검사를 반복하세요. 다이제스트가 바뀌지 않았으면 복사된 선언이나 소스 위치 때문에 카탈로그 diff가 생겨도 새 확인은 필요하지 않습니다.

승인 이력과 무관하게 PR을 검토하려면 기준 인벤토리와 헤드 인벤토리를 로컬 JSON 파일로 저장하고 실행하세요:

```sh
pnpm --silent run persistence-review --before .artifacts/base.schema.json --after docs/persistence-schema.json
```

기록된 결정이 이 비교에서 전환을 숨기지는 않습니다. `--check`는 현재 소스를 확인된 이력과만 비교하므로, 기록 후에는 기준/헤드 검토를 대체하거나 사람이 그 변경을 검토했음을 입증할 수 없습니다.

그 파일을 제공한 커밋을 보고서와 함께 기록하세요. 구조화 출력에는 `--json`을 추가합니다. 이 읽기 전용 비교는 공유 변경을 영향을 받는 루트와 묶고, 유니언 위치 대신 실제 리터럴 `kind`/`form` 값을 사용합니다. 모호한 대안은 별개의 추가와 제거로 남습니다. 호환성 섹션은 모든 루트의 권위 있는 분류기 결과를 복사하며, 구조 설명이 확인 검사를 대체하지는 않습니다. 현재 카탈로그 레이블과 선언 이름은 서술적 메타데이터이며, 타입을 식별하는 것은 구조 앵커와 핑거프린트입니다.

모든 인벤토리는 [노드 표 레이아웃](../persistence-changes/README.md#files-and-ownership)을 사용하며, 두 비교 입력 모두 현재 도구로 생성되어야 합니다. `formatVersion`은 정규화 규칙을 식별하며, 저장 레이아웃은 루트 핑거프린트를 바꾸거나 확인을 요구하지 않습니다.

<a id="acknowledge"></a>
## 1. 변경 기록

먼저 [수락된 기준선](../session-format-status.ko.md#확정-기록)을 확인하고 잠긴 기록을 보존하세요. [호환성 규칙](../persistence-changes/README.md#compatibility-rules) 아래에서 두 판독 방향을 모두 평가하세요. 구조 차이는 안전한 해석이나 거부의 증거가 있으면 같은 버전으로 남을 수 있으며, 자동으로 더 높은 기록 버전을 요구하지는 않습니다.

`en`과 `zh`를 담은 로컬 JSON 파일을 작성하고, 각 항목에 `summary`, `compatibility`, `verification` 문자열을 넣습니다. 다음 입력은 필수에서 선택으로 바뀐 훅 감사 필드 변경을 설명합니다. 설명과 테스트 증거는 여러분 변경에 대한 사실로 바꾸세요. CLI가 이 주장을 입증하지는 않습니다.

필요하면 무시 디렉터리를 만들고 입력을 `.artifacts/persistence-change.prose.json`으로 저장하세요:

```json
{
  "en": {
    "summary": "Makes the persisted hook audit decision optional.",
    "compatibility": "Existing records remain valid. Hook execution consumes HookOutput instead of replaying this audit field. Producers still write decisions, and absence does not imply pass.",
    "verification": "pnpm exec vitest run packages/experimental/hook-protocol/tests/events.spec.ts: 10 tests passed."
  },
  "zh": {
    "summary": "将持久化的钩子审计决策改为可选。",
    "compatibility": "已有记录仍然有效。钩子执行消费 HookOutput，不回放此审计字段。写入方仍然记录决策，缺失不代表 pass。",
    "verification": "pnpm exec vitest run packages/experimental/hook-protocol/tests/events.spec.ts：10 个测试通过。"
  }
}
```

이 예제 id 대신 날짜와 서술형 슬러그를 사용하세요:

```sh
pnpm --silent run persistence-changes --record 2026-09-11-poc-optional --prose .artifacts/persistence-change.prose.json --json
```

명령은 이력 및 짝을 이루는 설명 텍스트(prose)를 검증하고, 확립된 동일 버전 결정을 추론하며, 파일에 쓰기 전에 명시적 호환성 결정을 검사합니다. 기록 쌍, 스키마 이후 완료, 두 카탈로그, 기계 인벤토리, 페어링 기록을 생성합니다. 커밋 전에 설명과 반환된 `changes`, `roots`, `files`를 검토하세요. `--prose`를 생략하면 설명 텍스트가 완성될 때까지 검증을 통과하지 못하는 미완성 초안이 생성됩니다.

`requiresCompatibilityReview`로 표시된 변경이라면 확인 기록의 Compatibility 섹션에서 두 판독 방향을 모두 설명하고 Verification에 실행한 검사를 기록하세요. 그 증거가 버전 유지를 뒷받침하면 `--decision same-version`을 제공하세요. 헤더 버전이 바뀌지 않았고 명시적 결정도 없는 채로 플래그된 변경을 기록하거나 갱신하면 `decision-required`로 실패합니다. 구조 차이만으로는 버전 인상이 추론되지 않습니다. 실제 헤더 버전 증가는 `version-bump`를 추론할 수 있습니다. 유효한 판별자가 안전하지 않은 해석을 막을 수 없다면 [세션 형식 버전 추가](adding-a-session-format-version.ko.md)를 따르고 `--decision version-bump`를 선택하세요. 그 기록에는 고유하게 증가하는 `SessionHeader.version` 전환이 포함되어야 하며, 무관한 역사적 인상이 이를 승인할 수 없습니다. 일상적 변경은 또 다른 기준선을 만들지 않습니다.

<a id="verify"></a>
## 2. 검사, 커밋, 푸시

변경된 소유자의 동작 검사는 [테스트 정책](../testing.ko.md)으로 선택한 뒤 문서 검사를 실행하세요:

```sh
pnpm run doc-sync
```

`doc-sync`는 영속화 인벤토리와 카탈로그 최신성, 전체 이력, 이중 언어 페어링을 검사합니다. 기록 명령의 `ok: true`는 이 검사나 소유자의 동작·마이그레이션 테스트를 대체하지 않습니다. JSON 실패는 `ok: false`, 진단용 `code`, 종료 코드 1을 유지합니다. 구조화된 변경은 안정적인 종류와 루트별 before/after 다이제스트를 포함하므로 자동화가 설명을 파싱할 필요가 없습니다.

기록 생성은 자신의 카탈로그와 기록 쌍을 소유하며, 패키지 README나 다른 이중 언어 페이지 편집은 평소 페어링 워크플로를 따릅니다. 의도한 diff를 검토하고 스테이징한 뒤 정상적으로 커밋하고 푸시하세요. 스테이징 lint, 페어링, 공백 훅과 푸시 전 호스트/클라이언트 타입 검사는 여전히 적용됩니다.

<a id="competing-records"></a>
## 수락되지 않은 기록 갱신

기록 후 소스가 바뀌면 호환성 설명을 검토하고 같은 미수락 최종 기록을 새로 고칩니다:

```sh
pnpm --silent run persistence-changes --update 2026-09-11-poc-optional --prose .artifacts/persistence-change.prose.json --json
```

명령은 기계 선언, 스키마, 카탈로그, 페어링을 새로 고칩니다. `--prose`가 없으면 기존 설명을 유지합니다. 그 설명을 전체 전환에 비추어 다시 평가하고, 플래그된 동일 버전 갱신에는 `--decision same-version`을 제공하세요. 갱신은 최초 기준선, 다른 기록이 의존하는 기록, 확정 체크포인트 기록을 거부합니다. 확정 체크포인트 밖에서 트리는 리뷰 수락을 추론하지 않으므로, 수락된 이력을 보존하고 후속 기록을 만드세요.

통합이 경쟁하는 최종 기록을 만들면, 남은 이력에 대해 미수락 기록을 갱신한 뒤 결과 diff를 다시 평가하세요. 무관한 루트의 확인은 새로 고칠 필요가 없습니다. [메커니즘 결정](../../.agents/notes/implemented/process/2026-09-11-persistence-type-history.md)이 완전한 스냅샷과 루트별 선행 기록을 유지하는 이유를 설명합니다.

검토가 필요한 기존 속성 값 타입 변경이라면, 먼저 설명 파일(.prose.json)의 Compatibility와 Verification 섹션을 수정하여 실제 새로운 전환 내용과 수행한 검증 테스트를 설명하세요. 다른 변경 사항에 이전의 필수→선택 변경 설명을 그대로 재사용하지 마세요. 그런 다음 해당 설명 파일과 명시적 동일 버전 선택 옵션으로 기록을 갱신합니다:

```sh
pnpm --silent run persistence-changes --update 2026-09-11-poc-optional --decision same-version --prose .artifacts/persistence-change.prose.json --json
```

<a id="dev-note"></a>
## 개발 노트

<details>
<summary>유지 관리자를 위한 작업 맥락 — 펼치려면 클릭하세요</summary>

없음.

</details>
