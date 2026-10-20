# First guide image clarity QA

final result: passed

## Source, scope and evidence
- User screenshot: /var/folders/sj/jwhymxt53b11fm81tn5k24rw0000gn/T/codex-clipboard-0c3ab571-d126-4495-b8da-cf44fe43d9e9.png (667×740, scaled card).
- Original card image: public/home-art/support-refresh/guide-start-reference.png (383×371). Its original hash is preserved and unchanged.
- Scope: improve clarity of this one image; preserve surrounding layout, article copy, routes, other two images and previous work.
- New image: public/home-art/support-refresh/guide-start-sharp-v2.webp (1274×1234, quality95,316518 bytes), AI restoration/reconstruction from original. Not a claim of exact recovery of missing original detail or of a real transaction.
- Runtime: http://localhost:3013/#guides. Desktop1918×941 and mobile390×844, density1.
- Desktop image rendered464.664×450.102 CSSpx, native1274px:2.742 source pixels per CSSpx. Mobile rendered356px wide, same full1274px source. Images loaded successfully without a second optimizer conversion.
- Evidence: design-evidence/guide-sharp/desktop.png, desktop-card-image.png, mobile-card-image.png.
- Combined comparison: design-evidence/guide-sharp/comparison.png. Before left, browser-rendered after right, equal465×450 image boxes. Both viewed together.
- Focused comparison: design-evidence/guide-sharp/focused-comparison.png, normalized1000px-wide assets then corresponding550×350 crops, before left/after right. Opened and reviewed phone edges, screen lettering, skin details and halos.

## Findings / iterations
1. Baseline source383px was being enlarged for desktop and high-density phones. Enlarged comparison shows pixelated/slurred edges and lettering (P1 clarity issue).
2. First AI restoration was sharper but added an unsupported43.3% value, irrelevant platform and incorrect URL. Rejected; not integrated.
3. Second restoration removed those additions, retained orange/cream phone and green129.250 example composition. Integrated1274×1234 asset under a new filename; original retained. Browser and focused comparison show cleaner phone outline, headline, input and hand detail.
4. Final: no actionableP0/P1/P2 issues for the clarity-improvement scope. Overall pose/hand/lettering fine detail is reconstructed, not pixel-identical; this is an illustrative marketing photo, not factual transaction evidence.

## Fidelity surfaces
- Typography: article fonts and text unchanged. Raster headline and principal number are clearer. Tiny illustrative UI text remains reconstructed; not claimed accurate to live UI.
- Spacing/layout: no CSS/layout edits; existing383:371 box accommodates new near-identical ratio. Full phone remains within photo. No horizontal overflow at1918/390.
- Colors: warm natural hand/background, orange headline/bag, pale-green result retained. No claim of exact source-color matching for regenerated microdetails.
- Image quality:1274px native source replaces383px; no artificial enlargement of a low-res image alone. Sharper skin/phone/screen observed in matched comparison. No visible oversharpen halos at card scale.
- Copy/content: HTML copy, category, title, description and routes unchanged; other two source images untouched. Raster amount remains an illustration, not a current cashback promise.

## Checks
- npx eslint app/components/home-support.tsx: exit0.
- npm run build -- --webpack: exit0.
- Custom image/component checks: pass.
- Card click navigated to /how-to. Browser console errors:[].
- Existing keyboard, focus, hover, lazy-loading and reduced-motion behavior retained; no new control/state logic. Forced network error not tested.
- Independent-copy rollback restores old source path and original image byte-for-byte; actual workspace keeps new asset.
- Not pushed/deployed in this request.
