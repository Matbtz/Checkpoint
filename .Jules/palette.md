## 2025-05-23 - Accessibility in Core Actions
**Learning:** Core user actions like "Add to Library" are often where accessibility gaps are most critical but easiest to fix. Simple additions like `aria-label` for icon-only inputs and visual loading states significantly improve the experience for all users, not just those using assistive technology.
**Action:** Always check `loading` states for async buttons and `aria-label` for inputs that rely on visual context (like "Hours" labels outside the input tag).
