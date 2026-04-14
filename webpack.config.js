const path = require("path");

/** @type {import('webpack').Configuration} */
module.exports = {
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    popup: "./popup/popup.ts",
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js"],
  },
  // Chrome extensions don't run in Node — disable Node polyfills
  target: "web",
  // Service workers can't use eval; this keeps CSP happy
  devtool: "source-map",
  optimization: {
    // Keep each entry as a single self-contained file (no shared chunks).
    // Background service workers and content scripts must each be a single file.
    splitChunks: false,
    runtimeChunk: false,
  },
};
