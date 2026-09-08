/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

/** @type {import('webpack').Configuration} */
const config = {
  name: 'extension',
  target: 'node',
  mode: 'production',
  entry: {
    extension: './src/extension.ts',
    'commandScanner.worker': './src/commands/commandScanner.worker.ts',
    'sqlite.worker': './src/database/sqlite.worker.ts',
    'sqlDump.worker': './src/database/sqlDump.worker.ts'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    chunkFilename: 'host-[id].js',
    libraryTarget: 'commonjs2',
    clean: true
  },
  externals: {
    vscode: 'commonjs vscode',
    'sql.js': 'commonjs ./sql-wasm.js',
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
        use: {
          loader: 'ts-loader',
          options: { compilerOptions: { module: 'esnext' } }
        }
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
          from: 'node_modules/sql.js/dist/sql-wasm.js',
          to: 'sql-wasm.js'
        },
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
  name: 'webviews',
  dependencies: ['extension'],
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
    extensions: ['.tsx', '.ts', '.js', '.jsx']
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
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  devtool: 'source-map',
  infrastructureLogging: { level: 'log' }
};

module.exports = [config, webviewConfig];
