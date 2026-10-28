# Web UI 스타일 참조

[English](web-styling.md) | [中文](web-styling.zh.md) | 한국어

이 참조 문서는 브라우저 클라이언트 패키지의 스타일 소유권과 컴포넌트 규칙을 정의합니다. 현재 토큰 값은 [`packages/client/ui-theme/src/styles/`](../packages/client/ui-theme/src/styles/)에 있으며, 이 문서는 소스에서 생성되는 그 목록을 중복 기재하지 않습니다.

## 소유권

[`ui-theme`](../packages/client/ui-theme/README.md)은 `--dsw-*` 정적 스케일, 시맨틱 별칭, 타이포그래피, 모션, 그라디언트, 그림자, 스크롤바 스타일, 라이트/다크 선호를 소유합니다. [`ui-layout`](../packages/client/ui-layout/README.md)은 해석된 테마 스냅샷을 문서에 적용합니다. 기능 패키지는 시맨틱 별칭을 사용하며 별도의 전역 테마를 정의하지 않습니다.

전역 스타일시트는 `ui-theme/src/styles/`에 속합니다. 컴포넌트 스타일은 CSS Modules로 컴포넌트 옆에 둡니다. 어떤 값이 해당 컴포넌트의 레이아웃이나 표현 계약의 일부일 때 컴포넌트는 로컬 사용자 지정 속성을 정의할 수 있지만, 공유 색상, 타이포그래피, 엘리베이션, 모션은 테마 패키지에 속합니다.

<a id="component-rules"></a>
## 컴포넌트 규칙

- 컨트롤의 스타일을 다시 짜기 전에 재사용하세요. [ui-primitives 컴포넌트 카탈로그](../packages/client/ui-primitives/README.md#component-catalog)는 기능 패키지를 가로지르는 유일한 통로이며, 의도적인 시각 차이는 두 번째 사본이 아니라 그곳의 prop에 두어야 합니다([참조](../packages/client/ui-primitives/README.md)).
- CSS Modules와 `clsx`를 사용하고, 컴포넌트 라이브러리나 Tailwind를 추가하지 마세요.
- 기능 컴포넌트에서는 `--dsw-alias-*` 시맨틱 토큰을 사용하세요. 정적 팔레트 값을 복사하거나 색상 리터럴을 쓰지 마세요.
- 기능 컴포넌트 CSS에 테마 선택자를 넣지 마세요. 라이트/다크 재정의는 테마 소유자에게 속합니다.
- 글꼴 크기는 줄 높이와 짝을 이루게 하고, 기존 역할이 맞으면 테마 타이포그래피 변수를 사용하세요.
- 컴포넌트 계약이 열 보존을 요구하면 소스 텍스트, 터미널 출력, diff 줄을 줄바꿈하지 마세요. 컴포넌트별 스크롤바 선택자 대신 공유 스크롤바 스타일을 사용하세요.
- 표현은 CSS에 두세요. React 인라인 스타일은 컴포넌트 로컬 사용자 지정 속성 값을 전달할 수 있지만 테마 분기를 인코딩해서는 안 됩니다.
- 플러그인 스타일시트의 상대 `url()`은 패키지의 `src/client/assets/`에 있는 파일을 가리키며, 빌드가 이를 [패키지 자산](../packages/client/AGENTS.md#dependency-declaration) URL로 다시 씁니다. `data:`, `#fragment`, `/`로 시작하는 참조, scheme 참조, 빈 `url('')` 참조는 그대로 남고, fragment나 query가 붙은 상대 파일 참조는 빌드를 실패시키며, 의존성의 스타일시트는 다시 쓰지 않습니다.
- `:hover` 선택자는 뷰포트 너비와 무관하게 `@media (hover: hover)` 아래에 두세요. 선택, 확장, 눌림, 키보드 포커스 스타일은 그 조건 밖에 둡니다. hover가 없을 때 동작은 계속 보이거나 명시적 컨트롤로 접근할 수 있어야 하며, hover 전용 미리보기를 여는 포인터 핸들러는 터치를 무시합니다. 키보드 포커스 가시성과 모션 감소 동작을 보존하세요.
- 둥근 모서리는 지원 엔진에서 ui-theme의 `corner-shape.css`가 제공하는 전역 슈퍼타원 평활화를 상속합니다. 완전한 원형 `border-radius`(`50%`, `100%` 또는 알약 반경)마다 `corner-shape: round`를 짝지어 원과 캡슐이 원호를 유지하게 하세요. ui-theme의 corner-shape spec이 이 짝을 강제합니다.
- 엘리베이션 표면(메뉴, 팝오버, 모달, 패널, 플로팅 버튼, 입력창)은 `border: 0`을 설정하고 `box-shadow: var(--dsw-elevation-panel)`, `var(--dsw-elevation-prominent)`, 또는 입력창의 `var(--dsw-elevation-soft)`(더 큰 흐림, 더 낮은 알파)를 사용합니다. 0.5px 헤어라인 획이 첫 번째 그림자 층이며, `--dsw-elevation-stroke-color`가 표면이나 상태별로 이를 다시 묶거나 억제합니다. `--dsw-alias-border-*` 테두리를 lv/엘리베이션 그림자와 짝짓지 마세요. ui-theme 엘리베이션 spec이 그 짝을 거부합니다. 상태 색 테두리(warn 패널)는 실제 테두리로 남습니다.
- 기존 및 새 드롭다운, 컨텍스트, 하위 메뉴, 선택 메뉴는 `Menu`를 사용하거나 사용자 지정 내용을 `MenuSurface`로 감싸세요. 재질은 테마가 소유한 `--dsw-menu-surface-fill`과 `--dsw-menu-backdrop-filter`이며, 기능 및 플랫폼 CSS는 둘 다 재정의해서는 안 됩니다. ui-theme 메뉴 spec은 감싸지 않은 menu/listbox 렌더러, 재질 재정의, 토큰 재정의를 거부합니다. 예약이 소유한 `TaskMenu`와 `ClockPicker`는 명시적 예외로 기존 컨테이너와 재질을 유지합니다([소유자](../packages/client/ui-schedule/README.md)).
- 설정 및 확인 대화 상자를 포함한 모달 배경은 흐림 없이 반투명한 어두운 마스크를 유지합니다. 테마는 `--dsw-mask-blur`를 `none`으로 설정하며, 데스크톱이 소유한 모달 오버레이도 부모 페이지를 필터링하지 않습니다.
- 메뉴 배경 필터링은 격리된 레이어에 남겨, 중첩 메뉴와 고정 오버레이가 위치와 배경을 유지하게 합니다. macOS에서 `MenuSurface`는 각 메뉴 범위 안에서만 페이지 내용 뒤에 불투명 받침을 추가해 Chromium이 네이티브 비브런시 위의 내용을 흐리게 할 수 있게 합니다. CSS 앵커는 배치와 크기를 따르고, 언마운트하면 받침이 제거됩니다. 이 받침이 없는 오버레이는 `--dsw-specific-menu`를 사용하며, 테마가 소유한 macOS 채움은 불투명도 94%여서 아래 텍스트가 비쳐 보이지 않습니다. 그 채움을 쓰는 다른 엘리베이션 표면은 고정 오버레이를 담을 때 자체 격리 배경에 같은 필터를 짝지어야 합니다.
- 중립 `--dsw-alias-border-*` 토큰을 쓰는 평면 테두리와 구분선은 `0.5px`로 그립니다. 버튼, 입력, 카드, 행 구분선, 채워진 박스로 그리는 구분선(메뉴 구분선, 대화 헤더 seam, markdown `hr`, 세로 레일)이 같은 헤어라인 두께를 공유하며, Chromium은 이를 장치 픽셀 하나로 그립니다. 점선 표시와 상태 색 테두리는 1px을 유지하고, 스피너 링 트랙은 spec의 명시적 허용 목록을 통해 너비를 유지합니다. ui-theme 엘리베이션 spec은 더 넓은 중립 실선 테두리를 거부합니다.
- 클릭 가능한 아티팩트 링크(markdown 앵커, 본문 파일 언급, 웹 소스 및 fetch 링크, 산출 파일 칩, 워크플로 구성원 링크)는 `--dsw-alias-link`로 `font-weight: 500` 색을 쓰고, 기본 상태에는 밑줄이 없으며 hover/focus에는 3px 오프셋 점선 밑줄이 있습니다. 컴팩트 Thinking Markdown은 3차 텍스트 색과 기본 점선 밑줄을 유지합니다([컴팩트 표현](../packages/client/ui-primitives/README.md#rendering-agent-output)). 텍스트가 앞서는 앵커는 `currentColor`를 따르는 ui-primitives `LinkIconMedium` 분류 글리프를 함께 쓰며, 잘 알려진 외부 호스트의 경우 지구본 대신 그 사이트의 자체 표식을 씁니다. 워크플로 구성원 링크와 이미지만 담은 앵커는 글리프가 없고, 도구 행 파일 링크는 회색 점선 표시를 유지합니다.

<a id="input-capabilities"></a>
## 입력 기능

`pointer`와 `hover`는 브라우저가 선택한 기본 포인팅 장치를 나타내고, `any-hover`는 사용 가능한 모든 포인팅 장치를 고려합니다. 물리적 키보드를 감지하는 것은 없습니다.

- 포인팅 정확도에 의존하는 표현(예: 터치 크기 컨트롤과 텍스트 필드)에는 `(pointer: coarse)`를 사용하세요.
- CSS hover 효과는 `(hover: hover)` 아래에 두어 터치 우선 레이아웃이 hover 없이도 사용 가능하게 하세요.
- JavaScript hover 미리보기는 마우스 진입을 받을 때 `(any-hover: hover)`를 사용하고 터치 진입은 무시합니다. 따라서 터치스크린이 여전히 기본 포인터여도 보조 마우스가 미리보기를 열 수 있습니다. `any-hover`로 모든 CSS hover 스타일을 켜면 터치가 만든 `:hover` 상태에도 그 스타일이 적용됩니다.

혼합 입력 장치에서는 기본 포인터 기반 CSS hover 스타일이 비활성인 채로 마우스 미리보기가 나타날 수 있습니다. 키보드 포커스와 단축키 힌트는 이 기능 질의와 무관하게 실제 키보드 상호 작용을 따릅니다. 공유 동작은 [Menu와 입력 모달리티](../packages/client/ui-primitives/README.md#input-modality)가 정의합니다.

<a id="corner-radii-and-settings-cards"></a>
## 모서리 반경과 설정 카드

[DSH 통합 모서리 반경 표준](ui-radius.ko.md)이 반경 스케일, 컴포넌트 크기 매핑, 원과 캡슐 예외, 중첩 hover 형상, 설정 카드의 채움과 획을 정의합니다.

## 시스템 변경

공유 토큰은 소유한 `ui-theme` 시트에서 추가하거나 변경한 뒤, 기능 패키지에서 그 시맨틱 별칭을 사용하세요. 공개 스타일 계약이 바뀌면 소유 패키지 참조 문서를 갱신하세요. 시각 동작은 [테스트 정책](testing.ko.md)을 따르며, [보관된 스타일 시스템 Agent Note](../.agents/notes/archived/process/2026-07-19-web-styling-system.md)이 프레임워크 근거를 기록합니다.
