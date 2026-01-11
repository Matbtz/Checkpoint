## 2024-05-22 - ActionBar Accessibility
**Learning:** Custom toggle buttons in `ActionBar` were missing `aria-pressed` states, making them ambiguous for screen readers.
**Action:** When using raw `<button>` elements for toggles, always explicit `aria-pressed` and descriptive `aria-label`.

## 2025-02-23 - Custom Progress Bar Accessibility
**Learning:** Custom visual progress bars built with `div`s are invisible to screen readers unless they have explicit `role="progressbar"` and ARIA attributes (`aria-valuenow`, `aria-valuemin`, `aria-valuemax`, `aria-label`).
**Action:** Always wrap custom progress indicators in a container with `role="progressbar"` and provide context in `aria-label` (e.g., "Progress: 50% of Main Story").
