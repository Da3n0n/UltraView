# ✨ DBView – Your Instant Database & Markdown Explorer

[![Version](https://img.shields.io/visual-studio-marketplace/v/Dannan.dbview.svg)](https://marketplace.visualstudio.com/items?itemName=Dannan.dbview)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/Dannan.dbview.svg)](https://marketplace.visualstudio.com/items?itemName=Dannan.dbview)

**DBView** is the ultimate lightweight file explorer for VS Code that lets you preview **Databases**, **SQL Dumps**, and **Markdown** files instantly—just click and view! 🚀

No drivers. No connection strings. No hassle. It just works.

---

## 🔥 Features

### 👁️ Instant Preview
Forget about installing heavy database clients just to check a table. DBView integrates directly into your file explorer. Just **double-click** a supported file, and it opens right inside VS Code.

### 🎨 Matches Your Theme Automatically
Whether you love Dark Mode 🌙, Light Mode ☀️, or High Contrast, DBView adapts instantly.
**How it works:** We use native VS Code CSS variables (like `--vscode-editor-background` and `--vscode-editor-foreground`). When you change your theme, VS Code updates these variables, and DBView reflects the changes immediately—no restart required!

### 📂 Massive File Support
DBView isn't just for one type of database. We support a wide range of formats out of the box:

- **SQLite**: `.db`, `.sqlite`, `.sqlite3`, `.db3`
- **DuckDB**: `.duckdb`, `.ddb`
- **Microsoft Access**: `.mdb`, `.accdb`
- **SQL Dumps**: `.sql`, `.dump`, `.bak`, `.pgsql`
- **Markdown**: `md`, `.mdx`, `.markdown` (with full rendering!)
- **Index Files**: `.idx`, `.index`, `.ndx`

---

## 🚀 Getting Started

1.  **Install** the extension from the VS Code Marketplace.
2.  **Locate** a database file in your explorer.
3.  **Click** the file.
4.  **Explore** your data in a clean, responsive table view!

---

## 🛠️ How it works under the hood

### Theme Matching
DBView uses the VS Code Webview API, which allows extensions to render HTML/CSS. By using the official VS Code theme color tokens (e.g., `var(--vscode-list-hoverBackground)`), the extension's UI is painted by VS Code itself. This ensures it always looks like a native part of your editor.

### File Previewing
DBView registers itself as a **Custom Editor** provider in `package.json`.
```json
"customEditors": [
  {
    "viewType": "dbview.sqlite",
    "selector": [ { "filenamePattern": "*.db" } ]
  }
]
```
This tells VS Code: "Hey, whenever the user opens a `.db` file, let DBView handle it!" We then read the binary data and render it using high-performance libraries like `sql.js` (for SQLite) and `mdb-reader` (for Access).

---

## 📦 Release 0.1.5
We've just packaged version 0.1.5! Check the releases tab on GitHub to download the VSIX manually if needed.

**Enjoy exploring your data!** 🎉
