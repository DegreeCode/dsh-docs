# GitHub 웹훅으로 리뷰 세션 만들기

[English](github-review.md) | [中文](github-review.zh.md) | 한국어

이 옵션 오버레이는 `dsh web`에 서명된 GitHub 엔드포인트를 추가합니다. 구성한 저장소의 풀 리퀘스트가 초안에서 리뷰 준비 완료로 바뀌면, 규칙이 해당 저장소의 웹 워크스페이스 아래에 제목이 있는 루트 세션을 만들고 읽기 전용 리뷰 프롬프트를 시작합니다.

## 사전 준비

- DSH가 웹 워크스페이스로 등록할 수 있는 로컬 체크아웃.
- `DSH_GITHUB_WEBHOOK_SECRET` 자격 증명 참조로 사용할 수 있는, 엔트로피가 높은 GitHub 웹훅 시크릿.
- 공개 URL 하나를 루프백 리스너로 전달할 수 있는 TLS 리버스 프록시 또는 터널.
- Pull requests 이벤트를 구독하고 content type이 `application/json`인 GitHub 웹훅.

오버레이는 워크스페이스를 실행 디렉터리로, 리스너를 `127.0.0.1:3081`로 기본 설정합니다. `DSH_GITHUB_REVIEW_WORKSPACE`와 `DSH_GITHUB_WEBHOOK_PORT`로 재정의하세요.

## DSH 시작

시크릿을 생성하고, 다시 시작해도 같은 값을 유지합니다:

```sh
export DSH_GITHUB_WEBHOOK_SECRET="$(openssl rand -hex 32)"
printf '%s\n' "$DSH_GITHUB_WEBHOOK_SECRET"
```

먼저 두 실험 패키지를 웹 프로필에 설치합니다. 프로필은 피어를 자동으로 설치하지 않으며, GitHub 어댑터는 웹훅 런타임을 명시적으로 필요로 합니다:

```sh
dsh plugin --profile web add @deepseek-ai/dsh-webhook @deepseek-ai/dsh-webhook-github
export DSH_GITHUB_REVIEW_WORKSPACE=/path/to/deepseek-harness
dsh web --patch "${DSH_HOME:-$HOME/.dsh}/profiles/web/node_modules/@deepseek-ai/dsh-webhook-github/examples/github-review/cordis.yml"
```

어댑터가 예제를 배포하며, 이 예제는 프로필의 설치 디렉터리에서 로드되므로 규칙 모듈이 프로필에 설치된 피어를 해석할 수 있습니다. 규칙을 프로필 밖의 임의 디렉터리에서 실행하지 마세요. 사용자 지정하려면 예제 파일 두 개를 `$DSH_HOME/profiles/web/github-review/`로 복사하고 구성을 수정한 뒤 `--patch`를 복사한 `cordis.yml`로 지정하세요. `DSH_HOME`이 설정되지 않았으면 `~/.dsh`를 사용합니다.

저장소의 예제는 `packages/experimental/webhook-github/examples/github-review/`에 있습니다. CLI는 웹훅 패키지를 설치하지 않고 공식 플러그인으로 나열하지도 않습니다. 패키지 설치와 오버레이 제공은 별개의 단계입니다.

## 전용 엔드포인트 노출

기본 웹 UI와 `/api`는 포트 3080에 그대로 있습니다. 오버레이는 격리된 realm에 두 번째 WebServer를 마운트하며, 여기에는 `POST /github`만 등록되고 다른 모든 경로는 `404`를 반환합니다.

Caddy 구성으로 해당 리스너만 노출할 수 있습니다:

```caddyfile
hooks.example.com {
  route {
    @github path /github
    reverse_proxy @github 127.0.0.1:3081
    respond 404
  }
}
```

GitHub는 다음과 같이 구성합니다:

```text
Payload URL:  https://hooks.example.com/github
Content type: application/json
Secret:       DSH_GITHUB_WEBHOOK_SECRET value
Events:       Pull requests
Active:       yes
```

## 규칙 동작

규칙은 소스 `primary-github`, 저장소 `deepseek-ai/deepseek-harness`, 이벤트 `pull_request`, 동작 `ready_for_review`만 받아들입니다. 정확한 head SHA와 선택한 PR 필드를 리뷰 프롬프트에 전달하고, JSON을 신뢰할 수 없는 메타데이터로 표시하며, 파일·브랜치·PR·GitHub 상태 변경을 금지합니다.

세션 요청은 `standard` 에이전트 프리셋과 `read-only` 권한 프리셋을 선택합니다. `workspacePath`는 `WorkspaceRegistry.create()`를 통해 정규화되므로, 처음 일치하는 전달이 워크스페이스가 없을 때 웹 워크스페이스를 만들고 이후 전달은 이를 재사용합니다.

HTTP 응답은 의도적으로 에이전트 결과보다 약합니다. `202`는 서명과 JSON이 수락되었고 규칙 호출이 메모리에서 예약되었음을 뜻합니다. 이 규칙이 일치했다거나 세션이 만들어졌다는 뜻은 아닙니다.

## 프로그래밍 방식 확장

`run()`은 일반적인 신뢰할 수 있는 JavaScript입니다. 배포 환경에서는 세션 요청을 반환하기 전에 내부 정책 서비스를 조회할 수 있습니다:

```js
const response = await fetch('https://policy.internal/pr-review', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ repository: payload.repository.full_name }),
  signal,
})
if (!response.ok || (await response.json()).automaticReview !== true) return null
```

저장소를 서로 다른 로컬 경로로 매핑할 수도 있습니다:

```js
const workspacePath = {
  'deepseek-ai/deepseek-harness': '/path/to/deepseek-harness',
  'deepseek-harness/dsh-sdk': '/path/to/dsh-sdk',
}[payload.repository.full_name]
if (workspacePath === undefined) return null
```

## 전달 의미

웹훅 런타임은 전달이나 실행 상태를 저장하지 않습니다. 반복 전달은 규칙을 실행하며 또 다른 세션을 만들 수 있습니다. 크래시가 나면 프롬프트를 아직 받아들이지 않은 규칙 호출은 사라집니다. 프롬프트가 수락된 뒤에는 일반 세션 로그, 영속성, 워크스페이스, 에이전트 수명 주기가 작업을 소유합니다.

웹훅 시크릿은 인바운드 GitHub 데이터만 인증합니다. 규칙 코드나 만들어진 에이전트에 아웃바운드 GitHub 접근 권한을 부여하지 않으며, 규칙이나 에이전트에 그 권한이 필요하면 따로 구성해야 합니다.
