// Copyright (c) 2021 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

// NOTE: To use this example standalone (e.g. outside of deck.gl repo)
// delete the local development overrides at the bottom of this file

// avoid destructuring for older Node version support
const resolve = require('path').resolve;
const join = require('path').join;
const webpack = require('webpack');
const DotEnv = require('dotenv-webpack');

module.exports = {
  // bundle app.js and everything it imports, recursively.
  entry: {
    app: resolve('./src/main.js')
  },
  output: {
    path: resolve(__dirname, 'dist'),
    publicPath: '/',
    filename: 'bundle.js'
  },

  devtool: 'source-map',

  module: {
    rules: [
      {
        test: /\.js$/,
        loader: 'babel-loader',
        include: [join(__dirname, 'src')],
        exclude: [/node_modules/]
      },
      {
        test: /\.css$/i,
        use: [
          "css-loader"
        ],
      }
    ]
  },

  node: {
    fs: 'empty'
  },

  // to support browser history api and remove the '#' sign
  devServer: {
    historyApiFallback: true,
    publicPath: '/',
    port: 8080
    // writeToDisk: true
  },

  // Optional: Enables reading mapbox and dropbox client token from environment variable
  plugins: [
    new DotEnv()
  ],

  // optimization: {
  //   runtimeChunk: 'single',
  //   splitChunks: {
  //     chunks: 'all',
  //     maxInitialRequests: Infinity,
  //     minSize: 200 * 1024,
  //     cacheGroups: {
  //       vender: {
  //         test: /[\\/]node_modules[\\/]/,
  //         name(module) {
  //           const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
  //           return `npm.${packageName.replace('@', '')}`;
  //         }
  //       }
  //     }
  //   }
  // }
};