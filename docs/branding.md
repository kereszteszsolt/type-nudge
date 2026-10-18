# Display branding contract

The project uses a small, predictable **`brand/branding.json`** file and optional assets in **`brand/assets/`**. This is **display metadata only**, not a branding framework or source of legal license notices.

| Field | Use |
| --- | --- |
| `appName` | Window title, in-app header/About |
| `appWebsite` | Optional project website; hide the link when empty |
| `appGithubUrl` | Project repository link |
| `authorName` | About/footer author name |
| `authorWebsite` | Author link |
| `authorGithub` | Author GitHub profile |
| `authorWaysToSupportUrl` | General ways to help: stars, forks, shares, subscriptions etc. |
| `authorBuyMeACoffeeUrl` | Direct Buy Me a Coffee support action |
| `license` | Display-only `Apache-2.0` label; **not** a LICENSE generator |
| `appFavicon` | Optional local relative favicon path |
| `appIcon` | Optional local relative icon path (packaging, where supported) |
| `appPoster` | Optional local relative cover/poster image |

Optional asset names may be empty. When provided, resolve only within the **packaged brand asset directory**, not arbitrary filesystem or remote URL input; document actual supported image formats when packaging is implemented. Do not show broken images for empty values.

The TND-001 main-process bundle reads this JSON at build time. App name, author and license are displayed as text; nonempty HTTPS project/author/support links are exposed to the UI as named actions. Main-process validation resolves those names back to the configured URLs. Empty or invalid links are hidden. The About version comes from Electron's `app.getVersion()`, backed by `package.json`, rather than a second branding version.

TND-001 renders no optional images and uses the default Electron window icon; all current asset slots are empty. Loading/packaging nonempty optional image assets and verifying supported formats remains delivery work in TND-006. No remote branding assets are loaded.

**Legal separation:** the full Apache-2.0 text stays in `LICENSE`, and new handwritten source uses the short two-line SPDX notice. Changing branding must never rewrite either. General JSON/metadata files do not get SPDX source headers.

The maintainer’s **Ways to support** action stays inside **About**. It describes ways to help the developer and projects, rather than technical support. The main editor footer contains only document status; no persistent support button is rendered. The configured URL and display label are retained.
