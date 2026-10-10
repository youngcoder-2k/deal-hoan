# Compact cashback card — design QA

Result: **passed** for the scoped right-card refinement.

## References and scope
- Empty reference: /Users/wei/.codex/generated_images/01a04954-d620-7ff1-bf0a-01809dd0a54f/exec-c808896d-28fa-4496-aa39-82dd1bd4faf0.png
- Result reference: /Users/wei/.codex/generated_images/01a04954-d620-7ff1-bf0a-01809dd0a54f/exec-f9339a46-eab0-4d7e-9c55-2d9fd97a50ef.png
- Preserved existing header, left hero, artwork and functional calculation flows. One white calculator surface, compact controls and typography, pale peach reward block with orange cashback emphasis.

## Visual comparison
Compared native browser screenshots at 1558×1009 against the selected designs (empty reference has a 1px taller canvas).
- /Users/wei/Code/me/deal-hoan/design-evidence/compact-empty-comparison-detail.jpg
- /Users/wei/Code/me/deal-hoan/design-evidence/compact-result-comparison-detail.jpg
- /Users/wei/Code/me/deal-hoan/design-evidence/compact-empty-desktop.png
- /Users/wei/Code/me/deal-hoan/design-evidence/compact-result-desktop.png
Reference and implementation panel dimensions: 570×610. Implementation horizontal position differs by approximately 15px because the existing hero grid is preserved. Artwork, icon shapes and real product content differ slightly; no claim of pixel-perfect fidelity.

## Responsive and state checks
Measured empty and result at viewport widths 360, 390, 768, 1024, 1366, 1558, 1920. Desktop/tablet panel: 570×610; 390 mobile: 362×650; 360 mobile: 332×650. Empty/loading/error/result preserve the reserved panel dimensions. All measured states have no document horizontal overflow; normal empty/result content and reward have zero internal overflow. Extremely long content can scroll inside the fixed receipt.

## Interactions and accessibility
Observed real product calculation, Enter submission, empty-input validation, loading, reset, copy success and return to Copy link, purchase notice opening and closing. Existing clipboard/confetti/auth behavior remains unchanged. Focus styles, hover rules, reduced-motion rules and semantic buttons reviewed. OS reduced-motion and screen-reader announcements were not interactively tested.

## Findings resolved
- Shared CSS selector regression corrected before final screenshots.
- Small receipt overflow corrected by reducing financial-row padding.
- No remaining P0–P2 findings in the scoped card. P3: illustration/brand-button color and icon geometry remain the existing implementation assets.

## Engineering checks
Production build passed (exit 0). ESLint: 0 errors, 9 existing home-client warnings. Browser error/warning logs returned an empty list. git diff --check passed. Browser measurement evidence: /Users/wei/.codex/artifacts/deal-hoan-compact-card/browser-metrics.json.

## Follow-up: vertical centering
Passed: removed 70px desktop offset and equalized hero vertical padding. Native DOM measurements show top/bottom gaps 160.164/160.172px at 1558px and 79.102/79.109px at 1024px (subpixel rounding only). Empty and result remain 570×610; 390px stacked card remains 362×650 without horizontal overflow. Screenshot: /Users/wei/Code/me/deal-hoan/design-evidence/centered-card-desktop.png. Production build passed.

## Follow-up: form emphasis
Passed: desktop input/submit increased from 42px to 48px, mobile input 50px and submit 48px. Warm input surface, orange border and stronger button shadow; hover/focus/loading rules retained. Reduced surrounding spacing preserves the fixed panel dimensions and reserved state space. Native browser checks: desktop 570×610, mobile 362×650; no horizontal overflow. Screenshot: /Users/wei/Code/me/deal-hoan/design-evidence/emphasized-input-desktop.png. Production build passed.

## Mobile compact layout follow-up
Passed visual review against the supplied mobile screenshot: illustration reduced from160×145 to108×82; input and submit now share one50px row. Card reduced650→600px with fixed empty/result geometry. Native browser: empty390px has no overflow; results360/390px have no internal/horizontal overflow; desktop remains570×610 with48px controls. Step icons and whitespace reduced. Screenshot: /Users/wei/Code/me/deal-hoan/design-evidence/mobile-compact-empty.png. Build and component lint passed. Existing hover, focus and reduced-motion rules retained.

## 2026-10-10 — Icon-led horizontal guide (latest selected design)

final result: passed

### Scope and visual comparison
- Exact selected reference: `/var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-564ca4f7-d828-4197-82a7-be98f5518ed1.png`.
- Replaced the old large empty illustration/card with a transparent three-step guide. The input remains on its own white surface. Icons dominate small light numbered corner badges; the coin animates gently. Receipt/data-fetch behavior is unchanged.
- Viewed the reference beside the empty implementation at logical 390×844: `/Users/wei/Code/me/deal-hoan/design-evidence/horizontal-steps-comparison.png`.
- IAB captures include a device-scale blank right/bottom margin at DPR1.1. The comparison removes only that margin and normalizes the content to390×844; raw capture is retained as `horizontal-steps-mobile.png`.
- Also opened and inspected `horizontal-steps-tablet.png` (768×1100) and `horizontal-steps-desktop.png` (1440×1100), under `/Users/wei/Code/me/deal-hoan/design-evidence/`.
- P3 differences: reused existing brand/bag/coin/background assets; solid curved Phosphor arrows instead of dotted arrows; mobile guide is approximately40px lower than the mock. No pixel-perfect claim. Existing fixed600px mobile/610px desktop state frame is retained to avoid a layout jump on submit.

### Responsive and interaction evidence
- Measured actual viewport widths320,375,390,600,601,768,900,901,1023,1440,1920. No horizontal document overflow, all three steps share one row, guide fits the panel and is not clipped by the hero.
- Empty/result at390px:362×600. Empty/result at768/1440px:570×610. Tested normal receipt has no internal vertical overflow at768/1440px.
- Empty submission: aria-invalid=true observed. Enter submission of built-in Sony fixture: busy=true, button100%, width82px unchanged, loading heading visible; then receipt appears. This fixture does not verify real Shopee cashback data.
- Copy link: success label appears; later returns to Copy link. Reset: closing animation, empty input, input focus and original guide restored. Clearing while calculation is pending prevents a stale result.
- Long clipboard paste: selectionStart0 and scrollLeft0 observed. Keyboard Tab reaches Tính with visible outline. Guide link navigates to#how. Hover rules retained; reduced-motion CSS statically reviewed, not OS-emulated.
- Contrast fix: eyebrow5.09:1, badges4.97:1; guide5.41:1 and supporting text6.20:1 against the peach fallback. Bright decorative icons remain orange.
- Browser logs after final reload (since09:15:36UTC): no errors/warnings. Older transient FAQ Fast Refresh error predates the final reload; concurrent FAQ fix is preserved.
- Existing generic resolver fallback can return a receipt for invalid text; backend validation/cashback sourcing is unchanged and is not certified by this visual QA.

### Checks and preservation
- Baseline and modified production builds passed. Targeted ESLint:0 errors,12 existing warnings. git diff --check passed.
- Unrelated concurrent FAQ, API route, and cashback-booster changes were not edited or reverted.
- Machine-readable measurements and exact test/rollback commands: `/Users/wei/.codex/artifacts/deal-hoan-horizontal-steps/VERIFICATION.txt`.
