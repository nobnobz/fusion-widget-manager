# Changelog

## [0.5.0] - 2026-04-03
### Added
- **Letterboxd Catalog Support**: Seamlessly integrate and manage Letterboxd-based catalogs directly within the manager.
- **Custom AIOMetadata Export Sorting**:
  - Configure catalog sort order (Popularity, Release Date, etc.) directly during export.
  - Set global refresh intervals for all catalogs at once, removing the need for manual configuration in AIOMetadata.

### Improved
- **Smart Import & Move Detection**: Dramatically improved reliability when updating existing setups; moved items are now correctly recognized across widgets to prevent duplication.
- **Mobile Design Evolution**: Comprehensive "Neutral Obsidian" refinement for small screens, including improved touch targets, spacing, and interaction flows.
- **Stability & Performance**: General optimizations for smoother navigation and faster configuration processing.

### Fixed
- **Omni Import Compatibility**: Resolved several edge cases where Omni snapshots would fail to import due to structural variations.
- **UI Refinements**: Numerous minor visual fixes and layout adjustments for a more premium, cohesive experience.


## [0.4.0] - 2026-03-31
### Added
- **Smart Import & Merge System**: Completely redesigned import engine allowing users to merge widgets from external configurations into existing setups.
  - **Granular Update Control**: Choose exactly which fields to update (Images, Names, Catalogs) on a per-widget or per-item basis.
  - **Intelligent Diffing**: Automatically detects additions versus updates, preventing accidental overwrites.
  - **Improved Merge Logic**: Safer handling of partial updates ensuring unaffected widgets/items remain untouched.
  - **Built-in Repair**: Enhanced `normalizeFusionConfig` logic to automatically repair common inconsistencies in imported configurations.

### Changed
- **Neutral Obsidian UI Refinement**:
  - Global layout polishing with standardized spacing, alignment, and consistent `rounded-3xl` radii.
  - Enhanced contrast and typography across the editor and footer for better accessibility.
- **Mobile Optimizations**:
  - Optimization of the "Selection Station" for touch devices with smoother scrolling and better touch targets.
  - Improved responsive scaling for the branding section and dialogs on various mobile devices.

### Fixed
- **Catalog Support**: Resolved parsing and validation issues affecting SIMKL and specific MDBList catalogs.
- **Stability**: Multiple bug fixes and stability improvements during complex import/merge workflows.

## [0.3.0] - 2026-03-27
### Added
- **AIOMetadata Export**: Added full support for exporting AIOMetadata catalogs directly from the manager with preview, selection controls, and JSON download.
- **Unified Import Logic**: Standardized import flow for JSON URLs, manual pasting, and file uploads, including automatic manifest takeover.
- **Flexible Export Options**: New choices for handling invalid catalog entries (`Skip Invalid` or `Export Empty Items`) to preserve layout even without valid catalogs.

### Improved
- **Enhanced Issue Detection**: Items without catalogs are now flagged as issues with clearer warnings and guidance.
- **UI Refinements**: Refined status banners, refined Apple TV warnings, and updated wording for better clarity (e.g., `issue/issues` instead of `invalid`).
- **Standardized Navigation**: Changed `Select All` to `All` in the source selection UI for consistency.

### Fixed
- **Manifest Sync**: Fixed AIOMetadata disconnect behavior to ensure full disconnection after confirmation.
- **Export Consistency**: Resolved inconsistent behavior when exporting items with zero catalogs.

### Validation
- Updated unit tests for manifest extraction, catalog handling, and empty item export behavior.

## [0.2.1] - 2026-03-24
### Added
- **AIOMetadata Popup**: Introduced a selection popup for AIOMetadata templates, allowing users to choose between a "Full Setup" (comprehensive configuration) or "Catalogs Only" (lightweight metadata) during download.

### Changed
- **Mobile UI Optimizations**:
  - Refined the "New Widget" button layout on mobile to be more compact by showing only "New" instead of the full text.
  - Improved touch interactions and spacing for better usability on small screens.

## [0.2.0] - 2026-03-23
### UI Polish
- **Welcome Screen Overhaul**: Redesigned the desktop layout and hero section proportions for better visual balance.
- **Compact Utility Bar**: Streamlined the top utility bar to harmonize with the centered layout.
- **Composition Stiffening**: Tightened the hero layout by moving the mascot closer to the main heading.
- **Enhanced Resources**: Visually reworked the "Additional Resources" section with integrated, compact pills and improved hierarchy.
- **Action Refinement**: Subtly softened the primary buttons ("Import Fusion JSON", "Create New") for a cleaner look.
- **Layout Balancing**: Improved the spatial arrangement of the textarea, CTA row, and "UME Templates" on desktop.

### Manifest Sync UX
- **Redesigned Status Area**: Introduced a fixed status area above the toolbar with clearly distinct "Not synced" and "Synced" states.
- **Toolbar De-cluttering**: Removed the redundant "Sync Manifest" button from the toolbar.
- **Extended Actionability**: Added direct "Refresh" and "Edit" actions directly into the "Synced" status banner.
- **Improved Feedback**: Standardized the refresh animation duration for better visual confirmation.
- **Banner Refinement**:
  - Updated "Not synced" status to a calm, uniform amber design.
  - Aligned "Synced" status with a matching flat, soft aesthetic.
  - Refined typography and iconography for a more subtle status display.
- **Status Clarity**: Removed host-specific details from the "Synced" banner to focus on the core status.

### Modal Improvements
- **AIOMetadata Setup**: Overhauled the setup modal for improved clarity and flow.
- **Better URL Inputs**: Redesigned the manifest URL field as a clearly editable input with improved light-mode visibility.
- **Surface Integration**: Matched input styling with the modal design while maintaining clear interactability.

### Navigation
- **Manager Switcher**: Updated the Omni Manager switcher to open in a new tab for seamless context switching.

## [0.1.7] - 2026-03-22
### Added
- **AIOSTREAMS Template Support**:
  - Added a direct download button for the latest UME AIOSTREAMS template.
  - Implemented dynamic version detection for AIOSTREAMS templates from the GitHub repository.
  - Improved layout of the template action bar for better alignment on different screen sizes.

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
