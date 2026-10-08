# Homepage redesign — visual and interaction QA

final result: passed

## Scope and source of truth

Implement both selected desktop states, retain the real product/auth/affiliate flow, and adapt the hero to smaller screens. Lower homepage sections are retained rather than redesigned.

- Result reference: `/var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-aca0fcee-4313-4db4-920e-12f68080c0e0.png`
- Empty reference: `/var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-38962b1a-0348-4114-b339-fc6b1bec9066.png`
- Local implementation: `http://localhost:3000/`
- Source pixels: 1555 × 1012 each. Implementation pixels and CSS viewport: 1555 × 1012, effective screenshot density 1×. No device chrome in either image.
- Same empty and resolved-product states were compared. The real NAM BẮC product returned 198,000đ payment, 13,860đ cashback (7%), 184,140đ net cost. The current original price is 582,000đ, not the reference's 267,000đ; data was not replaced to force a visual match.
- Auth difference is intentional: the test browser is signed out; the source depicts Huy signed in. Existing real account controls remain conditional on Supabase state.

## Final evidence

All paths below are relative to this repository. Each comparison places the source on the left and browser-rendered implementation on the right; both were opened together for review.

- `design-evidence/desktop-empty-final.jpg`
- `design-evidence/desktop-result-final.jpg`
- Full views: `design-evidence/empty-comparison-final.jpg`, `design-evidence/result-comparison-final.jpg`. Both halves normalized to 778 × 506.
- Focused right-panel views: `design-evidence/empty-detail-final.jpg`, `design-evidence/result-detail-final.jpg`. Each half is a native-scale 750 × 850 crop at x=685, y=144.
- Mobile: `design-evidence/mobile-empty-final.jpg` (390 × 844), `design-evidence/mobile-result-final.jpg` (390 × 844), `design-evidence/mobile-360-result-final.jpg` (360 × 800).
- Additional breakpoint checks: `design-evidence/tablet-768-final.jpg`, `design-evidence/tablet-1024-final.jpg`, `design-evidence/laptop-1366-final.jpg`, `design-evidence/pc-1920-final.jpg`. These were captured before the last desktop-only typography/spacing refinement; mobile 360px and desktop 1555px were rechecked afterward.

## Findings and comparison history

### Pass 1 — blocked

Evidence: `empty-comparison-pass1.jpg`, `result-comparison-pass1.jpg`, and `mobile-result-top.jpg` in `design-evidence/`.

- [P2, fixed] Cashback amount was too small relative to the selected hierarchy. Increased responsive amount size while retaining smaller long-number styling.
- [P2, fixed] Empty illustration lacked its peach halo; heading and body copy were too small. Regenerated the illustration with the halo, adjusted scale and typography, and retained a cache-distinct local asset path.
- [P2, fixed] Mobile slogan broke into an orphaned final word and decorative art crowded its right edge. Preserved the explicit two-line cashback phrase and reduced/repositioned mobile artwork.

### Pass 2 — blocked

The combined full-view and focused right-panel inspection showed additional P2 text/layout drift: the result's payment text, purchase button and footer were undersized, and the result wrapper was narrower than the selected design. Increased those type sizes, widened/aligned the desktop panel, and tightened slogan line-height and receipt row spacing.

### Pass 3 — passed

Evidence: the four final combined comparisons above, opened after the last capture. Cashback is the dominant result value; payment remains secondary; both empty and result panels follow the source's placement and grouping. All actionable P0–P2 findings in this scope are resolved.

## Required fidelity surfaces

- **Fonts/typography:** retained the app's Be Vietnam Pro with Vietnamese glyph support. Heavy burgundy/orange display hierarchy, readable empty-state heading, very large white cashback, and smaller payment/net-cost tiers. Explicit mobile wrapping; product names clamp rather than expand the card without bounds. Exact generated-reference glyph shapes are not claimed.
- **Spacing/layout:** two-column desktop grid, white translucent outer calculator shell, bordered inner state, aligned form controls, and clearly separated conditions/reset action. Single-column tablet/mobile adaptation, stacked mobile submit control. No document-width overflow at 360, 390, 768, 1024, 1366, 1555 or 1920px.
- **Colors/tokens:** orange utility/actions/reward, dark burgundy headline, cream-peach background, neutral prices and secondary copy. Hover/focus/copy success states remain visually distinct. Source highlights use more complex lighting than the solid functional orange controls; see P3 below.
- **Image quality:** real generated raster bag/plinth, floating dong coins, link/coin halo and ribbon background. No CSS/SVG illustration stand-ins. Real DealHoàn branding, stored marketplace brand assets, and actual product imagery. Standard action icons use Phosphor.
- **Copy/content:** slogan, empty-state guide and steps, reward heading, timing, price labels, link/copy, buy and reset match the selected concept. Live price, name, rate and affiliate URL remain dynamic. No fixed 7% introduced.

## Interaction and technical verification

- Real Shopee product calculation: loading → receipt, with input focus removed on submission.
- Pasted a long Shopee URL through native paste: selectionStart=0, scrollLeft=0; beginning of URL displayed.
- Copy: clipboard begins with the returned Shopee affiliate URL; “Đã copy” appears, then “Copy link” returns after its 1500ms timer. Confetti visibly rendered. Clipboard continuation is ignored after the result generation changes.
- Reset: clears link/result, restores empty state and focuses the input. Immediate empty resubmission does not resurrect the old receipt.
- Clear while calculation is pending: stayed empty after the request completed; no stale receipt.
- Buy: opens the existing purchase-warning modal; closing works. No external purchase or modal confirmation was submitted during testing.
- Header search: filters deal names, scrolls to the results, shows a useful no-results state and can restore all deals.
- Guide link: reaches the existing how-it-works section, now with product-link copying instructions.
- Coin/state animation and confetti contain reduced-motion handling; OS-level reduced-motion switching was not exercised.
- Browser console after fresh final reload: no warning/error entries. A pre-existing clock hydration mismatch observed during testing was narrowly suppressed on the three changing countdown text nodes, following the bundled Next.js hydration guidance.
- `npm run build`: passed after final UI changes (compilation, TypeScript, prerender and route generation).
- Targeted ESLint: zero errors, nine warnings in `home-client.tsx` (unused legacy declarations and plain image tags). New hero component has no lint findings.
- `git diff --check`: passed.
- No changes to Supabase, authentication provider configuration, cashback providers, database, or crawler behavior.

## Follow-up polish / limitations

- [P3] Generated bag, coin angles and background ribbon placement are stylistically faithful, not identical pixels from the mockup. A production art master could refine exact highlights later.
- [P3] The mockup's orange lighting is richer than a solid UI action fill; functional buttons use a consistent, restrained hover color.
- Signed-in account layout and actual iOS/Android software keyboards were not end-to-end tested in this pass; responsive browser widths were tested.
- Existing lower-page content, metrics and marketplace artwork are outside this hero redesign's visual QA scope.
- No production deployment status is inferred from a successful local build or push.

## Implementation checklist

- [x] Both selected states implemented with real data flow.
- [x] Generated assets placed and inspected.
- [x] Full and focused source/implementation comparisons completed.
- [x] P0/P1/P2 findings fixed and recaptured.
- [x] Primary interactions and responsive breakpoints checked.
- [x] Build, targeted lint and whitespace checks completed.
- [x] Local preview left running for handoff.
