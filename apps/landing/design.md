# Plucia Landing Page — Design Reference

Built 1:1 from the Figma file **abhi | TV-File → “Landing page”** frame
(`node 2877:21183`, 1440 × 9161 px).

- Figma source: https://www.figma.com/design/KoGKyrJFudZYnm3ecY6K88/abhi-%7C-TV-File?node-id=2877-21183
- Stack: **Next.js 15 (App Router) + Tailwind CSS v4 + framer-motion + Lenis (smooth scroll)**

---

## 1. Project structure

```
src/
  app/            Next.js routing shell (layout, globals.css, page.tsx)
  page/           Page-level compositions (HomePage.tsx assembles all sections)
  sections/       One file per Figma landing-page section
  components/     Shared building blocks (Navbar, AvatarGroup, SmoothScroll, Reveal)
public/
  assets/
    icons/        All SVGs exported from Figma (~130 files)
    images/       All PNG exports (photos, blobs, backgrounds)
design.md         This file
```

> Note: the folder is `src/page` (singular) on purpose — a `src/pages` folder
> would be picked up by Next.js as the legacy Pages Router and create
> unwanted routes.

## 2. Section map (Figma node → component)

| #   | Figma frame                                                                   | Node id                            | Component                         | Page Y (px) |
| --- | ----------------------------------------------------------------------------- | ---------------------------------- | --------------------------------- | ----------- |
| 1   | Background + navbar + headline + dashboard                                    | 2877:21184 / 21231 / 21219 / 21243 | `sections/Hero.tsx`               | 13.6 – 1650 |
| 2   | “Everything Your Team Needs …” (svg **motion section**)                       | 2877:21244                         | `sections/PlatformSection.tsx`    | 1825        |
| 3   | “Just Tell Plucia What You Need.” (dark card, **motion section**)             | 2877:21319                         | `sections/TellPluciaSection.tsx`  | 2353        |
| 4   | “From Conversation to Calendar, Automatically.”                               | 2877:21314                         | `sections/CalendarSection.tsx`    | 2982        |
| 5   | Insights collage “Dominate Every sales meeting …”                             | 2877:21504                         | `sections/InsightsSection.tsx`    | 3685        |
| 6   | Integration “Everything Your Team Needs in One Platform” (**motion section**) | 2877:22158                         | `sections/IntegrationSection.tsx` | 5367        |
| 7   | “Powerful AI Features That Drive Your Business”                               | 2877:22300                         | `sections/FeaturesSection.tsx`    | 6246        |
| 8   | FAQ “General Question asked by Everyone”                                      | 2877:22869                         | `sections/FaqSection.tsx`         | 7164        |
| 9   | Subscription CTA “Be The Part of the Future Before Everyone”                  | 2877:22890                         | `sections/SubscribeSection.tsx`   | 7941        |
| 10  | Footer                                                                        | 2877:22925                         | `sections/Footer.tsx`             | 8466        |

The page renders inside a centered `max-w-[1440px]` canvas; each section keeps
its exact Figma offsets (margins/left positions derived from frame x/y values).

## 3. Typography

| Figma font         | Usage                                             | Loaded via                                                                      |
| ------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Manrope            | Headings (50/48px, −2.5px tracking), buttons, FAQ | `next/font/google` → `font-manrope`                                             |
| Inter              | Body copy, small UI text                          | `font-inter`                                                                    |
| Urbanist           | Prompt field, “Features”/“FAQ’s” eyebrows         | `font-urbanist`                                                                 |
| Geist Medium       | “Plucia” wordmark (navbar + footer)               | `font-geist`                                                                    |
| DM Sans            | “Plucia AI · Profile Summary” card                | `font-dmsans`                                                                   |
| Poppins            | Chat notification names                           | `font-poppins`                                                                  |
| Work Sans          | “WhatsApp”/“Channels” chips                       | `font-worksans`                                                                 |
| Ms Madi            | Script accents: “One Platform”, “Everyone”        | `font-msmadi`                                                                   |
| Figma Hand         | “Try Yourself”, “Sell with Plucia.”               | **substituted with Caveat** (`font-hand`) — Figma Hand is not publicly licensed |
| Font Awesome 6 Pro | chevron/dot glyphs in mock UI                     | replaced with inline SVG / dot span                                             |

## 4. Core colors

| Token        | Value                                              | Where                                   |
| ------------ | -------------------------------------------------- | --------------------------------------- |
| Ink          | `#202020`                                          | headings, dark buttons, subscription bg |
| Ink soft     | `#606060` / `#5c5c5c` / `#838383`                  | descriptions                            |
| Surface      | `#f4f4f4` / `#f6f6f6` / `#f2f2f2`                  | cards, chips, FAQ tiles                 |
| Accent green | `#34a853` (Figma var `Accents/Green` ≈ `#34c759`)  | badges, confidence score, WhatsApp dots |
| Hero canvas  | `#eaeaea` + pastel gradient PNG                    | hero background                         |
| Dark card    | `#333 → #111` gradients                            | Tell-Plucia card, AI buttons            |
| CTA gradient | `linear-gradient(-6deg, #070707 12%, #2f2e31 88%)` | Join Waitlist / Contact Sales           |

## 5. Motion

- **Smooth scroll**: Lenis (`components/SmoothScroll.tsx`, lerp 0.1 / duration 1.2) wraps the whole app in `app/layout.tsx`.
- **Section reveal**: `components/Reveal.tsx` (framer-motion) — fade + 48px rise, `once: true`, honors `prefers-reduced-motion`.
- **Pending — “motion section” frames**: the Figma frames named _svg motion
  section_ (hero background `2877:21185`, platform card `2877:21245`,
  Tell-Plucia card `2877:21324`, integration wires `2877:22160-22167`) are
  marked in the DOM with `data-motion-section="hero|platform|tell-plucia|integration"`.
  These will get the light-pulse-travelling-along-connected-lines SVG
  animation once the animation spec is provided. The connector-line SVGs are
  separate files (`platform-lines-*`, `tell-lines-*`, `int-wire-*`,
  `insight-line-*`) so strokes can be animated with `stroke-dasharray` /
  gradient masks without touching the layout.

## 5b. Full-bleed backgrounds & interactive hero composer

- **Hero and Footer backgrounds are full-bleed.** They used to be pinned at
  the Figma-exact pixel width (1411px / implicitly 1440px), so on any viewport
  wider than 1440px the pastel/gradient backdrop stopped short and left hard
  white edges. Both sections now render as: an outer full-width `<section>` /
  `<footer>` holding an `inset-0 object-cover` background image (stretches to
  the real viewport width) with a `relative mx-auto max-w-[1440px]` canvas on
  top holding the pixel-exact Figma content, unchanged. `HomePage.tsx` renders
  `<Hero/>` and `<Footer/>` as direct children of `<main>` (outside the
  max-w-1440 wrapper used by the rest of the sections) so their backgrounds
  aren't clipped by that wrapper.
- **The hero "Ask anything...." composer is interactive**
  (`components/HeroComposer.tsx`, client component):
  - The text field is a real `<input>`.
  - The active channel chip (defaults to WhatsApp) reveals a small `×` badge
    on hover (`group`/`group-hover`) that removes the channel when clicked.
  - The `…` button opens a channel picker (`components/ChannelIcons.tsx`)
    listing WhatsApp, Instagram, LinkedIn, Meta, X, Email, Outlook, Telegram,
    Slack, and CRM; picking one swaps the active chip. The picker closes on
    outside click or Escape.
  - The composer sits at `z-20` inside the hero canvas so the dropdown always
    renders above the dashboard screenshot positioned below it.
  - Channel icons here are hand-authored (not reused Figma exports) — several
    of the downloaded `channel-*.svg` files turned out to be mislabeled (e.g.
    `channel-whatsapp.svg` is actually a Gmail glyph), so correctness for a
    user-facing picker took priority over reusing those assets.

## 5c. Scrollbars, floating label, dashboard pan-in

- **Scrollbars are hidden everywhere** (page-level in `globals.css` on
  `html`, plus a reusable `.no-scrollbar` utility applied to the channel
  picker's list) — scrolling still works via wheel/touch/keyboard/Lenis, the
  native scrollbar chrome is just not painted.
- **`components/TryYourselfLabel.tsx`** — the hero's "Try Yourself" callout
  bobs up/down forever (`animate={{ y: [0, -12, 0] }}`, `duration: 2.8`,
  `ease: "easeInOut"`, `repeat: Infinity`), disabled under
  `prefers-reduced-motion`.
- **`components/DashboardShowcase.tsx`** — the dashboard screenshot under the
  hero pans/zooms into its resting frame as it scrolls into view (starts at
  `scale 1.14` / `y +64px`, eases to `scale 1` / `y 0` tied to
  `useScroll({ target, offset: ["start 0.95", "start 0.3"] })`, run through
  `useSpring` for a soft, Lenis-matched settle rather than a linear scrub).

## 6. Assets

All icons/illustrations were exported from the Figma file into
`public/assets/icons` (SVG) and `public/assets/images` (PNG) — around 170
files. Notable groups:

- `plucia-logo*.svg` — brand marks (navbar, footer, giant footer wordmark)
- `channel-*.svg`, `channel-lg-*.svg`, `int-icon-*.svg` — app/channel icons (Gmail, Slack, WhatsApp, Messenger, Instagram, Meta …)
- `orb-*` / `int-orb-*` — layered pieces of the AI orb (rings, sparks, flares, noise mask)
- `*-wire-*.svg` / `*-lines-*.svg` — dashed/curved connector lines used by the motion sections
- `hero-dashboard.png`, `calendar-visual.png`, `insights-chat.png`, `sophie-photo.png` — large product/photo exports
- `blob-color-*.png` — colorful blurred blobs behind insights/integration/features
- `footer-gradient-bg.png` — pastel gradient footer backdrop

## 7. Known deviations from Figma (intentional)

1. **Figma Hand → Caveat** (font licensing, see §3).
2. Font Awesome Pro glyph placeholders (“Chevron-down”, “CIRCLE”) are drawn
   as inline SVG / a dot span instead of the paid icon font.
3. The email field in the subscription CTA is a real `<input>` (the design is
   a static mock).
4. The footer “subs” row present in older metadata was removed from the
   current Figma file, so it is not built.
5. Page is pixel-exact at 1440px viewport width (like the Figma frame);
   responsiveness below 1440 wasn’t part of this pass.
