# TND-001: Electron foundation and editor

## Status

Planned

## User story

As a writer, I want an approachable, offline desktop editor so that I can write plain text without a browser or online service.

## Goal

Initialize a minimal secure Electron/TypeScript application with Vite, CodeMirror 6, basic display branding and development/desktop run commands.

## Dependencies

None — first implementation story.

## Acceptance criteria

- [ ] Pin compatible Electron, TypeScript, Vite, CodeMirror 6 and Electron Forge versions; create the minimum project manifest, lockfile and documented commands.
- [ ] Display a usable single-window, plain-text CodeMirror editor with normal typing, selection, copy/paste, undo/redo and keyboard accessibility.
- [ ] Enable `contextIsolation`, renderer sandbox and disabled renderer Node integration; add restrictive CSP and a minimal typed preload/IPC boundary (no arbitrary SQL/FS access).
- [ ] Read display metadata from `brand/branding.json`; show app name and discreet About/support links. Empty optional asset fields never create broken images; the displayed version comes from package metadata.
- [ ] Do not make network requests for app functionality, implement global keyboard hooks, use external models or add an unnecessary server/monorepo framework.
- [ ] Add focused startup/editor/IPC tests or verifiable smoke steps. Run real development launch and record the OS, commands and outcome, including any limitations, in release verification.

## Out of scope

No SQLite import/index, personalized learning, inline predictions, installer claims or AI APIs. Do not start TND-002 before approval.
