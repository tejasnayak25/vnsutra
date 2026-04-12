export default {
    testEnvironment: "node",
    coverageProvider: "v8",
    coverageDirectory: "coverage",
    collectCoverageFrom: [
        "api/**/*.js",
        "vnsutra_modules/**/*.js",
        "!vnsutra_modules/jszip.min.js",
    ],
    testMatch: ["**/__tests__/**/*.js", "**/?(*.)+(spec|test).js"],
    testPathIgnorePatterns: ["/node_modules/"],
    coveragePathIgnorePatterns: ["/node_modules/"],
    moduleNameMapper: {
        "^https://unpkg.com/konva.*$": "<rootDir>/tests/__mocks__/konva.js"
    }
};
