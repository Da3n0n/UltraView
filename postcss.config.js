// Project-level postcss config — only used when a CSS file is processed
// through postcss-loader. As of this writing that's only the GitNexus
// webview's `theme.css`, which lives at src/webview/gitNexus/theme.css
// and gets matched by the webpack `include` rule.

module.exports = {
    plugins: {
        tailwindcss: {},
        autoprefixer: {},
    },
};
