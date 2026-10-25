# Neovide Glow website

The official Neovide Glow website, published at <https://ysrae1.github.io/neovide-glow/>.

Neovide Glow is a personal Neovide customization with glow rendering, native previews, and an integrated Neovim configuration. This website presents the project and links to its releases.

- Application source and downloads: [Ysrae1/neovide](https://github.com/Ysrae1/neovide)
- Current release: [v1.0](https://github.com/Ysrae1/neovide/releases/tag/v1.0)
- Website source snapshot: `f1e01a8ea444b6e1bce941e3d39a8d6685255b52` (2026-10-25)

## Publishing

This repository contains the prebuilt static website at its root. GitHub Pages publishes the `main` branch from `/`; `.nojekyll` preserves the static files without Jekyll processing. No build step is required.

## Credits and licenses

The website retains its component-specific notices and licenses. This repository does not replace them with a single license.

- Neovide icon: Marc Oliver Orth's [Neovide-macOS-Icon](https://github.com/marc2o/Neovide-macOS-Icon), adapted for Liquid Glass by Ysrae1. See [license](licenses/Icon-LICENSE.txt) and [full artwork attribution](licenses/Icon-Attribution.txt), including the Neovide, Rust, and Neovim logo origins.
- Fonts: Inter, Fira Code, and a renamed Noto Sans SC subset. Sources and SIL Open Font Licenses are preserved in [assets/fonts](assets/fonts/README.md).
- Kawarp renderer: MIT; its source record and license are preserved in [assets/vendor](assets/vendor/kawarp-SOURCE.json).
- Character-rain demonstration: [GPL-3.0 license](assets/cmatrix-showcase-LICENSE.txt); source and attribution remain in [cmatrix-showcase.js](assets/cmatrix-showcase.js).
- Platform marks: [sources and attribution](assets/platform-logos/source.md); the relevant trademark and icon notices remain with the assets.
- Additional project acknowledgements appear on the website and in the [application README](https://github.com/Ysrae1/neovide#credits).
