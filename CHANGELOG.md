# Changelog

## [0.1.6] - 2026-03-21
### Changed
- **UI Refinements & Polish**:
  - Added a "Support My Work" button to the mobile header for better visibility.
  - Completely redesigned the "How To Use" guide with a modern, card-based layout and improved typography.
  - Refined the main action bar and utility buttons (Export, Trash, Import) for a more consistent aesthetic.
  - Improved touch targets and spacing in dialogs for better mobile usability.
- **Manifest Sync Improvements**:
  - Introduced **Manual JSON Mode** in the Manifest Modal, allowing users to paste manifest data directly if the URL fetch fails.
  - Enhanced visual feedback and status indicators during the manifest synchronization process.

### Fixed
- **Responsive Layouts**: Fixed minor alignment issues in the widget grid and editor views on small screens.
- **Icon Consistency**: Standardized icon sizes and weights across all navigation and action elements.

## [0.1.5] - 2026-03-21
### Added
- **Collection Item Trash**: Introduced a trash system for individual collection items.
  - Deleted items are now moved to a new `itemTrash` storage instead of being permanently removed.
  - Items can be restored back to their original parent widget with their original order preserved.
  - Unified Trash UI now shows both deleted widgets and individual items.

### Fixed
- **Missing Items**: Bug fixes for missing items in certain configurations.
- **Widget Recognition**: Improved logic for recognizing missing widgets properly.

## [0.1.4] - 2026-03-20
### Changed
- **Renamed "Row" to "Classic Row"**: Improved clarity in the widget creation dialog and list view.
- **Updated Descriptions**: 
  - "Classic Row" now says: "Show a single catalog on your homescreen."
  - "Collection" now says: "Create collection with different catalogs and custom images."
- **Badge Label**: Updated the "Classic" badge label to "Classic Row" for consistency across the application.

## [0.1.3] - 2026-03-19
### Added
- **Dedicated Web App Icon**: Added a high-resolution, wavy-background icon for PWA/Apple devices.
- **Optimized Favicons**: Replaced the large, blurry favicon with optimized 16x16 and 32x32 PNGs for sharper browser tab display.

### Changed
- **Mobile Grid Overhaul**: Refined the utility row into a balanced 2x2 grid for "New Widget", "Export", "Import", and "Trash".
- **Visual Feedback**: Applied a reddish, "destructive" theme to the Trash buttons to improve contrast and clarity.
- **Mobile Action Layout**: Right-aligned the action buttons (Eye, Copy, Trash) in collection items for a more professional, right-anchored feel.
- **Header Refinement**: Reclaimed vertical space in the mobile header by removing the heart (support) icon.

### Fixed
- **Widget Card Formatting**: Resolved a critical layout issue on mobile where overlapping desktop and mobile blocks caused shifted content.
- **File Asset Cleanup**: Removed unused/legacy icon files and fixed metadata references.

## [0.1.2] - 2026-03-19
### Changed
- **Premium UI Overhaul**: Implemented a modern glassmorphism design system across all components with refined typography and smooth micro-animations.
- **Action Bar Redesign**: Iterated on the central action bar to prioritize high-value actions (New Widget, Export) with better mobile stacking.
- **Expanded Widget View**: Optimized the responsive layout to stack configuration cards on mobile while maintaining a side-by-side view on desktop.
- **Resource Accessibility**: Added a direct, Blob-based AIOMetadata template download with dynamic version detection (e.g., v1.6.0) and iOS JSON compatibility.
- **Clean Header**: Removed the "Configuration" label from the welcome screen to further refine the minimalist aesthetic.
- **UI De-cluttering**: Hidden raw Data Source URLs in the editor for a cleaner, more focused configuration experience.
- **Trash Handling**: Redesigned the Trash modal with improved visual hierarchy and fixed the cluttered top-right action area.

### Fixed
- **Mobile Overflow**: Fixed horizontal overflow issues in the aspect ratio selection (Wide/Poster/Square) on small screens.
- **Responsive Alignment**: Standardized label and button positioning to prevent "weird" floating alignments in the expanded widget view on mobile.

## [0.1.1] - 2026-03-18
### Fixed
- **Omni Sorting**: Replaced heuristic sorting with precise iteration using decoded `subgroup_order._data` for perfect item sequences.
- **GitHub Pages Assets**: Fixed broken logos and icons in production by switching to static image imports.
- **Deployment Concurrency**: Prevented GitHub Actions deployment failures by enabling `cancel-in-progress` in the workflow.
- **Single Widget Copy**: Fixed an issue where the `YOUR_AIOMETADATA` placeholder was not replaced during individual widget copies.

### Changed
- **UI Refinement**: Updated "Start Over" confirmation dialog for better clarity.
- **UME Templates**: Updated repository links to point to the new individual template repository.
- **CI/CD Environment**: Upgraded GitHub Actions runners to Node.js 22 to address deprecation warnings.
- **Template UX**: Limited the maximum height of the template selection dropdown for a cleaner layout.

## [0.1.0] - 2026-03-18
### Added
- **Initial Release**: Complete Fusion Widget Manager web interface.
- **Import Support**: Support for pasting JSON and drag-and-dropping `.json` files.
- **Omni Snapshot Converter**: Specialized tool to convert Omni snapshots for Fusion use.
- **How-to-Use Guide**: Integrated step-by-step documentation for users (accessible via the "Guide" button).
- **AIOMetadata Sync**: Automated catalog data synchronization from manifest URLs.
- **UME Templates**: Support for loading official community templates via GitHub integration.
- **iOS Optimization**: Specialized `.json` export handling (`application/octet-stream`) for seamless import into the Fusion iOS app.
- **Modern UI**: Dark/light mode support, premium aesthetics, and responsive layout.
- **GitHub Attribution**: Subtle project attribution and repository links in the footer.
