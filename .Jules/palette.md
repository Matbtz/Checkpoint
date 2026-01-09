## 2024-05-22 - ActionBar Accessibility
**Learning:** Custom toggle buttons in `ActionBar` were missing `aria-pressed` states, making them ambiguous for screen readers.
**Action:** When using raw `<button>` elements for toggles, always explicit `aria-pressed` and descriptive `aria-label`.
