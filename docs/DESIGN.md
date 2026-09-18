# Design system — Evidentia website and console

Reviewed with the ui-ux-pro-max design pass on 2026-09-18. Product type:
enterprise B2B governance/security software, European. Recommended pattern:
**Trust & Authority + Conversion** — hero (mission/credibility) → proof →
solution overview → clear CTA path. Adopted with one deliberate deviation: the
"proof" section shows **verifiable facts only** (Lighthouse scores, source
counts, test counts, absence of trackers) — never logos, certifications,
testimonials or case studies we do not have.

## Direction
Swiss / International editorial. Typography carries hierarchy; rules and
tabular data do the rest. No gradients, blobs, stock photography or
"AI purple". Diagrams are hand-drawn inline SVG with real labels.

## Tokens (website `src/styles/global.css`)
| Token | Value | Use |
|---|---|---|
| `--ink` | #101418 | primary text, primary buttons |
| `--ink-2` | #3a424c | secondary text, nav |
| `--muted` | #59626e | captions (≥ 4.5:1 on paper) |
| `--paper` / `--paper-2` | #fbfaf7 / #f2f0ea | page / subtle surfaces |
| `--card` | #ffffff | cards, tables |
| `--accent` | #0f6e6a | links, evidence tier A, focus of attention |
| `--line` | #d8dde3 | rules and borders |
| `--warn` / `--bad` | #8a5a00 / #a3261e | tier C / tiers D–E and negative states |
| type scale | body clamp(16–18px), display clamp(38–74px), h2 clamp(26–37px) | |
| spacing | 4/8 rhythm; section `clamp(3.5rem, 6vw, 7rem)` | |
| motion | 180 ms ease-out on colour/border/shadow; reveal 700 ms; all disabled under `prefers-reduced-motion` | |

Fonts: Inter when installed, otherwise the system sans stack — no external font
requests (privacy, performance). Mono for identifiers and evidence tiers.

## Rules applied (from the review checklist)
- Contrast ≥ 4.5:1 for all text (axe WCAG 2.2 AA in Playwright; Lighthouse a11y 100).
- Touch targets ≥ 44 px for nav links and buttons; `touch-action: manipulation`.
- Visible focus rings (3 px amber) on every interactive element; skip link; one H1 per page; sequential headings; landmarks.
- Scrollable regions (`pre`, `.table-wrap`, wide diagram) are keyboard-focusable.
- Hover/active states with 150–300 ms transitions; cursor pointer on buttons.
- No horizontal scroll at 375 px (tested); tables scroll inside their wrapper.
- One primary CTA per screen: website hero → "Talk to Clixite" (secondary: install); console pages → one primary action per stage.
- Forms: visible labels, required markers via `required`, errors and confirmations in a `role="status"` notice near the top, destructive actions in danger colour with a mandatory reason.
- No emoji as icons; SVG mark only. No client-side JavaScript on the website; CSP forbids scripts on the console.

## Console (apps/admin/src/views.ts)
Sidebar navigation with current-page state, page header with title/subtitle and
signed-in identity, KPI cards with tabular numerals, dense tables in scrollable
wrappers, badges that carry text (never colour alone), notices for feedback,
and a footer that names the ledger. Light theme only in 1.0 (dark mode planned
with token pairs designed together).
