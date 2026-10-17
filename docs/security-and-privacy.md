# Security and privacy boundaries

**Offline application:** no network calls for autocomplete, corpus indexing, text saving or metrics. No Ollama, OpenRouter, telemetry, auto-update, remote spellcheck, global keylogging or system-wide autocomplete. A user can deliberately open project/support URLs in their external browser; those links do not power the app.

## Electron isolation

- Restrict renderer privileges: `contextIsolation: true`, `nodeIntegration: false`, sandboxed renderer and a restrictive CSP.
- Preload exposes only named, input-validated IPC functions needed for prediction, settings, file import and save. No arbitrary SQL executor, shell access, arbitrary path reader or wide `ipcRenderer` passthrough.
- The main process validates selected file types and limits again. Local imported text is data, not code or trusted HTML.
- Prevent unexpected navigation, popups and untrusted remote content in the application window. Launch author links in an external browser only on user action.

## Storage

SQLite and saved documents reside in the OS-specific Electron `userData` directory with normal user-level permissions. Do not commit databases, imported text, personal notes, or build artifacts to Git. Provide source deletion and reset of learned content. Explain that backups or normal OS filesystem access may expose the unencrypted DB — do not advertise cryptographic protection that does not exist.

## Import safety

Accept `.txt` and `.md` only, with explicit UTF-8 decoding, file-count/size caps and recoverable errors. Do not follow symlink chains or recursively scan a directory in the MVP. No automatic import of clipboard, browser, email or documents from other applications.

## Packaging and dependencies

Pin and audit dependencies used for Electron, CodeMirror, SQLite and Forge. Keep security settings intact in packaged builds. Test the native SQLite module in actual desktop packages; development-mode behavior is insufficient evidence. Preserve third-party license notices.
