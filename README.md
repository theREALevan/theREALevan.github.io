# Yiwen (Evan) Zhang

An academic homepage with two views of the same research. The default [Classic view](index.html) presents the biography and publication list. The alternate [3D World](world.html) places those publications on a tiny lunar planet, where visitors can drive a rover between research flags, watch floating previews, and open paper details. Both views share the same identity; the academic homepage has a single **Explore 3D World ↗** entry. [classic.html](classic.html) remains a legacy route to the classic homepage.

## Run locally

From this repository:

```sh
python3 tools/serve.py --port 8766
```

Open <http://127.0.0.1:8766/> for the classic homepage, or <http://127.0.0.1:8766/world.html> for the 3D view. The server binds to loopback by default and supports byte-range requests for the publication videos. Serve the files over HTTP; opening `world.html` directly with `file://` does not support its ES module loading.

For a remote VS Code session, forward remote port **8766** in the **Ports** panel and open its forwarded address in your local browser. The remote server’s localhost address alone is not reachable from your laptop.

## 3D controls

The 3D view opens directly to a small, centered planet with a prominent rover and publication flags. Keyboard and touch controls are immediately available. As you drive around the sphere, the camera follows smoothly while keeping the planet centered.

| Input | Action |
| --- | --- |
| **WASD** or **arrow keys** | Drive forward, reverse, and steer |
| **E** or **Enter** | Open the nearby publication |
| **Space** | Brake |
| **R** or **Reset view** | Return the rover to base and restore the starting camera view |
| Drag the scene / mouse wheel | Orbit / zoom the camera |
| Click a flag, outpost label, or map marker | Autopilot to that publication; manual driving takes over |
| **Publications** | Search the publication index and read any paper directly |
| **Play preview / Pause preview** | Control the nearby publication’s floating video |
| **?** | Open controls and the reduced-motion / autoplay setting |
| **Source & credits** | Open the repository link, library attribution, and inspirations |

On phones, use the on-screen arrow controls to drive immediately. Approaching a flag projects its video or image above the planet. Its **Read paper** button opens the full publication; clicking its 3D display while nearby does the same. Dialogs pause driving and preview playback and close with **Escape**, the close button, or a click outside. The map’s discovery count is stored locally in the browser.

If WebGL fails, the research index still works. The classic homepage is also linked from the fallback, the index, and a keyboard skip link; it remains available without JavaScript. The world respects the system’s reduced-motion preference, with an additional setting in the controls dialog. Reduced motion also pauses preview autoplay; **Play preview** remains available for explicit playback, including when the browser blocks autoplay.

## Files and content

This is a no-build static site: plain HTML, CSS, native JavaScript modules, and Three.js. No package installation or application backend is required.

| File | Responsibility |
| --- | --- |
| `index.html` | Default classic academic homepage, with the view switch |
| `classic.html` | Legacy route containing the same classic homepage |
| `world.html` | Alternate 3D view shell, biography, dialogs, navigation, and fallback |
| `world/publications.js` | Publication metadata, links, teaser media, colors, and outpost positions |
| `world/scene.js` | Original procedural sphere, rover, research displays, habitat, and animation |
| `world/spherical-motion.js` | Surface steering, rover orientation, spherical distances, and obstacle-aware routes |
| `world/hologram.js` | Nearby video/image projection, playback lifecycle, and reduced-motion behavior |
| `world/app.js` | Rendering, controls, camera damping, route/proximity coordination, and UI |
| `world/style.css` | Responsive interface, typography, dialogs, and motion preferences |
| `world/vendor/` | Locally vendored Three.js modules and license |
| `tools/serve.py` | Local HTTP preview with video byte-range support |
| `tools/browser-check.py` | Classic/World switching, responsive layout, keyboard/touch, and WebGL fallback checks |
| `tools/sphere-browser-check.py` | Full-planet driving, camera damping, all four holograms, playback, and source credits |
| `tools/spherical-motion-check.mjs` | Great-circle movement, poles, orientation, and obstacle-safe routes |
| `tools/loading-check.py` | Local-only loading, startup recovery, fonts, and video byte ranges |

The planet has a radius of 18 scene units, with the rover enlarged to 1.5× and outposts to 1.22× their base geometry. Movement follows the sphere and preserves the rover’s heading as the surface bends. The camera uses frame-rate-independent quaternion damping around the planet’s center. A single floating preview loads local media on approach, uses Three.js `VideoTexture` for videos, and releases the media when you leave.

To update a publication, edit its object in `world/publications.js`. Keep `id` unique and stable; set `shortTitle`, `title`, `authors`, `category`, `venue`, `description`, `links`, and `media`. Media paths are relative to the site root; `.mp4` entries use a video player, and other entries use an image. `color` uses a six-digit hex value. `x` and `z` are surface-distance map coordinates centered on the north pole; `normalFromMap()` in `scene.js` maps them onto the sphere. Leave room around displays and the habitat for rover access.

Keep the classic publication lists in `index.html` and `classic.html` synchronized with `world/publications.js`; the views do not yet generate their content from one shared source. When adding or removing publications, also update the fixed counts in `world.html` and the discovery-count denominator in `world/app.js`. Keep biography and contact edits consistent across `index.html`, `classic.html`, and `world.html`.

Three.js **0.186.1** is vendored under the MIT license in `world/vendor/THREE-LICENSE.txt`. The minified module’s core imports have been rewritten to `./three.core.min.js` so rendering does not require a CDN. Typography is self-hosted under `assets/fonts/` with `font-display: swap`; rendering does not depend on Google Fonts requests. Font licenses are included alongside the WOFF2 assets.

## Hosting

The repository root is ready to serve directly on GitHub Pages: retain `index.html`, `classic.html`, `world.html`, `world/`, and the existing media directories together. The default route opens the classic homepage; `world.html` is the alternate 3D view. There is no build step or server-side routing.

## Research and credits

[Website source](https://github.com/theREALevan/theREALevan.github.io) is the repository for this site. The 3D view is an original procedural implementation built with [Three.js](https://threejs.org/). Three.js is vendored under its MIT license. Its driving interaction is inspired by [Bruno Simon’s portfolio](https://bruno-simon.com/); Bruno’s code is not a dependency, and no portfolio code, models, textures, or scene assets were copied.

Interaction and tooling research included these primary sources:

- [Bruno Simon’s portfolio](https://bruno-simon.com/) — a navigable driving world with discoverable interaction points.
- [Bruno Simon’s portfolio source](https://github.com/brunosimon/folio-2025) — reference for world, vehicle, and camera architecture.
- [Maxime Morel’s 3D room portfolio](https://github.com/maxime-mrl/3D-room-portofolio) — object-based navigation as an alternative presentation.
- [Three.js terrain raycasting example](https://threejs.org/examples/webgl_geometry_terrain_raycast.html) — terrain and picking reference.
- [Ecctrl](https://github.com/pmndrs/ecctrl) — researched vehicle and character controls; not a dependency of this implementation.
- [Drei Html](https://drei.docs.pmnd.rs/misc/html) — researched scene-linked labels; this site uses its own DOM label projection.

Publication media comes from the existing academic site. The classic homepage is based on [Jon Barron’s website template](https://github.com/jonbarron/jonbarron.github.io).
