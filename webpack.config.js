const path = require("path");
const webpack = require("webpack");
require("dotenv").config();

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey || apiKey.trim() === "") {
  console.warn(
    "\x1b[33m[Automessage] WARNING: OPENROUTER_API_KEY is not set. " +
      "Create a .env file with OPENROUTER_API_KEY=sk-or-... before building.\x1b[0m"
  );
}

/** @type {function(any, import('webpack').WebpackOptionsNormalized): import('webpack').Configuration} */
module.exports = (_env, argv) => ({
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
  // Service workers can't use eval; this keeps CSP happy.
  // Omit source maps in production to reduce zip size and avoid exposing source.
  devtool: argv.mode === "production" ? false : "source-map",
  plugins: [
    new webpack.DefinePlugin({
      "process.env.OPENROUTER_API_KEY": JSON.stringify(apiKey ?? ""),
    }),
  ],
  optimization: {
    // Keep each entry as a single self-contained file (no shared chunks).
    // Background service workers and content scripts must each be a single file.
    splitChunks: false,
    runtimeChunk: false,
  },
});
