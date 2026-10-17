# Homepage support and documentation QA — 2026-10-17

## Scope
Benefits, FAQ, guide cards, final CTA, footer and related help pages. Existing hero and journey retained. Reference: https://hoanngay.vn/.

## Evidence
Reference desktop/mobile captures: `design-evidence/support-redesign/reference/`.
Implementation captures: `design-evidence/support-redesign/benefits-desktop.png`, `faq-desktop.png`, `guides-desktop.png`, `docs-desktop.png`, `faq-mobile.png`, `docs-mobile.png`.

## Checks
- Desktop 1440px: compared card grid, typography, spacing, FAQ, guide navigation and article layout against source.
- Mobile 390px: FAQ toggle and article navigation exercised; no horizontal overflow observed.
- FAQ supports independent expansion; first question opens initially.
- Guide click opens a real article; TOC anchors navigate to the selected section.
- 21 article definitions have unique slugs/section IDs; all featured links resolve.
- Existing journey JSX and CSS match baseline.
- Focus-visible and reduced-motion styles included; final CTA reuses existing account/start callbacks.
- Production webpack build and targeted ESLint checked separately in evidence logs.

## Intentional differences / limits
DealHoàn branding and original help copy are retained. Withdrawal information reflects the current 50,000đ threshold, not another service's policy. No unimplemented native app, gift, official-partner or support-contact claims were copied. Visual parity is not claimed as 100%. Live account login, payments and withdrawals were not executed.


## Reward ticket — selected design implementation, 2026-10-17

### Findings and resolved iterations
- P2 resolved: the first ticket notches retained the straight perimeter behind them. Removed the obsolete clipping and used clipped half-circle cutouts. Final comparison images show clear side cutouts aligned with the dashed divider.
- Accessibility refinement: visible amount omits the currency suffix, as selected; a visually hidden “đồng” span preserves the spoken unit. Replaced an unsupported naming approach on strong. Decorative coin and percent marks are excluded from accessibility content.
- Final independent read-only visual/source review found no actionable P0/P1/P2 issues.

### Source and evidence
- Exact selected source: /Users/wei/.codex/generated_images/01a1356c-bd78-7f80-b23e-79bc07a0834e/exec-ffb65769-5152-45fc-a4b8-3ee5f1eb0188.png.
- Production preview: http://localhost:3002/?preview=reward-ticket. Actual sample https://shopee.vn/tai-nghe-sony yields77.000/5%, rather than mock24.750/15%; data was not changed to imitate the mock. Both comparisons show the resolved-result state.
- Full captures: design-evidence/reward-ticket/desktop-full.jpg (1440×1000CSS px,DPR1), mobile-full.jpg (390×900CSS px,DPR1). Panel crops: desktop.png571×611; mobile.png390×605.
- Focused comparisons: compare-desktop.png and compare-mobile.png in the same evidence folder. Source above, implementation below. Desktop source reward crop889×261 normalized to530px width; implementation531×163 normalized to530. Mobile source454×218 normalized to334px width; implementation334×139. Normalization is for density comparison, not a claim of pixel identity.

### Required fidelity surfaces
- Typography: retained existing Be Vietnam Pro, centered label/number/pill; amount800 weight and compact responsive sizing. Numerals have no visible trailing đ; product price outside the reward is unchanged.
- Spacing/layout: ticket desktop530×161.34px; mobile334×137.57px at390px and264×127.91px at320px. The mobile ticket is intentionally more compact than the normalized mock. Coin34px desktop/28px mobile, centered amount group, dashed footer and pill below.
- Colors/tokens: mint surface, green number#079447, border#35d86d, pale-green percent library icons. Existing glass reflection is retained with reduced-motion/transparency fallbacks. Screenshot rendering is more muted than the generated reference; treated as minor color polish, not perfect fidelity.
- Image quality: generated transparent gold đ coin stack in public/hero/cashback-coin-stack.webp,272×216; proportional, no placeholder or emoji, no stretching or visible box. Small size remains secondary to the amount.
- Copy/content: “Bạn được hoàn dự kiến” and dynamically calculated “Hoàn …% giá trị đơn hàng” preserved. Unknown-price explanatory state remains; zero/long/fractional rate formatting tested.

### Responsive and interaction checks
- Browser widths320/390/768/1440: no horizontal document overflow; loaded coin and centered amount (maximum center deviation0.004px), all content fits. Metrics: browser-checks.json.
- SSR fixture edge cases (zero,long,very long,unknown) tested in browser at the same viewport widths; no overflow. Fixture has slightly wider mobile cards than the live page; no claim of exact live long-amount coverage. Results: fixture-checks.json.
- Copy link changes to “Đã copy”; keyboard Tab exposes the Mua ngay focus outline; Tính link khác clears the result; recalculation returns the result. Buy link destination retained, not opened.
- Loading state observed with disabled calculate button. Empty/loading SSR markup verified. Existing invalid-link resolver may return a generic product, so no invalid-link error pass is claimed.
- Console warning/error entries:0. Pointer reflection handling, reduced-motion/transparency and forced-color styles reviewed in source; OS preferences not toggled. No new interactive controls/network logic introduced.
- Scope test asserts TSX outside the reward area is byte-identical to baseline. ESLint, CSS parse, git diff --check and production Webpack build pass.

### Checklist and follow-up
- [x] Selected centered ticket and small gold coin implemented for desktop/mobile.
- [x] Actual data, surrounding controls, product display and calculator logic preserved.
- [x] Combined source/rendered comparisons reviewed after fixes.
- [x] Production build, responsive and interaction checks completed.
- P3 only: generated coin texture and screenshot font/color rendering differ slightly from the mock.

final result: passed
