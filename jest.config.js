export default {
    testEnvironment: "node",
    coverageProvider: "v8",
    coverageDirectory: "coverage",
    collectCoverageFrom: [
        "api/**/*.js",
        "vnsutra_modules/**/*.js",
        "!vnsutra_modules/konva.js",
        "!vnsutra_modules/jszip.min.js",
    ],
    testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
    testPathIgnorePatterns: ["/node_modules/"],
    coveragePathIgnorePatterns: ["/node_modules/"],
};
