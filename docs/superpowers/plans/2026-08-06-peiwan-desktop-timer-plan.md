# 陪玩小工具桌面端实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在独立工作区 `/Users/cinitswift/WebstormProjects/pw-tool` 中构建一款完全离线、跨 macOS/Windows 的 Electron 陪玩计时计费工具。

**Architecture:** Electron 主进程独占 SQLite 和会话状态转换；Preload 只暴露类型安全的最小 IPC API；React 渲染层负责主窗口、迷你窗和编辑器。计费、时间片段校验和状态转换均为独立纯函数，主进程和测试共享同一领域层，运行中显示基于持久化时间戳计算而不是定时器累加。

**Tech Stack:** Electron、React、TypeScript、Vite、electron-vite、better-sqlite3、electron-builder、Vitest、Playwright。

---

## 实现前约定

- 所有命令均在 `/Users/cinitswift/WebstormProjects/pw-tool` 执行。
- 不修改 `/Users/cinitswift/WebstormProjects/mp_b`。
- 代码、测试、配置和提交说明使用 ASCII；用户可见中文文案按规格实现。
- 采用 TDD：每个领域任务先写失败测试，再写最小实现。
- 所有数据库写入只能通过 Electron 主进程完成。
- 金额以整数分持久化；展示层再格式化为两位小数。
- 数据库时间以 UTC Unix 毫秒持久化；领域函数接收毫秒数；界面负责本地时区格式化。
- 主窗口默认 `720 × 620`，最小 `680 × 560`；迷你窗参考 `280 × 160`。
- 当前设计规格：`docs/superpowers/specs/2026-08-06-peiwan-desktop-timer-design.md`。

## 文件结构

首轮计划创建以下边界清晰的文件：

- `package.json`、`tsconfig*.json`、`vite.config.ts`、`electron.vite.config.ts`：项目脚本与构建配置。
- `src/shared/domain/types.ts`：跨进程共享的领域类型。
- `src/shared/domain/billing.ts`：三档计费与金额纯函数。
- `src/shared/domain/time-segments.ts`：有效时长和片段合法性纯函数。
- `src/shared/domain/session-machine.ts`：会话状态转换纯函数。
- `src/shared/domain/formatters.ts`：金额、时长、时间和 CSV 字段格式化。
- `src/main/db/schema.ts`、`src/main/db/database.ts`、`src/main/db/repositories.ts`：SQLite schema、迁移和仓储。
- `src/main/ipc/channels.ts`、`src/main/ipc/register-ipc.ts`：IPC 通道与主进程处理器。
- `src/main/windows/main-window.ts`、`src/main/windows/mini-window.ts`、`src/main/tray.ts`：窗口和托盘生命周期。
- `src/main/index.ts`：单实例、数据库初始化和应用启动编排。
- `src/preload/index.ts`、`src/preload/api.ts`：安全桥接和渲染层 API 类型。
- `src/renderer/App.tsx`、`src/renderer/main.tsx`、`src/renderer/styles/*.css`：React 应用入口与深色低干扰视觉系统。
- `src/renderer/features/timer/*`：空闲、运行、暂停、完成、恢复弹窗和备注/参数交互。
- `src/renderer/features/history/*`：历史列表、筛选、删除、导出和时间编辑器。
- `src/renderer/features/settings/*`：默认参数与迷你窗设置。
- `tests/unit/domain/*.test.ts`、`tests/unit/db/*.test.ts`、`tests/unit/ipc/*.test.ts`：单元测试。
- `tests/e2e/*.spec.ts`：Electron 端到端测试。
- `.github/workflows/build.yml`：GitHub Actions 分平台构建。

---

### Task 1: 初始化 Electron 项目骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `electron.vite.config.ts`
- Create: `vite.config.ts`
- Create: `playwright.config.ts`
- Create: `tests/setup.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles/reset.css`
- Create: `src/renderer/styles/tokens.css`
- Create: `tests/smoke/app-launch.spec.ts`

- [ ] **Step 1: 初始化依赖和测试 runner**

运行：

```bash
npm init -y
npm install react react-dom
npm install -D electron electron-vite vite typescript @types/node @types/react @types/react-dom vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test playwright electron-builder
```

创建 `playwright.config.ts`，让 `testDir` 指向 `tests`，并设置 `testMatch: ['smoke/**/*.spec.ts', 'e2e/**/*.spec.ts']`。在 `vite.config.ts` 的 Vitest 配置中设置 `include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/build/**/*.test.ts']`、`environment: 'jsdom'` 和 `setupFiles: ['./tests/setup.ts']`；`tests/setup.ts` 导入 `@testing-library/jest-dom/vitest`。

- [ ] **Step 2: 写应用启动失败测试**

创建 `tests/smoke/app-launch.spec.ts`，先固定 Electron 启动契约：应用必须创建一个窗口、加载 React 根节点、关闭后退出。

```ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('launches the desktop shell', async () => {
  const app = await electron.launch({ args: ['.'] });
  const page = await app.firstWindow();

  await expect(page.locator('[data-testid="app-root"]')).toBeVisible();
  await expect(page).toHaveTitle('陪玩小工具');

  await app.close();
});
```

- [ ] **Step 3: 运行失败测试**

运行：`npm run test:e2e -- tests/smoke/app-launch.spec.ts`

预期：失败，因为项目尚未有 `package.json`、Electron 入口和 `data-testid="app-root"`。

- [ ] **Step 4: 创建最小项目配置和启动壳**

`package.json` 至少包含以下脚本和构建目标：

```json
{
  "name": "pw-tool",
  "productName": "陪玩小工具",
  "private": true,
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "package:mac": "npm run build && electron-builder --mac dmg",
    "package:win": "npm run build && electron-builder --win nsis"
  },
  "build": {
    "appId": "com.pwtool.desktop",
    "productName": "陪玩小工具",
    "files": ["out/**/*"],
    "mac": { "target": ["dmg"] },
    "win": { "target": ["nsis"] }
  }
}
```

`src/main/index.ts` 使用 `app.requestSingleInstanceLock()`，在 `ready` 后创建窗口；`src/preload/index.ts` 先只暴露版本信息；`src/renderer/App.tsx` 返回带 `data-testid="app-root"` 的空闲占位页面。窗口配置必须包含：

```ts
webPreferences: {
  preload: join(__dirname, '../preload/index.js'),
  contextIsolation: true,
  nodeIntegration: false,
}
```

- [ ] **Step 5: 运行启动测试和类型检查**

运行：

- `npm run test:e2e -- tests/smoke/app-launch.spec.ts`
- `npm run typecheck`

预期：启动测试通过，类型检查退出码为 `0`。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json electron.vite.config.ts vite.config.ts playwright.config.ts tests/setup.ts src tests/smoke
git commit -m "build: scaffold electron desktop app"
```

### Task 2: 建立共享领域类型与三档计费引擎

**Files:**
- Create: `src/shared/domain/types.ts`
- Create: `src/shared/domain/billing.ts`
- Create: `tests/unit/domain/billing.test.ts`
- Modify: `package.json` only if Vitest config needs explicit include patterns

- [ ] **Step 1: 写计费失败测试**

测试必须覆盖规格中的取整、三种档位、金额、非法输入和跨小时边界：

```ts
import { describe, expect, it } from 'vitest';
import { calculateSessionFee, calculateCommission, roundUpEffectiveMinutes } from '../../../src/shared/domain/billing';

describe('billing', () => {
  it.each([[0, 0], [1, 1], [59, 1], [60, 1], [61, 2]])(
    'rounds %i seconds to %i effective minutes', (seconds, expected) => {
      expect(roundUpEffectiveMinutes(seconds)).toBe(expected);
    },
  );

  it.each([
    [10, '15-step', 0],
    [11, '15-step', 15],
    [20, '15-step', 15],
    [21, '15-step', 30],
    [40, '15-step', 30],
    [41, '15-step', 45],
    [50, '15-step', 45],
    [51, '15-step', 60],
    [75, '15-step', 75],
    [14, '15-floor', 0],
    [15, '15-floor', 15],
    [29, '15-floor', 15],
    [30, '15-floor', 30],
    [16, 'minute', 16],
  ])('calculates billed minutes for %i minutes in %s mode', (minutes, mode, billedMinutes) => {
    expect(calculateSessionFee({ effectiveMinutes: minutes, hourlyRateYuan: 40, billingMode: mode as never }).billedMinutes).toBe(billedMinutes);
  });

  it('calculates commission from billed minutes', () => {
    expect(calculateCommission({ billedMinutes: 90, hourlyCommissionYuan: 3 })).toBe(450);
  });

  it('rejects non-positive integer rates and unsupported modes', () => {
    expect(() => calculateSessionFee({ effectiveMinutes: 1, hourlyRateYuan: 0, billingMode: 'minute' })).toThrow();
    expect(() => calculateSessionFee({ effectiveMinutes: 1, hourlyRateYuan: 40, billingMode: 'unknown' as never })).toThrow();
  });
});
```

返回金额统一使用整数分，例如 `450` 表示 `¥4.50`。

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/domain/billing.test.ts`

预期：失败，因为领域类型和计费函数尚未创建。

- [ ] **Step 3: 实现类型和计费函数**

在 `types.ts` 定义：

```ts
export type BillingMode = '15-step' | '15-floor' | 'minute';
export type SessionStatus = 'running' | 'paused' | 'completed' | 'invalid';
export interface BillingSettings {
  billingMode: BillingMode;
  hourlyRateYuan: number;
  hourlyCommissionYuan: number;
}
export interface FeeResult {
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
}
```

在 `billing.ts` 实现：

- `roundUpEffectiveMinutes(effectiveSeconds: number): number`
- `getBilledMinutes(effectiveMinutes: number, billingMode: BillingMode): number`
- `calculateSessionFee(input: { effectiveMinutes: number; hourlyRateYuan: number; billingMode: BillingMode }): Pick<FeeResult, 'billedMinutes' | 'grossAmountCents'>`
- `calculateCommission(input: { billedMinutes: number; hourlyCommissionYuan: number }): number`
- `calculateFeeResult(input: { effectiveSeconds: number; settings: BillingSettings }): FeeResult`

金额计算使用整数算术：`Math.round(billedMinutes * hourlyRateYuan * 100 / 60)`，不在中间步骤转浮点金额。

- [ ] **Step 4: 运行计费测试和类型检查**

运行：

- `npm test -- --run tests/unit/domain/billing.test.ts`
- `npm run typecheck`

预期：全部计费测试通过，类型检查退出码为 `0`。

- [ ] **Step 5: 提交**

```bash
git add src/shared/domain/types.ts src/shared/domain/billing.ts tests/unit/domain/billing.test.ts
git commit -m "feat(domain): add billing engine"
```

### Task 3: 实现时间片段模型与双层合法性校验

**Files:**
- Modify: `src/shared/domain/types.ts`
- Create: `src/shared/domain/time-segments.ts`
- Create: `tests/unit/domain/time-segments.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { calculateEffectiveSeconds, validateSegments } from '../../../src/shared/domain/time-segments';

const segment = (startedAt: number, endedAt: number | null) => ({ startedAt, endedAt });

describe('time segments', () => {
  it('sums all closed segments before rounding', () => {
    expect(calculateEffectiveSeconds([
      segment(0, 630),
      segment(1050, 1360),
    ])).toBe(940);
  });

  it('allows a zero-second pause between adjacent segments', () => {
    expect(validateSegments({ status: 'paused', segments: [segment(0, 60), segment(60, 120)] }, 120)).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ['zero-length segment', { status: 'completed', segments: [segment(60, 60)] }],
    ['overlap', { status: 'completed', segments: [segment(0, 100), segment(90, 120)] }],
    ['open non-final segment', { status: 'running', segments: [segment(0, null), segment(100, 200)] }],
    ['future time', { status: 'completed', segments: [segment(0, 121)] }],
  ])('rejects %s', (_name, input) => {
    expect(validateSegments(input as never, 120).valid).toBe(false);
  });
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/domain/time-segments.test.ts`

预期：失败，因为片段计算和校验函数尚未实现。

- [ ] **Step 3: 实现校验器**

定义：

```ts
export interface TimeSegment {
  id?: string;
  sequence?: number;
  startedAt: number;
  endedAt: number | null;
}

export interface SegmentValidationError {
  code: 'invalid-date' | 'zero-duration' | 'overlap' | 'open-segment' | 'future-time' | 'too-many-segments';
  segmentIndex: number;
  field?: 'startedAt' | 'endedAt';
  message: string;
}

export function calculateEffectiveSeconds(segments: TimeSegment[]): number;
export function validateSegments(input: { status: SessionStatus; segments: TimeSegment[] }, nowMs: number): { valid: boolean; errors: SegmentValidationError[] };
```

规则实现必须明确：

- 每个片段自身 `endedAt > startedAt`。
- 相邻片段允许 `next.startedAt === previous.endedAt`。
- 只有 `running` 的最后片段可为 `endedAt: null`。
- `paused` 和 `completed` 不能有开放片段。
- 所有非空节点 `<= nowMs`。
- 片段数量 `<= 1000`。
- `calculateEffectiveSeconds` 只接受闭合片段，返回整数秒；开放片段由运行时快照先用 `nowMs` 计算，不直接写入完成结果。

- [ ] **Step 4: 运行时间校验测试**

运行：`npm test -- --run tests/unit/domain/time-segments.test.ts`

预期：所有正常、同秒暂停、零时长、重叠、开放片段和未来时间测试通过。

- [ ] **Step 5: 提交**

```bash
git add src/shared/domain/types.ts src/shared/domain/time-segments.ts tests/unit/domain/time-segments.test.ts
git commit -m "feat(domain): validate timer segments"
```

### Task 4: 实现会话状态机和运行时快照

**Files:**
- Modify: `src/shared/domain/types.ts`
- Create: `src/shared/domain/session-machine.ts`
- Create: `src/shared/domain/runtime-snapshot.ts`
- Create: `tests/unit/domain/session-machine.test.ts`
- Create: `tests/unit/domain/runtime-snapshot.test.ts`
- Create: `tests/fixtures/domain.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { startSession, pauseSession, resumeSession, completeSession, invalidateSession } from '../../../src/shared/domain/session-machine';

const settings = { billingMode: '15-step' as const, hourlyRateYuan: 40, hourlyCommissionYuan: 3 };

it('starts one running segment at the supplied timestamp', () => {
  const result = startSession({ id: 's1', nowMs: 1_000, settings });
  expect(result.status).toBe('running');
  expect(result.segments).toEqual([{ sequence: 0, startedAt: 1_000, endedAt: null }]);
});

it('pauses, resumes and completes without timer accumulation', () => {
  const running = startSession({ id: 's1', nowMs: 0, settings });
  const paused = pauseSession(running, 60_000);
  const resumed = resumeSession(paused, 60_000);
  const completed = completeSession(resumed, 120_000);
  expect(completed.status).toBe('completed');
  expect(completed.segments).toHaveLength(2);
});

it('invalidates a recovered session and preserves the reason', () => {
  const running = startSession({ id: 's1', nowMs: 0, settings });
  const invalid = invalidateSession(running, { nowMs: 120_000, reason: 'restart-discard' });
  expect(invalid.status).toBe('invalid');
  expect(invalid.invalidReason).toBe('restart-discard');
  expect(invalid.grossAmountCents).toBe(0);
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/domain/session-machine.test.ts tests/unit/domain/runtime-snapshot.test.ts`

预期：失败，因为状态转换和快照函数尚未实现。

- [ ] **Step 3: 实现状态转换**

在 `session-machine.ts` 定义：

```ts
export type InvalidReason = 'restart-discard' | 'restart-new-session';

export interface Session {
  id: string;
  status: SessionStatus;
  settings: BillingSettings;
  note: string;
  segments: TimeSegment[];
  invalidReason?: InvalidReason;
  invalidatedAt?: number;
  fee: FeeResult;
}

export function startSession(input: { id: string; nowMs: number; settings: BillingSettings }): Session;
export function pauseSession(session: Session, nowMs: number): Session;
export function resumeSession(session: Session, nowMs: number): Session;
export function completeSession(session: Session, nowMs: number): Session;
export function invalidateSession(session: Session, input: { nowMs: number; reason: InvalidReason }): Session;
export function updateSessionSettings(session: Session, settings: BillingSettings, nowMs: number): Session;
export function updateSessionNote(session: Session, note: string): Session;
export function editSessionSegments(session: Session, segments: TimeSegment[], nowMs: number): Session;
```

状态函数必须拒绝非法状态转换，例如对 `paused` 再暂停、对 `completed` 继续、对 `invalid` 编辑。`pauseSession` 在 running 状态闭合最后片段；`resumeSession` 在 paused 状态追加开放片段；`completeSession` 从 running 闭合最后片段，从 paused 直接完成。每次成功写操作都重新计算 `fee`。

- [ ] **Step 4: 实现运行时快照**

在 `runtime-snapshot.ts` 定义：

```ts
export interface RuntimeSnapshot {
  status: SessionStatus | 'idle';
  effectiveSeconds: number;
  effectiveMinutes: number;
  billedMinutes: number;
  grossAmountCents: number;
  commissionAmountCents: number;
  currentSegmentIndex: number | null;
}

export function getRuntimeSnapshot(session: Session | null, nowMs: number): RuntimeSnapshot;
```

同时在 `types.ts` 固定后续主进程、IPC 和界面共用的类型：

```ts
export interface AppSettings extends BillingSettings {
  miniAlwaysOnTop: boolean;
  mainWindowBounds?: { x: number; y: number; width: number; height: number };
}

export interface SessionSnapshot {
  session: Session | null;
  runtime: RuntimeSnapshot;
  recoveryRequired: boolean;
  error?: { code: string; message: string; fieldErrors?: SegmentValidationError[] };
}

export type RecoveryChoice = 'restore' | 'restart-new-session' | 'discard';
export interface RecoveryResult {
  invalidatedSession?: Session;
  newSession?: Session;
  snapshot: SessionSnapshot;
}

export interface HistoryQuery {
  query?: string;
  status?: 'all' | 'completed' | 'invalid';
  from?: number;
  to?: number;
}
```

创建 `tests/fixtures/domain.ts`，导出后续测试共用的实际构造器：

```ts
export const defaultSettings: BillingSettings;
export function buildSession(overrides?: Partial<Session>): Session;
export function buildSnapshot(overrides?: Partial<SessionSnapshot>): SessionSnapshot;
export const idleSnapshot: SessionSnapshot;
export const runningSnapshot: SessionSnapshot;
export const pausedSnapshot: SessionSnapshot;
export const completedRecord: Session;
export const invalidRecord: Session;
```

运行中最后开放片段使用 `nowMs` 计算；暂停、完成和无效记录使用持久化闭合片段；如果 `nowMs` 小于开放片段开始时间，返回 `clock-skew` 错误状态而不是负金额。

- [ ] **Step 5: 运行状态机和快照测试**

运行：

- `npm test -- --run tests/unit/domain/session-machine.test.ts`
- `npm test -- --run tests/unit/domain/runtime-snapshot.test.ts`
- `npm run typecheck`

预期：合法转换、非法转换、恢复、无效化和时钟倒退测试全部通过。

- [ ] **Step 6: 提交**

```bash
git add src/shared/domain/types.ts src/shared/domain/session-machine.ts src/shared/domain/runtime-snapshot.ts tests/fixtures/domain.ts tests/unit/domain/session-machine.test.ts tests/unit/domain/runtime-snapshot.test.ts
git commit -m "feat(domain): add session state machine"
```

### Task 5: 建立 SQLite schema、迁移和仓储

**Files:**
- Create: `src/main/db/schema.ts`
- Create: `src/main/db/database.ts`
- Create: `src/main/db/repositories.ts`
- Create: `src/main/db/migrations/001-initial.sql`
- Create: `tests/unit/db/database.test.ts`
- Create: `tests/unit/db/repositories.test.ts`
- Modify: `package.json` to add `better-sqlite3` and test setup

- [ ] **Step 1: 写数据库失败测试**

测试使用临时 SQLite 文件或 `:memory:` 数据库，验证 schema、默认设置、活动会话唯一性和事务回滚：

```ts
import { describe, expect, it } from 'vitest';
import { createDatabase } from '../../../src/main/db/database';
import { SessionRepository } from '../../../src/main/db/repositories';
import { buildSession } from '../../fixtures/domain';

it('creates the schema and default settings', () => {
  const db = createDatabase(':memory:');
  expect(db.prepare('select version from schema_version').get()).toEqual({ version: 1 });
  expect(db.prepare('select value from app_settings where key = ?').get('hourlyRateYuan')).toEqual({ value: '40' });
});

it('persists a session and its segments in one transaction', () => {
  const db = createDatabase(':memory:');
  const repo = new SessionRepository(db);
  repo.insertSession({ id: 's1', status: 'running', settings: { billingMode: '15-step', hourlyRateYuan: 40, hourlyCommissionYuan: 3 }, note: '', fee: { effectiveMinutes: 0, billedMinutes: 0, grossAmountCents: 0, commissionAmountCents: 0 }, segments: [{ sequence: 0, startedAt: 1000, endedAt: null }] });
  expect(repo.findById('s1')?.segments).toHaveLength(1);
});

it('rolls back a failed session write', () => {
  const db = createDatabase(':memory:');
  const repo = new SessionRepository(db);
  expect(() => repo.transaction(() => { repo.insertSession(buildSession({ id: 's1' })); throw new Error('boom'); })).toThrow('boom');
  expect(repo.findById('s1')).toBeNull();
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/db/database.test.ts tests/unit/db/repositories.test.ts`

预期：失败，因为 schema、数据库初始化和仓储尚未创建。

- [ ] **Step 3: 实现初始 schema 和迁移**

`001-initial.sql` 创建：

- `schema_version(version INTEGER NOT NULL)`。
- `sessions`，金额字段使用 `INTEGER` 分，时间字段使用 `INTEGER` 毫秒。
- `time_segments`，`session_id + sequence` 唯一，`ON DELETE CASCADE`。
- `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)`。
- 活动会话唯一索引：`CREATE UNIQUE INDEX one_active_session ON sessions(status) WHERE status IN ('running', 'paused')`。

默认设置写入：

```sql
INSERT INTO app_settings(key, value) VALUES
  ('billingMode', '15-step'),
  ('hourlyRateYuan', '40'),
  ('hourlyCommissionYuan', '3'),
  ('miniAlwaysOnTop', 'false');
```

- [ ] **Step 4: 实现 database 和仓储**

`createDatabase(filename: string)` 必须：开启外键、执行版本迁移、失败时不删除原数据库；测试环境支持 `:memory:`。

`SessionRepository` 至少实现：

```ts
insertSession(session: Session): void;
updateSession(session: Session): void;
findById(id: string): Session | null;
findActive(): Session | null;
list(input: { query?: string; status?: SessionStatus; from?: number; to?: number }): Session[];
delete(id: string): void;
getSettings(): AppSettings;
saveSettings(settings: AppSettings): void;
transaction<T>(work: () => T): T;
```

读写必须把数据库行映射为领域 `Session`，不能让 React 依赖 SQL 行结构。

- [ ] **Step 5: 运行数据库测试**

运行：

- `npm test -- --run tests/unit/db/database.test.ts tests/unit/db/repositories.test.ts`
- `npm run typecheck`

预期：schema、默认设置、事务回滚、活动会话唯一性、搜索和状态筛选通过。

- [ ] **Step 6: 提交**

```bash
git add package.json package-lock.json src/main/db tests/unit/db
git commit -m "feat(db): add sqlite persistence"
```

### Task 6: 实现主进程会话服务、IPC 和 Preload API

**Files:**
- Create: `src/main/services/session-service.ts`
- Create: `src/main/services/settings-service.ts`
- Create: `src/main/services/export-service.ts`
- Create: `src/main/ipc/channels.ts`
- Create: `src/main/ipc/register-ipc.ts`
- Modify: `src/preload/api.ts`
- Modify: `src/preload/index.ts`
- Create: `tests/unit/ipc/session-service.test.ts`
- Create: `tests/unit/ipc/preload-api.test.ts`
- Create: `tests/fixtures/in-memory-repository.ts`

- [ ] **Step 1: 写服务层失败测试**

```ts
import { createInMemoryRepository } from '../../fixtures/in-memory-repository';

it('starts, pauses, resumes and completes one session through the service', () => {
  const service = createSessionService(createInMemoryRepository(), () => 1_000);
  const started = service.start();
  expect(started.status).toBe('running');
  expect(service.pause().status).toBe('paused');
  expect(service.resume().status).toBe('running');
  expect(service.complete().status).toBe('completed');
});

it('rejects a second active session', () => {
  const service = createSessionService(createInMemoryRepository(), () => 1_000);
  service.start();
  expect(() => service.start()).toThrow('active session already exists');
});

it('invalidates and optionally starts a new session during recovery', () => {
  const repo = createInMemoryRepository();
  const service = createSessionService(repo, () => 2_000);
  service.start();
  const result = service.handleRecovery('restart-new-session');
  expect(result.invalidatedSession.status).toBe('invalid');
  expect(result.newSession?.status).toBe('running');
});
```

`tests/fixtures/in-memory-repository.ts` 实现服务层依赖的仓储接口：`findById`、`findActive`、`insertSession`、`updateSession`、`list`、`delete`、`getSettings`、`saveSettings` 和具有回滚语义的 `transaction`。它只用于单元测试，不进入生产 bundle。

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/ipc/session-service.test.ts tests/unit/ipc/preload-api.test.ts`

预期：失败，因为服务、IPC 通道和 preload API 尚未实现。

- [ ] **Step 3: 实现服务层**

`SessionService` 负责把领域纯函数和仓储事务组合起来，至少提供：

```ts
interface SessionService {
  getSnapshot(): SessionSnapshot;
  start(): SessionSnapshot;
  pause(): SessionSnapshot;
  resume(): SessionSnapshot;
  complete(): SessionSnapshot;
  updateSettings(settings: BillingSettings): SessionSnapshot;
  updateNote(note: string): SessionSnapshot;
  editSegments(segments: TimeSegment[]): SessionSnapshot;
  handleRecovery(choice: 'restore' | 'restart-new-session' | 'discard'): RecoveryResult;
}
```

每个写操作使用 `repository.transaction`，调用领域状态转换后保存整个 session 和 segments，并返回主进程权威快照。`getSnapshot` 运行时计算当前显示值，不把每秒变化写回数据库。

- [ ] **Step 4: 定义最小 IPC 通道**

`channels.ts` 固定以下通道：

```ts
export const IPC = {
  sessionSnapshot: 'session:snapshot',
  sessionStart: 'session:start',
  sessionPause: 'session:pause',
  sessionResume: 'session:resume',
  sessionComplete: 'session:complete',
  sessionUpdateSettings: 'session:update-settings',
  sessionUpdateNote: 'session:update-note',
  sessionEditSegments: 'session:edit-segments',
  sessionRecovery: 'session:recovery',
  historyList: 'history:list',
  historyDelete: 'history:delete',
  historyExportCsv: 'history:export-csv',
  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  windowShowMain: 'window:show-main',
  windowShowMini: 'window:show-mini',
  windowSetAlwaysOnTop: 'window:set-always-on-top',
} as const;
```

所有渲染层可调用操作使用 `ipcRenderer.invoke`，实时快照使用 `ipcRenderer.on`；不暴露通用 `send(channel, payload)`。

- [ ] **Step 5: 实现 preload 类型 API**

`src/preload/api.ts` 暴露：

```ts
export interface PwToolApi {
  session: {
    getSnapshot(): Promise<SessionSnapshot>;
    start(): Promise<SessionSnapshot>;
    pause(): Promise<SessionSnapshot>;
    resume(): Promise<SessionSnapshot>;
    complete(): Promise<SessionSnapshot>;
    updateSettings(settings: BillingSettings): Promise<SessionSnapshot>;
    updateNote(note: string): Promise<SessionSnapshot>;
    editSegments(segments: TimeSegment[]): Promise<SessionSnapshot>;
    recover(choice: RecoveryChoice): Promise<RecoveryResult>;
    subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;
  };
  history: {
    list(input: HistoryQuery): Promise<Session[]>;
    delete(id: string): Promise<void>;
    exportCsv(input: HistoryQuery): Promise<{ filePath: string; rowCount: number }>;
  };
  settings: { get(): Promise<AppSettings>; save(settings: AppSettings): Promise<AppSettings> };
  window: { showMain(): Promise<void>; showMini(): Promise<void>; setAlwaysOnTop(value: boolean): Promise<boolean> };
}
```

使用 `contextBridge.exposeInMainWorld('pwTool', api)`，并在 `src/renderer/env.d.ts` 声明 `window.pwTool`。

- [ ] **Step 6: 运行 IPC 测试**

运行：

- `npm test -- --run tests/unit/ipc/session-service.test.ts tests/unit/ipc/preload-api.test.ts`
- `npm run typecheck`

预期：服务状态转换、单活动会话约束、恢复分支和 API 白名单测试通过。

- [ ] **Step 7: 提交**

```bash
git add src/main/services src/main/ipc src/preload tests/fixtures/in-memory-repository.ts tests/unit/ipc
git commit -m "feat(ipc): expose session service"
```

### Task 7: 实现 Electron 主窗口、迷你窗、托盘和单实例

**Files:**
- Create: `src/main/windows/main-window.ts`
- Create: `src/main/windows/mini-window.ts`
- Create: `src/main/tray.ts`
- Modify: `src/main/index.ts`
- Create: `tests/unit/main/window-manager.test.ts`
- Create: `tests/e2e/window-and-tray.spec.ts`
- Create: `tests/fixtures/electron-app.ts`

- [ ] **Step 1: 写窗口行为失败测试**

单元测试使用 mock BrowserWindow 验证尺寸和行为；E2E 测试验证关闭主窗口后窗口隐藏而不是退出：

```ts
import { launchElectronApp } from '../fixtures/electron-app';

test('hides the main window to tray and restores it', async () => {
  const { app, page, showMainWindow } = await launchElectronApp();
  await page.getByRole('button', { name: '关闭窗口' }).click();
  await expect(page).toBeHidden();
  await showMainWindow();
  await expect(page).toBeVisible();
  await app.close();
});
```

`tests/fixtures/electron-app.ts` 使用 Playwright `_electron.launch`，每次测试创建独立临时 `userData` 目录，并返回 `app`、`page`、`userDataDir` 和 `showMainWindow()`。`showMainWindow()` 通过 `app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())` 恢复窗口。托盘菜单模板和退出回调由 `window-manager.test.ts` 单元测试，不尝试用 Playwright 点击操作系统托盘 UI。

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/main/window-manager.test.ts`。

预期：失败，因为窗口管理器和托盘尚未创建。

- [ ] **Step 3: 实现主窗口**

主窗口配置固定：

```ts
const MAIN_WINDOW = { width: 720, height: 620, minWidth: 680, minHeight: 560 };
```

实现：

- 读取并校验上次位置，超出所有显示器可见区域时回到默认居中。
- 开发环境加载 Vite URL，生产环境加载打包后的 `index.html`。
- 关闭事件 `event.preventDefault(); window.hide()`，由托盘退出菜单设置 `isQuitting = true` 后允许销毁。
- 禁止页面打开外部新窗口；外部链接不在首版 UI 中生成。

- [ ] **Step 4: 实现迷你窗**

迷你窗配置：

```ts
const MINI_WINDOW = { width: 280, height: 160, minWidth: 260, minHeight: 140, frame: false, resizable: false };
```

实现 `showMiniWindow()`、`showMainWindow()`、`setMiniAlwaysOnTop(value)`；置顶状态写入 `app_settings`，不自动检测其他应用全屏。

- [ ] **Step 5: 实现托盘与单实例**

- 主进程启动时获取单实例锁。
- 第二次启动通过 `second-instance` 聚焦主窗口；若恢复弹窗打开则聚焦恢复弹窗。
- 托盘菜单包含“显示窗口”“显示迷你窗”“退出应用”。
- 退出菜单设置 `isQuitting`，先关闭托盘，再调用 `app.quit()`。

- [ ] **Step 6: 运行窗口 E2E**

运行：

- `npm test -- --run tests/unit/main/window-manager.test.ts`
- `npm run test:e2e -- tests/e2e/window-and-tray.spec.ts`

预期：主窗口尺寸、关闭到托盘、托盘恢复、迷你窗显示、手动置顶和单实例聚焦通过。

- [ ] **Step 7: 提交**

```bash
git add src/main/windows src/main/tray.ts src/main/index.ts tests/fixtures/electron-app.ts tests/unit/main tests/e2e/window-and-tray.spec.ts
git commit -m "feat(desktop): add windows and tray workflow"
```

### Task 8: 实现 React 计时页、状态页和恢复弹窗

**Files:**
- Modify: `src/renderer/App.tsx`
- Create: `src/renderer/app-state.ts`
- Create: `src/renderer/features/timer/TimerPage.tsx`
- Create: `src/renderer/features/timer/IdleState.tsx`
- Create: `src/renderer/features/timer/RunningState.tsx`
- Create: `src/renderer/features/timer/PausedState.tsx`
- Create: `src/renderer/features/timer/CompletedState.tsx`
- Create: `src/renderer/features/timer/RecoveryDialog.tsx`
- Create: `src/renderer/features/timer/NoteDialog.tsx`
- Create: `src/renderer/features/timer/BillingSettingsPopover.tsx`
- Create: `src/renderer/features/timer/timer.css`
- Create: `tests/unit/renderer/timer-page.test.tsx`
- Create: `tests/unit/renderer/recovery-dialog.test.tsx`

- [ ] **Step 1: 写渲染层失败测试**

```tsx
import { idleSnapshot, pausedSnapshot, runningSnapshot } from '../../fixtures/domain';

it('shows start as the only primary action when idle', () => {
  render(<TimerPage snapshot={idleSnapshot} />);
  expect(screen.getByRole('button', { name: '开始计时' })).toBeVisible();
  expect(screen.queryByText('今日收入')).not.toBeInTheDocument();
});

it('shows continue as the primary action when paused', () => {
  render(<TimerPage snapshot={pausedSnapshot} />);
  expect(screen.getByRole('button', { name: '继续计时' })).toHaveClass('primary');
  expect(screen.getByText('计时已暂停')).toBeVisible();
});

it('requires an explicit recovery choice', async () => {
  render(<RecoveryDialog session={runningSnapshot} onChoose={vi.fn()} />);
  expect(screen.getByRole('button', { name: '恢复计时' })).toBeVisible();
  expect(screen.getByText(/旧记录标记无效/)).toBeVisible();
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/renderer/timer-page.test.tsx tests/unit/renderer/recovery-dialog.test.tsx`

预期：失败，因为 React 状态页尚未创建。

- [ ] **Step 3: 实现应用状态与计时页**

`app-state.ts` 负责：

- 启动时调用 `window.pwTool.session.getSnapshot()`。
- 订阅快照并通过 `useSyncExternalStore` 或等价订阅方式更新。
- 每秒只更新时间戳派生的显示快照，不每秒调用 IPC 写入。
- 导航状态只允许 `timer | history | settings`。

计时页按规格渲染：状态、有效时长、当前应得、当前抽成、备注摘要、本局参数、调整时间、编辑备注、暂停/继续、结束本局。不得添加今日局数、今日收入或统计卡片。

- [ ] **Step 4: 实现状态组件和操作回调**

按钮回调必须直接调用 preload API：

```tsx
<button onClick={() => void api.session.start()}>开始计时</button>
<button onClick={() => void api.session.pause()}>暂停计时</button>
<button onClick={() => void api.session.resume()}>继续计时</button>
<button onClick={() => void api.session.complete()}>结束本局</button>
```

所有异步写操作提供 pending 状态，失败时保留当前页面并显示错误提示；不能在渲染层自行伪造成功快照。

- [ ] **Step 5: 实现备注和本局参数弹窗**

- 备注弹窗限制 500 Unicode 字符，保存前 trim，空字符串表示清空备注。
- 计时中参数弹窗校验正整数和三个计费方式，保存后调用 `updateSettings`。
- 空闲设置修改调用 `settings.save`，不创建 session。
- 弹窗支持键盘 Escape 关闭、Enter 提交、明显焦点状态和未保存关闭确认。

- [ ] **Step 6: 实现恢复弹窗**

启动发现活动 session 时阻止进入正常计时页，显示三个选择：

- `恢复计时`：调用 `recover('restore')`。
- `重新计时`：调用 `recover('restart-new-session')`，旁边说明旧记录永久无效。
- `不恢复`：调用 `recover('discard')`，旁边说明不创建新会话。

- [ ] **Step 7: 运行渲染层测试和类型检查**

运行：

- `npm test -- --run tests/unit/renderer/timer-page.test.tsx tests/unit/renderer/recovery-dialog.test.tsx`
- `npm run typecheck`

预期：状态按钮、无统计约束、参数/备注弹窗和恢复三选项测试通过。

- [ ] **Step 8: 提交**

```bash
git add src/renderer/App.tsx src/renderer/app-state.ts src/renderer/features/timer tests/unit/renderer
git commit -m "feat(ui): add timer workflow"
```

### Task 9: 实现历史列表、时间编辑器、删除和 CSV 导出

**Files:**
- Create: `src/renderer/features/history/HistoryPage.tsx`
- Create: `src/renderer/features/history/HistoryFilters.tsx`
- Create: `src/renderer/features/history/HistoryRecord.tsx`
- Create: `src/renderer/features/history/TimeSegmentEditor.tsx`
- Create: `src/renderer/features/history/history.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/services/export-service.ts`
- Create: `tests/unit/renderer/history-page.test.tsx`
- Create: `tests/unit/renderer/time-segment-editor.test.tsx`
- Create: `tests/unit/domain/csv.test.ts`
- Create: `src/shared/domain/csv.ts`

- [ ] **Step 1: 写历史和编辑器失败测试**

```tsx
import { buildSession, completedRecord, invalidRecord } from '../../fixtures/domain';

it('lists records by local date and marks invalid records', async () => {
  render(<HistoryPage records={[completedRecord, invalidRecord]} />);
  expect(screen.getByText('历史记录')).toBeVisible();
  expect(screen.getByText('无效')).toBeVisible();
  expect(screen.getByText('¥0.00')).toBeVisible();
});

it('shows field-level validation and disables save', () => {
  const invalidEditedSession = buildSession({
    status: 'completed',
    segments: [{ sequence: 0, startedAt: 2_000, endedAt: 1_000 }],
  });
  render(<TimeSegmentEditor session={invalidEditedSession} />);
  expect(screen.getByText('结束时间必须晚于本段继续时间。')).toBeVisible();
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
});
```

CSV 测试：

```ts
import { buildSession } from '../../fixtures/domain';

it('escapes commas, quotes, newlines and adds UTF-8 BOM', () => {
  const csv = serializeSessions([buildSession({ note: '老板, 小北\n"排位"' })], 'Asia/Shanghai');
  expect(csv.startsWith('\uFEFF')).toBe(true);
  expect(csv).toContain('"老板, 小北\n""排位"""');
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/renderer/history-page.test.tsx tests/unit/renderer/time-segment-editor.test.tsx tests/unit/domain/csv.test.ts`

预期：失败，因为历史组件、CSV serializer 和编辑器尚未创建。

- [ ] **Step 3: 实现 CSV 领域函数**

在 `src/shared/domain/csv.ts` 实现：

```ts
export function serializeSessions(sessions: Session[], timezone: string): string;
export function csvEscape(value: string): string;
```

输出 UTF-8 BOM、固定表头和每局一行；片段在单列中以 `序号:本地开始 -> 本地结束` 合并；逗号、双引号、换行统一按 RFC 4180 规则转义；金额以两位小数输出。

- [ ] **Step 4: 实现历史列表和筛选**

- 默认按开始时间倒序和本地日期分组。
- 搜索框以备注过滤，输入变化使用 `useDeferredValue` 或 200ms debounce，不能每个键击都写数据库。
- 状态筛选支持全部、有效、无效。
- 有效记录显示调整时间入口；无效记录隐藏编辑入口，仅显示查看和删除。
- 删除前弹出记录时间和备注摘要确认。
- 导出按钮调用 `window.pwTool.history.exportCsv(query)`，显示成功路径和失败原因。

- [ ] **Step 5: 实现时间片段编辑器**

- 以纵向时间线呈现所有 segments。
- 每个节点提供本地日期和秒级时间输入。
- 使用 `validateSegments` 做即时字段校验。
- 顶部显示错误数量。
- 保存按钮在错误存在或 pending 时禁用。
- 主进程拒绝时保留草稿并映射 `segmentIndex/field` 错误。
- 保存成功后更新结果摘要并返回历史详情。
- `invalid` 记录不渲染编辑按钮。

- [ ] **Step 6: 运行历史测试和类型检查**

运行：

- `npm test -- --run tests/unit/renderer/history-page.test.tsx tests/unit/renderer/time-segment-editor.test.tsx tests/unit/domain/csv.test.ts`
- `npm run typecheck`

预期：日期分组、筛选、无效记录、字段错误、保存禁用和 CSV 转义测试通过。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/features/history src/shared/domain/csv.ts src/main/services/export-service.ts src/renderer/App.tsx tests/unit/renderer tests/unit/domain/csv.test.ts
git commit -m "feat(history): add records editor and csv export"
```

### Task 10: 实现设置页、视觉系统和迷你窗同步

**Files:**
- Create: `src/renderer/features/settings/SettingsPage.tsx`
- Create: `src/renderer/features/settings/settings.css`
- Create: `src/renderer/features/mini/MiniTimer.tsx`
- Create: `src/renderer/features/mini/mini.css`
- Modify: `src/renderer/App.tsx`
- Modify: `src/main/windows/mini-window.ts`
- Create: `tests/unit/renderer/settings-page.test.tsx`
- Create: `tests/unit/renderer/mini-timer.test.tsx`

- [ ] **Step 1: 写设置和迷你窗失败测试**

```tsx
import { defaultSettings, runningSnapshot } from '../../fixtures/domain';

it('saves defaults without creating a session', async () => {
  const nextSettings = { ...defaultSettings, hourlyRateYuan: 50, miniAlwaysOnTop: false };
  const save = vi.fn().mockResolvedValue(nextSettings);
  render(<SettingsPage api={{ settings: { save } }} />);
  await userEvent.clear(screen.getByLabelText('每小时单价'));
  await userEvent.type(screen.getByLabelText('每小时单价'), '50');
  await userEvent.click(screen.getByRole('button', { name: '保存设置' }));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ hourlyRateYuan: 50 }));
});

it('shows the same snapshot in the mini timer', () => {
  render(<MiniTimer snapshot={runningSnapshot} />);
  expect(screen.getByText('01:28:42')).toBeVisible();
  expect(screen.getByText('¥60.00')).toBeVisible();
  expect(screen.getByText('抽成 ¥4.50')).toBeVisible();
});
```

- [ ] **Step 2: 运行失败测试**

运行：`npm test -- --run tests/unit/renderer/settings-page.test.tsx tests/unit/renderer/mini-timer.test.tsx`

预期：失败，因为设置页和迷你窗组件尚未创建。

- [ ] **Step 3: 实现设置页**

- 默认计费方式、单价、抽成表单使用共享校验规则。
- 保存后只更新 `app_settings`，不修改活动会话。
- 置顶开关调用 `window.pwTool.window.setAlwaysOnTop(value)` 并保存结果。
- 展示完全离线说明和当前数据目录路径；不添加登录、同步或统计设置。

- [ ] **Step 4: 实现迷你窗界面**

- 只显示状态、有效时长、应得金额、抽成、暂停/继续、结束和置顶开关。
- 操作调用同一 `session` API，不能复制状态机。
- 订阅主进程快照，窗口打开后立即调用 `getSnapshot()`，之后通过 `subscribe()` 更新。
- 点击“显示主窗口”调用 `window.showMain()`；主窗口和迷你窗的状态显示必须一致。

- [ ] **Step 5: 完成视觉系统**

在 `tokens.css` 固定：

- 深色背景、表面层、分隔线、文字层级、青绿色主强调色、琥珀暂停色、错误色。
- 系统字体与等宽数字字体。
- 4px 基础间距、6/7/8/12px 控件圆角。
- 150-250ms 状态动效和 `prefers-reduced-motion` 覆盖。

所有主要控件必须有默认、hover、focus-visible、active、disabled、pending 和 error 状态；不要添加渐变、装饰性发光、今日统计卡片或宽屏仪表盘布局。

- [ ] **Step 6: 运行检测和测试**

运行：

- `npm test -- --run tests/unit/renderer/settings-page.test.tsx tests/unit/renderer/mini-timer.test.tsx`
- `npm run typecheck`
- `node /Users/cinitswift/.config/opencode/skills/impeccable/scripts/detect.mjs --json src/renderer`

预期：组件测试、类型检查通过，Impeccable detector 输出 `[]`。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/features/settings src/renderer/features/mini src/renderer/styles src/renderer/App.tsx src/main/windows/mini-window.ts tests/unit/renderer
git commit -m "feat(ui): add settings and mini timer"
```

### Task 11: 接通完整 Electron 流程并补齐恢复、托盘和异常处理 E2E

**Files:**
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/register-ipc.ts`
- Modify: `src/renderer/App.tsx`
- Create: `tests/e2e/timer-workflow.spec.ts`
- Create: `tests/e2e/recovery-workflow.spec.ts`
- Create: `tests/e2e/history-workflow.spec.ts`
- Create: `tests/fixtures/test-database.ts`
- Modify: `tests/fixtures/electron-app.ts`

- [ ] **Step 1: 写完整用户流程失败测试**

```ts
import { launchElectronApp } from '../fixtures/electron-app';
import { seedRunningSession } from '../fixtures/test-database';

test('starts, pauses, resumes, completes and lists a session', async () => {
  const { app, page } = await launchElectronApp();

  await page.getByRole('button', { name: '开始计时' }).click();
  await page.getByRole('button', { name: '暂停计时' }).click();
  await page.getByRole('button', { name: '继续计时' }).click();
  await page.getByRole('button', { name: '结束本局' }).click();

  await page.getByRole('button', { name: '历史' }).click();
  await expect(page.getByText('历史记录')).toBeVisible();
  await expect(page.getByText('已结束')).toBeVisible();
  await app.close();
});

test('offers recovery choices after restart', async () => {
  const userDataDir = await seedRunningSession();
  const { app: restarted, page } = await launchElectronApp({ userDataDir });
  await expect(page.getByText('发现未完成的计时')).toBeVisible();
  await expect(page.getByRole('button', { name: '恢复计时' })).toBeVisible();
  await restarted.close();
});
```

`tests/fixtures/test-database.ts` 必须使用生产 migration 创建独立临时数据库，再通过 `SessionRepository.insertSession(buildSession({ status: 'running', ... }))` 写入活动记录；不得手写与生产 schema 不同的测试 SQL。`launchElectronApp({ userDataDir })` 通过环境变量 `PW_TOOL_USER_DATA_DIR` 把该目录传给主进程，主进程仅在 `NODE_ENV === 'test'` 时允许覆盖 `app.getPath('userData')`。

- [ ] **Step 2: 运行失败 E2E**

运行：`npm run test:e2e -- tests/e2e/timer-workflow.spec.ts tests/e2e/recovery-workflow.spec.ts tests/e2e/history-workflow.spec.ts`

预期：失败或找不到完整流程，因为主进程、渲染层和测试 fixture 尚未全部接通。

- [ ] **Step 3: 接通应用启动快照和恢复门控**

启动顺序固定为：

1. 获取单实例锁。
2. 初始化并迁移 SQLite。
3. 创建服务、注册 IPC 和快照广播。
4. 查询 `findActive()`。
5. 创建主窗口。
6. 如果存在活动会话，先让 React 显示恢复弹窗，不允许进入其他导航。

IPC handler 统一把领域错误转换为稳定的序列化错误：`code`、`message`、可选 `fieldErrors`。

- [ ] **Step 4: 接通托盘、主窗和迷你窗同步**

服务层每次事务提交后调用 `broadcastSnapshot(snapshot)`，主窗口和迷你窗均订阅同一通道。窗口切换只改变可见性，不创建新服务或新计时器。

- [ ] **Step 5: 补齐异常和退出处理**

- 数据库失败显示启动错误页，不创建正常计时界面。
- 主进程写入失败返回可重试错误，React 保留草稿。
- 关闭主窗口只隐藏；托盘退出才允许 `app.quit()`。
- 第二实例聚焦已有主窗口或恢复弹窗。
- 系统时钟倒退时快照返回 `clock-skew`，暂停结束按钮并显示调整时间入口。

- [ ] **Step 6: 运行完整 E2E 与全量测试**

运行：

- `npm test`
- `npm run test:e2e`
- `npm run typecheck`

预期：领域、数据库、IPC、渲染和 Electron 流程全部通过。

- [ ] **Step 7: 提交**

```bash
git add src/main src/renderer/App.tsx tests/e2e tests/fixtures
git commit -m "feat(app): connect timer workflows"
```

### Task 12: 配置构建、CI、安装包验证和项目文档

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `README.md`
- Create: `docs/architecture.md`
- Create: `tests/build/package-config.test.ts`
- Modify: `package.json` only if packaging metadata is incomplete

- [ ] **Step 1: 写构建配置失败测试**

```ts
import packageJson from '../../package.json';

it('declares the expected unsigned desktop targets', () => {
  expect(packageJson.productName).toBe('陪玩小工具');
  expect(packageJson.build.mac.target).toEqual([{ target: 'dmg', arch: ['arm64', 'x64'] }]);
  expect(packageJson.build.win.target).toEqual([{ target: 'nsis', arch: ['x64'] }]);
});
```

- [ ] **Step 2: 运行失败配置测试**

运行：`npm test -- --run tests/build/package-config.test.ts`

预期：失败，直到 electron-builder metadata 和 CI 文件完成。

- [ ] **Step 3: 完善 electron-builder 配置**

固定产物：

```json
{
  "build": {
    "appId": "com.pwtool.desktop",
    "productName": "陪玩小工具",
    "asar": true,
    "files": ["out/**/*", "package.json"],
    "mac": { "target": [{ "target": "dmg", "arch": ["arm64", "x64"] }] },
    "win": { "target": [{ "target": "nsis", "arch": ["x64"] }] }
  }
}
```

better-sqlite3 的 native module 必须在 Electron 版本下 rebuild；构建脚本在打包前执行 `electron-builder install-app-deps`，不能依赖开发 Node ABI。

- [ ] **Step 4: 创建 GitHub Actions**

`.github/workflows/build.yml` 使用 `workflow_dispatch`，矩阵包含 `macos-latest` 和 `windows-latest`；每个平台执行：

```yaml
- uses: actions/checkout@v4
- uses: actions/setup-node@v4
  with:
    node-version: 22
    cache: npm
- run: npm ci
- run: npm test
- run: npm run typecheck
- run: npm run package:mac
  if: runner.os == 'macOS'
- run: npm run package:win
  if: runner.os == 'Windows'
- uses: actions/upload-artifact@v4
  with:
    name: pw-tool-${{ runner.os }}
    path: release/*
```

不添加签名、公证、自动更新或 Wine 交叉构建步骤。

- [ ] **Step 5: 编写 README 和架构文档**

README 必须说明：

- 本地开发命令 `npm install`、`npm run dev`、`npm test`、`npm run test:e2e`。
- macOS/Windows 安装包构建命令。
- 首版完全离线。
- 未签名安装包可能触发 Gatekeeper/SmartScreen，提供正常的系统允许路径，不绕过安全机制。
- 数据位置和如何删除本地数据。

`docs/architecture.md` 说明主进程、preload、renderer、SQLite、领域函数、IPC 快照流和恢复流程。

- [ ] **Step 6: 运行最终构建验证**

运行：

- `npm test -- --run tests/build/package-config.test.ts`
- `npm test`
- `npm run typecheck`
- `npm run build`
- 在 macOS Runner 或本机执行 `npm run package:mac`
- 在 Windows Runner 执行 `npm run package:win`
- `git diff --check`

预期：配置测试、全量测试、类型检查、Vite 构建和当前平台安装包构建退出码为 `0`；另一平台由对应 GitHub Actions Runner 验证。

- [ ] **Step 7: 提交**

```bash
git add .github/workflows/build.yml README.md docs/architecture.md tests/build package.json package-lock.json
git commit -m "build: add cross-platform packaging"
```

---

## 计划自检

### 规格覆盖

- 产品目标和首版范围：Task 1、Task 11、Task 12。
- Electron/React/Preload/主进程安全边界：Task 1、Task 6、Task 11。
- UTC 毫秒、时间戳实时计算、时钟倒退：Task 3、Task 4、Task 6、Task 11。
- 三档计费、整体向上取整、整数分：Task 2、Task 4。
- 会话状态机和单活动会话：Task 4、Task 6。
- SQLite schema、迁移、事务、默认设置：Task 5。
- 恢复、重新计时、不恢复和无效记录：Task 4、Task 6、Task 8、Task 11。
- 时间编辑、同秒暂停、字段错误和主进程复验：Task 3、Task 4、Task 9、Task 11。
- 本局参数、默认参数和备注：Task 6、Task 8、Task 10。
- 主窗口、迷你窗、托盘、单实例：Task 7、Task 10、Task 11。
- 历史、删除、筛选和 CSV：Task 9、Task 11。
- 视觉系统和无障碍状态：Task 8、Task 9、Task 10。
- CI、未签名安装包和构建文档：Task 12。
- 单元、数据库、IPC、渲染和 E2E 测试：Task 1-12。

### 占位扫描

计划正文没有未完成占位或含糊的后续说明；每个任务都给出具体路径、接口、测试命令和预期结果。

### 类型一致性

- `BillingMode` 始终使用 `'15-step' | '15-floor' | 'minute'`。
- `SessionStatus` 始终使用 `'running' | 'paused' | 'completed' | 'invalid'`。
- 金额函数返回整数分，渲染层显示两位小数。
- `TimeSegment.endedAt` 只有运行中最后片段可为 `null`。
- `SessionService` 通过 `SessionSnapshot` 向 IPC 和渲染层提供运行结果。
- Preload API 的 `session/history/settings/window` 命名与各任务中的 IPC 通道一致。
