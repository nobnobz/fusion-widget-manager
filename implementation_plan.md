# [Landing Page Polish] Premium Light Mode Optimization

Refining the initial landing page (MainEditor welcome view) to align with the professional "Neutral Obsidian" design system, focusing on light mode contrast and modern radii. The goal is to ensure the fusion-widget-manager is ready for release. This involves fixing linting issues, updating E2E tests for the new UI, and verifying the production build.

## User Review Required

> [!IMPORTANT]
> The E2E tests are being updated to interact with the new `Neutral Obsidian` UI components. Specifically, the import process now requires explicit selection in the "Selection Station" during review.

## Proposed Changes

---

### UI & Component Fixes

#### [MODIFY] [CollectionItemEditor.tsx](file:///Users/marvin/.gemini/antigravity/scratch/fusion-widget-manager/src/components/editor/CollectionItemEditor.tsx)
- Restore the "Title Hidden" visual indicator in the preview area when the visibility toggle is active. This is required for test parity and user feedback.

---

### E2E Test Suite Modernization

#### [MODIFY] [editor-core.spec.ts](file:///Users/marvin/.gemini/antigravity/scratch/fusion-widget-manager/test/e2e/editor-core.spec.ts)
- **Import Tests**: Update `merges a partial import` and `shows moved items in review` to click the "All" button in the Selection Station.
- **Label Updates**: Ensure all tests use the new `Midnight` and `Yeb` instance labels and `PickerField` interactions.
- **Fixture Stability**: Ensure `InitScript` and `page.goto` sequences are stable.

---

### Maintenance & Cleanliness

#### [MODIFY] [AIOMetadataExportSettingsDialog.tsx](file:///Users/marvin/.gemini/antigravity/scratch/fusion-widget-manager/src/components/editor/AIOMetadataExportSettingsDialog.tsx)
- [COMPLETE] Removed unused `handleReset` function.

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
