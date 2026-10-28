# 플러그인 패키징과 설치

[English](publish.md) | [中文](publish.zh.md) | 한국어

앞선 자습서에서는 `--patch` 오버레이로 로컬 플러그인을 로드했습니다. 이 자습서에서는 이를 설치 가능한 **번들**로 패키징하고 `dsh plugin add`로 **프로필**에 설치한 뒤, 최종 구성을 결정하는 계층 순서를 설명합니다. `dsh` CLI가 설치되어 있다고 가정합니다. 먼저 [플러그인 구성](./config.ko.md)을 완료하세요.

새 소스 체크아웃을 대신 사용하려면 [소스에서 실행 절](../../../../README.ko.md#소스에서-실행)을 완료하고, 이 자습서의 `hello-plugin` 디렉터리를 저장소 루트에 둔 다음, 나머지 `dsh ...` 명령을 그곳에서 `pnpm dsh ...`로 실행하세요. 빌드와 런처 동작은 [소스 실행](../../../../apps/cli/reference/README.md#source-execution)을 참고하세요.

## 두 개념, 두 매니페스트

설치는 두 가지 핵심 개념을 기반으로 이루어집니다. 둘 다 `package.json` 파일에 정의되지만, `dsh` 키 아래에 서로 다른 종류의 매니페스트를 담고 각기 다른 역할을 수행합니다:

- **번들**은 구성 계층을 제공하는 npm 패키지입니다. 매니페스트에 `dsh.bundle`을 선언하며 "이 패키지는 어떤 구성과 기능을 제공하는가?"를 정의합니다. 즉 플러그인 행을 추가하거나 재정의하는 패치 파일입니다.
- **프로필**은 `$DSH_HOME/profiles/<name>` 디렉터리 아래에서 실행 가능한 단일 런타임 환경 구성을 정의합니다. 매니페스트에 `dsh.profile`을 선언하며 "이 환경은 어떤 번들들을 어떤 순서로 조합하는가?"를 정의합니다.

번들은 개발자가 작성하여 배포하는 패키지이고, 프로필은 사용자가 `dsh --profile <name>`으로 실행하는 환경 명세입니다. 둘의 역할은 명확히 구분됩니다.

### 번들 매니페스트

패키지 디렉터리를 만듭니다:

```sh
mkdir -p hello-plugin
```

```
hello-plugin/
├── package.json       # declares dsh.bundle
├── cordis.patch.yml   # the layer applied when a profile lists this bundle
└── index.js           # plugin modules the patch rows reference
```

`hello-plugin/package.json`을 만듭니다:

```json
{
  "name": "dsh-hello-plugin",
  "version": "0.1.0",
  "type": "module",
  "main": "index.js",
  "files": ["index.js", "cordis.patch.yml"],
  "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
}
```

플러그인 진입점으로 `hello-plugin/index.js`를 만듭니다:

```js
export const name = 'hello-plugin'

export function apply() {
  console.log('[hello-plugin] plugin loaded!')
}
```

`hello-plugin/cordis.patch.yml`을 만듭니다. 이 패치는 작성했던 `--patch` 오버레이와 같은 YAML 배열이지만, Node 모듈 해석이 설치된 코드를 찾을 수 있도록 플러그인 행이 상대 소스 경로 대신 패키지 이름으로 패키지를 참조합니다:

```yaml
- insert:
    - id: hello
      name: dsh-hello-plugin
```

`patch`는 파일 목록도 순서대로 받습니다. 예: `["./base.patch.yml", "./web.patch.yml"]`. 런처는 이를 그 순서대로 하나의 계층으로 적용하며, 각 파일의 상대 플러그인 경로는 그 파일 옆에서 해석됩니다. `dsh.bundle` 선언이 없는 패키지도 설치되지만 일반 의존성으로만 설치됩니다. `dsh plugin`은 경고를 출력하고 어떤 계층도 활성화하지 않습니다. 사용자가 활성화하는 플러그인이 아니라 플러그인 패키지가 import하는 라이브러리에는 그 패키지 형식을 사용하세요.

`engines.dsh` SemVer 범위로 번들이 지원하는 DSH 릴리스를 선언하세요. 예: `"engines": { "dsh": ">=0.2.0 <0.3.0" }`. 설치와 프로필 시작은 실행 중인 DSH가 그 범위를 만족하지 않는 번들을 거부합니다. `engines.dsh`가 없으면 대신 `@deepseek-ai/dsh*` 피어 의존성 범위를 검사합니다([규칙](../../../../packages/boot/app-boot/README.md#profiles)).

### 프로필 매니페스트

프로필 디렉터리에는 파일 두 개가 있습니다:

- `package.json` — 프로필의 트리 밖 플러그인 의존성(pnpm이 관리)과 순서 있는 `bundles` 목록을 담은 `dsh.profile` 매니페스트.
- `cordis.patch.yml` — 모든 번들 계층 뒤에 적용되는 사용자 자신의 패치 계층.

프로필 매니페스트는 직접 작성하지 않습니다. `dsh --profile <name> --from-default-profile <template>`이 함께 제공되는 애플리케이션 템플릿에서 프로필을 만들거나 초기화할 수 있고, `dsh plugin`은 base 기반 프로필을 만들어 설치된 번들 목록을 유지합니다. 생성 규칙은 [CLI 동작 참조](../../../../apps/cli/reference/README.md#profile-boot)가 소유하며, 다음 절에서 플러그인 경로를 보여 줍니다.

## 프로필에 설치

`dsh plugin --profile <name> <args...>`는 프로필 디렉터리에서 pnpm으로 전달되므로 모든 pnpm 명령을 사용할 수 있습니다. `hello-plugin`이 있는 디렉터리에서 패키지 체크아웃을 설치합니다:

```sh
dsh plugin --profile demo add ./hello-plugin
```

처음 사용하면 프로필이 초기화되고(`@deepseek-ai/dsh-base`가 첫 번째 번들), pnpm이 체크아웃을 링크하며, 패키지가 `dsh.bundle`을 선언하므로 `dsh`가 번들을 `dsh.profile.bundles`에 추가합니다:

```json
{
  "name": "dsh-profile-demo",
  "private": true,
  "dependencies": {
    "dsh-hello-plugin": "link:/path/to/hello-plugin"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "dsh-hello-plugin"
      ]
    }
  }
}
```

링크된 체크아웃은 자체 `node_modules`를 유지합니다. 하네스(harness) 패키지들처럼, 플러그인이 호스트와 인스턴스를 공유해야 하는 dsh 패키지는 `peerDependencies`와 `devDependencies` 양쪽에 선언하세요. 해당 매니페스트의 조회 위치에서 실행 중인 dsh의 런타임 해석에 존재하는 피어는 설치본의 복사본을 사용하고, devDependency 복사본은 타입 검사기와 독립 테스트에 쓰입니다. 독립적으로 버전이 매겨지는 서드파티 의존성과 상태가 없는 dsh 유틸리티는 `dependencies`에 두세요.

일반적인 링크된 import는 Node의 상위 디렉터리 순서를 따르며 각 디렉터리의 현재 피어 선언을 검사합니다. 더 가까운 물리 패키지가 더 상위의 피어 선언보다 우선합니다. 링크 대상에는 `package.json`이 없어도 되고, 그 매니페스트 옆에 물리적 `node_modules`가 없어도 상위 피어가 여전히 적용됩니다. 명시적 `require.resolve(..., { paths })`는 프로필 내부 경로를 포함해 항상 네이티브로 동작합니다. 이 규칙은 npm, Desktop, 소스 실행이 공유하며, 이미 로드된 모듈을 무효화하거나 피어 버전 범위를 검증하지는 않습니다. 범위와 파일 조회 동작은 [해석 규칙](../../../../.agents/notes/implemented/architecture/2026-09-19-profile-resolution-lookup-order.md)을 참고하세요.

넓은 체크아웃을 링크해도 실행 중인 설치 자체의 패키지 디렉터리에는 피어 가로채기가 적용되지 않습니다. pnpm store를 포함해 프로필 안에 머무는 대상을 가리키는 링크는 외부 linked root가 아니라 프로필이 소유한 설치 콘텐츠로 남습니다. 외부 링크가 겹쳐도 조회 순서는 바뀌지 않으며, 각 요청은 여전히 자기 importer 디렉터리에서 시작합니다.

부팅하지 않고 계층을 확인한 뒤 부팅합니다:

```sh
dsh --profile demo --dump-config   # shows a "# == dsh-hello-plugin" layer
dsh --profile demo
```

`dsh plugin --profile demo remove dsh-hello-plugin`은 의존성과 계층을 모두 제거합니다.

## 로딩 순서

유효 구성은 빈 루트 위에 다음 순서로 계층을 적용해 구성됩니다:

1. 프로필의 `dsh.profile.bundles` 목록에 있는 각 번들 패치를 목록 순서대로 — `@deepseek-ai/dsh-base`가 먼저, 그다음 설치된 각 번들이 추가된 순서대로.
2. 프로필 자체의 `cordis.patch.yml`.
3. 홈 수준의 `$DSH_HOME/cordis.patch.yml` — 모든 프로필이 공유하는 머신 로컬 기본 설정.
4. 각 `--patch <path>` 오버레이를 argv 순서대로.

앱 인수는 또 다른 패치 계층이 아닙니다. 표면 번들(surface bundle)은 아래에서 설명하는 일반적인 앱 소유 서비스를 통해 인수를 해석할 수 있습니다.

나중에 적용되는 상위 계층이 행(row) 단위로 우선 적용되며, 패치는 내부 키를 깊은 병합(deep merge)하지 않고 행의 `config` 값 전체를 통째로 교체합니다. 번들 개발 시 다음 두 가지 특성을 염두에 두어야 합니다:

- 패치는 `id`로 이전 계층의 행을 재정의할 수 있습니다. [`dsh-web-app` 번들](../../../../packages/bundle/web-app/cordis.patch.yml)이 `dsh-base` 행을 재정의하는 방식과 같습니다. 다만 바뀐 키만이 아니라 그 행이 필요로 하는 모든 키를 다시 적어야 합니다.
- 사용자는 패키지를 건드리지 않고 프로필의 `cordis.patch.yml`에서 해당 행을 재정의할 수 있으므로, 사용자가 그대로 유지할 가능성이 높은 구성 기본값을 우선 제공하고 나머지는 스키마에 맡기세요.

내장 번들 이름은 항상 dsh 설치 자체에서 해석됩니다. pnpm은 트리 밖 패키지만 관리하므로, 번들은 `@deepseek-ai/dsh-base`가 존재하고 최신이라고 믿고 의존할 수 있습니다.

## 표면 번들에 자체 명령줄 제공하기

실행 가능한 앱을 정의하는 번들은 일반 제공자 플러그인을 마운트합니다:

```yaml
- id: hello-startup
  name: 'dsh-hello-plugin/startup'
```

그 플러그인은 `inject = ['cmdlineArgs']`를 내보내고, 자체 commander 프로그램으로 [`@deepseek-ai/dsh-cmdline`](../../../../packages/boot/cmdline/README.md)의 `parseCmdline`을 호출하며, 프로그램의 action에서 앱 소유 서비스를 제공합니다. 런처는 런처 플래그 뒤의 동일한 불변 인수를 모든 플러그인에 전달하므로, 앱 전용 플래그에 런처 변경이 필요 없고 여러 플러그인이 그 스냅샷을 해석할 수 있습니다. Loader 행에는 런처 표시나 특별한 종류가 필요하지 않습니다.

그 인수로 구성되는 행은 제공자의 서비스를 주입하고 자체 `!!js` 옵션에서 이를 읽으며, 배포 값을 옆에 두어 대체값으로 씁니다:

```yaml
- id: my-app
  name: '@example/my-app'
  inject: [myAppStartup]
  config:
    port: !!js ctx.myAppStartup.port ?? 8080
```

`--help`일 때 제공자는 서비스를 게시하지 않으므로 그 행들은 활성화되지 않습니다. Loader는 구성을 한 번 마운트하고 각 행의 일반 주입을 기다린 뒤에야 주입된 컨텍스트로 그 행의 `!!js` 구성을 평가합니다.

## GitHub에서 설치: 빌드 스크립트라는 함정

레지스트리에 게시하는 것은 필수가 아닙니다. 사용자는 git 호스트에서 바로 설치할 수 있습니다:

```sh
dsh plugin --profile demo add github:you/hello-plugin
```

하지만 git 설치가 가져오는 것은 **빌드 산출물이 아니라 소스**입니다. `build` 스크립트를 실행하는 단계가 없으므로 TypeScript 패키지는 `lib/` 출력 없이 도착하고 로드에 실패합니다. 양쪽에서 각각 한 가지씩 해야 합니다:

- **작성자**는 `prepare` 스크립트를 제공합니다. pnpm이 git 설치 후 실행하며, 게시할 진입점을 소스에서 빌드하고 스스로 완결되어야 합니다. 옆에 모노레포 체크아웃이 있다는 식의 개발 전용 상황을 가정해서는 안 됩니다. 전용 tsdown 구성은 프로젝트 참조나 타입 검사 없이 `src/`를 트랜스파일할 수 있습니다.
- **사용자**는 빌드를 허용 목록에 추가합니다. pnpm ≥10은 명시적으로 허용되기 전까지 git 의존성의 `prepare` 스크립트 실행을 거부하므로 첫 `add`는 실패합니다. `dsh`가 해결책을 알려 줍니다. pnpm이 출력한 정확한 패키지 키를 프로필의 `pnpm-workspace.yaml`에 복사하세요:

  ```yaml
  allowBuilds:
    dsh-hello-plugin: true
  ```

  그런 다음 `add`를 다시 실행합니다.

그 허용은 **설치 시점에 이 머신에서 패키지 코드를 실행할 수 있는 권한**이며, 에이전트가 실행되는 어떤 샌드박스의 밖입니다. 소스를 신뢰하는 패키지에만 허용하고, 나중의 push가 실행 내용을 조용히 바꾸지 못하도록 commit을 고정하세요(`github:you/hello-plugin#<sha>`).

사용자에게 허용을 요청하고 싶지 않다면 대신 빌드 산출물을 배포하세요. 두 방식 모두 빌드 권한이 필요 없습니다:

- **npm에 게시**하고 `pnpm publish` 시점에 `lib/`를 빌드합니다. 그러면 `dsh plugin add your-package`가 미리 빌드된 코드를 설치합니다.
- **tarball 제공**: `pnpm pack`으로 만들고 사용자는 `dsh plugin add ./hello-plugin-0.1.0.tgz`를 실행합니다.

## 다음 단계

- [플러그인과 수명 주기](../framework/index.ko.md) — 전체 플러그인 수명 주기
- [CLI 동작 참조](../../../../apps/cli/reference/README.md) — 정확한 계층 우선순위, 플래그, 프로필 동작 방식
