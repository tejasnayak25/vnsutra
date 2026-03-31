const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
    mode: "production",
    target: "web",
    entry: path.resolve(__dirname, "vnsutra_modules", "init.js"),
    output: {
        path: path.resolve(__dirname, "dist", "vnsutra_modules"),
        filename: "app.bundle.js",
        chunkFilename: "chunks/[name].[contenthash:8].js",
        clean: false,
        publicPath: "auto"
    },
    optimization: {
        usedExports: true,
        minimize: true,
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    compress: {
                        passes: 2,
                        drop_debugger: true
                    },
                    format: {
                        comments: false
                    }
                }
            })
        ],
        splitChunks: {
            chunks: "all",
            minSize: 20000,
            maxAsyncRequests: 30,
            maxInitialRequests: 30,
            cacheGroups: {
                vendors: {
                    test: /[\\/]node_modules[\\/]/,
                    name: "vendors",
                    chunks: "all",
                    priority: 20
                },
                common: {
                    minChunks: 2,
                    priority: 10,
                    reuseExistingChunk: true
                }
            }
        }
    },
    devtool: false
};