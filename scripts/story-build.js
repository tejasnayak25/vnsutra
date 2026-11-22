/* eslint-disable no-console */
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import chokidar from "chokidar";
import chalk from "chalk";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const GAME_DIR = path.resolve(__dirname, "../game");
const SOURCE_DIR = path.join(GAME_DIR, "story");
const OUTPUT_DIR = path.join(GAME_DIR, "scenes");

// Phase 1 Regex Matchers
const REGEX_SCENE = /^\[scene:\s*([a-zA-Z0-9_-]+)\]$/i;
const REGEX_JUMP = /^jump:\s*([a-zA-Z0-9_-]+)$/i;
const REGEX_END = /^end$/i;
const REGEX_DIALOG_ACTOR = /^(\w+):\s*(.+)$/; // mary: Hello
const REGEX_DIALOG_NARRATOR = /^"([^"]+)"$/; // "Just narration"

// Phase 2 Regex Matchers (Game Actions)
const REGEX_STAGE = /^stage:\s*([^ ]+)$/i; // stage: cherry_park.vnstage or stage: cherry_park
const REGEX_BG = /^bg:\s*([^ ]+)$/i; // bg: futon_room
const REGEX_PARALLAX_BG = /^(?:parallax\s+bg|bg\s+parallax):\s*(.+)$/i; // bg parallax: far=sky mid=forest near=clearing fore=vines
const REGEX_MUSIC_PLAY = /^music play:\s*([^ ]+)$/i; // music play: bgm.mp3
const REGEX_MUSIC_CROSSFADE = /^music crossfade:\s*([^ ]+)(?:\s+([0-9]+))?$/i; // music crossfade: bgm2.mp3 1200
const REGEX_MUSIC_STOP = /^music stop$/i;
const REGEX_AMBIENT_PLAY = /^ambient play:\s*([^ ]+)$/i; // ambient play: rain.mp3
const REGEX_AMBIENT_STOP = /^ambient stop$/i;
const REGEX_SFX_PLAY = /^sfx:\s*([^ ]+)$/i; // sfx: click
const REGEX_VAR_SET_STR = /^\$([a-zA-Z0-9_]+)\s*=\s*"([^"]+)"$/; // $name = "Alice"
const REGEX_VAR_SET_NUM = /^\$([a-zA-Z0-9_]+)\s*=\s*([0-9.]+)$/; // $score = 10
const REGEX_STORAGE_SET = /^storage\s*set:\s*([a-zA-Z0-9_-]+)\s*=\s*\$([a-zA-Z0-9_]+)$/i; // storage set: name = $name

// Phase 3 Regex Matchers (Control Flow Blocks)
const REGEX_IF = /^if\s+(.+):$/i;
const REGEX_ELIF = /^elif\s+(.+):$/i;
const REGEX_ELSE = /^else:$/i;
const REGEX_SWITCH = /^switch\s+\$([a-zA-Z0-9_]+)\s*:$/i;
const REGEX_CHOICE = /^>\s*choice\s+\$([a-zA-Z0-9_]+)\s*:\s*"([^"]+)"$/i;
const REGEX_CASE = /^case\s+"([^"]+)"\s*:$/i;
const REGEX_OPTION = /^-\s+"([^"]+)"\s*:$/i;
const REGEX_DEFAULT = /^default\s*:$/i;
const REGEX_REPEAT = /^repeat\s*(.+):$/i;

// Phase 4 Regex Matchers (Full Coverage)
const REGEX_GENERIC_ACTION = /^@([a-zA-Z0-9_.-]+)(.*)$/; // @actor.move actor="mary" duration=500
const REGEX_WAIT = /^wait:\s*([0-9]+)$/i; // wait: 1000
const REGEX_INPUT = /^>\s*input\s+\$([a-zA-Z0-9_]+)\s*:\s*"([^"]+)"$/i; // > input $name: "What's your name?"
const REGEX_ACTOR_SHOW = /^actor\s+show:\s*([a-zA-Z0-9_]+)$/i; // actor show: mary
const REGEX_ACTOR_HIDE = /^actor\s+hide:\s*([a-zA-Z0-9_]+)$/i; // actor hide: mary

// Remaining actions
const REGEX_VAR_INC = /^\$([a-zA-Z0-9_]+)\s*\+=\s*([0-9.]+)$/; // $score += 1
const REGEX_VAR_DEC = /^\$([a-zA-Z0-9_]+)\s*-=\s*([0-9.]+)$/; // $score -= 1
const REGEX_VAR_DEL = /^delete\s+\$([a-zA-Z0-9_]+)$/; // delete $score
const REGEX_STORAGE_GET = /^storage\s*get:\s*([a-zA-Z0-9_-]+)\s*=\s*\$([a-zA-Z0-9_]+)$/i;
const REGEX_STORAGE_DEL = /^storage\s*remove:\s*([a-zA-Z0-9_-]+)$/i;
const REGEX_LOADING_START = /^loading\s*start$/i;
const REGEX_LOADING_STOP = /^loading\s*stop$/i;
const REGEX_LOG = /^log\s*(.+)$/i;
const REGEX_FLASH = /^flash\s*screen(?:\s+([a-zA-Z0-9#]+))?(?:\s+([0-9]+))?$/i; // flash screen #ffffff 500
const REGEX_SHAKE_SCREEN = /^shake\s*screen(?:\s+([0-9]+))?(?:\s+([0-9]+))?$/i; // shake screen 5 300
const REGEX_TRANSITION = /^transition:\s*([a-zA-Z0-9_-]+)(?:\s+([a-zA-Z0-9#]+))?(?:\s+([0-9]+))?$/i; // transition: wipe-left #000 500
const REGEX_WEATHER = /^weather:\s*([a-zA-Z0-9_-]+)(?:\s+intensity=([0-9.]+))?$/i; // weather: rain intensity=0.7

function parseSingleCondition(str) {
    const trimmed = str.trim();
    if (!trimmed) {
        return { op: "truthy", value: true };
    }

    if (trimmed.startsWith("not ") || trimmed.startsWith("!")) {
        const inner = trimmed.startsWith("not ") ? trimmed.slice(4).trim() : trimmed.slice(1).trim();
        return { op: "not", test: parseSingleCondition(inner) };
    }

    const cmpMatch = trimmed.match(/^\$([a-zA-Z0-9_]+)\s*(===|!==|>=|<=|==|!=|>|<|in|not-in)\s*(.+)$/i);
    if (cmpMatch) {
        let rightVal = cmpMatch[3].trim();
        if ((rightVal.startsWith("\"") && rightVal.endsWith("\"")) || (rightVal.startsWith("'") && rightVal.endsWith("'"))) {
            rightVal = rightVal.slice(1, -1);
        } else if (rightVal === "true") {
            rightVal = true;
        } else if (rightVal === "false") {
            rightVal = false;
        } else if (rightVal === "null") {
            rightVal = null;
        } else if (!isNaN(rightVal)) {
            rightVal = Number(rightVal);
        } else if (rightVal.startsWith("$")) {
            rightVal = { fromVar: rightVal.slice(1) };
        }

        let opVal = cmpMatch[2];
        if (opVal === "==") opVal = "===";
        if (opVal === "!=") opVal = "!==";

        return {
            left: { fromVar: cmpMatch[1] },
            op: opVal,
            right: rightVal
        };
    }

    const varMatch = trimmed.match(/^\$([a-zA-Z0-9_]+)$/);
    if (varMatch) {
        return {
            left: { fromVar: varMatch[1] },
            op: "truthy",
            value: { fromVar: varMatch[1] }
        };
    }

    if (trimmed === "true") return { op: "truthy", value: true };
    if (trimmed === "false") return { op: "truthy", value: false };

    return { op: "truthy", value: trimmed };
}

function parseConditionExpression(expr) {
    const raw = expr.trim();
    const orTokens = raw.split(/\s+(?:or|\|\|)\s+/i);
    if (orTokens.length > 1) {
        return {
            op: "or",
            conditions: orTokens.map((token) => parseConditionExpression(token))
        };
    }

    const andTokens = raw.split(/\s+(?:and|&&)\s+/i);
    if (andTokens.length > 1) {
        return {
            op: "and",
            conditions: andTokens.map((token) => parseSingleCondition(token))
        };
    }

    return parseSingleCondition(raw);
}

async function compileFile(filePath) {
    try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split(/\r?\n/);
        
        let currentScene = null;
        const scenes = {};
        let stack = [];
        let expectingBlock = null;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const line = rawLine.trim();

            if (!line || line.startsWith("#")) {
                continue; // Skip empty lines and comments
            }

            const indentMatch = rawLine.match(/^(\s*)/);
            const indent = indentMatch[1].replace(/\t/g, "    ").length;

            // Scene boundary
            const sceneMatch = line.match(REGEX_SCENE);
            if (sceneMatch) {
                currentScene = sceneMatch[1];
                scenes[currentScene] = [];
                stack = [{ array: scenes[currentScene], indent: -1 }];
                expectingBlock = null;
                continue;
            }

            if (!currentScene) {
                console.warn(chalk.yellow(`Warning: Found action outside of a [scene: ...] block in ${path.basename(filePath)} on line ${i + 1}. Ignoring.`));
                continue;
            }

            // Pop stack for indentation drop
            while (stack.length > 1 && indent < stack[stack.length - 1].indent) {
                stack.pop();
            }

            // Push pushed block target
            if (expectingBlock) {
                if (indent <= stack[stack.length - 1].indent) {
                    console.warn(chalk.yellow(`Warning: Expected indented block at line ${i + 1}`));
                } else {
                    stack.push({ ...expectingBlock, array: expectingBlock.target, indent });
                }
                expectingBlock = null;
            }

            const targetArray = stack[stack.length - 1].array;

            // --- Phase 3: Control Flow ---

            const ifMatch = line.match(REGEX_IF);
            if (ifMatch) {
                const ifObj = {
                    type: "if",
                    test: parseConditionExpression(ifMatch[1]),
                    then: [],
                    else: []
                };
                targetArray.push(ifObj);
                expectingBlock = { target: ifObj.then };
                continue;
            }

            const elifMatch = line.match(REGEX_ELIF);
            if (elifMatch) {
                const lastAction = targetArray[targetArray.length - 1];
                if (!lastAction || lastAction.type !== "if") {
                    console.warn(chalk.yellow(`Warning: Found 'elif:' without matching 'if' at line ${i + 1}`));
                    continue;
                }
                let currentIf = lastAction;
                while (currentIf.else && currentIf.else.length === 1 && currentIf.else[0].type === "if") {
                    currentIf = currentIf.else[0];
                }
                const elifObj = {
                    type: "if",
                    test: parseConditionExpression(elifMatch[1]),
                    then: [],
                    else: []
                };
                currentIf.else.push(elifObj);
                expectingBlock = { target: elifObj.then };
                continue;
            }

            const elseMatch = line.match(REGEX_ELSE);
            if (elseMatch) {
                // Check if the last action in the targetArray was an "if"
                const lastAction = targetArray[targetArray.length - 1];
                if (!lastAction || lastAction.type !== "if") {
                    console.warn(chalk.yellow(`Warning: Found 'else:' without matching 'if' at line ${i + 1}`));
                    continue;
                }
                let currentIf = lastAction;
                while (currentIf.else && currentIf.else.length === 1 && currentIf.else[0].type === "if") {
                    currentIf = currentIf.else[0];
                }
                expectingBlock = { target: currentIf.else };
                continue;
            }

            // Independent Switch
            const switchMatch = line.match(REGEX_SWITCH);
            if (switchMatch) {
                const switchObj = {
                    type: "switch",
                    value: { fromVar: switchMatch[1] },
                    cases: []
                };
                targetArray.push(switchObj);
                expectingBlock = { target: switchObj.cases, type: "switch_cases", parent: switchObj };
                continue;
            }

            // Choice Combined
            const choiceMatch = line.match(REGEX_CHOICE);
            if (choiceMatch) {
                const choiceObj = {
                    type: "choice",
                    var: choiceMatch[1],
                    message: choiceMatch[2],
                    options: []
                };
                const switchObj = {
                    type: "switch",
                    value: { fromVar: choiceMatch[1] },
                    cases: []
                };
                targetArray.push(choiceObj);
                targetArray.push(switchObj);
                expectingBlock = { target: switchObj.cases, type: "choice_cases", parentChoice: choiceObj };
                continue;
            }

            // Case Block (For independent switch)
            const caseMatch = line.match(REGEX_CASE);
            if (caseMatch) {
                const newCase = { value: caseMatch[1], actions: [] };
                targetArray.push(newCase);
                expectingBlock = { target: newCase.actions };
                continue;
            }

            // Case Block (For choice options)
            const optionMatch = line.match(REGEX_OPTION);
            if (optionMatch) {
                const newCase = { value: optionMatch[1], actions: [] };
                targetArray.push(newCase);
                
                // We need to find the parentChoice in the stack to add this option string to it
                const parentBlock = stack[stack.length - 1];
                if (parentBlock && parentBlock.type === "choice_cases" && parentBlock.parentChoice) {
                    parentBlock.parentChoice.options.push(optionMatch[1]);
                }
                
                expectingBlock = { target: newCase.actions };
                continue;
            }

            // Default Block (For switch)
            const defaultMatch = line.match(REGEX_DEFAULT);
            if (defaultMatch) {
                const parentBlock = stack[stack.length - 1];
                if (parentBlock && parentBlock.parent && parentBlock.type === "switch_cases") {
                    parentBlock.parent.default = [];
                    expectingBlock = { target: parentBlock.parent.default };
                } else {
                    console.warn(chalk.yellow(`Warning: Found 'default:' without matching switch block at line ${i + 1}`));
                }
                continue;
            }

            // Repeat Block
            const repeatMatch = line.match(REGEX_REPEAT);
            if (repeatMatch) {
                let countVal = repeatMatch[1].trim();
                if (countVal.startsWith("$")) countVal = { fromVar: countVal.slice(1) };
                else if (!isNaN(countVal)) countVal = Number(countVal);

                const repeatObj = {
                    type: "repeat",
                    count: countVal,
                    actions: []
                };
                targetArray.push(repeatObj);
                expectingBlock = { target: repeatObj.actions };
                continue;
            }

            // --- Phase 1 & 2 Actions ---

            const jumpMatch = line.match(REGEX_JUMP);
            if (jumpMatch) {
                targetArray.push({ type: "jump", scene: jumpMatch[1] });
                continue;
            }

            if (REGEX_END.test(line)) {
                targetArray.push({ type: "end" });
                continue;
            }

            const parallaxBgMatch = line.match(REGEX_PARALLAX_BG);
            if (parallaxBgMatch) {
                const argsStr = parallaxBgMatch[1].trim();
                const planes = [];
                const depths = { far: 0.2, mid: 0.6, near: 1.0, fore: 1.5 };
                const kvRegex = /([a-zA-Z0-9_]+)=(?:'([^']*)'|"([^"]*)"|([^ ]+))/g;
                let match;
                while ((match = kvRegex.exec(argsStr)) !== null) {
                    const key = match[1];
                    const val = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : match[4]);
                    const depth = depths[key] !== undefined ? depths[key] : (!isNaN(key) ? Number(key) : 1.0);
                    planes.push({ asset: val, depth, id: key });
                }
                targetArray.push({ type: "background.parallax", planes });
                continue;
            }

            const stageMatch = line.match(REGEX_STAGE);
            if (stageMatch) {
                targetArray.push({ type: "stage", asset: stageMatch[1] });
                continue;
            }

            const bgMatch = line.match(REGEX_BG);
            if (bgMatch) {
                targetArray.push({ type: "background", asset: bgMatch[1] });
                continue;
            }

            const musicPlayMatch = line.match(REGEX_MUSIC_PLAY);
            if (musicPlayMatch) {
                targetArray.push({ type: "music.play", track: musicPlayMatch[1] });
                continue;
            }

            const musicCrossfadeMatch = line.match(REGEX_MUSIC_CROSSFADE);
            if (musicCrossfadeMatch) {
                const action = { type: "music.crossfade", track: musicCrossfadeMatch[1] };
                if (musicCrossfadeMatch[2]) action.duration = Number(musicCrossfadeMatch[2]);
                targetArray.push(action);
                continue;
            }

            if (REGEX_MUSIC_STOP.test(line)) {
                targetArray.push({ type: "music.stop" });
                continue;
            }

            const ambientPlayMatch = line.match(REGEX_AMBIENT_PLAY);
            if (ambientPlayMatch) {
                targetArray.push({ type: "ambient.play", track: ambientPlayMatch[1] });
                continue;
            }

            if (REGEX_AMBIENT_STOP.test(line)) {
                targetArray.push({ type: "ambient.stop" });
                continue;
            }

            const weatherMatch = line.match(REGEX_WEATHER);
            if (weatherMatch) {
                const preset = weatherMatch[1].toLowerCase();
                if (preset === "off" || preset === "none") {
                    targetArray.push({ type: "weather.stop" });
                } else {
                    const action = { type: "weather.set", preset };
                    if (weatherMatch[2]) action.intensity = Number(weatherMatch[2]);
                    targetArray.push(action);
                }
                continue;
            }

            const sfxMatch = line.match(REGEX_SFX_PLAY);
            if (sfxMatch) {
                targetArray.push({ type: "sfx.play", track: sfxMatch[1] });
                continue;
            }

            const varSetStrMatch = line.match(REGEX_VAR_SET_STR);
            if (varSetStrMatch) {
                targetArray.push({ type: "var.set", var: varSetStrMatch[1], value: varSetStrMatch[2] });
                continue;
            }

            const varSetNumMatch = line.match(REGEX_VAR_SET_NUM);
            if (varSetNumMatch) {
                targetArray.push({ type: "var.set", var: varSetNumMatch[1], value: Number(varSetNumMatch[2]) });
                continue;
            }

            const storageSetMatch = line.match(REGEX_STORAGE_SET);
            if (storageSetMatch) {
                targetArray.push({ type: "storage.set", key: storageSetMatch[1], value: { fromVar: storageSetMatch[2] } });
                continue;
            }

            // --- Phase 4: Missing Common Actions & Generic Fallback ---
            
            const waitMatch = line.match(REGEX_WAIT);
            if (waitMatch) {
                targetArray.push({ type: "wait", duration: Number(waitMatch[1]) });
                continue;
            }

            const inputMatch = line.match(REGEX_INPUT);
            if (inputMatch) {
                targetArray.push({ type: "input", var: inputMatch[1], message: inputMatch[2] });
                continue;
            }

            const actorShowMatch = line.match(REGEX_ACTOR_SHOW);
            if (actorShowMatch) {
                targetArray.push({ type: "actor.show", actor: actorShowMatch[1] });
                continue;
            }

            const actorHideMatch = line.match(REGEX_ACTOR_HIDE);
            if (actorHideMatch) {
                targetArray.push({ type: "actor.hide", actor: actorHideMatch[1] });
                continue;
            }

            const genericActionMatch = line.match(REGEX_GENERIC_ACTION);
            if (genericActionMatch) {
                const type = genericActionMatch[1];
                const argsStr = genericActionMatch[2].trim();
                const actionObj = { type };
                
                const kvRegex = /([a-zA-Z0-9_]+)=(?:'([^']*)'|"([^"]*)"|([^ ]+))/g;
                let match;
                while ((match = kvRegex.exec(argsStr)) !== null) {
                    const key = match[1];
                    let val = match[2] !== undefined ? match[2] : (match[3] !== undefined ? match[3] : match[4]);
                    if (!isNaN(val)) {
                        val = Number(val);
                    } else if (val === "true") {
                        val = true;
                    } else if (val === "false") {
                        val = false;
                    } else if (typeof val === "string" && (val.startsWith("[") || val.startsWith("{"))) {
                        try {
                            val = JSON.parse(val);
                        } catch (e) {
                            console.warn(chalk.yellow(`Warning: Failed to parse JSON literal for ${key}=${val} at line ${i + 1}`));
                        }
                    }
                    actionObj[key] = val;
                }
                targetArray.push(actionObj);
                continue;
            }

            const varIncMatch = line.match(REGEX_VAR_INC);
            if (varIncMatch) {
                targetArray.push({ type: "var.increment", var: varIncMatch[1], amount: Number(varIncMatch[2]) });
                continue;
            }

            const varDecMatch = line.match(REGEX_VAR_DEC);
            if (varDecMatch) {
                targetArray.push({ type: "var.decrement", var: varDecMatch[1], amount: Number(varDecMatch[2]) });
                continue;
            }

            const varDelMatch = line.match(REGEX_VAR_DEL);
            if (varDelMatch) {
                targetArray.push({ type: "var.delete", var: varDelMatch[1] });
                continue;
            }

            const storageGetMatch = line.match(REGEX_STORAGE_GET);
            if (storageGetMatch) {
                targetArray.push({ type: "storage.get", key: storageGetMatch[1], var: storageGetMatch[2] });
                continue;
            }

            const storageDelMatch = line.match(REGEX_STORAGE_DEL);
            if (storageDelMatch) {
                targetArray.push({ type: "storage.remove", key: storageDelMatch[1] });
                continue;
            }

            if (REGEX_LOADING_START.test(line)) {
                targetArray.push({ type: "loading.start" });
                continue;
            }

            if (REGEX_LOADING_STOP.test(line)) {
                targetArray.push({ type: "loading.stop" });
                continue;
            }

            const logMatch = line.match(REGEX_LOG);
            if (logMatch) {
                let msg = logMatch[1];
                if (msg.startsWith("\"") && msg.endsWith("\"")) msg = msg.slice(1, -1);
                else if (msg.startsWith("$")) msg = { fromVar: msg.slice(1) };
                targetArray.push({ type: "log", message: msg });
                continue;
            }

            // flash screen #ffffff 500
            const flashMatch = line.match(REGEX_FLASH);
            if (flashMatch) {
                const action = { type: "effect.flash" };
                if (flashMatch[1]) action.color = flashMatch[1];
                if (flashMatch[2]) action.duration = Number(flashMatch[2]);
                targetArray.push(action);
                continue;
            }

            // shake screen 5 300
            const shakeMatch = line.match(REGEX_SHAKE_SCREEN);
            if (shakeMatch) {
                const action = { type: "effect.screen-shake" };
                if (shakeMatch[1]) action.intensity = Number(shakeMatch[1]);
                if (shakeMatch[2]) action.duration = Number(shakeMatch[2]);
                targetArray.push(action);
                continue;
            }

            // scene transition fade #000 500
            const transMatch = line.match(REGEX_TRANSITION);
            if (transMatch) {
                const action = { type: "scene.transition", transitionType: transMatch[1] };
                if (transMatch[2]) action.color = transMatch[2];
                if (transMatch[3]) action.duration = Number(transMatch[3]);
                targetArray.push(action);
                continue;
            }

            const dialogActorMatch = line.match(REGEX_DIALOG_ACTOR);
            if (dialogActorMatch) {
                targetArray.push({
                    type: "dialog",
                    actor: dialogActorMatch[1].toLowerCase(),
                    text: dialogActorMatch[2].trim()
                });
                continue;
            }

            const narrationMatch = line.match(REGEX_DIALOG_NARRATOR);
            if (narrationMatch) {
                targetArray.push({
                    type: "dialog",
                    text: narrationMatch[1]
                });
                continue;
            }

            // Unknown line format fallback
            targetArray.push({
                type: "dialog",
                text: line
            });
        }

        for (const [sceneName, actions] of Object.entries(scenes)) {
            const outPath = path.join(OUTPUT_DIR, `${sceneName}.scene.js`);
            const fileContent = `// AUTO-GENERATED BY VN-SUTRA COMPILER\nexport default ${JSON.stringify(actions, null, 4)};\n`;
            await fs.writeFile(outPath, fileContent, "utf-8");
            console.log(chalk.green(`✓ Compiled scene: ${sceneName} -> scenes/${sceneName}.scene.js`));
        }
        
    } catch (err) {
        console.error(chalk.red(`Error compiling ${filePath}:`), err);
    }
}

async function buildAll() {
    console.log(chalk.blue("Starting VN-Sutra Story Compiler..."));
    
    try {
        await fs.mkdir(SOURCE_DIR, { recursive: true });
        await fs.mkdir(OUTPUT_DIR, { recursive: true });
        
        const files = await fs.readdir(SOURCE_DIR);
        const vnFiles = files.filter(f => f.endsWith(".vn"));
        
        if (vnFiles.length === 0) {
            console.log(chalk.yellow(`No .vn files found in ${SOURCE_DIR}.`));
            return;
        }

        for (const file of vnFiles) {
            await compileFile(path.join(SOURCE_DIR, file));
        }
        
        console.log(chalk.blue("Story compilation complete."));
    } catch (err) {
        console.error(chalk.red("Build failed:"), err);
    }
}

async function watch() {
    await buildAll();
    console.log(chalk.yellow(`Watching for changes in ${SOURCE_DIR} ...`));
    
    chokidar.watch(path.join(SOURCE_DIR, "*.vn"), {
        ignoreInitial: true,
        persistent: true
    })
        .on("add", path => compileFile(path))
        .on("change", path => compileFile(path))
        .on("unlink", path => {
            console.log(chalk.yellow(`File removed: ${path}`));
        // Note: For full safety, you might want to remove associated .scene.js files.
        // But for a simple compiler, leaving them or overwriting is fine.
        });
}

const args = process.argv.slice(2);
if (args.includes("--watch")) {
    watch();
} else {
    buildAll();
}
