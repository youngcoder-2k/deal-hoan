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
