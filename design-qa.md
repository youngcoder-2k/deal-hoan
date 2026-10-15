# Journey podium section — image-to-code QA

final result: passed

## Source and rendered evidence
- Exact selected source: `/Users/wei/Code/me/deal-hoan/design-evidence/journey-glass/reference.png`, 1707×921px.
- Production preview: http://localhost:3001/?preview=journey-glass-final#how.
- Final implementation: `/Users/wei/Code/me/deal-hoan/design-evidence/journey-glass/implementation-final.png`, 1707×921px.
- Same-view comparison: `/Users/wei/Code/me/deal-hoan/design-evidence/journey-glass/comparison-final.png`, source left / implementation right.
- Focused typography comparison: `/Users/wei/Code/me/deal-hoan/design-evidence/journey-glass/heading-comparison-2.png`.
- CSS viewport1707×1000, DPR1. The real section measures1707×919.609px; screenshot crop is1707×920 and normalized by1px vertically to the reference921px. No browserchrome; signed-out, empty calculator, same static step content. Floating scroll-to-top control is page infrastructure, not a source-design asset.

## Comparison history and resolved findings
1. `comparison-1.png`: [P1] inherited global header styling created a white rectangle behind the intro; [P1] the headline wrapped to three lines and overflowed its column. Fix: reset header positioning/background, tune headline to the existing Be Vietnam Pro family at64px and adjust left-column ratio to.53. Postfix: `comparison-2.png` and `heading-comparison-2.png` show transparent background and two clean headline lines.
2. Responsive capture `responsive-before-1280.png`: [P2] phone top overlapped the last description line on laptop widths. Fix: reserve490px card height at1101–1300 and32px extra at1301–1500. Postfix: `laptop-after.png`; first paragraph bottom199.375px, first visible subject top approximately220px, no overlap. The1707px reference layout remains unchanged.
3. Final comparison and responsive checks: no actionable P0/P1/P2 findings remain.

## Required fidelity surfaces
- Typography: existing Be Vietnam Pro retained, navy bold headline, orange second line, real HTML copy and numbered ordered list. Desktop heading64px/70.4px gives the reference's two-line shape; card titles24.4px and body19px. Mobile31–43px headline retains two lines. The mock font has slightly different glyph proportions; no artificial glyph stretching used.
- Layout/spacing: full-width architectural backdrop; left intro and three right arches, consistent podium baseline and centered CTA. At1707px the section is919.609px high against921px source. Existing sections before/after and all unrelated layout/styles remain protected. Laptop cards gain breathing room; tablet intro stacks above three columns; mobile cards stack vertically with downward connectors and full-width CTA.
- Colors/tokens: navy/coral/ivory/champagne-gold palette follows the source. Glass panels retain transparency and soft border. Number badges and CTA use native UI styling; scene/object/underline imagery is real generated raster artwork, not CSS drawings or a rasterized page.
- Images/quality: three individually generated transparent3D objects/podiums, a separate1707×921 room background, and transparent underline. All packaged assets fit their slots proportionately with full pedestals visible. No alpha halo or unwanted image box observed. Non-journey illustrations continue using the existing duotone files unchanged.
- Copy/content: heading, three step titles/descriptions and CTA preserved. The intro's second sentence is separated by a real line break to match source. No amounts/rates/marketing claims added. UI text stays selectable and accessible.

## Responsive and behavior checks
- Final screenshots: `section-1707.png`, `section-1440.png`, `section-768.png`, `section-390.png`, `section-320.png`; `laptop-after.png` at1280px.
- No horizontal document overflow at1707/1440/1280/768/390/320. Every card title fits; headline emphasis fits its column; all four inline images loaded successfully. Background image also rendered.
- CTA remains the original onStart action. Keyboard ArrowRight focuses the button, exposes a3px orange focus outline; Enter focuses the product-link input with aria-label “Link sản phẩm”, preserves empty value and existing empty-state guidance.
- Hover observed: transform matrix(1,0,0,1,0,-2), expected elevated shadow; transition0.2s. Reduced-motion rule disables movement; forced-colors rules preserve borders/focus. OS preference modes inspected in source, not toggled.
- Lazy loading observed pending→loaded. Existing Artwork blur placeholder/onError hiding behavior remains unchanged; no synthetic image error injected. Static journey has no independent empty/error state. Other calculator loading/empty/error logic is untouched.
- Console warnings/errors:0 (`browser-console.json`).

## Verification/build
- Baseline isolated snapshot:177/177 original hashes passed and Webpack production build passed.
- Modified scope test:174/174 protected hashes; all JSX outside #how and existing CSS byte-identical;3steps and original CTA preserved;5real image assets.
- ESLint passed for changed TSX. Modified production build via documented `npm run build -- --webpack` passed.
- Default Turbopack builds encountered an environment-level internal port-binding denial, even after retry. Webpack production builds (baseline and modified) completed with approved font network access; no app build configuration changed. This default-bundler environment failure is retained in logs, not represented as a source-code failure or a passing Turbopack check.

## Follow-up polish — P3, nonblocking
Generated object pose/material details, mock font glyph proportions and CTA gloss are close rather than pixel-identical. The implemented UI preserves the existing product font and real interactive elements. No100%fidelity claim.

## Completion checklist
- [x] Selected reference used for all five real assets.
- [x] Intro/cards/CTA rebuilt only within the journey section.
- [x] Desktop full and focused source comparison completed.
- [x] Responsive, focus, hover, keyboard CTA and console checked.
- [x] P1/P2 findings fixed and recaptured.
