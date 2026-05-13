# macos-cua — Strict TypeScript Port of trycua/cua (macOS Local Only)

## 0. Goal & Non-Goals

### Goal
Build a brand-new ultra-strict TypeScript monorepo (`macos-cua/`) that ports the architecture of [`trycua/cua`](https://github.com/trycua/cua) — Computer Use, sandbox-style platform abstraction, multi-runtime ready — but with these specific constraints:

- **Implements ONLY**: macOS host control via native CoreGraphics/CGEvent FFI + ScreenCaptureKit-class capture
- **Abstracts (interface-only stubs)**: QEMU runtime, Lume runtime, Docker runtime, environment variable handling, cloud transport, generic Sandbox lifecycle
- **Exposes via**: a CLI binary (`macos-cua`), an MCP server (`@modelcontextprotocol/sdk` v1.x), a pi-extension package (`@mariozechner/pi-coding-agent` peer-dep, following [`pi-cua-integration`](file:///Users/yeongyu/local-workspaces/pi-extensions/pi-cua-integration) shape), and an opencode skill colocated in the same repo at `skills/macos-cua/`
- **Tooling**: tsgo (`@typescript/native-preview` v7.x dev) + biome 2.4.x + vitest 4.x + Node 20+ + ESM-only + Node16 module resolution
- **TDD throughout**: write failing test first, implement to green, refactor, commit atomically
- **All implementation delegated to parallel `ultrabrain` / `deep` agents** with single-goal prompts; orchestrator only reviews and integrates

### Non-Goals
- Cloud VM provisioning, Docker container management, QEMU/Lume VM boot (these are interface-only stubs)
- Cross-platform (Linux/Windows) host driver — interface stubs only, throwing `"Not implemented for platform"`
- Reimplementing OpenAI/Anthropic agent loops — only the host control + tool surface
- Performance benchmarking against cua/codex — feature parity is the bar

---

## 1. Reference Material Already Collected

| Topic | Source of Truth | Status |
|---|---|---|
| cua interface tree | `bg_75e17764` report | ✅ |
| cua macOS handler | `bg_a759518b` report | ✅ |
| cua runtime providers | `bg_4b247942` report (partial; have enough) | ✅ |
| codex MCP/plugin shape | `bg_f54320b7` report | ✅ |
| opencode skill format | `bg_aecafe10` report | ✅ |
| pi-mono extension format | `bg_83e49d0e` report | ✅ |
| pi-extensions computer-use shape | `bg_0fb0ebde` report + direct file reads | ✅ |
| Ultra-strict TS toolchain | `bg_bedbf0a3` report | ✅ |
| Node macOS automation libs | `bg_8defd2ce` report | ✅ |

Comparison doc at `/Users/yeongyu/local-workspaces/macos-cua/codex-cua-comparison.md` framed the design (host-native > VM sandbox for latency).

---

## 2. Top-Level Architecture

```
macos-cua/                       (pnpm monorepo)
├── package.json                 # workspaces root
├── pnpm-workspace.yaml
├── tsconfig.base.json           # ultra-strict shared config
├── biome.json                   # tabs/120 width, recommended + extras as ERROR
├── lefthook.yml                 # pre-commit hooks
├── vitest.config.ts             # root vitest config
├── README.md                    # user-facing intro
├── AGENTS.md                    # already exists; will keep + extend
├── codex-cua-comparison.md      # already exists; reference for design
├── .gitignore                   # node_modules, dist, coverage
├── packages/
│   ├── core/                    # @macos-cua/core
│   ├── macos/                   # @macos-cua/macos (depends on core)
│   ├── cli/                     # @macos-cua/cli (depends on core + macos)
│   ├── mcp/                     # @macos-cua/mcp (depends on core + macos)
│   └── pi-extension/            # macos-cua-pi-extension (depends on core + macos)
└── skills/
    └── macos-cua/
        ├── SKILL.md
        └── references/
```

### Package Responsibilities

| Package | Public API | Implements | Stubs (throw "Not implemented") |
|---|---|---|---|
| `@macos-cua/core` | `ComputerInterface`, `MouseInterface`, `KeyboardInterface`, `ScreenInterface`, `ShellInterface`, `WindowInterface`, `PermissionInterface`, `Sandbox`, `Runtime`, `RuntimeInfo`, `Transport`, action types, branded coord types | `LocalhostRuntime`, `LocalTransport` factory, `Sandbox` composition, action discriminated unions | `QemuRuntime`, `LumeRuntime`, `DockerRuntime`, `HttpTransport`, `CloudTransport`, env-var abstraction interface |
| `@macos-cua/macos` | `MacOSHostComputer` implementing `ComputerInterface` | All mouse/keyboard/screen/shell/window/permission methods via `koffi` FFI + `node-screenshots` + `node-mac-permissions` + `get-windows` + child_process | None — fully implemented |
| `@macos-cua/cli` | `macos-cua` binary | `citty` subcommands: `screenshot`, `click`, `double-click`, `type`, `key`, `scroll`, `move`, `drag`, `permissions check`, `windows`, `shell` | `sandbox start/stop/list` (stubs print "QEMU/Lume runtime not yet implemented") |
| `@macos-cua/mcp` | MCP stdio server | All single-action tools (`screenshot`, `click`, `type`, `key`, `scroll`, `move`, `drag`, `wait`, `double_click`) following OpenAI computer-use tool contract; returns `image_url` data URI in tool result | None — surface mirrors openAI computer-use action set |
| `macos-cua-pi-extension` | Pi extension default export | `pi.registerTool` for each `macos_cua_*` tool (screenshot/click/type/key/scroll/move/drag); `resources_discover` -> skills path; `session_start/shutdown` lifecycle | Sandbox start/stop tools register but print "feature stub" |

---

## 3. Public Interface Contracts (Locked Before Implementation)

These TypeScript interfaces are the contract every other layer codes against. They must be finalised in Phase 1 and **changed only with deliberation** afterward.

### 3.1 Coordinate / Branded Primitive Types (`@macos-cua/core/types/coords.ts`)
```typescript
declare const __pixelBrand: unique symbol;
export type Pixels = number & { readonly [__pixelBrand]: "pixels" };
export const pixels = (n: number): Pixels => n as Pixels;

declare const __pointBrand: unique symbol;
export interface Point {
  readonly x: Pixels;
  readonly y: Pixels;
  readonly [__pointBrand]: "point";
}

export interface Bounds {
  readonly x: Pixels;
  readonly y: Pixels;
  readonly width: Pixels;
  readonly height: Pixels;
}

export interface ScreenSize {
  readonly width: Pixels;
  readonly height: Pixels;
}
```

### 3.2 Action Discriminated Union (`@macos-cua/core/types/action.ts`)
Mirrors OpenAI computer-use tool contract:
```typescript
export type MouseButton = "left" | "right" | "middle";

export type ComputerAction =
  | { readonly type: "screenshot" }
  | { readonly type: "click"; readonly x: Pixels; readonly y: Pixels; readonly button?: MouseButton }
  | { readonly type: "double_click"; readonly x: Pixels; readonly y: Pixels }
  | { readonly type: "scroll"; readonly x: Pixels; readonly y: Pixels; readonly scrollX: Pixels; readonly scrollY: Pixels }
  | { readonly type: "type"; readonly text: string }
  | { readonly type: "wait"; readonly ms: number }
  | { readonly type: "keypress"; readonly keys: readonly string[] }
  | { readonly type: "drag"; readonly path: readonly Point[]; readonly button?: MouseButton }
  | { readonly type: "move"; readonly x: Pixels; readonly y: Pixels };
```

### 3.3 ComputerInterface (`@macos-cua/core/interfaces/computer.ts`)
```typescript
export interface ComputerInterface {
  readonly screen: ScreenInterface;
  readonly mouse: MouseInterface;
  readonly keyboard: KeyboardInterface;
  readonly shell: ShellInterface;
  readonly window: WindowInterface;
  readonly permission: PermissionInterface;

  /** Coarse OS detection. */
  getEnvironment(): Promise<"mac" | "linux" | "windows" | "browser">;
  /** Native screen pixel dimensions. */
  getDimensions(): Promise<ScreenSize>;
  /** Apply a single action (high-level wrapper that screenshots after). */
  dispatch(action: ComputerAction): Promise<ActionResult>;
  /** Lifecycle. */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
}
```

### 3.4 Per-Surface Interfaces
- `ScreenInterface`: `screenshot()`, `screenshotBase64()`, `size()`
- `MouseInterface`: `click(p, button?)`, `doubleClick(p)`, `rightClick(p)`, `move(p)`, `drag(path[], button?)`, `scroll(p, deltaX, deltaY)`, `mouseDown(p, button?)`, `mouseUp(p, button?)`, `getCursorPosition()`
- `KeyboardInterface`: `type(text)`, `keypress(keys[])`, `keyDown(key)`, `keyUp(key)`
- `ShellInterface`: `run(command, opts?) -> CommandResult`
- `WindowInterface`: `activeWindow()`, `listWindows()`, `bringToFront(bundleId | pid)`
- `PermissionInterface`: `check(kind)`, `request(kind)`, where `kind ∈ "screen" | "accessibility" | "input-monitoring" | "apple-events"`

### 3.5 Runtime / RuntimeInfo / Transport (interface only, no impl beyond Localhost)
- `Runtime` ABC: `start(image, name) -> Promise<RuntimeInfo>`, `stop(name)`, `isReady(info, timeout?)`, optional `suspend/resume/list/checkpoint`
- `RuntimeInfo`: host, apiPort, vncPort?, qmpPort?, sshPort?, environment?, etc.
- `Transport` ABC: `connect()`, `disconnect()`, `send(action, params)`, `screenshot()`, `getScreenSize()`, `getEnvironment()`
- `LocalTransport`: routes calls to a `ComputerInterface` instance (the macOS impl)
- `QemuRuntime`/`LumeRuntime`/`DockerRuntime`: each has constructor + method signatures, all methods throw `new Error("Runtime '<name>' not implemented in macos-cua@0.1; interface reserved for future use")`

### 3.6 Sandbox
```typescript
export class Sandbox {
  readonly screen: ScreenInterface;
  readonly mouse: MouseInterface;
  readonly keyboard: KeyboardInterface;
  readonly shell: ShellInterface;
  readonly window: WindowInterface;
  readonly permission: PermissionInterface;

  static async createLocalhost(): Promise<Sandbox>;       // ✅ implemented
  static async create(opts: SandboxCreateOptions): Promise<Sandbox>;  // ⚠️ throws if non-local

  async screenshot(): Promise<Buffer>;
  async screenshotBase64(): Promise<string>;
  async getDimensions(): Promise<ScreenSize>;
  async dispatch(action: ComputerAction): Promise<ActionResult>;
  async destroy(): Promise<void>;
}
```

---

## 4. Phased Plan with TDD + Oracle Verification Gates

Each phase ends with: ✅ tests pass + ✅ `tsgo --noEmit` clean + ✅ `biome ci .` clean + ✅ oracle verification + ✅ atomic commit.

### Phase 0 — Repo Skeleton (sequential, fast)
**Goal**: Empty monorepo bootstraps successfully; `pnpm install` works; placeholder tests pass; first commit lands.

**Tasks** (each as a SINGLE prompt to a `quick` or `unspecified-low` agent):
- P0.1 — Write `package.json` (root) with pnpm workspaces, scripts (lint/check/test/build), devDependencies pinned per `bg_bedbf0a3`
- P0.2 — Write `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.base.json`, `biome.json`, `lefthook.yml`, `vitest.config.ts`
- P0.3 — Create empty `packages/{core,macos,cli,mcp,pi-extension}/` skeletons each with `package.json`, `tsconfig.json` extending base, `src/index.ts` placeholder, `src/index.test.ts` placeholder
- P0.4 — Create `skills/macos-cua/` with stub `SKILL.md` (final content comes later)
- P0.5 — Run `pnpm install`, `pnpm check` (tsgo + biome), `pnpm test` — confirm green
- P0.6 — **Commit**: `chore: bootstrap macos-cua monorepo skeleton`

**Oracle gate after P0**: Oracle reviews the repo skeleton for soundness (workspace links resolve? tsconfig inheritance correct? biome rules consistent with pi-cua-integration style?)

### Phase 1 — Core Interfaces & Types (sequential — contracts must be locked)
**Goal**: All public interfaces from §3 are defined in `@macos-cua/core`. NO implementations yet — just types, ABCs, and interface tests that verify a fake implementation can satisfy them.

**Tasks** (parallel `ultrabrain` agents, one per interface family):
- P1.1 — `core/src/types/{coords,action,result,permission}.ts` + tests verifying brand types + discriminated union exhaustiveness
- P1.2 — `core/src/interfaces/{computer,screen,mouse,keyboard,shell,window,permission}.ts` + a `MockComputer` fixture used by every interface test
- P1.3 — `core/src/runtime/{runtime,runtime-info,checkpoint-info}.ts` + ABC tests (instantiation forbidden, subclass must implement)
- P1.4 — `core/src/runtime/{qemu,lume,docker,hyperv}.ts` — stubs that throw, with tests asserting `"Not implemented"` error message format
- P1.5 — `core/src/transport/{transport,local,http,cloud}.ts` — ABC + LocalTransport impl + HTTP/Cloud stubs with throwing methods
- P1.6 — `core/src/env/env.ts` — `EnvironmentProvider` interface for env-var injection at sandbox creation; macOS impl reads `process.env`
- P1.7 — `core/src/sandbox.ts` — Sandbox class that composes a `ComputerInterface`, with `Sandbox.createLocalhost(driver)` taking an injected driver
- P1.8 — `core/src/index.ts` — public barrel
- P1.9 — Run `pnpm --filter @macos-cua/core test` → all green

**Oracle gate after P1**: Oracle reviews the interface set for completeness vs cua's Python contract (from `bg_75e17764`); flags any missing methods that we'd regret later. Also verifies branded types + discriminated unions are airtight.

**Commit**: `feat(core): define interfaces, action types, runtime/transport ABCs`

### Phase 2 — macOS Driver Implementation (TDD; parallel sub-tasks)
**Goal**: `@macos-cua/macos` package implements every interface from `@macos-cua/core` using node-screenshots + koffi/CGEvent + node-mac-permissions + get-windows + child_process. All tests green on a real Mac.

**Pre-Phase-2 decision**: confirm `koffi` over `bun:ffi` (we target Node, per `pi-cua-integration` engines field).

**Tasks** (parallel `ultrabrain` / `deep` agents, one per surface):
- P2.1 — `macos/src/screenshot.ts` (uses `node-screenshots` Monitor API; returns PNG Buffer + dimensions). TDD: tests assert PNG magic bytes, dimensions > 0, base64 encoding round-trips.
- P2.2 — `macos/src/ffi/coregraphics.ts` — koffi binding to `/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics` exposing: `CGEventCreateMouseEvent`, `CGEventCreateKeyboardEvent`, `CGEventCreateScrollWheelEvent`, `CGEventPost`, `CGEventSetFlags`, `CGEventKeyboardSetUnicodeString`, `CGEventSourceCreate`, `CGEventGetLocation`, `CGEventCreate`, `CGWarpMouseCursorPosition`, `CGAssociateMouseAndMouseCursorPosition`, `CFRelease`. Tests assert symbols load successfully.
- P2.3 — `macos/src/mouse.ts` — implements MouseInterface using P2.2 bindings (with the `CGEventSourceStateID.HIDSystemState` trick for `isTrusted` in browsers, and `CGWarpMouseCursorPosition` for Retina/VM safety). TDD: tests mock the FFI layer and assert correct CGEvent construction order.
- P2.4 — `macos/src/keyboard.ts` — implements KeyboardInterface with virtual key code mapping (`a`-`z`, `0`-`9`, `Return`, `Tab`, `Esc`, arrows, F-keys, modifiers), Unicode text input via `CGEventKeyboardSetUnicodeString`. Maps `command` → `cmd` (Python cua compat). TDD: mock + assert.
- P2.5 — `macos/src/permissions.ts` — wraps `node-mac-permissions` for screen / accessibility / input-monitoring / apple-events. TDD: tests assert returned union literal is one of `"not-determined" | "denied" | "authorized" | "restricted"`.
- P2.6 — `macos/src/window.ts` — wraps `get-windows` for `activeWindow`/`openWindows`. `bringToFront(bundleId)` shells out to `osascript -e 'tell application id "..." to activate'`. TDD: skip integration tests on CI but include local-only `*.integration.test.ts`.
- P2.7 — `macos/src/shell.ts` — `child_process.spawn` wrapper returning `CommandResult { stdout, stderr, exitCode }`. TDD: tests run `echo`, `false`, timeout cases.
- P2.8 — `macos/src/driver.ts` — `MacOSHostComputer` class that composes all surfaces and exports a single `createMacOSHostComputer()` factory.
- P2.9 — `macos/src/index.ts` — barrel.
- P2.10 — Manual QA on a real Mac: `tsx packages/macos/scripts/smoke.ts` script that screenshots, moves cursor, clicks, types — and prints results.

**Oracle gate after P2**: Oracle reviews the macOS driver against the cua Python handler report (`bg_a759518b`) — does each Python method have a TypeScript counterpart? Did we preserve the `CGWarpMouseCursorPosition` workaround? Did we avoid `time.sleep` in async paths?

**Commit**: `feat(macos): implement host computer driver via koffi+CGEvent+node-screenshots`

### Phase 3 — Consumer Packages (parallel — all depend on Phase 2)
**Goal**: All four consumer packages (`cli`, `mcp`, `pi-extension`, plus `skills/macos-cua/SKILL.md`) functional and tested.

**Tasks** (parallel `ultrabrain` / `visual-engineering` / `unspecified-high` agents):
- P3.1 — `cli/src/cli.ts` (citty) with subcommands. Each subcommand instantiates `MacOSHostComputer`, performs the action, prints JSON result. TDD: vitest + execa to spawn the built CLI.
- P3.2 — `mcp/src/server.ts` — MCP stdio server using `@modelcontextprotocol/sdk` v1.x. Registers tools matching OpenAI computer-use action set. Tool results return `[{type:"image", data, mimeType:"image/png"}, {type:"text", text:"<diagnostic>"}]`. TDD: vitest spawns the server, sends `tools/list`, asserts surface; sends `tools/call screenshot`, asserts image content block.
- P3.3 — `pi-extension/src/index.ts` — default export `(pi: ExtensionAPI) => void` following `pi-cua-integration` shape exactly:
  - `pi.on("resources_discover", ...)` → returns repo-relative skill paths
  - `pi.on("session_start", ...)` → instantiates `MacOSHostComputer`, calls `pi.registerTool` for each `macos_cua_*` tool
  - `pi.on("session_shutdown", ...)` → cleanup
  - Tools use `typebox` schemas (matching `pi-cua-integration`'s convention)
  - `pi/index.ts` barrel re-exports types from `@mariozechner/pi-coding-agent` peer dep
  - `package.json` has `"pi": { "extensions": ["./src/index.ts"] }`
- P3.4 — `skills/macos-cua/SKILL.md` — YAML frontmatter (`name`, `description` with rich triggers), short index-style body (~120 lines), references in `references/installation.md`, `references/usage.md`, `references/troubleshooting.md`, `references/architecture.md`
- P3.5 — root `README.md` — replaces nothing (file doesn't exist); user-facing intro with badges, quickstart, examples for CLI / MCP / pi-extension / skill

**Oracle gate after P3**: Oracle reviews the four consumer surfaces for: tool schema parity (CLI ↔ MCP ↔ pi-extension all expose the same action set), error message consistency, schema definitions matching the OpenAI computer-use contract.

**Commit**: 5 separate atomic commits (one per consumer package + README + SKILL.md)

### Phase 4 — Integration Testing & Manual QA
**Goal**: Each surface has been driven end-to-end on a real macOS desktop and the output observed.

**Tasks**:
- P4.1 — Run `pnpm test` (full workspace) → all green
- P4.2 — Run `pnpm check` → all green
- P4.3 — Run CLI: `macos-cua screenshot --output /tmp/shot.png` → file exists; `macos-cua permissions check` → prints status; `macos-cua click 100 100` → cursor moves
- P4.4 — Spawn MCP server via `node packages/mcp/dist/server.js`; send `tools/list` + `tools/call screenshot` via a tiny stdin/stdout test driver; assert image is returned
- P4.5 — Install pi-extension locally: `pi install file:///Users/yeongyu/local-workspaces/macos-cua/packages/pi-extension`; start pi; verify `macos_cua_*` tools registered; ask the agent to take a screenshot via the tool
- P4.6 — Run skill validator if present (from cua-skill convention): inspection of SKILL.md frontmatter

**Oracle final gate**: Oracle reviews the entire repo against the original user request — did we deliver platform abstraction with macOS-only impl + stubs? Did we use tsgo + biome + ultra-strict TS? Did we expose via CLI + MCP + pi-extension + skill?

### Phase 5 — Atomic Commits & Push
**Goal**: Commit history reads cleanly; each commit is self-contained.

**Commit graph** (target):
1. `chore: bootstrap macos-cua monorepo skeleton`
2. `feat(core): define interfaces, action types, runtime/transport ABCs`
3. `feat(macos): implement host computer driver via koffi+CGEvent+node-screenshots`
4. `feat(cli): expose host driver via citty CLI`
5. `feat(mcp): MCP server matching OpenAI computer-use tool contract`
6. `feat(pi-extension): pi-coding-agent extension following pi-cua-integration shape`
7. `docs: skill + README + references`

No `git push` (user did not request it).

---

## 5. Parallel-Agent Dispatch Plan

| Wave | Agents (each gets ONE goal) | Phase | Run mode |
|---|---|---|---|
| W0 | `quick` × 5 (P0.1, P0.2, P0.3, P0.4, P0.5) — sequential because shared root files | 0 | foreground |
| W1 | `ultrabrain` × 8 (P1.1–P1.8 in parallel) | 1 | background |
| W2-Oracle | oracle review of W1 output | 1 | foreground (blocking) |
| W3 | `ultrabrain` × 9 (P2.1–P2.9 in parallel; P2.10 separate after) | 2 | background |
| W4-Oracle | oracle review of macOS driver | 2 | foreground (blocking) |
| W5 | `ultrabrain` × 5 (P3.1, P3.2, P3.3, P3.4, P3.5 in parallel) | 3 | background |
| W6-Oracle | oracle review of consumer surfaces | 3 | foreground (blocking) |
| W7 | Manual QA (orchestrator itself runs CLI/MCP/pi-extension) | 4 | foreground |
| W8-Oracle | final oracle | 4 | foreground (blocking) |
| W9 | `git` (commit skill) for atomic commit graph | 5 | foreground |

---

## 6. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| `koffi` doesn't expose CGEvent symbols as expected → can't synthesize input | Fallback: shell out to `cliclick` binary (homebrew); document in skill |
| `node-screenshots` napi prebuild missing for Node 24 | Pin to a known-good Node 22 version in `engines`; or fallback to `screencapture` CLI |
| `node-mac-permissions` doesn't prompt for permissions reliably on macOS 26 | Document permission grant flow in skill; have `cli permissions request <kind>` use shell `open "x-apple.systempreferences:..."` URLs |
| pi-extension `@mariozechner/pi-coding-agent` peer dep breaks across versions | Match versions used by `pi-cua-integration` exactly |
| MCP SDK v1 → v2 migration mid-project | Pin to v1.29.x; document v2 migration as future work |
| Test runner can't run on CI without macOS host | Mark integration tests with `*.integration.test.ts` and gate behind `MACOS_CUA_INTEGRATION=1` |
| Tool schemas drift between CLI / MCP / pi-extension | Centralize action schemas in `@macos-cua/core` and re-export from each consumer |

---

## 7. Completion Criteria

The task is `<promise>DONE</promise>`-ready when ALL of the following are true:

1. ✅ `pnpm install && pnpm check && pnpm test` is green from a clean clone
2. ✅ All five packages build (or `noEmit`-pass with tsgo) without warnings
3. ✅ CLI binary `macos-cua --help` runs from `./packages/cli/dist/cli.js` (or `tsx`) and lists all subcommands
4. ✅ MCP server starts via stdio and responds to `tools/list` with the OpenAI computer-use action set
5. ✅ pi-extension package, when symlinked into pi, registers `macos_cua_*` tools at session start
6. ✅ `skills/macos-cua/SKILL.md` has valid YAML frontmatter (name + description with triggers), body ≤ 200 lines, references/ contains ≥ 3 markdown files
7. ✅ All interfaces from §3 exist in `@macos-cua/core` and the macOS package implements every method
8. ✅ Stubs for Qemu/Lume/Docker/HTTP transport throw clear errors mentioning "not implemented in macos-cua@0.1"
9. ✅ Git history has ≥ 6 atomic commits in the order shown in §4 Phase 5
10. ✅ Oracle has approved every phase gate
11. ✅ Manual QA proof: at least ONE real screenshot taken and saved during P4.3 (orchestrator demonstrates)
