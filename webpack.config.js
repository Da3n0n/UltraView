/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'none',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2'
  },
  externals: {
    vscode: 'commonjs vscode',
    duckdb: 'commonjs duckdb'
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    fallback: { crypto: false, path: false, fs: false }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: 'ts-loader'
      }
    ]
  },
  plugins: [
    new webpack.IgnorePlugin({
      resourceRegExp: /^pg-native$/
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'node_modules/sql.js/dist/sql-wasm.wasm',
          to: 'sql-wasm.wasm'
        }
      ]
    })
  ],
  devtool: 'nosources-source-map',
  infrastructureLogging: { level: 'log' }
};

/** @type {import('webpack').Configuration} */
const webviewConfig = {
  target: 'web',
  mode: 'production',
  entry: {
    codeFlow: './src/webview/codeFlowApp.tsx',
    markdown: './src/webview/markdownApp.tsx',
    svg: './src/webview/svgApp.tsx',
    gitPanel: './src/webview/gitPanelApp.tsx',
    db: './src/webview/dbApp.tsx',
    commandsPanel: './src/webview/commandsPanelApp.tsx',
    portsPanel: './src/webview/portsPanelApp.tsx',
    drawings: './src/webview/drawingsApp.tsx',
    bucketManager: './src/webview/bucketManagerApp.tsx',
    gitNexus: './src/webview/gitNexusApp.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].next.js',
    libraryTarget: 'window',
    publicPath: './'
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx'],
    // Keep Sigma.js, Graphology and force-atlas2 unbundled. Sigma pulls in a
    // graphology-types peer (>= 0.24) that we already satisfy; webpack 5 can
    // resolve it from node_modules. Aliasing the entry we copied into
    // src/webview/gitNexus/ to the root lets the vendored source's `../`
    // imports keep working without rewriting every relative path.
    alias: {
      // Re-export the vendored source under our own path so the original's
      // relative imports (`./lib/...`, `../hooks/...`) resolve the same way
      // whether the file lives in vendor/ or src/webview/gitNexus/.
      '@gitnexus-web': path.resolve(__dirname, 'vendor/GitNexus/gitnexus-web/src'),
    }
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true, configFile: 'tsconfig.webview.json' }
        }
      },
      // CSS that goes through Tailwind/PostCSS (anything under src/webview/gitNexus)
      {
        test: /\.css$/,
        include: [path.resolve(__dirname, 'src/webview/gitNexus')],
        use: ['style-loader', 'css-loader', 'postcss-loader']
      },
      // Plain CSS for the rest of the webviews
      {
        test: /\.css$/,
        exclude: [path.resolve(__dirname, 'src/webview/gitNexus')],
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: { level: 'log' }
};

module.exports = [config, webviewConfig];
