# [Landing Page Polish] Premium Light Mode Optimization

Refining the initial landing page (MainEditor welcome view) to align with the professional "Neutral Obsidian" design system, focusing on light mode contrast and modern radii.

## User Review Required

> [!IMPORTANT]
> **Design Consistency**: I'll update the main Dropzone (the central interaction area) to use the same premium "Glass" styling as the widget cards, moving away from the muddy `bg-black/15` currently seen in Light Mode.

## Proposed Changes

### 1. Landing Page Refinement
Update the initial state of the application for better contrast and modern aesthetics.

#### [MODIFY] [MainEditor.tsx](file:///Users/marvin/.gemini/antigravity/scratch/fusion-widget-manager/src/components/editor/MainEditor.tsx)
- **Central Dropzone (Textarea Container)**:
    - Change background to `bg-white/40 dark:bg-white/[0.03]`.
    - Update border to `border-zinc-200/80 dark:border-white/10`.
    - Change radius to `rounded-3xl` (and `max-sm:rounded-2xl`).
    - Remove the muddy `bg-black/15`.
- **Upload Icon Circle**:
    - Update to use a cleaner border and background that pops in light mode.
- **Create New & Load Buttons**:
    - Update styling to match the primary soft blue or a more premium solid blue with better active/hover transitions.
- **Top "Additional Resources" Row**:
    - Standardize radii to `rounded-2xl` or `rounded-3xl`.
    - Improve contrast of "AIOMetadata" and "AIOSTREAMS" buttons.
- **UME Templates Section**:
    - Update main container to `rounded-3xl`.
    - Update the internal template selector row for better consistency.

## Open Questions

- Should the **"Create New"** button remain a solid blue (as it is currently) or move to the more subtle **Primary Blue Soft** style (light blue background with blue text) like we used in the editor?
- I'll assume you want the main logo to keep its subtle pulse/glow effect.

## Verification Plan

### Automated Tests
- `npm run dev` to verify visual updates in the browser.

### Manual Verification
- Confirm the Landing Page looks premium and high-fidelity in Light Mode.
- Verify all radii are consistently rounded.
- Check that the "Convert Omni Snapshot" button matches the other primary actions.
