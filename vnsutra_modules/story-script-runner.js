import { dialog, next, loading, input, choice, storage, end } from "./game-utils.js";
import { i18n } from "./i18n.js";
import { initActorAnimation, addGameAnimationMethods } from "./animation-utils.js";
import { initAudioSystem } from "./audio-effects-utils.js";

function resolveResponsive(value, { isPortrait = false, isAndroid = false } = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, "portrait") && isPortrait) {
        console.log("resolveResponsive: choosing portrait", { value, isPortrait, isAndroid });
        return value.portrait;
    }

    if (Object.prototype.hasOwnProperty.call(value, "android") && isAndroid) {
        console.log("resolveResponsive: choosing android", { value, isPortrait, isAndroid });
        return value.android;
    }

    if (Object.prototype.hasOwnProperty.call(value, "default")) {
        console.log("resolveResponsive: choosing default", { value, isPortrait, isAndroid });
        return value.default;
    }

    return value;
}

function resolveVarRef(value, vars = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, "fromVar")) {
        return vars[value.fromVar];
    }

    return value;
}

function resolveDialogParams(params = {}, vars = {}) {
    if (!params || typeof params !== "object") {
        return {};
    }

    const resolved = {};
    for (const [key, value] of Object.entries(params)) {
        if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "fromVar")) {
            resolved[key] = vars[value.fromVar];
        } else {
            resolved[key] = value;
        }
    }

    return resolved;
}

async function executeActions(actions = [], runtime) {
    for (const action of actions) {
        if (!action || typeof action !== "object") {
            continue;
        }

        const actor = action.actor ? runtime.getActor(action.actor) : null;

        switch (action.type) {
        case "background": {
            const gameInstance = runtime.getGame?.();
            if (action.reset) {
                gameInstance?.background?.reset?.();
            }
            if (gameInstance && action.asset) {
                gameInstance.background = runtime.getAsset(action.asset);
            }
            break;
        }
        case "background.prop": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance?.background && action.prop) {
                gameInstance.background[action.prop] = resolveResponsive(action.value, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
            }
            break;
        }
        case "actor.reset": {
            actor?.reset?.(action.fields ?? []);
            break;
        }
        case "actor.show": {
            actor?.show?.();
            break;
        }
        case "actor.hide": {
            actor?.hide?.();
            break;
        }
        case "actor.set": {
            if (!actor) {
                break;
            }
            for (const [key, rawValue] of Object.entries(action.props ?? {})) {
                actor[key] = resolveResponsive(rawValue, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
            }
            break;
        }
        case "actor.prop": {
            if (!actor) {
                break;
            }
            actor[action.prop] = resolveResponsive(action.value, {
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            });
            break;
        }
        case "actor.call": {
            if (!actor || typeof actor[action.method] !== "function") {
                break;
            }
            const args = Array.isArray(action.args) ? action.args.map((arg) => resolveResponsive(arg, {
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            })) : [];
            await actor[action.method](...args);
            break;
        }
        case "sprite.apply": {
            if (!actor) {
                break;
            }

            if (actor.sprites) {
                await actor.sprites.apply(action.sprite, action.options ?? {});
            } else if (action.fallback) {
                if (action.fallback.outfit) {
                    actor.outfit = actor.outfits?.[action.fallback.outfit] ?? actor.outfit;
                }
                if (action.fallback.mood) {
                    actor.mood = action.fallback.mood;
                }
            }
            break;
        }
        case "dialog": {
            const params = resolveDialogParams(action.params, runtime.vars);
            await dialog(actor ?? null, action.text ?? "", action.wait ?? true, params);
            break;
        }
        case "input": {
            let value = await input(action.message ?? "", action.placeholder);
            if (action.trim) {
                value = value.trim();
            }
            runtime.vars[action.var] = value;
            break;
        }
        case "choice": {
            let options = Array.isArray(action.options) ? [...action.options] : [];
            if (action.optionsI18nKey && i18n) {
                const translated = i18n.t(action.optionsI18nKey);
                if (Array.isArray(translated)) {
                    options = translated;
                }
            }
            if (action.optionsVar) {
                runtime.vars[action.optionsVar] = options;
            }
            if (action.firstOptionVar) {
                runtime.vars[action.firstOptionVar] = options[0];
            }
            runtime.vars[action.var] = await choice(action.message ?? "", options);
            break;
        }
        case "var.set": {
            runtime.vars[action.var] = resolveVarRef(action.value, runtime.vars);
            break;
        }
        case "var.delete": {
            delete runtime.vars[action.var];
            break;
        }
        case "var.increment": {
            const current = runtime.vars[action.var] || 0;
            runtime.vars[action.var] = current + (action.amount ?? 1);
            break;
        }
        case "var.decrement": {
            const current = runtime.vars[action.var] || 0;
            runtime.vars[action.var] = current - (action.amount ?? 1);
            break;
        }
        case "var.push": {
            if (!Array.isArray(runtime.vars[action.var])) {
                runtime.vars[action.var] = [];
            }
            const value = resolveVarRef(action.value, runtime.vars);
            runtime.vars[action.var].push(value);
            break;
        }
        case "var.pop": {
            if (Array.isArray(runtime.vars[action.var])) {
                const value = runtime.vars[action.var].pop();
                if (action.result) {
                    runtime.vars[action.result] = value;
                }
            }
            break;
        }
        case "var.splice": {
            if (Array.isArray(runtime.vars[action.var])) {
                const start = action.start ?? 0;
                const deleteCount = action.deleteCount ?? 0;
                const items = Array.isArray(action.items) ? action.items : [];
                runtime.vars[action.var].splice(start, deleteCount, ...items);
            }
            break;
        }
        case "storage.set": {
            const value = resolveVarRef(action.value, runtime.vars);
            await storage.setItem(action.key, value);
            break;
        }
        case "storage.get": {
            runtime.vars[action.var] = await storage.getItem(action.key);
            break;
        }
        case "storage.remove": {
            await storage.removeItem(action.key);
            break;
        }
        case "loading.start": {
            loading.start();
            break;
        }
        case "loading.stop": {
            loading.stop();
            break;
        }
        case "if": {
            let conditionMet = false;

            if (action.test && typeof action.test === "object") {
                const left = resolveVarRef(action.test.left, runtime.vars);
                const right = resolveVarRef(action.test.right, runtime.vars);
                const op = action.test.op || "===";

                switch (op) {
                case "===":
                    conditionMet = left === right;
                    break;
                case "!==":
                    conditionMet = left !== right;
                    break;
                case ">":
                    conditionMet = left > right;
                    break;
                case ">=":
                    conditionMet = left >= right;
                    break;
                case "<":
                    conditionMet = left < right;
                    break;
                case "<=":
                    conditionMet = left <= right;
                    break;
                case "in":
                    conditionMet = Array.isArray(right) && right.includes(left);
                    break;
                case "not-in":
                    conditionMet = !Array.isArray(right) || !right.includes(left);
                    break;
                default:
                    conditionMet = false;
                }
            }

            const branch = conditionMet ? action.then : action.else;
            if (Array.isArray(branch)) {
                const result = await executeActions(branch, runtime);
                if (result?.jumped || result?.ended) {
                    return result;
                }
            }
            break;
        }
        case "switch": {
            const value = resolveVarRef(action.value, runtime.vars);
            let matchedBranch = null;

            if (Array.isArray(action.cases)) {
                for (const caseItem of action.cases) {
                    const caseValue = resolveVarRef(caseItem.value, runtime.vars);
                    if (value === caseValue) {
                        matchedBranch = caseItem.actions;
                        break;
                    }
                }
            }

            if (!matchedBranch && action.default) {
                matchedBranch = action.default;
            }

            if (Array.isArray(matchedBranch)) {
                const result = await executeActions(matchedBranch, runtime);
                if (result?.jumped || result?.ended) {
                    return result;
                }
            }
            break;
        }
        case "repeat": {
            const count = resolveVarRef(action.count, runtime.vars) ?? 1;
            const actions = Array.isArray(action.actions) ? action.actions : [];

            for (let i = 0; i < count; i++) {
                if (action.var) {
                    runtime.vars[action.var] = i;
                }
                const result = await executeActions(actions, runtime);
                if (result?.jumped || result?.ended) {
                    return result;
                }
            }
            break;
        }
        case "wait": {
            const duration = resolveVarRef(action.duration, runtime.vars) ?? 1000;
            await new Promise((resolve) => {
                setTimeout(resolve, duration);
            });
            break;
        }
        case "log": {
            const message = resolveVarRef(action.message, runtime.vars);
            const data = action.data ? resolveVarRef(action.data, runtime.vars) : undefined;
            runtime.onLog?.(message, data, action, runtime);
            break;
        }
        case "emit": {
            const eventName = action.event ?? "custom-event";
            const eventData = action.data ? resolveVarRef(action.data, runtime.vars) : {};
            const customEvent = new CustomEvent(eventName, { detail: eventData });
            if (typeof globalThis !== "undefined" && globalThis.dispatchEvent) {
                globalThis.dispatchEvent(customEvent);
            }
            break;
        }
        case "parallel": {
            const actionSequences = Array.isArray(action.sequences) ? action.sequences : [];
            const promises = actionSequences.map((seq) => executeActions(Array.isArray(seq) ? seq : [], runtime));
            const results = await Promise.all(promises);
            for (const result of results) {
                if (result?.jumped || result?.ended) {
                    return result;
                }
            }
            break;
        }
        case "actor.to":
        case "actor.tween": {
            if (!actor) {
                break;
            }
            const duration = action.duration ?? 1000;
            const easing = action.easing ?? "linear";
            const target = {};
            for (const [key, value] of Object.entries(action.props ?? {})) {
                target[key] = resolveResponsive(value, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
            }
            if (typeof actor.to === "function") {
                await actor.to(target, { duration, easing, ...action.options });
            }
            break;
        }
        case "background.to":
        case "background.tween": {
            const gameInstance = runtime.getGame?.();
            if (!gameInstance?.background) {
                break;
            }
            const duration = action.duration ?? 1000;
            const easing = action.easing ?? "linear";
            const target = {};
            for (const [key, value] of Object.entries(action.props ?? {})) {
                target[key] = resolveResponsive(value, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
            }
            if (typeof gameInstance.background.to === "function") {
                await gameInstance.background.to(target, { duration, easing, ...action.options });
            }
            break;
        }
        case "actor.fade": {
            if (!actor) {
                break;
            }
            const duration = action.duration ?? 500;
            const direction = action.direction ?? "in";
            if (typeof actor.fade === "function") {
                await actor.fade(direction, duration);
            }
            break;
        }
        case "actor.move": {
            if (!actor) {
                break;
            }
            const duration = action.duration ?? 1000;
            const x = resolveResponsive(action.x, {
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            });
            const y = resolveResponsive(action.y, {
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            });
            if (typeof actor.moveTo === "function") {
                await actor.moveTo(x, y, duration);
            }
            break;
        }
        case "actor.shake": {
            if (!actor) {
                break;
            }
            const duration = action.duration ?? 300;
            const intensity = action.intensity ?? 5;
            if (typeof actor.shake === "function") {
                await actor.shake(intensity, duration);
            }
            break;
        }
        case "effect.screen-shake": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const duration = action.duration ?? 300;
                const intensity = action.intensity ?? 5;
                if (typeof gameInstance.shake === "function") {
                    await gameInstance.shake(intensity, duration);
                }
            }
            break;
        }
        case "effect.flash": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const duration = action.duration ?? 300;
                const color = action.color ?? "#ffffff";
                if (typeof gameInstance.flash === "function") {
                    await gameInstance.flash(color, duration);
                }
            }
            break;
        }
        case "effect.particles": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const x = resolveResponsive(action.x, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
                const y = resolveResponsive(action.y, {
                    isPortrait: runtime.isPortrait,
                    isAndroid: runtime.isAndroid
                });
                if (typeof gameInstance.particles === "function") {
                    await gameInstance.particles(x, y, action.particleType, action.options);
                }
            }
            break;
        }
        case "music.play": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const fadeIn = action.fadeIn ?? 0;
                if (typeof gameInstance.playMusic === "function") {
                    await gameInstance.playMusic(action.track, {
                        fadeIn,
                        loop: action.loop !== false,
                        volume: action.volume
                    });
                }
            }
            break;
        }
        case "music.stop": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const fadeOut = action.fadeOut ?? 500;
                if (typeof gameInstance.stopMusic === "function") {
                    await gameInstance.stopMusic(fadeOut);
                }
            }
            break;
        }
        case "music.fade": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const volume = action.volume ?? 0;
                const duration = action.duration ?? 1000;
                if (typeof gameInstance.fadeMusic === "function") {
                    await gameInstance.fadeMusic(volume, duration);
                }
            }
            break;
        }
        case "sfx.play": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const volume = action.volume ?? 1;
                if (typeof gameInstance.playSFX === "function") {
                    await gameInstance.playSFX(action.track, volume);
                }
            }
            break;
        }
        case "scene.transition": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const duration = action.duration ?? 500;
                const transitionType = action.transitionType ?? "fade";
                const color = action.color ?? "#000000";
                const overlapRatio = action.overlapRatio ?? action.overlap;
                const fadeInRatio = action.fadeInRatio;
                const holdMs = action.holdMs;
                if (typeof gameInstance.transitionEffect === "function") {
                    await gameInstance.transitionEffect({
                        type: transitionType,
                        color,
                        duration,
                        overlapRatio,
                        fadeInRatio,
                        holdMs
                    });
                }
            }
            break;
        }
        case "run": {
            if (typeof action.run === "function") {
                const result = await action.run(runtime, action);
                if (result?.jumped || result?.ended) {
                    return result;
                }
                if (typeof result === "string" && runtime.story[result]) {
                    next(runtime.story[result], result);
                    return { jumped: true };
                }
            }
            break;
        }
        case "achievement": {
            runtime.achievements?.increment?.(action.id, action.amount ?? 1);
            break;
        }
        case "jump": {
            if (!runtime.story[action.scene]) {
                break;
            }
            next(runtime.story[action.scene], action.scene);
            return { jumped: true };
        }
        case "end": {
            end();
            return { ended: true };
        }
        default: {
            const customAction = runtime.actionHandlers?.[action.type];
            if (typeof customAction === "function") {
                const result = await customAction(action, runtime);
                if (result?.jumped || result?.ended) {
                    return result;
                }
            } else {
                runtime.onUnknownAction?.(action, runtime);
            }
            break;
        }
        }
    }

    return { jumped: false, ended: false };
}

function createStoryFromScript({
    scenes = {},
    actors = {},
    assets = {},
    achievements = null,
    getGame = () => null,
    getIsPortrait = () => false,
    getIsAndroid = () => false,
    getScene = null,
    getActor = null,
    getAsset = null,
    actionHandlers = {},
    context = {},
    beforeScene = null,
    afterScene = null,
    sharedVars = false,
    onUnknownAction = null,
    onLog = null
} = {}) {
    const sceneEntries = {};
    const persistentVars = sharedVars ? {} : null;
    const sceneCache = {};
    const sceneOverrides = {};

    const resolveScene = async (sceneName) => {
        if (Object.prototype.hasOwnProperty.call(sceneOverrides, sceneName)) {
            return sceneOverrides[sceneName];
        }

        if (Object.prototype.hasOwnProperty.call(sceneCache, sceneName)) {
            return sceneCache[sceneName];
        }

        let sceneDefinition;
        if (typeof scenes === "function") {
            sceneDefinition = await scenes(sceneName, context);
        } else if (scenes && typeof scenes === "object") {
            sceneDefinition = scenes[sceneName];
        }

        if ((sceneDefinition === undefined || sceneDefinition === null) && typeof getScene === "function") {
            sceneDefinition = await getScene(sceneName, context);
        }

        sceneCache[sceneName] = sceneDefinition;
        return sceneDefinition;
    };

    const resolveActor = (actorName) => {
        if (!actorName) {
            return null;
        }

        let actorValue;
        if (typeof getActor === "function") {
            actorValue = getActor(actorName, context);
            if (actorValue !== undefined && actorValue !== null) {
                return initActorAnimation(actorValue);
            }
        }

        if (typeof actors === "function") {
            actorValue = actors(actorName, context);
            return initActorAnimation(actorValue ?? null);
        }

        const actor = actors?.[actorName] ?? null;
        return initActorAnimation(actor);
    };

    const resolveAsset = (assetName) => {
        if (!assetName) {
            return null;
        }

        let assetValue;
        if (typeof getAsset === "function") {
            assetValue = getAsset(assetName, context);
            if (assetValue !== undefined && assetValue !== null) {
                return assetValue;
            }
        }

        if (typeof assets === "function") {
            assetValue = assets(assetName, context);
            return assetValue ?? null;
        }

        return assets?.[assetName] ?? null;
    };

    const runScene = async (sceneName) => {
        const sceneDefinition = await resolveScene(sceneName);
        if (!sceneDefinition) {
            return;
        }

        const gameInstance = getGame?.();
        if (gameInstance) {
            addGameAnimationMethods(gameInstance);
            initAudioSystem(gameInstance);
        }

        const runtime = {
            vars: sharedVars ? persistentVars : {},
            scenes,
            story,
            getActor: resolveActor,
            getAsset: resolveAsset,
            achievements,
            getGame: () => gameInstance,
            isPortrait: !!getIsPortrait(),
            isAndroid: !!getIsAndroid(),
            actionHandlers,
            onUnknownAction,
            onLog,
            context
        };

        // Debug: log runtime device flags so consoles show why responsive branches choose values
        try {
            console.warn("[story-script-runner] runtime flags", {
                scene: sceneName,
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            });
        } catch (e) {
            // ignore
        }

        const shouldContinue = typeof beforeScene === "function"
            ? await beforeScene(sceneName, runtime)
            : true;
        if (shouldContinue === false) {
            return;
        }

        let result = { jumped: false, ended: false };
        if (Array.isArray(sceneDefinition)) {
            result = await executeActions(sceneDefinition, runtime);
        } else if (typeof sceneDefinition === "function") {
            const functionResult = await sceneDefinition(runtime);
            if (functionResult?.jumped || functionResult?.ended) {
                result = functionResult;
            }
        }

        if (typeof afterScene === "function") {
            await afterScene(sceneName, runtime, result);
        }
    };

    const getSceneExecutor = (sceneName) => {
        if (!sceneEntries[sceneName]) {
            const sceneExecutor = async function () {
                await runScene(sceneName);
            };
            Object.defineProperty(sceneExecutor, "__sceneName", {
                value: sceneName,
                configurable: true
            });
            sceneEntries[sceneName] = sceneExecutor;
        }
        return sceneEntries[sceneName];
    };

    const story = new Proxy(sceneEntries, {
        get(target, prop) {
            if (typeof prop !== "string") {
                return target[prop];
            }
            return getSceneExecutor(prop);
        }
    });

    if (scenes && typeof scenes === "object" && !Array.isArray(scenes)) {
        for (const sceneName of Object.keys(scenes)) {
            getSceneExecutor(sceneName);
        }
    }

    story.setScene = (sceneName, sceneDefinition) => {
        if (!sceneName) {
            return false;
        }
        sceneOverrides[sceneName] = sceneDefinition;
        sceneCache[sceneName] = sceneDefinition;
        getSceneExecutor(sceneName);
        return true;
    };

    story.extendScenes = (sceneMap = {}) => {
        if (!sceneMap || typeof sceneMap !== "object") {
            return 0;
        }

        let count = 0;
        for (const [sceneName, sceneDefinition] of Object.entries(sceneMap)) {
            if (story.setScene(sceneName, sceneDefinition)) {
                count += 1;
            }
        }
        return count;
    };

    story.invalidateScene = (sceneName) => {
        if (!sceneName) {
            return false;
        }
        delete sceneOverrides[sceneName];
        delete sceneCache[sceneName];
        return true;
    };

    story.listScenes = () => {
        const names = new Set([
            ...Object.keys(sceneEntries),
            ...Object.keys(sceneOverrides),
            ...Object.keys(sceneCache),
            ...(scenes && typeof scenes === "object" ? Object.keys(scenes) : [])
        ]);
        return [...names];
    };

    return story;
}

export { createStoryFromScript };
export default { createStoryFromScript };
