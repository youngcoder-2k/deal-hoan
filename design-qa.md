# Journey reference implementation QA

final result: passed

## Source and scope
- Source visual truth: /var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-64730399-203e-413f-991e-91e9f7343e39.png
- Implementation: http://localhost:3004/#how
- Scope: only the three-step journey section. Existing other sections, calculator, data and scroll controller preserved.
- Source and desktop screenshot: 1918 × 941 pixels; CSS viewport 1918 × 941. Same section-top state; no density normalization required.
- Desktop evidence: /Users/wei/Code/me/deal-hoan/design-evidence/journey-reference/desktop.png
- Full comparison: /Users/wei/Code/me/deal-hoan/design-evidence/journey-reference/comparison.png (source above, final below; 1918 × 1882).
- Focused typography/card-body comparison: /Users/wei/Code/me/deal-hoan/design-evidence/journey-reference/focused-comparison.png (source left, final right).
- Mobile: /Users/wei/Code/me/deal-hoan/design-evidence/journey-reference/mobile.png (390 × 844).

## Comparison history and fixes
1. V1 screenshot: desktop-v1.png. Initial placement had cards approximately 10px too low and oversized section height; image API density produced 126px natural image width for a 282px source asset (P2).
2. Fixes: preserve supplied illustration pixels via unoptimized local Image assets; reduce heading gap and card footer spacing; align heading/body sizes to reference. Actual local images now report natural widths 282/282/286px, not 126px.
3. Final combined and focused comparisons inspected after fixes. Final card top 325.17px, bottom 788.66px vs source approximately 326–787px. White surface, rounded cards, number colors and actual supplied illustrations retained. No actionable P0/P1/P2 differences remain.

## Required fidelity surfaces
- Typography: existing Be Vietnam Pro retained for Vietnamese accents and brand consistency. Large black heading and orange/red second line; orange card titles. Source font not embedded; minor optical differences remain P3, not an exact-font claim.
- Spacing/layout: centered 1460px desktop content, three equal columns, 30px gaps, 32px card radii; near-reference vertical alignment. Equal columns intentionally regularize slightly uneven source card widths (P3).
- Colors/tokens: white background, black text, orange titles, pastel orange/purple/green step numbers and matched heading gradient. Platform screenshot color rendering may differ slightly from reference pixels.
- Imagery: directly extracted three illustration regions and sparkle from user-provided source, no regenerated or code-drawn substitutes, no placeholder imagery. Source resolution is preserved; no fabricated high-resolution detail.
- Copy: Lorem ipsum replaced with truthful short Vietnamese instructions. Same three step headings as reference. Copy remains actual HTML, not text baked into a screenshot.

## Interaction and responsive checks
- 1918px desktop: three aligned cards, no horizontal overflow.
- 768px tablet: three 224px columns, no horizontal overflow.
- 390px and 320px mobile: cards stack; no horizontal overflow, no broken loaded images; text fully readable.
- New cards are informational, not misleading clickable surfaces. Old podium arrows and section CTA removed to match source.
- Existing nearby primary CTA still focuses the Link sản phẩm input. Input remains empty; no external transaction performed.
- Scroll reveal data attributes retained; existing controller's 10 regression checks passed, including reduced motion, focus cancellation and cleanup.
- Illustration loading failure preserves space and hides only decorative image, leaving instructions readable.
- Existing focus-visible treatment retained. Viewport override reset after responsive tests.
- Browser error/warning log query returned [] for the tested production page.

## Implementation checklist
- [x] Reuse exact supplied image assets.
- [x] Replace placeholder text only with actual guidance.
- [x] Scope new styles to referenceScene/reference*.
- [x] Preserve other homepage sections and earlier motion work.
- [x] Desktop/mobile browser comparison.
- [x] Targeted lint, source checks, production build.

## Follow-up polish
- P3: exact source font is unspecified; current brand font and equalized card columns are deliberate implementation choices.
