# App metadata and About

The project uses a small, predictable **`brand/branding.json`** file and optional assets in **`brand/assets/`**. This is **display metadata only**, not a branding framework or source of legal license notices.

The field order below is shared by every repository using this branding structure. Keep the JSON keys in exactly this order and preserve all field values when reordering them.

| Field | Use |
| --- | --- |
| `appName` | Window title, in-app header/About |
| `appTagline` | Project tagline |
| `appDescription` | Project description |
| `appWebsite` | Optional project website; hide the link when empty |
| `appGithubUrl` | Project repository link |
| `appFavicon` | Optional local relative favicon path |
| `appIcon` | Optional local relative icon path (packaging, where supported) |
| `appPoster` | Optional local relative cover/poster image |
| `authorName` | About/footer author name |
| `authorWebsite` | Author link |
| `authorWebsiteLanguages` | Ordered language codes for the author website |
| `authorGithub` | Author GitHub profile |
| `authorWaysToSupportUrl` | General ways to help: stars, forks, shares, subscriptions etc. |
| `authorBuyMeACoffeeUrl` | Direct Buy Me a Coffee support action |
| `supportRemarkText` | Voluntary-support notice |

Optional asset names may be empty. When provided, resolve only within the **packaged brand asset directory**, not arbitrary filesystem or remote URL input; document actual supported image formats when packaging is implemented. Do not show broken images for empty values.

The TND-001 main-process bundle reads this JSON at build time. App name and author are displayed as text. The application defines the Apache-2.0 license label directly. Nonempty HTTPS project/author/support links are exposed to the UI as named actions. Main-process validation resolves those names back to the configured URLs. Empty or invalid links are hidden. The About version comes from Electron's `app.getVersion()`, backed by `package.json`, rather than a second branding version.

The Electron window keeps its default OS icon and all current artwork slots are empty. The About renderer can bundle configured local SVG/PNG/ICO images as separate files, compatible with the existing restrictive CSP; unavailable or empty paths are omitted. Remote artwork is never loaded.

**Legal separation:** the full Apache-2.0 text stays in `LICENSE`, and new handwritten source uses the short two-line SPDX notice. Changing branding must never rewrite either. General JSON/metadata files do not get SPDX source headers.

The maintainer’s **Ways to support** action stays inside **About**. It describes ways to help the developer and projects, rather than technical support. The main editor footer keeps document status and current-year copyright/license/author attribution; support actions stay inside About. The configured URL and display label are retained.


## About presentation

The native About modal displays configured description/tagline, Electron package version, project/author links, support actions, the voluntary-support notice and current-year Apache-2.0 attribution. The renderer bundles the same public root JSON; privileged URL opening still accepts only named, main-process-validated link IDs. The license destination is an application constant and cannot be overridden by display metadata. Tooltips show the complete HTTPS destination and configured language list. Optional local SVG/PNG/ICO artwork is mapped from root assets at build time and omitted when empty or unavailable. Current artwork slots are empty, so About shows a text introduction. Editor text, selections, native editing and CSP/sandbox settings remain intact.
