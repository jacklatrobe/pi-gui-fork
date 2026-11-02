# Desktop App

Codex-style Electron shell for `pi`, with Playwright E2E coverage organized by test lane.

CI runs the Core suite on Linux under Xvfb on every change; Windows CI validates packaging. The Linux run does not establish native OS behavior.

## Setup

Install workspace dependencies once:

```bash
corepack enable
pnpm install
```

Build the desktop app:

```bash
pnpm --filter @pi-gui/desktop build
```

Run the app in development:

```bash
pnpm --filter @pi-gui/desktop dev
```

`dev` now runs through `electron-vite`, so renderer edits hot-update in place and Electron `main` / `preload` changes trigger the appropriate reload or restart behavior automatically. The desktop dev launcher also rebuilds the shared workspace packages up front and keeps them in watch mode so Node-side package changes can be picked up without manual rebuilds.

Run the built app locally without packaging:

```bash
pnpm --filter @pi-gui/desktop preview
```

Package a Linux AppImage locally:

```bash
pnpm --filter @pi-gui/desktop run package:linux
```

Package Windows installers locally:

```bash
pnpm --filter @pi-gui/desktop run package:win
```

Unpacked Windows build (faster iteration):

```bash
pnpm --filter @pi-gui/desktop run package:win:dir
```

On Windows, `package:win*` routes through `scripts/package-windows.mjs`, which prefers the ASCII repo-local `tools/pnpm.cmd` shim and redirects `ELECTRON_BUILDER_CACHE` / `LOCALAPPDATA` into `.cache/` under the repo. This avoids electron-builder failures when `pnpm` lives under a non-ASCII `%USERPROFILE%` or when Developer Mode / elevation is unavailable for winCodeSign symlink extraction. Linux and Windows packaging retry GitHub 502/503/504 downloads of Electron and electron-builder binaries (including winCodeSign) up to three times. Cached binaries stay in `ELECTRON_BUILDER_CACHE` (default `.cache/electron-builder` in the repo). CI runners do not keep that cache across jobs, so the retry covers a 504 on a cold runner. Set `ELECTRON_MIRROR` if Electron downloads are flaky in your region.

The `live` lane mixes deterministic runtime integration with opt-in real-provider tests. Real-provider tests require usable provider authentication; deterministic extension tests can run without it.

## Test Lanes

Use the smallest lane that matches the changed surface.

- `core`
  Background-friendly Electron UI coverage. This is the default lane for renderer, sidebar, composer, persistence, settings, skills, and worktree UI behavior.

  ```bash
  pnpm --filter @pi-gui/desktop run test:e2e
  pnpm --filter @pi-gui/desktop run test:e2e:core
  ```

- `live`
  Runtime integration coverage, including local extension fixtures and opt-in real-provider tests. Inspect the selected spec and report skips: a green lane without real requests does not prove a provider conversation.

  ```bash
  pnpm --filter @pi-gui/desktop run test:e2e:live
  ```

- `native`
  OS-surface coverage such as image pickers and real clipboard paste. This lane is foreground-only and can take focus.

  ```bash
  pnpm --filter @pi-gui/desktop run test:e2e:native
  ```

Run core, live, and native together (dev and demo are separate):

```bash
pnpm --filter @pi-gui/desktop run test:e2e:all
```

## Marketing media

The root commands own published marketing outputs:

- `pnpm marketing:media` records the README and pi-gui.com media in
  `apps/website/public/media/`: the hero video and poster, and light and dark stills of the thread
  list, review, terminal and command palette. It runs
  [`scripts/product-media/capture.media.ts`](scripts/product-media/capture.media.ts), which drives
  a real agent run on Linux in its own 2x Xvfb display and records it with ffmpeg. The run
  needs `PI_GUI_MARKETING_PROVIDER`, `PI_GUI_MARKETING_MODEL` and `PI_APP_REAL_AUTH_SOURCE_DIR` (the
  pi agent directory holding `auth.json`); only the selected provider's saved credentials are
  copied, into a private temporary directory, and that copy is deleted afterwards. If pi refreshes an OAuth
  token during the run, the refreshed token is not written back, so a provider that rotates refresh
  tokens may ask you to sign in again; an API key avoids that. Install Inter and
  JetBrains Mono first so Linux captures match the intended fonts.
- `pnpm marketing:capture` writes the three Remotion inputs in
  `video/public/captures/`. The parallel-session capture starts two threads with initial prompts and
  requires both sessions to report `running` before recording or publishing the clip. The command
  submits real prompts, so it fails unless
  `PI_GUI_MARKETING_ALLOW_PROVIDER_ENV=1`, `PI_GUI_MARKETING_PROVIDER`, and
  `PI_GUI_MARKETING_MODEL` explicitly select the provider environment to use.
- `pnpm marketing:render` consumes those clips and renders `video/out/pi-showcase.mp4`.

[`scripts/marketing-assets.json`](../../scripts/marketing-assets.json) is the producer-to-consumer
manifest. Preserve existing media and capture evidence. For a proof run, set
`PI_GUI_MARKETING_STAGE_DIR` to an empty directory so capture commands write the same output tree
there without replacing tracked media. The product media capture scrubs ambient provider
credentials and retains its profile, workspaces and raw recording under
`.artifacts/marketing/product-media/`.
Showcase capture writes an empty auth file, does not copy ambient credentials, and retains its
synthetic profiles and frames under `.artifacts/marketing/showcase-captures/`.

Linux CI also validates packaging via:

```bash
pnpm --filter @pi-gui/desktop run package:linux
pnpm --dir apps/desktop run verify:packaged-runtime-deps:linux
```

Windows release CI validates packaging via:

```bash
pnpm --filter @pi-gui/desktop run package:win:dir
pnpm --dir apps/desktop run verify:packaged-runtime-deps:windows
```

## What A Passing Check Proves

`pnpm check` at the repository root proves the static/unit baseline described in [CI baseline](../../docs/ci-baseline.md), not Electron, provider, or native behavior. Core Electron specs can use fixtures and injected events. Report fixture-backed Electron, deterministic runtime integration, real-provider conversation, native OS, and packaged-artifact evidence separately.

For a visible send/stream/tool/restart journey without injected assistant events, use the checked-in [verify-pi-gui skill](../../.agents/skills/verify-pi-gui/SKILL.md). Its no-provider settings smoke proves navigation and preference persistence only. Missing auth blocks conversation proof; skipped specs are not passes.

## Focus And Foreground Rules

- `core` and most `live` scripts set `PI_APP_TEST_MODE=background` for you. Agents normally should not set that env var manually.
- `native` scripts set `PI_APP_TEST_MODE=foreground` for you and may steal focus.
- If a native test fails, rerun it with a clean foreground window before assuming the product is broken.

## Playwright Vs Computer Use

Prefer the repo lanes first. They are deterministic, scriptable, and the right source of truth for normal development and CI.

- Use `core` when the behavior lives inside the Electron window and should stay background-friendly.
- Use `live` for runtime integration; select and enable real-provider specs when the behavior depends on an actual model run.
- Use `native` when the surface is a real OS dialog, picker, or clipboard path.

Use manual Computer Use smoke only as a complement, not a replacement.

- The reason to use Computer Use is product confidence, not determinism. It is useful when you want to see the real installed app behave correctly while minimizing disruption to the laptop.
- Keep Playwright as the primary regression signal. Computer Use should not replace lane coverage for `core`, `live`, or `native`, and it should not become a hidden repo dependency.
- Treat real open-folder and native file-picker checks in Computer Use as best-effort smoke coverage unless the workflow is explicitly being validated there.

## Targeted Commands

Use a targeted script while iterating.
Rerun the matching lane before closing for `core` and `live`.
For `native`, rerun the targeted native spec by default and expand to `test:e2e:native` only when the change touches shared native helpers, multiple native specs, or lane-wide native behavior.

```bash
pnpm --filter @pi-gui/desktop run test:core:worktrees
pnpm --filter @pi-gui/desktop run test:core:persistence
pnpm --filter @pi-gui/desktop run test:live:tool-calls
pnpm --filter @pi-gui/desktop run test:native:paste
pnpm --filter @pi-gui/desktop run test:core:attach-image
pnpm --filter @pi-gui/desktop run test:core:auth-contract
```

For real-auth `live` specs, opt in explicitly:

```bash
PI_APP_REAL_AUTH=1 PI_APP_REAL_AUTH_SOURCE_DIR=/absolute/path/to/agent \
  pnpm --filter @pi-gui/desktop run test:e2e:runner -- apps/desktop/tests/live/submit-run.spec.ts

PI_APP_REAL_AUTH=1 PI_APP_REAL_AUTH_SOURCE_DIR=/absolute/path/to/agent \
  pnpm --filter @pi-gui/desktop run test:e2e:runner -- apps/desktop/tests/live/tool-calls.spec.ts
```

For dev-loop verification, use:

```bash
pnpm --filter @pi-gui/desktop run test:dev:reload
```

That spec launches the app in development mode, edits isolated probe modules for renderer/Electron/shared-package wiring, and proves the running window picks up the changes.

## Test Conventions

- Shared helpers live in [`tests/helpers/electron-app.ts`](./tests/helpers/electron-app.ts). Extend them instead of adding another Electron harness.
- Prefer real clicks, typing, keyboard shortcuts, and visible assertions.
- Avoid direct IPC shortcuts for visible behavior unless the user surface does not exist yet. If you must use one, document why the surface gap exists.
- `pasteTinyPng()` drives the renderer paste handler directly and is appropriate for background-safe coverage.
- `pasteTinyPngViaClipboard()` writes an image to the Electron clipboard and presses the platform paste shortcut. It belongs in foreground/native coverage.
- `tests/core/real-auth-contract.spec.ts` proves the default non-real-auth path still seeds a temporary fake-auth agent dir and keeps real-auth coverage opt-in.

## Lane Map

- `tests/core`: deterministic in-window behavior
- `tests/live`: deterministic runtime integration and opt-in real-provider behavior
- `tests/native`: OS-surface behavior

Future agents should start by reading this file, `apps/desktop/tests/AGENTS.md`, and the scripts in `apps/desktop/package.json`.
