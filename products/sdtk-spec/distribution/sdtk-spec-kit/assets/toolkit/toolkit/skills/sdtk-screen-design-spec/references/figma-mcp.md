# Figma MCP: extract layout, styling, tokens, and screen images

## Parse the Figma URL

Example URL:
`https://www.figma.com/design/<fileKey>/<fileName>?node-id=<nodeId>&m=dev&t=...`

- `fileKey` = the segment after `/design/`.
- `nodeId`:
  - query param `node-id=1-2695`
  - convert to API format: `1:2695` (replace `-` with `:`).

## Fetch layout and styling data first

Use MCP:
- `mcp__figma__get_figma_data`
  - Input: `fileKey`, `nodeId`
  - Recommendation: try `depth=2` or `depth=3` first, then increase only if data is missing.

When summarizing into `docs/specs/[FEATURE_KEY]_FIGMA_LAYOUT.md`, keep this structure:
- Design Structure: frame dimensions, components/instances, key layers, variants/properties.
- Styling Data: color (Hex/RGB), typography (font/size/weight/line-height), shadow/opacity/border.
- Layout Information: padding/gap/alignment, width/height, border radius.
- Design Tokens: color/typography/spacing tokens when named styles exist (for example `style_...`).

## Handle `429` and partial data

If you hit `429 Too Many Requests`:
1) Reduce `depth` and try again.
2) Wait and retry with backoff (20s -> 40s -> 80s).
3) If it still fails, leave the unavailable sections blank and record a clear note that the omission is due to `429`.

Do not invent colors, typography, or tokens when the source data is unavailable.

## Export screen images

Use MCP:
- `mcp__figma__download_figma_images`
  - Input: `fileKey`, list of `nodes` (`nodeId`), `fileName` (`png`), `pngScale` (usually `2`).

Notes for `localPath`:
- Some environments block absolute paths.
- Use a repo-relative temp folder first, for example `Requirements/_tmp/figma_downloads`, then copy the images into:
  - `docs/specs/assets/[feature_snake]/screens/`

## Image naming convention

Use stable filenames so markdown embeds do not need frequent updates, for example:
- `screen_3_1_main.png`
- `screen_3_2_search.png`
- `screen_3_3_dialog.png`
- `screen_3_3_dialog_numbered.png`

If an image is later replaced by an Excel-derived export, keep the same filename to avoid rewriting multiple markdown links.
