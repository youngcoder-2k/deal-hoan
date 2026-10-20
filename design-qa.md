# Exact guide artwork — scoped QA

final result: passed

## Source and scope
- Source truth: /var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-d7373e24-be02-426d-98f0-2f3b419b2ad1.png, 1918×941.
- Scope requested: use the three exact images from this design, not regenerate similar pictures. Existing typography, card/grid layout, copy and destinations intentionally preserved.
- Implementation: http://localhost:3012/#guides, production build. Browser viewport 1918×941 desktop and 390×844 mobile, density1.
- Evidence: design-evidence/guide-reference/desktop.png (1918×1029 section), mobile.png (390×1983 section), baseline.png, rendered-images.png.
- Combined full view: design-evidence/guide-reference/comparison.png. Source left at959×471, final right at959×515; different section heights reflect preserved current layout, not an overall clone claim.
- Focused required-image comparison: design-evidence/guide-reference/focused-comparison.png. Top: three original383×371 crops; bottom: browser-rendered images normalized back to383×371. Opened together and reviewed.

## Findings / history
- Baseline used three generated substitutes, not the supplied source images. Replaced only three source paths and changed image containers from1.22 desktop/1.4 mobile to383/371 (P1/P2 corrected).
- Exact equality test compares decoded RGB bytes of all three shipped PNGs against the three source crop rectangles: passed. No fabricated detail, regeneration or recompression.
- Final review: phone/hand, gold piggybank, woman/blue shopping composition and embedded text preserved. No actionable P0/P1/P2 findings within image-replacement scope.

## Required surfaces
- Typography: surrounding HTML text, Be Vietnam Pro and hierarchy unchanged. All lettering within source images remains raster source content.
- Spacing/layout: existing homepage gutters, desktop3-column grid and mobile1-column preserved. Image boxes now preserve source aspect383:371 at each breakpoint; no document horizontal overflow at390 or1918.
- Colors/tokens: surrounding styles unchanged; lossless PNG exact RGB confirmed. Browser screenshot rendering/interpolation may visually differ slightly.
- Imagery: original383×371 pixels extracted from source positions (359,283),(767,283),(1175,283). No up-resolution detail claims; desktop display approximately465×450 involves scaling. Large originals, if later supplied, could sharpen desktop presentation (P3).
- Copy: original article titles/descriptions/categories and all destination links remain. Repeated placeholder text from design intentionally not copied, per scope.

## Functional checks
- Browser naturalWidth383 and complete=true for all3 images.
- Clicked cards navigate to /how-to, /cach-san-sale-shopee, /cashback-shopee-la-gi respectively.
- Console errors: [].
- Focus-visible, hover and reduced-motion rules preserved. No new controls, loading logic, empty/error API states introduced; forced asset failure not tested.
- ESLint and production build passed. Isolated rollback restored baseline component/styles byte-for-byte; main workspace keeps new images and ratios.
- No push or deployment performed for this request.

## Follow-up polish
- Full-resolution original photos could improve sharpness when displayed larger than383px. No invented replacement or artificial sharpening applied.
