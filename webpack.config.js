const path = require("path");
const webpack = require("webpack");
require("dotenv").config();

const proxyUrl = process.env.AUTOMESSAGE_PROXY_URL;
const sharedToken = process.env.AUTOMESSAGE_SHARED_TOKEN;

/** @type {function(string): never} */
function fatalMissing(varName) {
  throw new Error(
    `[Automessage] ${varName} is not set. ` +
      `Create a .env file with ${varName}=<value> before building for production.`
  );
}

/** @param {import('webpack').WebpackOptionsNormalized} argv */
function checkEnvVars(argv) {
  if (argv.mode !== "production") {
    if (!proxyUrl || proxyUrl.trim() === "") {
      console.warn(
        "\x1b[33m[Automessage] WARNING: AUTOMESSAGE_PROXY_URL is not set.\x1b[0m"
      );
    }
    if (!sharedToken || sharedToken.trim() === "") {
      console.warn(
        "\x1b[33m[Automessage] WARNING: AUTOMESSAGE_SHARED_TOKEN is not set.\x1b[0m"
      );
    }
  } else {
    if (!proxyUrl || proxyUrl.trim() === "") fatalMissing("AUTOMESSAGE_PROXY_URL");
    if (!sharedToken || sharedToken.trim() === "") fatalMissing("AUTOMESSAGE_SHARED_TOKEN");
  }
}

/** @type {function(any, import('webpack').WebpackOptionsNormalized): import('webpack').Configuration} */
module.exports = (_env, argv) => {
  checkEnvVars(argv);
  return {
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
        "process.env.AUTOMESSAGE_PROXY_URL": JSON.stringify(proxyUrl ?? ""),
        "process.env.AUTOMESSAGE_SHARED_TOKEN": JSON.stringify(sharedToken ?? ""),
      }),
    ],
    optimization: {
      // Keep each entry as a single self-contained file (no shared chunks).
      // Background service workers and content scripts must each be a single file.
      splitChunks: false,
      runtimeChunk: false,
    },
  };
};
