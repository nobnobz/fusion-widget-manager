# Release Checklist

## Automated Before Merge
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:unit`
- `npm run test:e2e`

## Automated Before Release
- `npm run test:perf`
- `npm run test:smoke:live`

## Manual Cross-Device Pass
- Desktop Chrome: import, merge, reorder, export, trash/restore.
- Desktop Safari: manifest sync, export preview, persistence after reload.
- Mobile Chrome: touch navigation, dialogs, search, export.
- Mobile Safari: touch input, scroll behavior, dialog focus, export.

## Manual Regression Focus
- Large JSON import remains responsive.
- Widget title editing does not show visible input lag.
- Drag-and-drop still works with large widget lists.
- Manifest refresh and reconnect flows recover cleanly from errors.
- Static export on GitHub Pages still loads and preserves local state.
