# Homepage duotone artwork QA

final result: passed

## Target, implementation and state
- Selected source: `/Users/wei/Code/me/deal-hoan/design-evidence/home-icon-duotone/approved-reference.png` (user-selected attachment, 1310 × 1201).
- Local production build: http://localhost:3001/#how.
- Actual desktop: `/Users/wei/Code/me/deal-hoan/design-evidence/home-icon-duotone/modified-desktop.png` (1440 × 5707; CSS viewport 1440 × 1000; DPR 1).
- Reference normalized to 1440 × 1320; implementation crop starts at the journey section, y=1682, 1440 × 1320. Reference scaling is 1.099×; rounded one-pixel height difference is immaterial. No browser chrome.
- Full comparison: `/Users/wei/Code/me/deal-hoan/design-evidence/home-icon-duotone/reference-comparison.png` (reference left, implementation right).
- Focused comparison: `/Users/wei/Code/me/deal-hoan/design-evidence/home-icon-duotone/focused-art-comparison.png` (reference top, implementation bottom).
- Same route, light theme, signed-out state, collapsed guide/FAQ, no copy-success feedback in comparison. Reference contains a scroll-to-top control that lies outside the implementation full-page crop; this is a capture-state difference, not a removed control.
- Scope: replace only five large image assets. Preserve UI structure, CSS, typography, copy, functional Phosphor icons, heroGrid, socialProof, flash section and behavior.

## Findings
No actionable P0/P1/P2 findings. Independent second visual review agrees.

### Required fidelity surfaces
- Fonts/typography: existing family, weights, sizes, line heights, letter spacing and responsive wrapping unchanged. Reference heading/body hierarchy preserved. Text remains real selectable HTML.
- Spacing/layout: desktop before/after section x/y/width/height arrays match exactly, including the protected sections. Three-column journey and guides remain at desktop/tablet; narrow-screen stacked layout remains intact. No new clipping or horizontal document overflow at 1440, 768, 390, 320 or default 1280px.
- Colors/tokens: existing cream, mint, navy, coral UI tokens unchanged. Artwork uses navy contours, cream/orange fill and mint approval check. Orange appears slightly more muted than the selected generated mock (P3), not a contrast or semantic issue.
- Image quality: five generated raster assets, each 720 × 480 transparent WebP. Phone/chain, shopping bag/ticket, wallet/card/check follow the selected silhouettes. Sharing/help extend the same language. Proportionate resize; no stretch, gloss, coins, background rectangles or visible alpha halos. Opaque cream phone surfaces remain readable against navy. Large wallet/help outlines are marginally heavier than phone/bag (P3). Existing optical slots intentionally retained rather than resizing the UI. All ten image placements load successfully on desktop.
- Copy/content: normalized component equals baseline byte-for-byte after reverting the five import suffixes. All visible titles, descriptions, disclosure text and functional icon imports remain unchanged.

## Responsive and interaction evidence
- Desktop: `design-evidence/home-icon-duotone/modified-desktop.png`, `modified-selected-view.png`, `desktop-faq-cta.png`.
- Mobile 390 × 844: `modified-mobile.png`, `mobile-how.png`, `mobile-supporting.png`, `mobile-faq-cta.png`.
- Small mobile 320 × 740: `modified-small.png`, `small-how.png`.
- Tablet 768 × 1024: `modified-tablet.png`, `tablet-how.png`.
- FAQ: click opens answer, Enter closes it, keyboard focus remains on summary; 3px orange focus outline verified. Mobile FAQ also opens and closes without overflow.
- Guide: click opens guidance, Enter closes it. Hover state verified with expected border color rgb(230,173,135); existing image transform transition remains 0.25s.
- Sharing: button shows “Đã copy” and clipboard equals http://localhost:3001/. Prior empty browser clipboard restored. `sharing-success.png` records feedback.
- Journey CTA: focuses the product-link field (aria-label “Link sản phẩm”), preserves empty value and existing empty-state guidance.
- Loading: initially deferred images were observed unloaded, then all ten loaded with nonzero naturalWidth; lazy-loading and blur placeholder code unchanged.
- Error state: no image errors observed. Existing image onError handler and share failure feedback remain byte-identical; no artificial failure was injected.
- Reduced-motion / forced-colors styles, disabled-account styling and all existing transitions remain unchanged (source inspection; OS modes not toggled).
- Browser console: zero warnings/errors observed (`browser-console.json`).

## Verification
- Baseline production build exit 0.
- Modified ESLint (changed TSX), TypeScript and production build exit 0.
- Protected SHA-256 files: 16/16 unchanged; exactly five artwork imports changed; README append-only.
- Rollback tested on an isolated copy: restored three original file hashes (component, artwork README and QA report), retained 16/16 protected files, removed five v2 assets, restored v1 imports and preserved unrelated sentinel. Working project remains modified.

## Comparison history
1. First full and focused reference/implementation comparison passed. No P0/P1/P2 visual correction iteration was needed. The app was not redesigned while packaging the artwork.

## Follow-up polish
- Optional only: tighten contour weight uniformity and match the mock's brighter orange in a later art pass. These are P3 refinements, not blockers, and were not used to broaden this change.

## Implementation checklist
- [x] Five transparent assets generated and placed.
- [x] Original assets retained; only five import paths updated.
- [x] Desktop and responsive browser verification completed.
- [x] Baseline/build/type/lint/scope/rollback checks passed.
- [x] Existing layout and functionality preserved.
