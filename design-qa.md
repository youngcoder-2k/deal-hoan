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
