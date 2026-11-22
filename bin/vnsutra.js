#!/usr/bin/env node

/**
 * VN-Sutra CLI (`vnsutra` & `create-vnsutra`)
 * Scaffold, develop, and build web-based Visual Novels.
 *
 * Usage:
 *   npx vnsutra create <project-name>
 *   npm create vnsutra <project-name>
 *   npx vnsutra dev
 *   npx vnsutra build
 */

import fs from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import https from "node:https";

const VERSION = "3.0.0";
const REPO_URL = "https://github.com/tejasnayak25/vnsutra.git";
const TARBALL_URL = "https://codeload.github.com/tejasnayak25/vnsutra/tar.gz/main";

// Dark Amethyst ANSI Palette
const C = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    purple: "\x1b[38;2;184;138;239m", // #B88AEF
    pink: "\x1b[38;2;242;169;213m",   // #F2A9D5
    bg: "\x1b[38;2;23;21;47m",        // #17152F
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m"
};

function printBanner() {
    console.log(`
${C.purple}${C.bold} __      __ _   _         ____  _   _ _____ ____      _    
 \\ \\    / /| \\ | |       / ___|| | | |_   _|  _ \\    / \\   
  \\ \\  / / |  \\| | _____ \\___ \\| | | | | | | |_) |  / _ \\  
   \\ \\/ /  | |\\  ||_____| ___) | |_| | | | |  _ <  / ___ \\ 
    \\__/   |_| \\_|       |____/ \\___/  |_| |_| \\_\\/_/   \\_\\${C.reset}
       ${C.pink}Modular 2.5D Visual Novel SDK for the Web${C.reset} ${C.dim}(v${VERSION})${C.reset}
`);
}

function printHelp() {
    printBanner();
    console.log(`${C.bold}USAGE:${C.reset}
  ${C.cyan}npx vnsutra${C.reset} <command> [options]
  ${C.cyan}npm create vnsutra${C.reset} <project-name>

${C.bold}COMMANDS:${C.reset}
  ${C.green}create <dir>${C.reset}     Scaffold a new VN-Sutra project in <dir>
  ${C.green}init [dir]${C.reset}       Initialize a new VN-Sutra project in current or specified dir
  ${C.green}dev${C.reset}              Start local development server (concurrent dev + reload)
  ${C.green}build${C.reset}            Compile story scenes, UI layout cache, and production bundle
  ${C.green}story:build${C.reset}      Compile .vn story files into .scene.js
  ${C.green}models:download${C.reset}  Download AI models for character rigging and parallax stages

${C.bold}OPTIONS:${C.reset}
  ${C.yellow}--install, -i${C.reset}    Automatically run npm install after scaffolding
  ${C.yellow}--help, -h${C.reset}       Show this help message
  ${C.yellow}--version, -v${C.reset}    Show version number

${C.bold}EXAMPLES:${C.reset}
  ${C.dim}# Create a new visual novel project:${C.reset}
  npx vnsutra create my-visual-novel --install

  ${C.dim}# Run project dev server:${C.reset}
  cd my-visual-novel && npx vnsutra dev
`);
}

function runCommand(cmd, args, cwd = process.cwd(), inherit = true) {
    return new Promise((resolve, reject) => {
        const child = spawn(cmd, args, {
            cwd,
            stdio: inherit ? "inherit" : "pipe",
            shell: true
        });
        child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Command "${cmd} ${args.join(" ")}" exited with code ${code}`));
        });
        child.on("error", reject);
    });
}

async function cloneRepo(targetDir) {
    console.log(`  ${C.cyan}→${C.reset} Cloning VN-Sutra starter template from GitHub...`);
    try {
        execSync(`git clone --depth 1 ${REPO_URL} "${targetDir}"`, {
            stdio: "pipe"
        });
        return true;
    } catch {
        return false;
    }
}

async function downloadFallback(targetDir) {
    console.log(`  ${C.yellow}!${C.reset} Git clone unavailable, streaming archive directly...`);
    // Fallback: clone with git or instruct user
    throw new Error(`Please ensure git is installed to bootstrap new projects: git clone ${REPO_URL}`);
}

async function scaffoldProject(projectName, options = {}) {
    printBanner();

    if (!projectName || projectName === ".") {
        projectName = path.basename(process.cwd());
    }

    const targetDir = path.resolve(process.cwd(), projectName);
    const isCurrentDir = targetDir === process.cwd();

    console.log(`${C.purple}${C.bold}Creating a new VN-Sutra project in:${C.reset}`);
    console.log(`  ${C.pink}${targetDir}${C.reset}\n`);

    if (fs.existsSync(targetDir)) {
        const files = fs.readdirSync(targetDir);
        if (files.length > 0 && !isCurrentDir) {
            console.error(`${C.red}Error:${C.reset} Target directory "${projectName}" already exists and is not empty.`);
            console.error(`Please specify an empty directory or a new folder name.`);
            process.exit(1);
        }
    } else {
        fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Clone starter repo
    const cloneSuccess = await cloneRepo(targetDir);
    if (!cloneSuccess) {
        await downloadFallback(targetDir);
    }

    // 2. Clean up git history and development artifacts
    console.log(`  ${C.cyan}→${C.reset} Preparing clean project structure...`);
    const gitDir = path.join(targetDir, ".git");
    if (fs.existsSync(gitDir)) {
        fs.rmSync(gitDir, { recursive: true, force: true });
    }

    const researchDir = path.join(targetDir, "research");
    if (fs.existsSync(researchDir)) {
        fs.rmSync(researchDir, { recursive: true, force: true });
    }

    const distDir = path.join(targetDir, "dist");
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }

    // 3. Customize package.json
    const pkgPath = path.join(targetDir, "package.json");
    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
            pkg.name = path.basename(targetDir).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
            pkg.version = "0.1.0";
            pkg.description = "A visual novel created with VN-Sutra";
            delete pkg.repository;
            delete pkg.bugs;
            delete pkg.homepage;
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
        } catch (err) {
            console.warn(`  ${C.yellow}!${C.reset} Warning: Could not customize package.json:`, err.message);
        }
    }

    // 4. Initialize fresh git repository
    try {
        execSync("git init", { cwd: targetDir, stdio: "ignore" });
        console.log(`  ${C.green}✓${C.reset} Initialized empty Git repository`);
    } catch {
        // Git init optional
    }

    // 5. Run npm install if requested
    if (options.install) {
        console.log(`\n${C.purple}${C.bold}Installing dependencies via npm...${C.reset}`);
        try {
            await runCommand("npm", ["install"], targetDir);
            console.log(`  ${C.green}✓${C.reset} Dependencies installed successfully`);
        } catch (err) {
            console.error(`  ${C.yellow}!${C.reset} npm install encountered an issue: ${err.message}`);
            console.log(`  You can manually run "npm install" inside the project.`);
        }
    }

    // 6. Success message & next steps
    console.log(`
${C.green}${C.bold}✨ Success! Your visual novel project is ready.${C.reset}

${C.bold}Next steps:${C.reset}
${isCurrentDir ? "" : `  1. ${C.cyan}cd ${projectName}${C.reset}\n`}${options.install ? "" : `  2. ${C.cyan}npm install${C.reset}\n`}  3. ${C.cyan}npm run dev${C.reset}

${C.dim}Documentation:${C.reset}
  - Story Scripting:      ${C.pink}docs/STORY_SCRIPTING.md${C.reset}
  - 2.5D Parallax Stages: ${C.pink}docs/PARALLAX_STAGES.md${C.reset}
  - Rigged Characters:    ${C.pink}docs/RIGGED_CHARACTERS.md${C.reset}
  - VS Code Extension:    ${C.pink}https://marketplace.visualstudio.com/items?itemName=tejasnayak25.vnsutra-language-tools${C.reset}

Happy visual novel authoring! 🌸
`);
}

async function main() {
    const rawArgs = process.argv.slice(2);

    if (rawArgs.length === 0 || rawArgs.includes("--help") || rawArgs.includes("-h")) {
        printHelp();
        return;
    }

    if (rawArgs.includes("--version") || rawArgs.includes("-v")) {
        console.log(`vnsutra v${VERSION}`);
        return;
    }

    const firstArg = rawArgs[0];
    const isInstall = rawArgs.includes("--install") || rawArgs.includes("-i");

    // Standard commands
    if (firstArg === "create" || firstArg === "init") {
        const target = rawArgs[1] || (firstArg === "init" ? "." : null);
        if (!target) {
            console.error(`${C.red}Error:${C.reset} Please specify a project directory name.`);
            console.log(`Usage: npx vnsutra create <project-name>`);
            process.exit(1);
        }
        await scaffoldProject(target, { install: isInstall });
        return;
    }

    if (firstArg === "dev") {
        await runCommand("npm", ["run", "dev"]);
        return;
    }

    if (firstArg === "build") {
        await runCommand("npm", ["run", "build"]);
        return;
    }

    if (firstArg === "story:build") {
        await runCommand("npm", ["run", "story:build"]);
        return;
    }

    if (firstArg === "models:download") {
        await runCommand("npm", ["run", "models:download"]);
        return;
    }

    // Direct project name (npm create vnsutra <my-project>)
    if (!firstArg.startsWith("-")) {
        await scaffoldProject(firstArg, { install: isInstall });
        return;
    }

    console.error(`${C.red}Unknown command or option:${C.reset} ${firstArg}`);
    printHelp();
    process.exit(1);
}

main().catch((err) => {
    console.error(`\n${C.red}${C.bold}[vnsutra error]${C.reset} ${err.message}`);
    process.exit(1);
});
