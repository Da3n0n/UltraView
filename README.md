# Ultraview – The Ultra VS Code Viewer

[]($1)


No drivers. No heavy clients. No hassle. Ultraview brings a full suite of viewers and editors right inside VS Code — and it always looks like it belongs .


## Features


- **Interactive Code Graph** — Obsidian-style node graph of your entire codebase and notes, with physics simulation, live search, and color customizations.




- **Markdown Editor** — Full rich editor with WYSIWYG preview, split view, toolbar, and Obsidian/GitHub styles




- **Database Viewer** — Browse SQLite, DuckDB, Access, SQL dumps, and index files without leaving VS Code




- **Dynamic Theming** — Every panel, editor, and graph adapts to your active VS Code theme instantly, no restart needed

- **Quick URL Opener** — Open any URL in VS Code's Simple Browser from the Command Palette with `Ultraview: Open URL`





## Code Graph

Ultraview scans your workspace and builds a live, interactive node graph showing how your files, imports, and markdown links connect — like Obsidian, but for your entire codebase.


### Node Types

Ultraview represents files and symbols as nodes in the graph. Common node types and typical file extensions:

- **TypeScript / TSX**: `.ts`, `.tsx` (node type: `ts`)
- **JavaScript / JSX**: `.js`, `.jsx` (node type: `js`)
- **Markdown**: `.md`, `.mdx`, `.markdown` (node type: `md`)
- **Python**: `.py` (node type: `py`)
- **Go**: `.go` (node type: `go`)
- **C / C++**: `.c`, `.cpp`, `.cc`, `.cxx`, `.h`, `.hpp` (node types: `c`, `cpp`)
- **Java**: `.java` (node type: `java`)
- **Rust**: `.rs` (node type: `rs`)
- **PHP**: `.php` (node type: `php`)
- **C# / .NET**: `.cs` (node type: `cs`)
- **HTML / CSS**: `.html`, `.htm`, `.css` (node types: `html`, `css`)
- **SQL**: `.sql` and SQL dump files (node type: `sql`)
- **JSON / YAML / TOML / INI**: `.json`, `.yaml`, `.yml`, `.toml`, `.ini` (node types: `json`, `yaml`, `toml`, `ini`)
- **Shell scripts**: `.sh`, `.bash`, `.ps1`, `.bat` (node types: `sh`, `ps1`, `bat`)
- **Build / config files**: `Dockerfile`, `Makefile`, `CMakeLists.txt` (node type uses filename)
- **Database files**: `.db`, `.sqlite`, `.duckdb`, `.mdb`, `.accdb` (node type: `db`)
- **Binary / image / misc files**: `.png`, `.jpg`, `.jpeg`, `.svg`, `.ico`, etc. (node type uses extension)
- **URL nodes**: detected external links become `url` nodes
- **Function / Export nodes**: extracted functions, classes and exports appear as `fn`/symbol nodes

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

The graph uses a configurable force-directed layout. Adjust the sliders in the settings panel:


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

Ultraview scans up to 10,000 files, detecting `.ts`, `.tsx`, `.js`, `.jsx`, `.md`, `.mdx`, and `.markdown` files. Excluded automatically: `node_modules`, `dist`, `.git`, `out`, `.next`, `build`.


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

Rich mode uses TurndownService to convert HTML edits back to clean markdown, so you can edit in WYSIWYG and always get proper markdown output saved to disk.


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



- Column name, data type, primary key badge, NOT NULL constraint badge for every column in the selected table


**Query**



- Full SQL editor — write and run custom queries




- Results rendered in the same table format




- Error messages shown inline





**Stats**



- Total tables, total rows, database file size, file path


### Sidebar

Searchable table list with row counts for every table in the database.


## Dynamic Theming

Ultraview uses native VS Code CSS variables so every panel and editor matches your active theme automatically.


**How it works:** VS Code exposes theme colors as CSS custom properties (`--vscode-editor-background`, `--vscode-editor-foreground`, `--vscode-sideBar-background`, etc.). Ultraview binds directly to these — when you switch themes, all Ultraview UI updates instantly with no restart required. This works with every color theme, light or dark.


## Getting Started


- **Install** the extension from the VS Code Marketplace




- **Open a file** — double-click a `.db`, `.sqlite`, `.md`, or other supported file in your explorer




- **Open the Code Graph** — use the Command Palette (`Ctrl+Shift+P`) and run `Ultraview: Open Code Graph`

- **Open the built‑in browser** — click the globe icon in the activity bar or run `Ultraview: Open Browser`. The browser appears in the **sidebar** under that container; it includes an address bar and navigation buttons. (A separate command `Ultraview: Open Browser in Panel` can open the same content in a full‑editor tab if you prefer.)

- **Open any URL in VS Code** — open the Command Palette (`Ctrl+Shift+P`) and run `Ultraview: Open URL`. Enter any URL and it will open in VS Code's built‑in Simple Browser tab in the main editor area.




- **Explore** — browse tables, write queries, edit markdown, or navigate your codebase as a graph





## Settings

All settings live under the `ultraview.*` namespace in VS Code settings.


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


## How It Works

### Custom Editors

Ultraview registers as a **Custom Editor** provider for each supported file type in `package.json`. When you open a `.db` file, VS Code routes it to Ultraview instead of the default text editor. The extension reads the binary data and renders it using:



- **sql.js** — WebAssembly SQLite, no native binaries




- **mdb-reader** — Microsoft Access parsing in pure JS




- **marked** — Fast markdown rendering




- **TurndownService** — HTML-to-markdown conversion





### Code Graph

The graph builder scans your workspace using file-type-specific detectors:



- **TypeScript/JS Detector** — extracts imports, requires, exported functions and classes, and URLs using regex




- **Markdown Detector** — extracts wiki links, markdown links, and URLs




- **Database Detector** — creates nodes for database files





All edges are deduplicated before the graph is rendered. The physics simulation runs as a requestAnimationFrame loop with O(n²) repulsion (with a distance cutoff for performance) and spring forces for connected nodes.


## Release Notes

### 0.1.5


- Interactive code graph with physics simulation and color customization




- Settings panel with live sliders for graph physics




- Markdown editor with Rich, Raw, and Split view modes




- Obsidian and GitHub markdown styles




- Full toolbar with heading, formatting, list, block, and media tools




- Database viewer with Data, Structure, Query, and Stats tabs




- Dynamic theming across all panels





**Enjoy Ultraview** — feedback and issues welcome on [GitHub]($1).



| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
