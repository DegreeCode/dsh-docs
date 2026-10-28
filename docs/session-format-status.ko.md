# 세션 형식 버전과 릴리스 상태

[English](session-format-status.md) | [中文](session-format-status.zh.md) | 한국어

## 요약

이 참조는 체크아웃 기록기, 승인된 호환성 기준선, 최신 게시 세션 형식을 구분하는 데 사용합니다. 코드 상수는 기록기를 소유하며, 아래의 확정 기록과 릴리스 기록은 각각 승인된 이력과 게시 증거를 식별합니다. 다른 문서는 해당 값을 다시 서술하지 않고 이 문서로 연결합니다.

## 목차

- [진실 공급원](#sources-of-truth)
- [확정 기록](#finalization-record)
- [릴리스 기록](#release-record)
- [기록 갱신](#updating-the-record)
- [개발 노트](#dev-note)

<a id="sources-of-truth"></a>
## 진실 공급원

- **체크아웃 기록기:** [core Session 타입](../packages/core/session/src/types.ts)의 `SESSION_FORMAT_VERSION`은 코드에서 유일하게 직접 유지 관리하는 현재 기록기 번호입니다. [카탈로그 생성기](../scripts/gen-session-format-catalog.ts)는 코덱 순서를 도출하고 인접 마이그레이션이 그 값에 도달하는지 검사합니다. 패키지 버전, 코덱 내보내기 이름, 픽스처 파일 이름, 프로젝션 캐시 버전은 기록기 권위가 아닙니다.
- **최신 릴리스 형식:** 아래 기록의 `latestReleasedVersion`이 게시된 세션 형식을 나타냅니다. `evidenceTag`는 태그된 기록기가 그 값을 갖는 게시 제품 릴리스를 지정하며, 그 형식을 처음 담은 릴리스일 필요는 없습니다. 이중 언어 사본은 별도 결정으로 유지되지 않고 같은 기록을 기준으로 검사됩니다.
- **릴리스 상태:** 기록기 상수를 검증된 릴리스 기록과 비교합니다. 같으면 기록기 형식이 이미 출시된 것입니다. 기록기 버전이 더 크면 아직 게시된 것으로 기록되지 않은 것이며, 확정 기록이 승인된 호환성 기준선을 독립적으로 식별합니다. 이전 체크아웃을 더 새 브랜치의 검증된 기록과 비교할 때 기록기 버전이 더 낮으면 더 오래된 기록기 형식을 뜻하며, 로컬 일관성 게이트가 한 체크아웃 안에서 그러한 순서를 거부합니다. 별도의 released 불리언은 유지하지 않습니다. 더 큰 버전을 미출시로 선언하기 전에 게시된 릴리스가 기록을 앞당기지 않았는지 확인하세요.

Alpha, beta, release-candidate 제품 게시도 출시된 세션 형식 의무를 확립합니다. GitHub의 프리릴리스 플래그가 영속 사용자 데이터를 폐기 가능하게 만들지는 않습니다. 릴리스 기록이 없다는 것은 미게시의 증거가 아닙니다. [버전 지정과 권위 결정](../.agents/notes/implemented/architecture/2026-08-10-session-log-version-mechanism.md)이 호환성 결정을 소유하고, [출시 형식 마이그레이션](../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md)이 불변 세대와 인접 변환을 소유합니다.

[형식 참조](persistence-changes/historical-formats/README.md)는 0부터 체크아웃 기록기까지의 모든 정수를 기록하며, 과거 스키마와 기존 현재 카탈로그를 함께 제공합니다.

<a id="finalization-record"></a>
## 확정 기록

```yaml session-format-finalization
latestFinalizedVersion: 4
```

V4는 [체크포인트](persistence-changes/finalized/v4.json)에 승인된 호환성 기준선을 가집니다. [판독기 호환성 규칙](persistence-changes/README.md#compatibility-rules)을 충족하고 필요한 검토가 기록되면 스키마 변경은 V4로 남을 수 있습니다. 버전 올림 결정에는 더 높은 기록기 버전과 그 자체의 헤더 전환이 필요하며, 승인된 3→4 전환을 재사용할 수 없습니다. 승인된 머신 기록과 변경 후 스키마는 불변으로 유지됩니다.

확정은 향후 모든 V4 추가 사항을 동결하지 않으며 게시를 단언하지도 않습니다. 아래 릴리스 기록은 독립적으로 검증된 게시 버전을 유지합니다. 일반 주석, 별칭, 소스 위치, 승인된 의미를 보존하는 구현 수정은 이 기준선을 바꾸지 않습니다.

[최종 V3 어휘](cookbook/adding-a-session-format-version.ko.md#final-v3-vocabulary)는 역사적 정의로 남으며 현재 V4 추가 사항과 무관합니다.

<a id="release-record"></a>
## 릴리스 기록

```yaml session-format-release
latestReleasedVersion: 4
evidenceTag: dsh-v0.2.0-rc.2
```

증거: 게시된 제품 태그 `dsh-v0.2.0-rc.2`; 태그된 기록기: `packages/core/session/src/types.ts`.

<a id="updating-the-record"></a>
## 기록 갱신

세션 형식 올림이 구현되면 코드 상수와 인접 카탈로그를 함께 갱신하고, 게시 전에 이 릴리스 기록을 앞당기지 마세요. 제품 릴리스가 더 높은 세션 형식을 처음 게시하면 게시 사실과 태그된 기록기를 확인한 뒤, 같은 이중 언어 갱신에서 이 기록과 증거 태그 및 태그된 기록기 경로를 앞당기세요. 같은 형식을 담은 이후 제품 릴리스는 기록을 바꿀 필요가 없습니다. 개발 트렁크에서는 절대 낮추지 마세요.

[문서 표준 테스트](../scripts/doc-standard.spec.ts)는 기록 구조, 이중 언어 동일성, 증거 태그와 기록기 경로의 일관성, 문서에 적힌 릴리스가 체크아웃 기록기를 넘지 않는지를 검사합니다. 이 키 없는 검사는 GitHub에 질의하지 않으며 기록이 최신임을 증명하지 않습니다. 게시 검증은 릴리스 갱신의 일부로 남습니다.

일반 동작에는 "현재 형식"과 "다음 인접 버전"을 사용합니다. 고정된 마이그레이션 입력과 출력, 와이어 스키마, 역사적 증거, 해당 특정 버전의 테스트에는 명시적 번호를 유지하세요. [형식 버전 쿡북](cookbook/adding-a-session-format-version.ko.md)은 최신 확정 또는 릴리스 형식에 N을, 그 후속에 N+1을 사용합니다.

<a id="dev-note"></a>
## 개발 노트

없습니다.
