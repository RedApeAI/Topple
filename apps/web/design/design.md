# RedApeAI — Design System

> Source of truth: Figma file `abhi | TV File` (fileKey `KoGKyrJFudZYnm3ecY6K88`).
> This document is derived directly from the following frames and will be extended every time a new frame is inspected or a new component is built.

| #   | Frame name                            | Node ID                                                                                               | What it shows                                                                                                               |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | `expanded sidebar`                    | [2866:8520](https://www.figma.com/design/KoGKyrJFudZYnm3ecY6K88/abhi-%7C-TV-File?node-id=2866-8520)   | One Inbox screen, sidebar fully expanded (280px)                                                                            |
| 2   | `closed sidebar`                      | [2866:10013](https://www.figma.com/design/KoGKyrJFudZYnm3ecY6K88/abhi-%7C-TV-File?node-id=2866-10013) | Same screen, sidebar collapsed to an 84px icon rail                                                                         |
| 3   | `… floating ai logo … chat interface` | [2866:10388](https://www.figma.com/design/KoGKyrJFudZYnm3ecY6K88/abhi-%7C-TV-File?node-id=2866-10388) | The Operator panel (thread list + a "New Chat" conversation state) opened as a right-hand drawer over One Inbox             |
| 4   | `whatsapp screen`                     | [2866:9454](https://www.figma.com/design/KoGKyrJFudZYnm3ecY6K88/abhi-%7C-TV-File?node-id=2866-9454)   | 3-pane WhatsApp view: conversation list → chat thread → Operator panel, with the Operator actively narrating a running task |

Values below were read directly from Figma's exported layout/style data. The raw export is scaled to a non-integer factor (e.g. `20px` comes back as `19.782px`, `12px` as `11.869px`), so every token in this document is the **rounded, intended value** — implement with the rounded number, not the raw decimal.

---

## 1. Design philosophy

RedApeAI is an operator workspace, not a marketing app: density, speed, and legibility beat decoration. The visual language borrows the same instincts as Linear, Superhuman and Cursor:

- **Neutral, warm-gray canvas.** The app background is never pure white or pure black (`#f1f0ee`), so the single-color brand gradient and channel colors (WhatsApp green, LinkedIn blue, Instagram gradient) read as the only "loud" colors on screen.
- **One accent gesture, reused everywhere.** The 4-stop brand gradient (red → orange → violet → magenta) appears exactly three places: the logo mark, the logo's inner glow, and the ring around the Operator's floating action button. It is a signature, not a theme color — never use it for arbitrary UI accents.
- **Chat- and list-dense, not card-heavy.** Inboxes, threads, and the Operator's task feed are all tight single-column lists with a 1px hairline divider, 14–16px type, and generous internal row padding — closer to Superhuman/WhatsApp than to a dashboard-with-cards aesthetic.
- **AI is ambient, not modal.** The Operator never takes over the screen — it lives in a persistent right-hand drawer that overlays without ever blocking the primary inbox/chat column. Status is communicated with quiet text + a colored dot, never a big banner.
- **Every dark surface is a gradient, not a flat fill.** Primary buttons, the FAB, and the logo chip all use a subtle top-to-bottom dark gradient (`#333 → #111` or `#292929 → #111`) plus an inset highlight — flat black is never used for an actionable surface.

## 2. Layout structure

### 2.1 Application shell

Three horizontal regions, always:

1. **Sidebar** — fixed width, two states (see 2.2).
2. **Topbar** — `84.19px` tall (⇒ implement as `h-[84px]`), full width of the content area, bottom hairline border (`border-b border-border`). Contains breadcrumb (left), avatar stack + icon actions + primary CTA (right).
3. **Content body** — padded `20px` on the outer edge, `10px`/`12px` on inner containers, fills remaining height (`flex-1 min-h-0`, scrolling internally — the shell itself never scrolls).

An optional 4th region, the **Operator drawer**, docks to the right edge on top of the content body (see §6).

### 2.2 Sidebar — expanded vs. collapsed

|             | Expanded                                                                                                                                                                                                                                                                                                                     | Collapsed (icon rail)                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Width       | `280px` (`275.52px` raw)                                                                                                                                                                                                                                                                                                     | `84px`                                                                                                      |
| Contents    | Logo + workspace switcher + "Pro" badge, search field, "Dashboard" section (Overview, AI Agent Campaigns), "Socials" section (One Inbox, WhatsApp, LinkedIn, Mail, AI Cold Calling, Instagram, CRM — each with an unread-count badge), divider, Calendar, Integrations, divider, account card (avatar, name, email, chevron) | Logo mark only, search icon, one icon per nav item (no labels, no unread badges shown), account avatar only |
| Active item | White pill background + `shadow-sm`                                                                                                                                                                                                                                                                                          | N/A — no explicit "active" chrome observed on icon-only rail beyond the icon itself                         |
| Trigger     | User-controlled collapse — both states share identical vertical rhythm and iconography, so the rail is a pure width transition, not a re-layout                                                                                                                                                                              |

Sidebar nav item anatomy (expanded): `20px` square icon, `8px` gap, `14px` medium label, optional unread badge right-aligned (`#FF2F2F` background, white bold number, `4px` corner radius, `~20px` square). Row padding `8px 10px`, row corner radius `10px`. Rows with an active/hover white surface additionally get `shadow-[0_1px_0.5px_rgba(0,0,0,0.15)]`.

### 2.3 Topbar

- Left: breadcrumb `Dashboard / One Inbox` — first segment muted (`text-[#595959]`), separator and current segment dark (`text-[#111]`), `14px` medium.
- Right, left→right: overlapping avatar stack (4 visible avatars, `white` `2px` ring, `-10px` overlap) + `+N` overflow chip in a tinted circle; icon buttons for Settings and Notifications (`40px` square, `#fafaf9` bg, `8px` radius, `shadow-sm`); primary button **"Create Task"** (dark gradient `#333→#111`, white text, leading `+` icon, `8px` radius, inset top highlight).

### 2.4 List toolbar (per-channel inbox header)

Sits inside the content card, `12px` padding, bottom hairline. Left: segmented pill control for channel scope — `All / WhatsApp / Linkedin / Mail / Calls`, each tab an icon + label; the active tab is a white pill with soft shadow inside a `#EDEBE9` track (`8px` outer radius). Right: two icon-only buttons (`filter`, `search`, `#EDEBE9` bg, `5px` radius) followed by a dark split button **`New ▾`** (`#111` bg, vertical divider before the chevron).

### 2.5 Conversation list row

`avatar (35px, circular, subtle drop shadow) → 15px gap → column [name row, preview row]`. Name row: name in **Poppins Regular 16px**, `tracking -0.16px`, truncates; timestamp right-aligned, `12px`, `rgba(96,96,96,0.6)`, `tracking -0.6px`. Preview row: single line, truncated, `14px` Inter Medium, `rgba(96,96,96,0.6)`, `tracking -0.7px`, `1.3` line-height. A small **channel badge** (18.8px circle, channel color, `1px` white ring) overlaps the avatar's bottom-right corner. Row padding `11px 10px`, hairline bottom border `rgba(32,32,32,0.05)`.

### 2.6 Chat thread (WhatsApp screen, 3rd column removed for 2-pane; see §6.3 for 3-pane with Operator)

Header: avatar + name (bold), icon actions (analytics, phone, overflow, close) right-aligned. Message bubbles:

- Incoming: white bubble, `1px` border, left-aligned, `12px` radius (sharper corner on the avatar side), timestamp below in muted `12px`.
- Outgoing (agent/user): **pale mint-green** bubble (`#DCF7C5`-family), right-aligned, same radius convention mirrored.
- A subtle repeating diagonal watermark pattern sits behind the whole thread at very low opacity (WhatsApp-style paper texture) — decorative only, do not let it reduce text contrast.
  Composer: attachment (paperclip) + emoji icon, single-line input `Type a message or /RedApeAI let agent chat`, circular dark send button.

## 3. Color tokens

Semantic tokens map to Tailwind CSS variables (`hsl(var(--token))`), so both themes are driven from the same class names. Raw values below are the **light-mode** source of truth extracted from Figma; dark-mode values are derived (see §3.3) since no dark frames exist yet in the file — flag for design review once dark frames are added.

### 3.1 Neutrals (light)

| Token                  | Hex                   | Used for                                        |
| ---------------------- | --------------------- | ----------------------------------------------- |
| `background`           | `#F1F0EE`             | App canvas behind all panels                    |
| `card`                 | `#FFFFFF`             | Rows, popovers, modals, active pill tabs        |
| `muted`                | `#F8F8F7`             | Inbox list container background                 |
| `muted-2`              | `#EDEBE9`             | Segmented control track, icon-button background |
| `border`               | `#D6D3CD`             | Sidebar/topbar hairlines                        |
| `border-subtle`        | `rgba(32,32,32,0.05)` | Row dividers inside lists                       |
| `foreground`           | `#111111`             | Primary text, active breadcrumb                 |
| `foreground-strong`    | `#000000`             | Contact names (Poppins)                         |
| `secondary-foreground` | `#292929`             | Nav labels, list-item text                      |
| `muted-foreground`     | `#595959`             | Section labels, inactive breadcrumb             |
| `muted-foreground-2`   | `#666666`             | Sidebar email, helper text                      |
| `muted-foreground-3`   | `rgba(96,96,96,0.6)`  | Timestamps, message previews                    |

### 3.2 Brand & semantic

| Token                          | Value                                                                            | Used for                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `brand-gradient`               | `linear-gradient(90deg, #FF2F2F 0%, #EF7B16 36.3%, #8A43E1 69.8%, #D511FD 100%)` | Logo ring, FAB ring — the **only** place the multi-stop gradient appears |
| `primary` (dark surface)       | `linear-gradient(180deg, #333333 0%, #111111 100%)`                              | "Create Task" button, FAB body                                           |
| `primary-alt`                  | `linear-gradient(180deg, #292929 0%, #111111 100%)`                              | FAB variant / dark chips                                                 |
| `primary-foreground`           | `#FFFFFF`                                                                        | Text/icons on dark surfaces                                              |
| `destructive` / `badge-unread` | `#FF2F2F`                                                                        | Unread-count badges                                                      |
| `success` / `whatsapp`         | `#34A853`                                                                        | WhatsApp channel identity                                                |
| `info` / `linkedin`            | `#0A66C2`                                                                        | LinkedIn channel identity                                                |
| `call`                         | `#202020`                                                                        | AI Cold Calling channel identity                                         |
| `mail`                         | `#FFFFFF` surface + full-color Gmail glyph                                       | Mail channel identity                                                    |
| `instagram-gradient`           | `linear-gradient(180deg, #5342D6 0%, #EF2044 53.4%, #FEC053 100%)`               | Instagram channel identity                                               |
| `bubble-outgoing`              | `#DCF7C5` (approx., mint green)                                                  | Chat bubble — agent/user sent                                            |
| `bubble-incoming`              | `#FFFFFF` w/ `1px` border                                                        | Chat bubble — received                                                   |

### 3.3 Dark mode

No dark-mode frames exist in the source file yet. Until they're provided, derive dark tokens algorithmically (invert lightness, keep hue/saturation of brand + channel colors fixed) and route every component through the semantic tokens above — **never** hardcode `#fff`/`#000`/`#F1F0EE` in component code. Revisit this section the moment dark frames are added to Figma.

### 3.4 Shadows

| Token                    | Value                                                                                                                                               | Used for                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `shadow-xs`              | `0 1px 0.5px rgba(0,0,0,0.15)`                                                                                                                      | List rows, small icon buttons                                            |
| `shadow-avatar`          | `0 0 0 1.7px rgba(255,255,255,0.8), 0 12px 7px rgba(0,0,0,0.05), 0 5px 5px rgba(0,0,0,0.09), 0 2px 3px rgba(0,0,0,0.1)`                             | Conversation-row avatars                                                 |
| `shadow-fab`             | `0 3px 5px rgba(0,0,0,0.05), 0 16px 28px rgba(0,0,0,0.15), 0 7px 16px rgba(0,0,0,0.05), 0 35px 28px rgba(0,0,0,0.05), 0 17px 13px rgba(0,0,0,0.05)` | Floating Operator launcher                                               |
| `shadow-inset-highlight` | `inset 0 1px 2px rgba(255,255,255,0.2), inset 0 1px 1px rgba(255,255,255,0.25)`                                                                     | Top edge of every dark-gradient surface (logo chip, primary button, FAB) |

## 4. Typography

Two families, deliberately mixed by role — this split is a strong, repeated pattern in the source file and must be preserved:

| Role                                                       | Family      | Weight                                                 | Size                     | Tracking                    | Line height                      |
| ---------------------------------------------------------- | ----------- | ------------------------------------------------------ | ------------------------ | --------------------------- | -------------------------------- |
| Contact / person names (inbox rows, chat header)           | **Poppins** | Regular (name rows) / SemiBold (account card)          | 16px                     | `-0.16px`                   | 1 (none)                         |
| All other UI text (nav, buttons, breadcrumb, body, badges) | **Inter**   | Medium (default), SemiBold (brand wordmark "RedApeAI") | 12 / 13 / 14 / 15 / 16px | 0 to `-0.7px` on dense rows | 1.5 (UI) / 1.3 (message preview) |

### Type scale

| Token       | Size    | Weight/Family                  | Example                        |
| ----------- | ------- | ------------------------------ | ------------------------------ |
| `text-xs`   | 12px    | Inter Medium                   | Timestamps, badge numbers      |
| `text-sm`   | 14px    | Inter Medium                   | Nav labels, body, message text |
| `text-base` | 15–16px | Inter Medium / Poppins Regular | Buttons, contact names         |
| `text-lg`   | 16px    | Inter SemiBold                 | Wordmark, dialog titles        |

**Negative tracking rule:** as row information density increases (timestamp, single-line preview), tracking tightens progressively: `0px → -0.16px → -0.6px → -0.7px`. Apply this only to compact list/preview text, never to buttons or headings.

## 5. Spacing scale

Base unit is **2px**, exposed as a Tailwind-compatible scale. All Figma raw values are multiples of this unit (allowing for the ~0.989 export-scale rounding):

`2, 4, 6, 8, 10, 12, 16, 20, 24, 30px`

Common usages:

- `20px` — outer page/section padding, sidebar padding, gap between sidebar sections.
- `12px` — card padding (list container), icon-button padding.
- `10px` — nav-row padding, list-row horizontal padding.
- `8px` — icon-to-label gaps, small button padding.
- `4–6px` — icon-to-text micro gaps, badge padding.

## 6. Radius

| Token         | Value  | Used for                                          |
| ------------- | ------ | ------------------------------------------------- |
| `radius-sm`   | 4px    | Unread badges, small chips                        |
| `radius-md`   | 6–8px  | Icon buttons, nav-row pills, split-button         |
| `radius-lg`   | 10px   | Cards, primary/CTA buttons, Operator panel        |
| `radius-xl`   | 16px   | Inbox list container                              |
| `radius-full` | 9999px | Avatars, channel badges, FAB, workspace logo chip |

## 7. Grid & breakpoints

Desktop-first, matching the PROJECT spec:

| Breakpoint | Width  | Sidebar behavior                                                                                                         |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| `2xl`      | 1440px | Full expanded sidebar (280px) + 3-pane layouts (e.g. WhatsApp screen) fit comfortably                                    |
| `xl`       | 1280px | Expanded sidebar; 3-pane views tighten column widths before collapsing the Operator drawer to overlay                    |
| `lg`       | 1024px | Sidebar auto-collapses to the 84px icon rail to preserve content width; Operator drawer becomes an overlay (not inline)  |
| `md`       | 768px  | Single active pane at a time (list _or_ thread _or_ Operator); others reachable via navigation, not simultaneous columns |
| `sm`       | 480px  | Not a primary target per PROJECT spec — reserve for future mobile pass; stack everything full-width                      |

The content area is not a numeric-column CSS grid — it's nested flexbox (`flex-1` panes with fixed-width siblings), matching how Figma's auto-layout frames are structured.

## 8. Motion

Framer Motion, durations restricted to **150 / 200 / 250 / 300ms**, `ease-out` for entrances, `ease-in` for exits.

| Interaction                | Motion                                                                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator drawer open/close | Slide-in from right + fade, 250ms ease-out (open) / 200ms ease-in (close)                                                                                       |
| Sidebar expand ↔ collapse  | Width transition, 200ms, contents cross-fade labels (don't reflow-pop)                                                                                          |
| List row hover             | Background fade, 150ms                                                                                                                                          |
| New inbox item arrival     | Fade + 4px slide-down, 200ms                                                                                                                                    |
| FAB press                  | Scale to 0.96, 150ms, spring back                                                                                                                               |
| Operator "thinking" state  | Looping opacity pulse on the status line (e.g. "Running RedApeAI on all whatsapp leads…"), 1.2s ease-in-out, no layout shift                                    |
| Streaming AI reply         | Text reveals progressively (typewriter/segment fade), no skeleton block — the Operator never shows a generic spinner for text, only for the leading status line |

Avoid excessive motion: no bouncing, no parallax, no full-page transitions between sidebar states.

## 9. Iconography

**Lucide React**, 20px default size inside a 20×20 box (icons observed: `settings`, `bell`, `plus`, `search`, `filter`, `chevron-down`, `chevrons-up-down`, `activity`, `gallery-vertical-end`, `message-circle-more`, `calendar-minus-2`, `route`, `mic`, `paperclip`/`clip`, `arrow-right`, `arrow-up`, `x`/`cancel`, `clock-check`). Channel glyphs (WhatsApp, LinkedIn, Gmail, Instagram, phone/call-spark) are brand SVGs, not Lucide, and always render inside a colored circular badge — never bare on a list row.

## 10. Component inventory (from the 4 frames analyzed)

- **Sidebar** (expanded / collapsed variants) — `features/*, components/layout/Sidebar`
- **Topbar / Breadcrumb bar** — `components/layout/Topbar`
- **AvatarStack** (+N overflow) — `components/shared/AvatarStack`
- **IconButton** (settings/bell/filter/search styles) — `components/ui/IconButton`
- **Button** (primary dark-gradient, split-button `New ▾`) — `components/ui/Button`
- **SegmentedTabs** (All/WhatsApp/Linkedin/Mail/Calls) — `components/ui/SegmentedTabs`
- **ConversationListItem** (avatar + channel badge + name/timestamp/preview) — `features/inbox/components/ConversationListItem`
- **ChannelBadge** (per-channel colored circular overlay) — `components/shared/ChannelBadge`
- **UnreadBadge** (red count pill) — `components/ui/Badge`
- **ChatThread / MessageBubble** (incoming/outgoing) — `features/whatsapp/components/MessageBubble`
- **ChatComposer** (attachment, emoji/mic, text field, send) — `components/shared/Composer`
- **FloatingActionButton** (Operator launcher, gradient ring) — `features/operator/components/OperatorLauncher`
- **OperatorPanel** (drawer shell, header, tabs) — `features/operator/components/OperatorPanel`
- **ThreadCard** (task title, timestamp, status pill) — `features/operator/components/ThreadCard`
- **StatusBadge** (dot + colored label: Waiting for meta approval, In progress, Scheduled, Pending, Planned, Researching, In development, Ongoing, Brainstorming, Drafting, Outreach) — `features/operator/components/StatusBadge`
- **PromptInput** (Operator composer with `/` command and `@` mention affordances, channel-selector chip) — `features/operator/components/PromptInput`
- **StreamingMessage** (Operator ↔ user conversational turn, avatar-anchored) — `features/operator/components/StreamingMessage`
- **History** (secondary tab within Operator panel) — `features/operator/components/History`
- **Sidebar account card** (avatar, name, email, chevron) — `components/layout/AccountCard`

Every entry above should get its own subsection in `components.md` (props, variants, states) the first time it's implemented — do not implement ahead of documenting.

## 11. Accessibility

- All icon-only buttons (settings, bell, filter, search, close, mic, attach) require an explicit `aria-label` — none carry visible text in Figma.
- Unread badges (`#FF2F2F` on white/`#111`) must be paired with an `aria-label` announcing the count ("5 unread WhatsApp messages"), not conveyed by color alone.
- Channel identity badges are decorative reinforcement of the row's channel tab context — the channel name must also exist in accessible text (e.g. row `aria-label` or adjacent SR-only text), never color/icon alone.
- Minimum contrast: body text (`#292929`/`#111` on `#F1F0EE`/`#FFFFFF`) passes WCAG AA; muted timestamp text at `rgba(96,96,96,0.6)` is borderline on white — verify computed contrast ≥ 4.5:1 at implementation time and darken the token if it fails.
- Operator drawer must trap focus while open on narrow breakpoints (overlay mode) and be dismissible via `Escape` and the visible `X`.
- All interactive rows (conversation list items, thread cards) are keyboard-focusable with a visible focus ring — Figma shows no explicit focus state, so define one using the existing `ring` utility rather than inventing a new visual language.

## 12. Interaction rules

- Sidebar collapse/expand is a pure width + label-visibility transition — never remounts nav items, so scroll position and active-state are preserved.
- The active segmented tab (`All/WhatsApp/…`) always renders as a white pill inside the gray track; never rely on text-weight alone to indicate selection.
- The Operator drawer and a chat thread can be open simultaneously (see the WhatsApp frame) — the drawer must never cover the composer or the conversation list; it docks beside them, shrinking the thread column.
- Row hover reveals no extra controls in the source frames (no hidden action icons appear on hover) — keep list rows purely informational; put actions in the row's own icon slots or a context menu, don't invent hover-reveal affordances not present in the design.
- The FAB is always bottom-right, floating above content with its multi-layer shadow, and is the single entry point to the Operator on any screen.

## 13. AI interaction patterns (Operator)

The Operator is modeled as a **persistent, resumable side-channel**, not a one-off dialog:

- **Two tabs, one panel:** _Threads Running_ (live/queued tasks with a running-count badge) and _History_ (completed). Switching tabs never closes the panel.
- **Task rows are status-first:** every row is `Title` + `Timestamp` + `• StatusLabel`, where the status is plain colored text next to a small dot — not a heavy chip/badge. Statuses seen: _Waiting for meta approval, In progress, Scheduled, Pending, Planned, Researching, In development, Ongoing, Brainstorming, Drafting, Outreach._ Treat this as an open enum — new agent workflows will add new statuses; the component must not hardcode a closed list.
- **Conversational mode ("New Chat")** replaces the thread list with a transcript: user turns are right-aligned with the user's avatar; Operator turns are left-aligned with the RedApeAI glyph in a dark circular chip. A muted, present-tense status line (e.g. _"Running RedApeAI on all whatsapp leads…"_) communicates in-flight work — this is the only "loading" affordance the Operator uses; there is no spinner/skeleton pattern in the source design.
- **Composer affordances are inline, not a toolbar:** the same text field surfaces `/` for command suggestions and `@` for mentioning a person as placeholder-style hint text, collapsing once the user starts typing. Below the field: attachment, a **channel-scope selector** chip (e.g. "WhatsApp ▾" — the channel the Operator will act through), and mic/send.
- **Backend is mocked, contract is real:** every Operator surface consumes the `services/operator.ts`-style interfaces (`generateSummary`, `generateReply`, `qualifyLead`, `createTask`, `analyzeConversation`, `searchKnowledge`, `executeWorkflow`) — components must be built against these interfaces now so swapping in real model calls later touches zero UI code.
