# Cashback hero assets

Used by `app/components/cashback-hero.tsx` and `app/home-redesign.module.css`.

The two user-selected desktop references are the source of truth for composition and art direction. Illustrations were generated with the built-in image generator, visually inspected, and exported to the sizes below. They are separate image assets, not a flattened screenshot of the interface.

| Asset | Size | Purpose |
| --- | --- | --- |
| `deal-hoan-shopping-bag.webp` | 640 × 520 | Branded orange bag and cream plinth, transparent background |
| `cashback-coin.png` | 256 × 256 | Gold Vietnamese dong coin, transparent background; reused for floating coins and reward card |
| `link-cashback-halo.webp` | 720 × 521 | Orange chain links, gold coin, peach circular halo; empty state |
| `cashback-background.webp` | 1920px wide | Peach/cream ribbons and soft light; hero backdrop |
| `link-cashback.png` | 1475 × 1067 | Retained original generation before the halo refinement; not loaded by the app |

## Art-direction prompts

- Bag: isolated premium 3D orange shopping bag, soft rounded handles, DealHoàn white brand mark and lettering, small Vietnamese shopping/cashback copy on the side, cream oval display plinth; match the selected reference's angle, lighting and proportions; no floating coins; transparent background.
- Coin: one premium 3D gold dong coin, slightly tilted, beveled yellow-gold face and orange-gold edge, embossed “₫”, subtle sparkles, transparent background. A targeted follow-up corrected the currency glyph.
- Empty state: glossy orange interlocking chain links alongside a gold “₫” coin and short gold rays; match the selected reference. Follow-up preserved links, coin and rays, added a soft peach/ivory circular halo and enlarged the composition.
- Background: wide warm cream/peach shopping hero background with flowing translucent ribbons, soft illumination and clear space behind editable foreground content; no text, logo or products.

## Existing brand assets

DealHoàn logo files are reused unchanged. Hero marketplace logos are stored locally:

- Lazada: official CDN image observed on `https://www.lazada.vn/`, `https://img.lazcdn.com/g/tps/images/ims-web/TB1T7K2d8Cw3KVjSZFuXXcAOpXa.png`.
- Shopee and TikTok: Simple Icons, `https://cdn.simpleicons.org/shopee/ee4d2d` and `https://cdn.simpleicons.org/tiktok/161823`.
- Standard UI icons: `@phosphor-icons/react`, imported per icon to avoid a full-library client import.

Decorative images have empty alt text. Coin movement and state transitions respect `prefers-reduced-motion`.
