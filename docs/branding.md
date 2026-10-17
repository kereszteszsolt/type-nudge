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

The version displayed to the user should come from **one real version source** (`package.json` when implemented), not duplicated manually in branding. No user-facing app is currently generated, so no runtime brand loading exists yet.

**Legal separation:** the full Apache-2.0 text stays in `LICENSE`, and new handwritten source uses the short two-line SPDX notice. Changing branding must never rewrite either. General JSON/metadata files do not get SPDX source headers.
