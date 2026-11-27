# Animated Beam source

- Component: Animated Beam, catalog ID 919
- Author: dillionverma (Magic UI)
- Source: https://21st.dev/@dillionverma/components/animated-beam
- Retrieved: 2026-11-27 through the official installed 21st CLI (`get 919 --json`)
- Original SHA-256: `1904e9605bfff3fa35e0d901a5e3841853e45cccc87dc91e132c9bf934e4ddd2`
- License: [Magic UI MIT license](LICENSE.md). Upstream license source: https://github.com/magicuidesign/magicui/blob/main/LICENSE.md.

`animated-beam.original.tsx` contains the unchanged retrieved component source. It was fully read before adaptation. The catalog preview was inspected. Demo brand icons are excluded from the product.

The runtime adaptation is `public/vendor/21st-animated-beam.js`. It preserves the component's quadratic path geometry, layered base and gradient paths, four gradient stops, and directional gradient travel. The app is native HTML/JavaScript; importing React and framer-motion solely for one connector would violate its existing framework boundary. The adapter therefore ports JSX to DOM/SVG construction and Framer Motion interpolation to native SVG animation, with explicit provenance rather than claiming unchanged TSX execution. This is a framework adaptation of the retrieved source, not a new approximation from a catalog description.

Changes: caller-owned SVG coordinates or existing path; native SVG animation; local colors; unique IDs; one finite pulse instead of an infinite loop; reduced-motion support; no demo assets or package dependencies.
