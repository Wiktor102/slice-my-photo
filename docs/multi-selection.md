# Multi-selection

Panel checkboxes toggle membership on touch, with a mouse, or with the keyboard. Shift-, Ctrl-, and Cmd-click also toggle membership. Clicking a panel name selects it alone. Clicking or dragging a selected canvas panel makes it primary while retaining the group. The primary panel supplies the property editor and individual resize handles; property and style edits still affect that panel, or all panels when global styling is active.

Layout commands use resolved outer frame bounds. Dragging, nudging, centering, and duplication preserve group spacing. A group that cannot fit the wall keeps its spacing and may extend beyond the wall, where preflight reports it. Duplication copies the whole selection only when all copies fit within the eight-panel limit. Copies have independent frame and passepartout objects.

Arrow keys move the selection by 1 cm or 1/4 inch in the project unit. Shift multiplies the step by ten. Delete and Backspace remove the selection. These shortcuts work on the canvas and focused panel-name buttons. Inputs, other buttons, preview mode, and open dialogs retain their normal keyboard behavior. Undo/redo shortcuts also stop behind dialogs.

## State invariants and integration

- `selectedIds` contains unique IDs of existing panels. `selectedId` is the primary member, or null when the group is empty.
- Selecting the image clears both panel-selection fields. Adding a panel clears image selection. Preset rebuilds, layout loads, project resets, and returning home clear both panel-selection fields.
- Removing a secondary member retains the primary. Removing the primary chooses the last remaining member.
- History snapshots include both selection fields. Persistence version 4 adds `selectedIds`; measurement version remains 3. Older persisted primary selections migrate, and same-version hydration removes stale or duplicate selection IDs.
- New flows that replace the panel collection must update both fields together and clear incompatible image-selection and per-panel editing modes. PR #5's import flow and PR #6's variant-apply flow need this integration when combined with this branch. Those features are not included here.

## Validation

Run `pnpm build`, `pnpm lint`, `pnpm test:canonical`, `pnpm test:layout-tools`, `pnpm test:measurement-pdf`, `pnpm test:keyboard`, `pnpm test:multi-select`, and `node scripts/smoke.mjs`.

The layout suite covers all six alignments, both distributions, group bounds including oversized groups, duplication at the wall edge, independent overrides, deletion/history, reset/load/preset flows, and hydration invariants. The multi-select browser suite covers modifier clicks, keyboard selection and nudges, rendered group dragging, dialog guards, mobile selection controls, and migration from version 3. The smoke suite checks ZIP contents and session reload.
