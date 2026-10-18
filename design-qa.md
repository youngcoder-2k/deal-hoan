# DealHoàn support/editorial redesign — 2026-10-18

## Target and scope
Implement four user-selected desktop reference designs: cashback story/phone, image-led guides, two-column orange FAQ, and horizontal closing banner. Existing header, hero, calculator, journey, backend and shared footer are preserved. User requested improvements rather than an exact clone.

## Comparison evidence
`design-evidence/support-editorial/{story,guides,faq,cta}-comparison.png` places the supplied source above the implementation. Story captured at 1672px; guides/FAQ/CTA at 1918px. Comparison panels downscaled equally to 900px; section-height differences reflect real copy and responsive content, not an asserted pixel match. Full captures and region coordinates are retained. Mobile has no supplied target: evaluated as responsive adaptation.

## Fidelity surfaces
- Typography: existing app font retained; two-line black/orange headings, bold editorial hierarchy, smaller explanatory text. Final pass increased display scale and narrowed the guide grid to match source proportions more closely.
- Spacing/layout: story and FAQ split layouts; three image cards; pouch/text/actions horizontal CTA. Mobile stacks naturally. Legacy global header border/sticky rules neutralized for the guide heading.
- Color: white/ivory base with orange headings and warm artwork. Controls use darker orange (#c84312) for white-text contrast (~4.92:1) instead of source's low-contrast bright orange. Focus ring uses blue.
- Images: six original generated raster assets, consistent art direction, transparent phone/chat/pouch, clear subjects, optimized WebP. All six loaded with naturalWidth>0 in production. Phone is explicitly promotional illustration, not functional embedded UI.
- Copy: repeated placeholder guide titles/questions replaced with distinct useful articles and six real FAQ answers. Current 50,000đ withdrawal policy retained; no guarantees or unsupported native-app availability.

## Interactions/accessibility
- Native details FAQ expands and collapses with Enter; visible focus outline observed.
- Closing CTA scrolls to and focuses `Link sản phẩm` input (observed INPUT aria-label).
- First guide navigates to /how-to; all six linked destinations returned HTTP200.
- Account button reuses real sign-in/account callbacks; loading label and disabled state retained. No production OAuth or payment action executed.
- Focus-visible styles and reduced-motion rules included; no automatic animations. Meaningful illustration alt text; decorative artwork has empty alt.
- 320/390/768/1024/1440/1918px: no horizontal document or scoped-section overflow in recorded checks. All three guide cards remain available. Existing desktop/mobile footer retained.
- Production browser console: no errors observed after all assets loaded.

## Findings resolved
P1: two newly generated illustrations initially unavailable because the test server started before files existed — restarted after assets completed; all six images confirmed loaded.
P2: legacy global header border affected guide heading — explicitly reset locally.
P2: white text on source-bright orange lacked contrast — darker functional orange used.

## Accepted differences / P3
No App Store or Google Play badges: no verified native app exists; replaced by real calculate/how-to actions. Illustrations are newly generated, not pixel-identical to reference. Real text changes answer/card heights. Smaller mobile FAQ illustration avoids taking excessive vertical space.

## Validation
Production webpack build, targeted ESLint, asset/route checks and rollback-copy checks recorded in the evidence folder. Final responsive/interaction pass confirmed the revised UI.

final result: passed
