# GitNexus in Ultraview

Ultraview keeps the upstream GitNexus repository unchanged at `vendor/GitNexus` and owns the integration in `src/gitNexus`, `src/providers/gitNexusProvider.ts`, and `src/webview/gitNexusApp.*`. This boundary allows the panel's branding and UX to evolve independently of the engine.

## Local commands

- `npm run setup:gitnexus` installs and builds the pinned submodule runtime.
- `npm run gitnexus -- <arguments>` runs the local GitNexus CLI. For example: `npm run gitnexus -- status`.
- `npm run pull:gitnexus` fast-forwards the clean submodule to `origin/main`, rebuilds it, refreshes the packaged-runtime pin, and restores the prior pointer if the build fails.

The updater refuses to run when tracked files inside the submodule were edited or when upstream is not a fast-forward. Ultraview customizations are outside the submodule, so updating GitNexus cannot overwrite them.

## VS Code commands

- `Ultraview: Open GitNexus`
- `Ultraview: Analyze Workspace with GitNexus`
- `Ultraview: Start/Stop GitNexus Local Server`
- `Ultraview: Open GitNexus CLI`
- `Ultraview: Start GitNexus MCP Server`

Packaged Ultraview builds omit the vendor source and include a verified GitNexus production runtime, its native dependencies, and Node.js. No first-use download or separate install is required. An explicit system Node executable can still be selected with `ultraview.gitNexus.nodePath` for development or diagnostics.

## Project Manager Sync

The GitNexus directory is a normal Git submodule. Ultraview's Project Manager Sync recursively syncs submodules first, then commits and pushes the parent repository's gitlink pointer. Clones initialize submodules recursively. No additional GitNexus-specific Sync step is required.
