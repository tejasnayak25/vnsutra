import { fileURLToPath } from "url";
import path from "path";
import daisyui from "daisyui";
import typography from "@tailwindcss/typography";

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('tailwindcss').Config} */
export default {
    darkMode: [
        "selector"
    ],
    content: [__dirname + "/**/*.{html,js,jsx,ts,tsx,md}"],
    theme: {
        extend: {},
    },
    plugins: [daisyui, typography],
};