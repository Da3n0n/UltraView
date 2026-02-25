# Ultraview – All din One VS Code Extension

Ultraview brings a full suite of viewers, editors, and developer tools right inside VS Code — and it always looks like your theme no matter what theme you use.


Install it once in **VS Code**, **Cursor**, **Windsurf**, or any VS Code-compatible IDE and everything stays in sync.


## Features at a Glance

FeatureUsageCodegraphGenerate Obsidian Like dynamic code graph of your codebase or notes rightin VS Code


## Cross-IDE Sync — Projects &amp; Git Accounts

**Add an account in Cursor. Open VS Code. It's already there.**


Ultraview stores all projects and Git accounts in a single shared file on your local machine at `~/.ultraview/sync.json`. Every VS Code-compatible IDE (VS Code, Cursor, Windsurf, Antigravity, etc.) that has Ultraview installed reads and writes to the same file.


### How It Works

`C:\Users\You\.ultraview\   sync.json     ← shared project list, accounts, profiles (no tokens) `



- **Projects** — your full project list is shared. Add a project in one IDE, open another IDE and it's already in the panel.




- **Git Accounts** — accounts, SSH keys, and provider settings are shared. Log in once, all IDEs know.




- **Tokens** — raw tokens are **never** written to `sync.json`. They stay exclusively in each IDE's OS keychain (`context.secrets`) and are keyed by account ID so any IDE can retrieve them.




- **Live reload** — the extension watches the sync file for changes. If another IDE writes to it, yours reloads within ~300 ms automatically — no restart required.




- **Atomic writes** — saves go through a temp-file rename to prevent corruption if two IDEs write at the same time.





### First Run &amp; Migration

On first activation, Ultraview automatically migrates any existing accounts and projects from your IDE's internal storage into the shared file and shows a confirmation notification. This migration runs once per IDE — after that everything comes from the shared file.


### Setting the Sync Folder

The default folder is `~/.ultraview/`. You can change it (e.g. to a Dropbox or OneDrive folder for cross-machine sync):



- Open the Command Palette (`Ctrl+Shift+P`)




- Run **`Ultraview: Set Cross-IDE Sync Folder`**




- Browse to your preferred folder or choose **Use default (~/.ultraview)**





The pointer to the sync folder is stored per-IDE in `globalState` (just a path string), so each IDE only needs to be told once. After that, all reads and writes go to the chosen location.


To open the sync folder in your file explorer:



- Run **`Ultraview: Show Sync Folder in Explorer`** from the Command Palette


### Setting Up Sync Across Multiple IDEs


- Install Ultraview in **IDE A** (e.g. VS Code). Add your accounts and projects. The sync file is created automatically at `~/.ultraview/sync.json`.




- Install Ultraview in **IDE B** (e.g. Cursor). On first activation it migrates any local data and reads from the same `~/.ultraview/sync.json`.




- That's it — both IDEs now share the same project list and accounts.





**Optional:** If you want to use a custom location (e.g. Dropbox), run `Ultraview: Set Cross-IDE Sync Folder` in **both** IDEs and point them to the same folder.


### Security Notes

Data
Where it's stored


Usernames, emails, provider info
`~/.ultraview/sync.json` (plain text, safe)


Project paths, profiles
`~/.ultraview/sync.json` (plain text, safe)


Auth tokens (PAT / OAuth)
OS keychain via VS Code `context.secrets` — **never** in the JSON


SSH private keys
OS keychain via VS Code `context.secrets` — **never** in the JSON


## Git Account Manager

Manage multiple Git identities across providers — GitHub, GitLab, and Azure DevOps — directly from the Ultraview sidebar or the Git Projects panel.


### Authentication Methods


- **Browser OAuth** — sign in via your browser (recommended for GitHub and GitLab)




- **Personal Access Token** — paste a PAT manually




- **SSH Key** — generate an Ed25519 key pair, copy the public key to clipboard, and open the provider's SSH settings page automatically





### Per-Project &amp; Global Accounts


- Set a **global** account that applies to all workspaces




- Override with a **local** account for any specific project




- When a local account is set, Ultraview configures `user.name` and `user.email` in the project's local `.git/config` automatically





### Git Profiles

Create named profiles (name + email) and assign them to projects. Useful for separating personal and work identities without managing full accounts.


## Database Viewer

Double-click a supported database or SQL file in your explorer and Ultraview opens it in a clean, paginated table view — no external client needed.


### Supported Formats

Format
Extensions


SQLite
`.db`, `.sqlite`, `.sqlite3`, `.db3`


DuckDB
`.duckdb`, `.ddb`


Microsoft Access
`.mdb`, `.accdb`


SQL Dumps
`.sql`, `.dump`, `.bak`, `.pgsql`


Index Files
`.idx`, `.index`, `.ndx`


### Viewer Tabs

**Data**



- Paginated table view (default 200 rows per page)




- Column headers with data type info




- NULL values, numbers, and booleans styled distinctly




- Horizontal scroll for wide tables




- Prev / Next pagination controls





**Structure**



- Column name, data type, primary key badge, NOT NULL constraint badge for every column


**Query**



- Full SQL editor — write and run custom queries




- Results rendered in the same table format




- Error messages shown inline





**Stats**



- Total tables, total rows, database file size, file path


### Sidebar

Searchable table list with row counts for every table in the database.


## Markdown Editor

Open any `.md`, `.mdx`, or `.markdown` file and Ultraview takes over with a full-featured editor — not just a preview.


### View Modes

Mode
Description


**Rich**
WYSIWYG contenteditable preview — edit directly in the rendered output


**Raw**
Plain textarea for direct markdown editing


**Split**
Editor and preview side by side, synced in real time


### Toolbar


- **Headings** — H1 through H6 dropdown




- **Text formatting** — Bold, Italic, Strikethrough, Inline Code




- **Lists** — Bullet, Numbered, Task (checkbox)




- **Block elements** — Blockquote, Horizontal Rule, Code Block, Table




- **Media** — Insert Link, Insert Image




- **Style switcher** — Toggle between Obsidian and GitHub markdown styles




- **View mode selector** — Switch between Rich / Raw / Split





### Styles


- **Obsidian** — Custom fonts, colored headings, styled blockquotes and code blocks




- **GitHub** — GitHub-flavored markdown with proper tables, checkboxes, and spacing





### Status Bar

Live word count, line count, and character count displayed at the bottom of the editor.


### Two-Way Conversion

Rich mode uses TurndownService to convert HTML edits back to clean markdown, so you always get proper markdown output saved to disk.


### Keyboard Shortcuts

Shortcut
Action


`Ctrl+B` / `Cmd+B`
Bold


`Ctrl+I` / `Cmd+I`
Italic


`Ctrl+S` / `Cmd+S`
Save


`Tab`
Insert 2-space indent


## Interactive Code Graph

Ultraview scans your workspace and builds a live, interactive node graph showing how your files, imports, and markdown links connect — like Obsidian, but for your entire codebase.


### Node Types


- **TypeScript / TSX**: `.ts`, `.tsx`




- **JavaScript / JSX**: `.js`, `.jsx`




- **Markdown**: `.md`, `.mdx`, `.markdown`




- **Python, Go, Rust, Java, C#, PHP, C/C++** and more




- **HTML / CSS**: `.html`, `.css`




- **SQL &amp; Database files**: `.sql`, `.db`, `.sqlite`, `.duckdb`, `.mdb`




- **Config files**: `.json`, `.yaml`, `.toml`, `Dockerfile`, `Makefile`




- **Function / Export nodes**: extracted functions, classes and exports appear as symbol nodes





Node colors are fully customizable per type — click any dot in the legend to change it.


### Edge Types


- **import** — Module dependencies (`import` / `require`)




- **wikilink** — Markdown `[[wiki-style]]` links




- **mdlink** — Standard markdown `[text](path)` links




- **url** — External HTTP/HTTPS URLs found in source files





### Interaction


- **Pan** — Click and drag the canvas




- **Zoom** — Scroll wheel or pinch to zoom




- **Drag nodes** — Reposition individual nodes; they pin in place until released




- **Select** — Click a node to see its file path and open it in the editor




- **Search** — Live filter nodes by name or path




- **Toggle function nodes** — Show or hide function/class nodes with the ƒ( ) button




- **Fit to screen** — Auto-zoom to fit all nodes in view





### Physics Settings

Setting
Range
Effect


Repulsion
1000 – 30000
How strongly nodes push each other apart


Spring Length
40 – 300
Natural rest distance between connected nodes


Damping
0.3 – 0.95
How quickly node velocity decays


Center Pull
0.001 – 0.05
Gravity pulling nodes toward the canvas center


### Color Customization

Click any dot in the legend to open the color picker and change that node type's color. Colors are saved to your VS Code settings and persist across sessions.


### UI Controls


- Toggle the legend and settings panel with the eye button




- Open the graph as a full editor panel for more space




- Settings panel slides in from the side without covering the graph





### Workspace Scanning

Ultraview scans up to 10,000 files. Excluded automatically: `node_modules`, `dist`, `.git`, `out`, `.next`, `build`.


## Dynamic Theming

Ultraview uses native VS Code CSS variables so every panel and editor matches your active theme automatically. Powered by `--vscode-editor-background`, `--vscode-editor-foreground`, `--vscode-sideBar-background`, and friends — no restart required when you switch themes.


## Getting Started


- **Install** the extension from the VS Code Marketplace (or install the `.vsix` manually)




- **Open a file** — double-click a `.db`, `.sqlite`, `.md`, or other supported file in your explorer




- **Open the Code Graph** — Command Palette → `Ultraview: Open Code Graph`




- **Open the Git panel** — click the Git icon in the activity bar, or run `Ultraview: Open Git Projects Manager`




- **Add your first account** — in the Git panel, click **+ Add Account** and choose browser OAuth or PAT




- **Cross-IDE sync** — install Ultraview in your other IDEs (Cursor, Windsurf, etc.). Your projects and accounts appear automatically from `~/.ultraview/sync.json`




- **Open any URL** — Command Palette → `Ultraview: Open URL`





## Settings

All settings live under the `ultraview.*` namespace in VS Code settings (`Ctrl+,`).


### Markdown

Setting
Default
Description


`ultraview.markdown.defaultView`
`split`
Initial view mode: `split`, `edit`, or `preview`


`ultraview.markdown.style`
`obsidian`
Markdown style: `obsidian` or `github`


`ultraview.markdown.autoSave`
`true`
Enable auto-save


`ultraview.markdown.autoSaveDelay`
`1000`
Auto-save delay in milliseconds


`ultraview.markdown.fontSize`
`14`
Editor font size


`ultraview.markdown.showStatusBar`
`true`
Show word/line/char count bar


`ultraview.markdown.wordWrap`
`true`
Enable word wrap in raw editor


### Code Graph

Setting
Description


`ultraview.codeGraph.nodeColors.*`
Color for each node type (TS, JS, MD, function)


`ultraview.codeGraph.nodeSize`
Size of nodes in the graph


`ultraview.codeGraph.fontSize`
Label font size


`ultraview.codeGraph.showLabels`
Toggle node labels


`ultraview.codeGraph.hideUI`
Hide legend and settings panel


`ultraview.codeGraph.layoutDirection`
`horizontal`, `vertical`, or `radial`


### Database

Setting
Default
Description


`ultraview.database.pageSize`
`200`
Rows per page


`ultraview.database.showRowNumbers`
`true`
Show row number column


`ultraview.database.maxColumnWidth`
`320`
Max column width in pixels


`ultraview.database.nullDisplay`
`NULL`
Display text for NULL values


`ultraview.database.autoQueryLimit`
`1000`
Auto-applied row limit for queries


### Custom Comments

Setting
Default
Description


`ultraview.customComments.enabled`
`false`
Enable custom comment font


`ultraview.customComments.fontFamily`
`Fira Code`
Font family (must be installed)


`ultraview.customComments.fontStyle`
`italic`
`normal`, `italic`, or `oblique`


`ultraview.customComments.color`
*(theme)*
Optional color override for comments


## Commands

Command
Description


`Ultraview: Open Code Graph`
Open the code graph in the sidebar


`Ultraview: Open Code Graph as Editor`
Open as a full-width editor panel


`Ultraview: Open Git Projects Manager`
Open the Git / Projects panel as editor


`Ultraview: Open URL`
Open any URL in VS Code's Simple Browser


`Ultraview: Set Cross-IDE Sync Folder`
Change where `sync.json` is stored


`Ultraview: Show Sync Folder in Explorer`
Open the sync folder in your file explorer


`Ultraview: Enable Custom Comments Font`
Enable custom font styling for comments


`Ultraview: Disable Custom Comments Font`
Disable custom font styling for comments


`Ultraview: Toggle Custom Comments Font`
Toggle custom comment font on/off


## How It Works

### Custom Editors

Ultraview registers as a **Custom Editor** provider for each supported file type. When you open a `.db` file, VS Code routes it to Ultraview instead of the default text editor.


**Libraries:**



- **sql.js** — WebAssembly SQLite, no native binaries




- **mdb-reader** — Microsoft Access parsing in pure JS




- **marked** — Fast markdown rendering




- **TurndownService** — HTML-to-markdown conversion





### Cross-IDE Sync Architecture

`SharedStore` (`src/sync/sharedStore.ts`) owns all reads and writes:



- On `activate()`, it loads `~/.ultraview/sync.json` into memory




- A `fs.watch` listener hot-reloads data when another process writes the file




- All writes go through a 100 ms debounce + atomic rename (`sync.json.tmp` → `sync.json`) to avoid corruption




- Tokens and SSH private keys are stored only in `context.secrets` and referenced by ID




- On first run, existing `globalState` data is automatically migrated into the shared file





### Code Graph

The graph builder scans your workspace using file-type-specific detectors:



- **TypeScript/JS Detector** — extracts imports, requires, exported functions and classes, and URLs using regex




- **Markdown Detector** — extracts wiki links, markdown links, and URLs




- **Database Detector** — creates nodes for database files





All edges are deduplicated before the graph is rendered. The physics simulation runs as a `requestAnimationFrame` loop with O(n²) repulsion (with a distance cutoff for performance) and spring forces for connected nodes.


## Release Notes

### 0.2.83


- ✨ **Cross-IDE Sync** — projects and Git accounts are now shared across all VS Code-compatible IDEs via `~/.ultraview/sync.json`




- ✨ **Live hot-reload** — changes made in one IDE appear in others within ~300 ms




- ✨ **Automatic migration** — existing accounts and projects are migrated to the shared file on first run




- ✨ New commands: `Ultraview: Set Cross-IDE Sync Folder` and `Ultraview: Show Sync Folder in Explorer`




- 🔐 Tokens and SSH private keys remain exclusively in the OS keychain — never written to disk





### 0.2.x


- Git Account Manager with GitHub, GitLab, and Azure DevOps support




- Browser OAuth flow, SSH key generation, and personal access token support




- Per-project and global Git identity management





### 0.1.5


- Interactive code graph with physics simulation and color customization




- Markdown editor with Rich, Raw, and Split view modes — Obsidian and GitHub styles




- Database viewer with Data, Structure, Query, and Stats tabs




- Dynamic theming across all panels





**Enjoy Ultraview** — feedback and issues welcome on [GitHub]($1).


