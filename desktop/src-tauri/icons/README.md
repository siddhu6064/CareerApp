# Tauri icons

Tauri's bundler needs platform-specific icon formats for native installers:

- `icon.icns` — macOS bundle (run `iconutil` from a real macOS box, or use [tauricon](https://github.com/tauri-apps/tauri/tree/dev/tooling/cli/templates/icons))
- `icon.ico` — Windows installer (generate from a 256×256 PNG using ImageMagick: `magick icon.ico.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`)

Both placeholder PNGs are committed (`icon.icns.png`, `icon.ico.png`). Replace
them with real `.icns` / `.ico` before running `cargo tauri build`.

The PNGs (32×32, 128×128, 128×128@2x, icon.png) are correct as-is.

## One-shot generation script (run from a real Mac with iconutil + magick)

```bash
cd desktop/src-tauri/icons
# .icns
mkdir icon.iconset
sips -z 16 16   icon.icns.png --out icon.iconset/icon_16x16.png
sips -z 32 32   icon.icns.png --out icon.iconset/icon_16x16@2x.png
sips -z 32 32   icon.icns.png --out icon.iconset/icon_32x32.png
sips -z 64 64   icon.icns.png --out icon.iconset/icon_32x32@2x.png
sips -z 128 128 icon.icns.png --out icon.iconset/icon_128x128.png
sips -z 256 256 icon.icns.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 icon.icns.png --out icon.iconset/icon_256x256.png
sips -z 512 512 icon.icns.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 icon.icns.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 icon.icns.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns
rm -rf icon.iconset

# .ico (uses ImageMagick — `brew install imagemagick`)
magick icon.ico.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico
```
