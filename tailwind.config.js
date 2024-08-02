// const { addDynamicIconSelectors } = require("@iconify/tailwind");
// const { iconsPlugin, getIconCollections } = require("@egoist/tailwindcss-icons");

/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: [
      'selector'
    ],
    content: [__dirname + "/**/*.{html,js,jsx,ts,tsx}"],
    theme: {
      extend: {},
    },
    plugins: [require("daisyui")],
}