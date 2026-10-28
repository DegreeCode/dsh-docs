/**
 * Canonical publication manifest for the documentation website.
 *
 * Markdown stays in its owning repository tier. This manifest maps each
 * canonical source into matching route trees for both site locales; when a
 * translation is absent, both routes intentionally project the available
 * source instead of copying Markdown.
 */

/** Locale key used by the VitePress site. */
export type DocsLocale = 'root' | 'en' | 'ko'

/** Locale pair every canonical document and its counterpart project into. */
type BilingualLocale = 'root' | 'en'

/** Sidebar collection rendered for one locale and top-level module. */
export type DocsSidebar =
  | 'zh-guide'
  | 'zh-develop'
  | 'zh-reference'
  | 'en-guide'
  | 'en-develop'
  | 'en-reference'
  | 'ko-guide'
  | 'ko-develop'
  | 'ko-reference'

/** A page projected into the VitePress source tree. */
export interface DocsPage {
  /** VitePress locale whose route tree owns this projection. */
  locale: DocsLocale
  /** Language of the canonical source currently projected at this route. */
  contentLocale: 'zh-CN' | 'en-US' | 'ko-KR'
  /** Repository-relative canonical Markdown source. */
  source: string
  /** VitePress route, including the `.md` suffix. */
  route: string
  /** Navigation label shown in the sidebar. */
  label: string
  /** Sidebar collection that owns the page, or null for a locale home page. */
  sidebar: DocsSidebar | null
  /** Section label within the sidebar. */
  section: string
  /** Stable order within the section. */
  order: number
  /** Heading levels included in this page's VitePress outline. */
  outline?: number | readonly [number, number] | 'deep' | false
  /** Additional repository paths that resolve to this page. */
  sourceAliases?: string[]
}

interface MirroredPage {
  source: string | Record<BilingualLocale, string>
  route: string
  contentLocale: DocsPage['contentLocale'] | Record<BilingualLocale, DocsPage['contentLocale']>
  label: Record<BilingualLocale, string>
  sidebar: Record<BilingualLocale, DocsSidebar | null>
  section: Record<BilingualLocale, string>
  order: number
  outline?: DocsPage['outline']
  sourceAliases?: string[] | Partial<Record<BilingualLocale, string[]>>
}

type PairedPage = Omit<MirroredPage, 'source' | 'contentLocale' | 'sourceAliases'> & {
  /** English side of a sibling `foo.md` / `foo.zh.md` pair. */
  source: string
  /** Language-neutral repository aliases, such as the directory of an index page. */
  sourceAliases?: string[]
}

function localized<T>(value: T | Record<BilingualLocale, T>, locale: BilingualLocale): T {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<BilingualLocale, T>)[locale]
    : value
}

function mirroredPages(pages: MirroredPage[]): DocsPage[] {
  return pages.flatMap(page => (['root', 'en'] as const).map((locale) => {
    const aliases = page.sourceAliases === undefined
      ? undefined
      : Array.isArray(page.sourceAliases) ? page.sourceAliases : page.sourceAliases[locale]
    return {
      locale,
      contentLocale: localized(page.contentLocale, locale),
      source: localized(page.source, locale),
      route: locale === 'root' ? page.route : `en/${page.route}`,
      label: page.label[locale],
      sidebar: page.sidebar[locale],
      section: page.section[locale],
      order: page.order,
      ...(page.outline === undefined ? {} : { outline: page.outline }),
      ...(aliases === undefined ? {} : { sourceAliases: aliases }),
    }
  }))
}

function pairedPages(pages: PairedPage[]): DocsPage[] {
  return mirroredPages(pages.map((page) => {
    const chineseSource = page.source.replace(/\.md$/, '.zh.md')
    const sharedAliases = page.sourceAliases ?? []
    return {
      ...page,
      source: { root: chineseSource, en: page.source },
      contentLocale: { root: 'zh-CN', en: 'en-US' },
      sourceAliases: {
        root: [...sharedAliases, page.source],
        en: [...sharedAliases, chineseSource],
      },
    }
  }))
}

const homeAndGuide = pairedPages([
  {
    source: 'docs/user/index.md',
    route: 'index.md',
    label: { root: 'DeepSeek Harness', en: 'DeepSeek Harness' },
    sidebar: { root: null, en: null },
    section: { root: '首页', en: 'Home' },
    order: 0,
  },
  {
    source: 'docs/user/guide/index.md',
    route: 'guide/quickstart.md',
    label: { root: '使用 Web UI', en: 'Use the Web UI' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide' },
    order: 1,
    sourceAliases: ['docs/user/guide'],
  },
  {
    source: 'docs/user/guide/providers.md',
    route: 'guide/providers.md',
    label: { root: '配置模型', en: 'Configure models' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide' },
    order: 2,
  },
  {
    source: 'docs/user/guide/network-proxy.md',
    route: 'guide/network-proxy.md',
    label: { root: '网络代理', en: 'Network proxy' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide' },
    order: 3,
  },
  {
    source: 'docs/user/guide/public-deployments.md',
    route: 'guide/public-deployments.md',
    label: { root: '公开部署', en: 'Public deployments' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '入门', en: 'Guide' },
    order: 4,
  },
  {
    source: 'docs/user/guide/python-sdk.md',
    route: 'guide/python-sdk.md',
    label: { root: 'Python', en: 'Python' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: 'SDK', en: 'SDK' },
    order: 1,
  },
  {
    source: 'docs/user/guide/github-review.md',
    route: 'guide/github-review.md',
    label: { root: 'GitHub 评审会话', en: 'GitHub review sessions' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '自动化', en: 'Automation' },
    order: 1,
  },
  {
    source: 'docs/user/guide/schedule.md',
    route: 'guide/schedule.md',
    label: { root: '会话内提醒', en: 'Session reminders' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '自动化', en: 'Automation' },
    order: 2,
  },
  {
    source: 'docs/user/guide/plugin-market.md',
    route: 'guide/plugin-market.md',
    label: { root: '插件索引', en: 'Plugin indexes' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '集成', en: 'Integrations' },
    order: 2,
  },
  {
    source: 'docs/user/guide/mcp-memory.md',
    route: 'guide/mcp-memory.md',
    label: { root: '记忆 MCP', en: 'Memory MCP' },
    sidebar: { root: 'zh-guide', en: 'en-guide' },
    section: { root: '集成', en: 'Integrations' },
    order: 1,
  },
])

const develop = pairedPages([
  {
    source: 'docs/user/develop/basic/index.md',
    route: 'develop/basic/index.md',
    label: { root: '第一个 Harness 插件', en: 'Your first Harness plugin' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 1,
    sourceAliases: ['docs/user/develop/basic'],
  },
  {
    source: 'docs/user/develop/basic/tool.md',
    route: 'develop/basic/tool.md',
    label: { root: '开发一个 Tool', en: 'Build a tool' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 2,
  },
  {
    source: 'docs/user/develop/basic/config.md',
    route: 'develop/basic/config.md',
    label: { root: '插件配置', en: 'Plugin configuration' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 3,
  },
  {
    source: 'docs/user/develop/basic/publish.md',
    route: 'develop/basic/publish.md',
    label: { root: '打包与安装插件', en: 'Package and install' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 4,
  },
  {
    source: 'docs/user/develop/framework/index.md',
    route: 'develop/framework/index.md',
    label: { root: '插件与生命周期', en: 'Plugin lifecycle' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 1,
    sourceAliases: ['docs/user/develop/framework'],
  },
  {
    source: 'docs/user/develop/framework/service.md',
    route: 'develop/framework/service.md',
    label: { root: '服务与依赖', en: 'Services and dependencies' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 2,
  },
  {
    source: 'docs/user/develop/framework/events.md',
    route: 'develop/framework/events.md',
    label: { root: '事件系统', en: 'Event system' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 3,
  },
  {
    source: 'docs/user/develop/practice/index.md',
    route: 'develop/practice/index.md',
    label: { root: '能力的三层拆分', en: 'Capability layering' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice' },
    order: 1,
    sourceAliases: ['docs/user/develop/practice'],
  },
  {
    source: 'docs/user/develop/practice/llm-adapter.md',
    route: 'develop/practice/llm-adapter.md',
    label: { root: 'LLM 适配器', en: 'LLM adapter' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice' },
    order: 2,
  },
  {
    source: 'docs/user/develop/practice/dynamic-cordis.md',
    route: 'develop/practice/dynamic-cordis.md',
    label: { root: '持久化 Harness 插件', en: 'Persistent Harness plugins' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice' },
    order: 3,
  },
])

/**
 * Korean sidebar labels, keyed by the English source they translate.
 *
 * Korean renderings exist for the reader-facing guides under `docs/user/`; the
 * Korean route tree publishes those pages and leaves the contributor reference
 * to the English site.
 */
const koreanLabels: Readonly<Record<string, string>> = {
  'docs/user/index.md': 'DeepSeek Harness',
  'docs/user/guide/index.md': '웹 UI 사용',
  'docs/user/guide/providers.md': '모델 구성',
  'docs/user/guide/network-proxy.md': '네트워크 프록시',
  'docs/user/guide/public-deployments.md': '공개 배포',
  'docs/user/guide/python-sdk.md': 'Python',
  'docs/user/guide/github-review.md': 'GitHub 리뷰 세션',
  'docs/user/guide/schedule.md': '세션 리마인더',
  'docs/user/guide/plugin-market.md': '플러그인 인덱스',
  'docs/user/guide/mcp-memory.md': '메모리 MCP',
  'docs/user/develop/basic/index.md': '첫 번째 Harness 플러그인',
  'docs/user/develop/basic/tool.md': '도구 만들기',
  'docs/user/develop/basic/config.md': '플러그인 구성',
  'docs/user/develop/basic/publish.md': '플러그인 패키징과 설치',
  'docs/user/develop/framework/index.md': '플러그인 생명주기',
  'docs/user/develop/framework/service.md': '서비스와 의존성',
  'docs/user/develop/framework/events.md': '이벤트 시스템',
  'docs/user/develop/practice/index.md': '기능 계층화',
  'docs/user/develop/practice/llm-adapter.md': 'LLM 어댑터',
  'docs/user/develop/practice/dynamic-cordis.md': '영속 Harness 플러그인',
  'docs/architecture.md': '아키텍처',
  'docs/capability-seams.md': '기능 seam',
  'docs/agent-lifecycle.md': '에이전트 수명 주기',
  'docs/tool-execution-pipeline.md': '도구 실행',
  'docs/api-gateway.md': 'API 게이트웨이',
  'docs/cordis-primer.md': 'Cordis 입문서',
  'docs/cordis-tutorial/index.md': '개요',
  'docs/cordis-tutorial/01-first-plugin.md': '1. 첫 플러그인',
  'docs/cordis-tutorial/02-lifecycle-and-effects.md': '2. 수명 주기와 효과',
  'docs/cordis-tutorial/03-services.md': '3. 서비스',
  'docs/cordis-tutorial/04-events.md': '4. 이벤트',
  'docs/cordis-tutorial/05-config.md': '5. 구성',
  'docs/cordis-tutorial/06-composition-and-hmr.md': '6. 조합과 HMR',
  'docs/cordis-tutorial/07-into-the-harness.md': '7. 하네스로 들어가기',
  'docs/cookbook/adding-a-package.md': '패키지 추가',
  'docs/cookbook/adding-a-tool.md': '도구 추가',
  'docs/cookbook/adding-an-llm-adapter.md': 'LLM 어댑터 추가',
  'docs/cookbook/adding-a-settings-card.md': '설정 페이지 추가',
  'docs/cookbook/extension-cookbook.md': '확장 패턴',
  'docs/cookbook/adding-a-remote-api.md': '원격 API 추가',
  'docs/cookbook/adding-a-session-format-version.md': '세션 형식 버전 추가',
  'docs/cookbook/adding-a-vendored-package.md': '벤더 패키지 추가',
  'docs/cookbook/adding-a-plugin-preview.md': '플러그인 미리 보기 추가',
  'docs/cookbook/maintaining-dsh-code-review.md': '코드 리뷰 자동화 유지',
  'docs/cookbook/reviewing-persistence-type-changes.md': '영속성 타입 변경 검토',
  'docs/cookbook/responding-to-pr-review-on-a-stack.md': '스택 PR 리뷰 대응',
  'docs/cordis-api/context.md': '컨텍스트',
  'docs/cordis-api/events.md': '이벤트',
  'docs/cordis-api/fiber.md': 'Fiber',
  'docs/cordis-api/registry.md': '레지스트리',
  'docs/cordis-api/service.md': '서비스',
  'docs/subsystems/README.md': '서브시스템',
  'docs/subsystems/core.md': '코어',
  'docs/subsystems/scope.md': '스코프',
  'docs/subsystems/session.md': '세션',
  'docs/subsystems/session-query.md': '세션 쿼리',
  'docs/subsystems/session-reference.md': '세션 참조',
  'docs/subsystems/session-title.md': '세션 제목',
  'docs/subsystems/session-projection.md': '세션 프로젝션',
  'docs/subsystems/persistence.md': '세션 영속성',
  'docs/subsystems/spill.md': '스필 저장소',
  'docs/subsystems/session-telemetry.md': '세션 텔레메트리',
  'docs/subsystems/llm-streaming.md': 'LLM 스트리밍',
  'docs/subsystems/token-meter.md': '토큰 미터',
  'docs/subsystems/system-prompt.md': '시스템 프롬프트',
  'docs/subsystems/compaction.md': '압축',
  'docs/subsystems/tools.md': '도구',
  'docs/subsystems/shell.md': '셸 실행',
  'docs/subsystems/subprocess.md': '하위 프로세스',
  'docs/subsystems/terminal.md': 'PTY 세션',
  'docs/subsystems/jobs.md': '백그라운드 작업',
  'docs/subsystems/filesystem.md': '파일 시스템',
  'docs/subsystems/lsp.md': 'LSP 내비게이션',
  'docs/subsystems/ptc-runtime.md': 'PTC 런타임',
  'docs/subsystems/web.md': '웹 접근',
  'docs/subsystems/skills.md': '스킬',
  'docs/subsystems/workflow.md': '워크플로',
  'docs/subsystems/subagent.md': '서브에이전트',
  'docs/subsystems/approval.md': '승인',
  'docs/subsystems/permission-presets.md': '권한 프리셋',
  'docs/subsystems/sandbox.md': '샌드박스',
  'docs/subsystems/plan.md': '계획 모드',
  'docs/subsystems/user-questions.md': '사용자 상호작용',
  'docs/subsystems/commands.md': '사용자 명령',
  'docs/subsystems/goal.md': '목표',
  'docs/subsystems/schedule.md': '예약',
  'docs/subsystems/web-server.md': 'HTTP 서버',
  'docs/subsystems/web-client.md': 'Web 클라이언트',
  'docs/subsystems/client-modules.md': '클라이언트 모듈',
  'docs/subsystems/slots.md': '클라이언트 슬롯',
  'docs/subsystems/client-resources.md': '클라이언트 리소스',
  'docs/subsystems/sidebar-right.md': '오른쪽 사이드바',
  'docs/subsystems/conversation.md': '대화 조립',
  'docs/subsystems/typert.md': 'Typert',
  'docs/subsystems/storage.md': '저장소',
  'docs/subsystems/workspace.md': '워크스페이스',
  'docs/subsystems/settings.md': '사용자 설정',
  'docs/subsystems/credentials.md': '자격 증명',
  'docs/subsystems/agent-team.md': '에이전트 팀',
  'docs/subsystems/deliverables.md': '결과물',
  'docs/subsystems/translation.md': '번역',
  'docs/subsystems/mcp.md': 'MCP',
  'docs/subsystems/voice-input.md': '음성 입력',
  'docs/subsystems/ssh.md': 'SSH',
  'docs/subsystems/computer-use.md': 'Computer Use',
  'docs/subsystems/office-to-pdf.md': 'Office → PDF',
  'docs/subsystems/webhook.md': '웹훅',
  'docs/subsystems/browser-use.md': '브라우저 사용',
  'docs/subsystems/worktrees.md': '워크트리',
  'docs/subsystems/working-directory.md': '작업 디렉터리',
  'docs/subsystems/product-telemetry.md': '제품 텔레메트리',
  'docs/subsystems/otel.md': 'OpenTelemetry',
  'docs/subsystems/todo.md': '할 일',
  'docs/config-catalog.md': '플러그인 구성 카탈로그',
  'docs/tool-catalog.md': '도구 스키마',
  'docs/persistence-catalog.md': '영속성 이벤트',
  'docs/experimental-persistence-catalog.md': '실험적 영속성',
}

/** Korean sidebar sections, keyed by the English section label they translate. */
const koreanSections: Readonly<Record<string, string>> = {
  Home: '홈',
  Guide: '가이드',
  SDK: 'SDK',
  Automation: '자동화',
  Integrations: '통합',
  Basics: '기본',
  Framework: '프레임워크',
  Practice: '실전',
}

/**
 * Korean projections of the reader-facing guides.
 *
 * Each entry mirrors its English projection under `/ko/` and reads the sibling
 * `.ko.md` source. Contributor reference pages stay out of this tree; links
 * from Korean pages resolve to the English site when no Korean page exists.
 */
const koreanSitePages: DocsPage[] = [...homeAndGuide, ...develop]
  .filter(page => page.locale === 'en')
  .map((page): DocsPage => ({
    locale: 'ko',
    contentLocale: 'ko-KR',
    source: page.source.replace(/\.md$/, '.ko.md'),
    route: `ko/${page.route.replace(/^en\//, '')}`,
    label: koreanLabels[page.source] ?? page.label,
    sidebar: page.sidebar === 'en-guide' ? 'ko-guide' : page.sidebar === 'en-develop' ? 'ko-develop' : null,
    section: koreanSections[page.section] ?? page.section,
    order: page.order,
    ...(page.outline === undefined ? {} : { outline: page.outline }),
  }))

const cordisTutorial = pairedPages(([
  ['index.md', '总览', 'Overview'],
  ['01-first-plugin.md', '1. 第一个插件', '1. Your first plugin'],
  ['02-lifecycle-and-effects.md', '2. 生命周期与副作用', '2. Lifecycle and effects'],
  ['03-services.md', '3. 服务', '3. Services'],
  ['04-events.md', '4. 事件', '4. Events'],
  ['05-config.md', '5. 配置', '5. Configuration'],
  ['06-composition-and-hmr.md', '6. 组合与热重载', '6. Composition and HMR'],
  ['07-into-the-harness.md', '7. 进入 Harness', '7. Into the harness'],
] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
  source: `docs/cordis-tutorial/${file}`,
  route: `develop/cordis-tutorial/${file}`,
  label: { root: rootLabel, en: enLabel },
  sidebar: { root: 'zh-develop', en: 'en-develop' },
  section: { root: 'Cordis 框架教程', en: 'Cordis framework tutorial' },
  order,
  ...(file === 'index.md' ? { sourceAliases: ['docs/cordis-tutorial'] } : {}),
})))

const cordisPrimerReference = pairedPages([
  {
    source: 'docs/cordis-primer.md',
    route: 'reference/cordis-primer.md',
    label: { root: 'Cordis 入门', en: 'Cordis primer' },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order: 1,
  },
])

/**
 * Subsystem pages grouped by the concern they document, as `[Chinese section,
 * English section, pages]`. One flat list of every subsystem pushed the rest of
 * the reference sidebar below the fold.
 */
const subsystemGroups = [
  ['总览', 'Overview', [
    ['README.md', '子系统', 'Subsystems'],
  ]],
  ['内核与作用域', 'Core and scopes', [
    ['core.md', '核心', 'Core'],
    ['scope.md', '作用域', 'Scopes'],
  ]],
  ['会话与持久化', 'Sessions and persistence', [
    ['session.md', '会话', 'Sessions'],
    ['session-query.md', '会话查询', 'Session query'],
    ['session-reference.md', '会话引用', 'Session references'],
    ['session-title.md', '会话标题', 'Session titles'],
    ['session-projection.md', '会话投影', 'Session projections'],
    ['persistence.md', '会话持久化', 'Session persistence'],
    ['spill.md', 'Spill 存储', 'Spill storage'],
    ['session-telemetry.md', '遥测', 'SessionTelemetryBackend'],
  ]],
  ['模型与上下文', 'Model and context', [
    ['llm-streaming.md', 'LLM 流式响应', 'LLM streaming'],
    ['token-meter.md', 'Token 计量', 'Token metering'],
    ['system-prompt.md', '系统提示词', 'System prompts'],
    ['compaction.md', '上下文压缩', 'Compaction'],
  ]],
  ['执行与工具', 'Execution and tools', [
    ['tools.md', '工具', 'Tools'],
    ['shell.md', 'Bash 执行', 'Bash execution'],
    ['subprocess.md', '子进程', 'Subprocesses'],
    ['terminal.md', 'PTY 会话', 'PTY sessions'],
    ['jobs.md', '后台任务', 'Background jobs'],
    ['filesystem.md', '文件系统', 'Filesystem'],
    ['lsp.md', 'LSP 导航', 'LSP navigation'],
    ['ptc-runtime.md', 'PTC 运行时', 'PTC runtime'],
    ['web.md', 'Web 访问', 'Web access'],
    ['skills.md', '技能', 'Skills'],
    ['workflow.md', '工作流', 'Workflows'],
    ['subagent.md', '子智能体', 'Subagents'],
  ]],
  ['策略与交互', 'Policy and interaction', [
    ['approval.md', '审批', 'Approvals'],
    ['permission-presets.md', '权限预设', 'Permission presets'],
    ['sandbox.md', '沙箱', 'Sandboxing'],
    ['plan.md', '计划模式', 'Plan mode'],
    ['user-questions.md', '用户交互', 'User interaction'],
    ['commands.md', '命令', 'Human commands'],
    ['goal.md', '目标', 'Goals'],
    ['schedule.md', '定时提醒', 'Scheduled reminders'],
  ]],
  ['平台与接入', 'Platform and access', [
    ['web-server.md', 'HTTP 服务器', 'HTTP server'],
    ['web-client.md', 'Web Client 架构', 'Web Client architecture'],
    ['client-modules.md', '客户端模块', 'Client modules'],
    ['slots.md', '客户端 Slots', 'Client slots'],
    ['client-resources.md', '客户端资源', 'Client resources'],
    ['sidebar-right.md', '右侧 Sidebar', 'Right Sidebar'],
    ['conversation.md', 'Conversation 组装', 'Conversation assembly'],
    ['typert.md', 'Typert', 'Typert'],
    ['storage.md', '存储', 'Storage'],
    ['workspace.md', '工作区', 'Workspaces'],
    ['settings.md', '用户设置', 'User settings'],
    ['credentials.md', '用户凭据', 'User credentials'],
  ]],
] as const

const subsystemsReference = subsystemGroups.flatMap(([rootSection, enSection, files]) => pairedPages(
  files.map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/subsystems/${file}`,
    route: file === 'README.md' ? 'reference/subsystems/index.md' : `reference/subsystems/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: rootSection, en: enSection },
    order,
    // Subsystem pages carry long third-level sections a two-level outline reaches.
    outline: [2, 3],
    ...(file === 'README.md' ? { sourceAliases: ['docs/subsystems'] } : {}),
  })),
))

const reference = [
  // `docs/deepseek-llm-api-wire-extensions.md` is a repository-only provider protocol reference.
  // Projected links intentionally resolve to its GitHub source instead of a public site route.
  ...pairedPages(([
    ['docs/architecture.md', 'reference/index.md', '架构', 'Architecture', 0],
  ] as const).map(([source, route, rootLabel, enLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order,
  }))),
  ...pairedPages(([
    ['docs/capability-seams.md', 'reference/capability-seams.md', '能力服务', 'Capability services', 2],
    ['docs/agent-lifecycle.md', 'reference/agent-lifecycle.md', 'Agent 生命周期', 'Agent lifecycle', 3],
    ['docs/tool-execution-pipeline.md', 'reference/tool-execution-pipeline.md', 'Tool 执行', 'Tool execution', 4],
    ['docs/api-gateway.md', 'reference/api-gateway.md', 'API Gateway', 'API Gateway', 5],
  ] as const).map(([source, route, rootLabel, enLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order,
  }))),
  ...pairedPages(([
    ['docs/config-catalog.md', 'reference/config-catalog.md', '插件配置', 'Plugin configuration'],
    ['docs/tool-catalog.md', 'reference/tool-catalog.md', 'Tool Schema', 'Tool schemas'],
    ['docs/persistence-catalog.md', 'reference/persistence-catalog.md', '持久化事件', 'Persistence events', 'deep'],
    ['docs/experimental-persistence-catalog.md', 'reference/experimental-persistence-catalog.md', '实验性持久化记录', 'Experimental persistence'],
  ] as const).map(([source, route, rootLabel, enLabel, outline], order): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '生成参考', en: 'Generated reference' },
    order,
    ...(outline === undefined ? {} : { outline }),
  }))),
  ...pairedPages(([
    ['context.md', 'Context', 'Context'],
    ['events.md', 'Events', 'Events'],
    ['fiber.md', 'Fiber', 'Fiber'],
    ['registry.md', 'Plugin Registry', 'Plugin Registry'],
    ['service.md', 'Service', 'Service'],
  ] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API' },
    order,
  }))),
  ...mirroredPages(([
    ['inherited.md', '继承接口面', 'Inherited surface'],
  ] as const).map(([file, rootLabel, enLabel], order): MirroredPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    contentLocale: 'en-US',
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API' },
    order: order + 5,
  }))),
  ...pairedPages(([
    ['adding-a-package.md', '新增 Package', 'Adding a package'],
    ['adding-a-tool.md', '新增 Tool', 'Adding a tool'],
    ['adding-an-llm-adapter.md', '新增 LLM Adapter', 'Adding an LLM adapter'],
    ['adding-a-settings-card.md', '新增设置页', 'Adding a settings page'],
    ['extension-cookbook.md', '扩展模式', 'Extension patterns'],
  ] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/cookbook/${file}`,
    route: `reference/cookbook/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '开发手册', en: 'Cookbook' },
    order,
  }))),
]


/** Korean reference section labels, keyed by the English section they translate. */
const koreanReferenceSections: Readonly<Record<string, string>> = {
  Concepts: '개념',
  'Cordis framework tutorial': 'Cordis 프레임워크 튜토리얼',
  'Cordis Core API': 'Cordis 핵심 API',
  Cookbook: '개발 매뉴얼',
  Overview: '개요',
  'Core and scopes': '코어와 스코프',
  'Execution and tools': '실행과 도구',
  'Policy and interaction': '정책과 상호작용',
  'Sessions and persistence': '세션과 영속성',
  'Model and context': '모델과 컨텍스트',
  'Platform and access': '플랫폼과 접근',
  'Generated reference': '생성 참조',
}

/**
 * Korean projections of the translated contributor reference pages.
 *
 * The reference tree mirrors each English projection under `/ko/`; pages
 * without a Korean file remain available on the English site.
 */
const koreanReferencePages: DocsPage[] = [...reference, ...subsystemsReference, ...cordisPrimerReference, ...cordisTutorial]
  .filter(page => page.locale === 'en' && koreanLabels[page.source] !== undefined)
  .map((page): DocsPage => ({
    locale: 'ko',
    contentLocale: 'ko-KR',
    source: page.source.replace(/\.md$/, '.ko.md'),
    route: `ko/${page.route.replace(/^en\//, '')}`,
    label: koreanLabels[page.source] ?? page.label,
    sidebar: page.sidebar === 'en-reference' ? 'ko-reference' : 'ko-develop',
    section: koreanReferenceSections[page.section] ?? page.section,
    order: page.order,
    ...(page.outline === undefined ? {} : { outline: page.outline }),
  }))

/**
 * Sidebar collections of each locale, in the order the site's navigation
 * presents them. The navigation bar and the llms.txt index both read this
 * sequence, so a new collection lands in both surfaces together.
 */
export const localeCollections = {
  root: ['zh-guide', 'zh-develop', 'zh-reference'],
  en: ['en-guide', 'en-develop', 'en-reference'],
  ko: ['ko-guide', 'ko-develop', 'ko-reference'],
} as const satisfies Record<DocsLocale, readonly DocsSidebar[]>

/** A sidebar group, matched to pages by `label`. */
export interface DocsSection {
  /** Group heading, equal to the `section` field of every page it holds. */
  label: string
  /** Render the group collapsed until it holds the page being read. */
  collapsed?: boolean
}

/**
 * Every sidebar group, in the order its locale renders it.
 *
 * The subsystem groups collapse because together they outnumber the rest of the
 * reference sidebar; expanded, they push every other group below the fold.
 */
const sections: Record<DocsLocale, readonly DocsSection[]> = {
  root: [
    { label: '入门' }, { label: 'SDK' }, { label: '自动化' }, { label: '集成' },
    { label: '基础' }, { label: '框架能力' }, { label: '实战' }, { label: 'Cordis 框架教程' },
    { label: '概念' }, { label: '生成参考' }, { label: 'Cordis API' }, { label: '开发手册' },
    { label: '总览' },
    { label: '内核与作用域', collapsed: true },
    { label: '会话与持久化', collapsed: true },
    { label: '模型与上下文', collapsed: true },
    { label: '执行与工具', collapsed: true },
    { label: '策略与交互', collapsed: true },
    { label: '平台与接入', collapsed: true },
  ],
  en: [
    { label: 'Guide' }, { label: 'SDK' }, { label: 'Automation' }, { label: 'Integrations' },
    { label: 'Basics' }, { label: 'Framework' }, { label: 'Practice' }, { label: 'Cordis framework tutorial' },
    { label: 'Concepts' }, { label: 'Generated reference' }, { label: 'Cordis Core API' }, { label: 'Cookbook' },
    { label: 'Overview' },
    { label: 'Core and scopes', collapsed: true },
    { label: 'Sessions and persistence', collapsed: true },
    { label: 'Model and context', collapsed: true },
    { label: 'Execution and tools', collapsed: true },
    { label: 'Policy and interaction', collapsed: true },
    { label: 'Platform and access', collapsed: true },
  ],
  ko: [
    { label: '가이드' }, { label: 'SDK' }, { label: '자동화' }, { label: '통합' },
    { label: '기본' }, { label: '프레임워크' }, { label: '실전' }, { label: 'Cordis 프레임워크 튜토리얼' },
    { label: '개념' }, { label: '생성 참조' }, { label: 'Cordis 핵심 API' }, { label: '개발 매뉴얼' }, { label: '개요' },
    { label: '코어와 스코프', collapsed: true },
    { label: '세션과 영속성', collapsed: true },
    { label: '모델과 컨텍스트', collapsed: true },
    { label: '실행과 도구', collapsed: true },
    { label: '정책과 상호작용', collapsed: true },
    { label: '플랫폼과 접근', collapsed: true },
  ],
}

/**
 * Placement and collapse behavior of one sidebar group.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param label - Section label carried by the pages in the group.
 * @returns The declared group, plus its zero-based position in the locale.
 * @throws When the locale declares no placement for the label. Ranking by list
 *   membership alone would sort an undeclared group silently ahead of every
 *   declared one.
 */
export function sectionSpec(locale: DocsLocale, label: string): DocsSection & { index: number } {
  const declared = sections[locale]
  const section = declared.find(candidate => candidate.label === label)
  if (section === undefined) throw new Error(`Sidebar section "${label}" has no placement in the ${locale} locale.`)
  return { ...section, index: declared.indexOf(section) }
}

/** Every canonical page published by the documentation website. */
export const docsPages: DocsPage[] = [
  ...homeAndGuide,
  ...develop,
  ...koreanSitePages,
  ...koreanReferencePages,
  ...cordisTutorial,
  ...cordisPrimerReference,
  ...subsystemsReference,
  ...reference,
]

/**
 * Pages of one sidebar collection, in the order the sidebar lists them.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param collection - Sidebar collection to read.
 * @returns The collection's pages, ordered by section placement then by `order`.
 */
export function orderedPages(locale: DocsLocale, collection: DocsSidebar): DocsPage[] {
  return docsPages
    .filter(page => page.locale === locale && page.sidebar === collection)
    .sort((left, right) => (
      sectionSpec(locale, left.section).index - sectionSpec(locale, right.section).index
      || left.order - right.order
    ))
}

/**
 * Site-relative link for a published route.
 *
 * @param route - Manifest route, including its `.md` suffix.
 * @returns The link VitePress serves the route at.
 */
export function routeLink(route: string): string {
  return `/${route.replace(/(?:index)?\.md$/, '')}`
}

/**
 * Where a top-level navigation item lands.
 *
 * The target is derived rather than written down: a collection whose first page
 * is renamed or reordered would otherwise leave the navigation bar pointing at
 * a route the manifest no longer publishes.
 *
 * @param locale - Route tree the navigation item belongs to.
 * @param collection - Sidebar collection the item opens.
 * @returns Site-relative link of the collection's first page.
 * @throws When the collection publishes no page.
 */
export function landingLink(locale: DocsLocale, collection: DocsSidebar): string {
  const first = orderedPages(locale, collection)[0]
  if (first === undefined) throw new Error(`Sidebar collection "${collection}" publishes no page.`)
  return routeLink(first.route)
}
