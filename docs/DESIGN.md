# Design System: Portal Hero × Glass-Orb Cover

**Sources:** 🎞️ the supplied animation (hero) · 🖼️ the dark glass-orb site image (cover section and page style). Both are black-base, neon-on-void, so they share one system.

**Asset note:** the supplied mp4 is a screen recording with its own nav, headline and button baked in, so it can't be dropped in behind your copy. Use a clean export of the animation layer only (ramps, coins, portal), or rebuild it from the choreography in Section 4.

## 1. Visual Theme & Atmosphere
Pure black stage, lit only by neon. One idea per screen: a glass orb with light trails on the cover, a coin-to-ring transformation in the hero. Everything else stays quiet, white on black, thin outlines, no filled cards.

**Key Characteristics**
- Void black base; color exists only as glow
- Cover (🖼️): giant, widely letter-spaced wordmark crossing a translucent glass orb with blue-to-magenta light streaks
- Hero (🎞️): dark metal coins roll down a ribbed ramp, pass through a glowing portal, and leave as neon violet rings
- Thin white hairlines and outlined pills instead of fills
- One solid violet button per screen, one white pill for the main action

## 2. Color Palette & Roles
- **Void** `#000000`: page base
- **Ink** `#FFFFFF`: headlines, wordmark
- **Muted** `#9A9AA5`: body copy, nav
- **Hairline** `rgba(255,255,255,.16)`: borders, dividers
- **Portal Violet** `#8B2BFF`: ring glow, portal outline
- **Magenta Edge** `#E040FB`: hottest edge of any glow
- **Electric Blue** `#4D8DFF`: cover light streak, secondary glow
- **Violet Fill** `#6A2CF5`: the single solid CTA
- **Ramp Charcoal** `#17171C` / **Ramp Highlight** `#2C2C34`: ribbed tiles
- **Coin Gunmetal** `#2B2B33` → `#0D0D10`: coin body, bevel `#55555F`

Glow is the only gradient; never fill a section with it.

## 3. Typography Rules
**Display/Cover:** Montserrat, medium, uppercase, tracking `0.35em`, wordmark only.
**Headline/Body/UI:** Plus Jakarta Sans.
Fallback: -apple-system, 'Segoe UI', sans-serif.

| Role | Font | Size | Weight | Line | Tracking |
|------|------|------|--------|------|----------|
| Cover Wordmark | Montserrat | clamp(48px, 11vw, 150px) | 500 | 1 | 0.35em |
| Hero Headline | Plus Jakarta Sans | clamp(36px, 5vw, 64px) | 600 | 1.05 | -0.02em |
| Section Heading | Plus Jakarta Sans | 32px | 600 | 1.15 | -0.01em |
| Body | Plus Jakarta Sans | 16px | 400 | 1.6 | 0 |
| Button / Nav | Plus Jakarta Sans | 14px | 500 | 1 | 0 |

Principles: sentence case everywhere except the cover wordmark; keep body lines under 60 characters; no second display face.

## 4. Component Stylings
**Buttons**
- Primary (white): `#FFF` fill, black text, pill, `48px`
- Accent (violet): `#6A2CF5` fill, white text, pill, `40px`, one per screen
- Outline: transparent, `1px` hairline, white text, pill, with an optional `48px` circular arrow button beside it
- Hover: lift `2px`, glow `0 0 24px rgba(139,43,255,.5)`; no other shadows

**Cards:** `#0A0A0D` fill, `1px` hairline, `20px` radius, no shadow. Hover brightens the border to Portal Violet at 50%.

**Glass Orb (cover):** circle, radial gradient from `rgba(255,255,255,.35)` at the upper left to near-black, `1px` rim `rgba(255,255,255,.3)`, slow `40s` rotation. A blue-to-white-to-magenta stroke crosses it with a `4px` blur and passes behind the wordmark.

**Portal Hero Animation (choreography, loop ≈ 2.85s per coin, new coin every ≈ 1.4s)**
1. Coin rolls down the upper S-curve ramp, rotating edge-on to face-on, ease-in
2. Coin drops onto the portal: a rounded-hexagon, white-lavender fill, violet-magenta neon outline, in a thin elliptical halo
3. Coin squashes and flashes at the portal, 0.3s
4. A hollow neon violet ring leaves the portal and rolls down the lower ramp to the bottom right
5. Loop with no pause
Ramps: dark woven tiles, thin highlights, curve right toward the portal.

**Inputs:** transparent, `1px` hairline, pill, `48px`; focus border Portal Violet.
**Nav:** logo left, links centered, one violet pill right; `1px` hairline under it on the cover.

## 5. Layout Principles
- Base unit `8px`; scale `8, 16, 24, 32, 48, 64, 96, 128`
- Max width `1240px`; full-viewport sections
- Cover: centered wordmark, tiny corner labels, copy bottom-left, social icons bottom-right, circular "scroll" badge bottom-left
- Hero: left-aligned copy (about 45%), animation right (about 55%) bleeding off the edge
- Radius: pills `999px`, cards `20px`

## 6. Depth & Elevation
| Level | Treatment | Use |
|-------|-----------|-----|
| Flat | none | text, nav |
| Hairline | `1px` border | cards, outline buttons |
| Glow | violet/magenta blur | portal, rings, hover |
Depth comes from light, never drop shadows.

## 7. Do's and Don'ts
**Do:** keep the base pure black; let one glow carry each screen; keep the wordmark uppercase and widely tracked; keep ring and portal colors in the violet–magenta range.
**Don't:** add filled colored cards; use more than one solid violet button per screen; add a second glow color to the hero; put the baked-in recording behind your own text.

## 8. Responsive Behavior
| Name | Width | Changes |
|------|-------|---------|
| Mobile | <640px | Wordmark `48px`; hero stacks, animation below copy at 60vw tall; nav collapses to the logo and violet pill |
| Tablet | 640–1023px | Hero stacks, animation 50vh |
| Desktop | 1024px+ | Full split layout |

Touch targets `44px` minimum. Respect `prefers-reduced-motion`: show a still frame with the ring mid-roll.

## 9. Agent Prompt Guide
**Colors:** Void `#000`, Ink `#FFF`, Muted `#9A9AA5`, Violet `#8B2BFF`, Magenta `#E040FB`, Blue `#4D8DFF`, CTA `#6A2CF5`.
1. Build every page on `#000`; color appears only as glow.
2. The cover wordmark is Montserrat, uppercase, tracked `0.35em`, crossing the glass orb.
3. The hero shows the coin → portal → neon ring loop; keep the choreography in Section 4.
4. One violet button per screen; the main action is the white pill.
5. Cards are hairline outlines, never filled with color.
6. No drop shadows; use glow.
7. Sentence case for everything except the cover wordmark.
8. Honor `prefers-reduced-motion`.
