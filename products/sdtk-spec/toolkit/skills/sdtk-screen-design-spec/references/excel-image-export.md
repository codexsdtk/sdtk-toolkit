# Export images from Excel sheets with pictures or shapes

## When to use this

- The source sheet contains pictures or shapes instead of plain cell text.
- You need a real image export for markdown embedding or numbered overlays.

## Known issues and root causes

1) `Chart.Export()` produces a blank PNG (~1.3KB)
- Root cause: Excel COM chart/picture export is unreliable for complex grouped objects or pictures.

2) Wrong image folder path when using Save As HTML
- Excel writes image assets to a folder named `<basename>.files`
- Example: `export.html` -> folder `export.files` (not `export.html.files`).

3) Excel COM crash / OLE error `0x800a01a8`
- Common root cause: calling `Quit()` on the wrong Excel instance, especially when using `Dispatch`.

4) Two-digit markers lose one digit (`10` displays like `1`)
- Root cause: the oval is too small and the wrap/alignment settings are not appropriate.

## Recommended automated approach

Use the repo script, for example:
`Requirements/_generate_numbered_screen_images.py`

The script should ensure:
- Flatten grouped content and use Save As HTML to get a real PNG export and avoid blank PNG output.
- Use `DispatchEx` when opening a dedicated Excel instance for overlay work to avoid quitting the wrong instance.
- Increase oval size and disable `WordWrap` so 2-3 digit markers remain visible.
- Use the correct `.files` folder convention when exporting HTML.

Run it from the project root, for example:
```powershell
python Requirements\_generate_numbered_screen_images.py
```

## Manual fallback approach

1) Open Excel -> select the UI area to export (picture/group) -> Copy as Picture.
2) Paste it into a blank sheet or a new workbook.
3) Save As -> "Web Page (*.htm; *.html)".
4) Open the `<basename>.files` folder -> choose the `imageXXX.png` file with the most appropriate size.
5) Copy it into `docs/specs/assets/[feature_snake]/screens/` and rename it according to the naming convention.

## If the script fails because Excel renamed a picture

If the script references a `picture_name` such as `Picture 4` or `Picture 7`, and Excel renamed it:
- Open Excel -> select the picture -> inspect or rename it in the Selection Pane, or
- Update the `picture_name` in the script.
