---
name: macos-cua
description: "MUST USE whenever the user wants to automate the local macOS desktop — clicking, typing, scrolling, screenshots, or driving a macOS app. In Senpi/pi-extension sessions, use registered tools: `get_app_state` first, then `click`, `type_text`, `press_keys`, `scroll`, `drag`, `set_value`, `select_text`, `perform_secondary_action`, or `zoom`. Use bash/CLI only when the discrete tools are unavailable, for setup, or when the user explicitly asks for the CLI. Triggers: macos-cua, macos computer use, macos automation, control mac, screenshot desktop, click screen, type mac app, scroll window, drive macOS app, macOS GUI automation, accessibility automation, ScreenCaptureKit, CGEvent, host-native computer use, no-sandbox computer use, codex-style locally, 맥 자동화, 데스크탑 자동화, 화면 스크린샷, 클릭 자동화, 키보드 자동화, 맥 컴퓨터 사용, GUI 제어, mac 화면 캡쳐, mac 입력 자동화, codex 로컬 자동화."
---

# macos-cua

`macos-cua` is a TypeScript-native computer-use automation framework for macOS. It drives the mouse, keyboard, screen, and accessibility tree through native macOS APIs (CoreGraphics CGEvent, AXUIElement, `screencapture`/`sips`, and SkyLight/AppKit FFI) without requiring Python, a VM sandbox, or a helper binary.

## When to reach for macos-cua

Use macos-cua whenever the user wants the agent to operate their actual macOS desktop as a human would. Specifically:

- Take a screenshot of the user's Mac desktop or a specific app window.
- Click, double-click, drag, type text, press key chords, or scroll at coordinates.
- Query the current cursor position or screen dimensions.
- Drive a macOS app through a sequence of UI actions.
- Run automation that needs low-latency, host-native execution (no Docker/QEMU/Lume overhead).

If the user only wants to read a file, run a normal CLI, or write code, this skill does not apply. Use pi's existing read/bash/edit tools instead.

## Operating modes

macos-cua has three entry points. Prefer the highest available mode in this order:

| Mode | How to invoke | When to pick it |
|---|---|---|
| **pi-extension** | `pi install file://...` then restart pi | Senpi has registered Codex-compatible `list_apps`, `get_app_state`, `click`, `drag`, `scroll`, `type_text`, `press_keys`, `set_value`, `select_text`, `perform_secondary_action`, and `zoom` tools. |
| **MCP server** | `macos-cua-mcp` over stdio | The host loads MCP servers automatically. The server exposes the same verbs as tools. |
| **CLI** | `macos-cua <verb>` directly in pi's bash | The discrete tools are unavailable, you are setting up/debugging the package, or the user explicitly asks for the CLI. |

All three modes share the same underlying `MacOSHostComputer` implementation.

## Senpi/pi-extension action loop

In Senpi/pi-extension sessions, use `get_app_state` first for visible UI work, then act with the discrete tools. Use bash/CLI only when the discrete tools are unavailable, for setup, or when the user explicitly asks for the CLI.

1. Start with `get_app_state` for the target app. It returns a screenshot, numbered `element_index` boxes, the accessibility tree, and remembers the target window.
2. Prefer `click element_index=<number>`, `set_value`, `select_text`, or `perform_secondary_action` when the accessibility tree exposes the target. Use `zoom` for small or ambiguous targets before clicking.
3. Use `type_text`, `press_keys`, `scroll`, or `drag` for direct input. Keep using the same app name or bundle id.
4. Call `get_app_state` again only after a UI-changing action when you need to verify or choose the next target.

When the `@macos-cua/pi-extension` is loaded, Anthropic Messages and direct OpenAI Responses models automatically receive native computer-use. Anthropic gets the `computer-use-2025-01-24` beta tool plus header/body fields; direct OpenAI Responses gets `{ type: "computer" }` in the provider payload. OpenAI Chat/proxy models, including Kimi in Senpi, use the discrete tools instead. All flows keep the Codex-compatible app tools available and all native-computer flows are disabled only by `MACOS_CUA_DISABLE_COMPUTER_USE_BETA=1` (`true`, `yes`, and `on` also work).

The extension sends model-facing screenshots captured at a 1280px long edge. Coordinates returned by the model are interpreted in that image space, then unscaled back to macOS logical points before `click`, `move`, or `drag` dispatch.

## macOS permissions

macOS needs host consent before `macos-cua` can see or control UI:

- **Screen Recording** for screenshots and window discovery.
- **Accessibility** for click, type, key, scroll, drag, and AX actions.
- **Apple Events** when resolving `--target-bundle-id` through System Events.

Full installation walkthrough: [`references/installation.md`](references/installation.md).

## App targeting

When you want the agent to drive a specific app, call `get_app_state` first in MCP/pi-extension mode, or pass `--target-pid`/`--target-bundle-id` in CLI mode. Targeted input uses a remembered visible app window and routes through CoreGraphics plus SkyLight/AppKit FFI. If no target window is known, targeted input fails loudly rather than falling back to global cursor-moving input.

## CLI surface — `macos-cua <verb>`

When using CLI mode, desktop actions go through `macos-cua <verb>`. The verb taxonomy:

| Action | Command shape |
|---|---|
| Screenshot | `macos-cua screenshot -o /tmp/macos-cua-<unix-ts>.png` |
| Click | `macos-cua click <x> <y>` (or `--button right`) |
| Double-click | `macos-cua double-click <x> <y>` |
| Move cursor | `macos-cua move <x> <y>` |
| Drag | `macos-cua drag <fromX> <fromY> <toX> <toY>` |
| Type text | `macos-cua type "<text>"` |
| Key chord | `macos-cua key <key> -m <modifiers>` (e.g. `cmd,shift`) |
| Keypress sequence | `macos-cua keypress cmd shift t` |
| Scroll | `macos-cua scroll -d <up\|down\|left\|right> -a <amount>` |
| Wait | `macos-cua wait <ms>` |
| Cursor position | `macos-cua cursor` |
| Screen size | `macos-cua screen` |
| Check permission | `macos-cua permissions check <screen\|accessibility\|input-monitoring\|apple-events>` |
| Request permission | `macos-cua permissions request <kind>` |
| Active window | `macos-cua --json windows active` |
| List windows | `macos-cua --json windows list` (requires Screen Recording; fails fast after 5s if missing) |

Add `--json` to any subcommand for machine-readable output. If a call fails with an unknown flag, run `macos-cua <verb> --help` to see the exact flag set for that verb.

## CLI screenshot → Read pattern

In CLI mode, `macos-cua` writes the PNG to disk; pi's Read tool ingests it as inline image content.

```bash
# capture with a unique filename so concurrent calls don't collide
TS=$(date +%s%N)
SHOT="/tmp/macos-cua-${TS}.png"
macos-cua screenshot -o "${SHOT}"
```

Then in the **same agent turn**, call pi's Read tool with the absolute path `/tmp/macos-cua-<ts>.png`. The PNG is attached to the next assistant message as inline image content. Do not base64 it manually, do not pipe it through stdin. Read already does the right thing.

## Shell on localhost — prefer pi's bash

On localhost, prefer pi's built-in bash tool for shell commands. It has the same shell environment and you get pi's standard output capture. If pi-extension computer-use tools are visible, use them for desktop actions; otherwise use `macos-cua` only for computer-use actions (screenshot, click, type, etc.).

## Reference files — load only what you need

| Reference | Load when... |
|---|---|
| [`references/installation.md`](references/installation.md) | Setting up the project for the first time or granting macOS permissions. |
| [`references/usage.md`](references/usage.md) | You need detailed CLI, MCP, pi-extension, or programmatic examples. |
| [`references/troubleshooting.md`](references/troubleshooting.md) | Something is broken (black screenshots, clicks not working, binary not found). |
| [`references/architecture.md`](references/architecture.md) | You want to understand why host-native beats sandbox, or how the layers fit together. |

## Critical conventions

### Never auto-drive a destructive GUI

Before executing any irreversible UI action (deleting files in Finder, confirming a system dialog, submitting a form, purchasing something), pause and ask the user for explicit confirmation. The agent can see the screen, but the user is the one who bears the consequences.

### Coordinate spaces

`MacOSHostComputer` input uses macOS logical points. The pi-extension native computer tool shows models a downscaled screenshot (1280x720 maximum) and unscales model-space coordinates back to logical points before input dispatch. Raw CLI screenshots may still be Retina physical PNGs, so convert screenshot pixels to logical points when driving the CLI directly.

## Permission troubleshooting

Only check permissions after a black screenshot, missing window, or ignored input. Permission is per-binary, so switching terminal apps may require re-granting. In CLI mode, verify with:

```bash
macos-cua permissions check screen
macos-cua permissions check accessibility
macos-cua permissions check input-monitoring
```

Each should print `authorized`. If any prints `denied` or `not-determined`, run `macos-cua permissions request <kind>` to trigger the macOS system dialog, then re-check. Falling back to System Settings → Privacy & Security works too.
