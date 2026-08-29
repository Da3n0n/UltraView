const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        // Tailwind's resolver doesn't read __dirname reliably when the config
        // is loaded from a postcss-loader subdir. Use absolute Windows paths
        // so the resolver always finds the source files regardless of cwd.
        'C:/Users/Dannan/Documents/GitHub/Da3n0n/Ultraview/src/webview/gitNexusApp.tsx',
        'C:/Users/Dannan/Documents/GitHub/Da3n0n/Ultraview/src/webview/gitNexus/**/*.{ts,tsx}',
    ],
    // Bypass VS Code's dark/light theme so we can keep the original GitNexus
    // palette. The webview reads `var(--vscode-editor-background)` etc. via the
    // VSCodeTheme adapter in theme.css.
    darkMode: ['class', '[data-theme="dark"]'],
    theme: {
        extend: {
            colors: {
                // Original GitNexus palette
                void: '#0a0e1a',
                deep: '#0f1420',
                elevated: '#1a1f2e',
                surface: '#222838',
                accent: '#7868ff',
                'accent-hover': '#6958f0',
                'node-function': '#10b981',
                'node-class': '#f59e0b',
                'node-method': '#14b8a6',
                'node-interface': '#ec4899',
                'node-variable': '#64748b',
                'node-type': '#a78bfa',
                'node-file': '#3b82f6',
                'node-folder': '#6366f1',
                'node-import': '#475569',
                'text-primary': '#e5e7eb',
                'text-secondary': '#9ca3af',
                'text-muted': '#6b7280',
                'border-subtle': '#2a3142',
                'border-default': '#3a4252',
                'vscode-bg': 'var(--vscode-editor-background)',
                'vscode-fg': 'var(--vscode-editor-foreground)',
                'vscode-border': 'var(--vscode-panel-border)',
            },
            boxShadow: {
                glow: '0 0 12px rgba(120, 104, 255, 0.45)',
            },
            fontFamily: {
                sans: ['var(--vscode-font-family)', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
                mono: ['var(--vscode-editor-font-family)', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
            },
        },
    },
    corePlugins: {
        // Sigma.js supplies its own canvas; we don't need tailwind preflight to
        // touch it. Disable preflight to keep VS Code's editor font defaults.
        preflight: true,
    },
    plugins: [],
};
