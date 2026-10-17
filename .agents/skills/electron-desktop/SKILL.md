---
name: electron-desktop
description: Electron/TypeScript desktop engineering for TypeNudge: secure main/preload/renderer separation, CodeMirror 6, local SQLite access, Vite/Forge packaging and desktop checks.
---

# Electron desktop engineering

## Use when

The active approved story changes Electron main/preload/renderer boundaries, CodeMirror integration, IPC, local file handling, brand assets, SQLite module packaging, desktop UI tests or Electron Forge. Skip for isolated language-model algorithm work.

## Engineering practice

1. Pin compatible **actual versions** of Electron, Vite, CodeMirror, better-sqlite3 and Forge. Native SQLite modules must be rebuilt/packaged for the chosen Electron ABI and verified after packaging; do not assume `npm run dev` proves distributables work.
2. Keep `contextIsolation` on, `nodeIntegration` off and renderer sandbox enabled. Define a narrow typed preload API. Validate every IPC input in the privileged main process, not only in React/DOM/renderer code.
3. Use `app.getPath('userData')` (or equivalent platform app-data location) for user files and SQLite. Accept text imports through an explicit OS dialog; cap bytes/file counts, reject unexpected types and invalid encodings, and do not execute embedded content.
4. CodeMirror 6 is a **general text editor** here, not a source-code IDE. Implement a small, testable view extension for ghost text and keyboard actions; preserve selection, undo/redo, IME composition, accessibility and normal Tab behavior when nothing is suggested.
5. Run index/database work outside the renderer; perform prediction queries asynchronously. Protect against outdated responses arriving after more typing or source/settings changes.
6. Load optional local brand icon/poster only when present and verified; do not hardcode the author's legal notices from display metadata. Support links open externally only after user action.
7. Package with the minimum build pipeline and test on the **specific supported OS**. No extra backend service, Docker stack, telemetry or global keylogging.

## Verification

First run focused Vitest/IPC tests, then Electron UI smoke checks and real packaged/native-module launches per active story. Record exact commands, OS and results (including skipped checks) in release verification. Do not invent cross-platform success.
