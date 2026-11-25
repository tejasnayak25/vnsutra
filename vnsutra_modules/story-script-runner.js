import { dialog, next, loading, input, choice, storage, end } from "./game-utils.js";
import { i18n } from "./i18n.js";
import { initActorAnimation, addGameAnimationMethods } from "./animation-utils.js";
import { initAudioSystem } from "./audio-effects-utils.js";
import { initVisualEffectsSystem } from "./visual-effects-utils.js";
import { RollbackManager } from "./rollback.js";
import { SpeakerSpotlight } from "./spotlight.js";
import { getShouldAbortGame, getGameSessionId, getConfiguration, getState, getInstructionCount } from "./runtime-state.js";

function isReplayCatchingUp(runtime) {
    const state = getState();
    const target = Number(runtime?.vars?.instruction_count ?? state?.instruction_count ?? 0);
    if (target <= 0) {
        return false;
    }
    return getInstructionCount() < target;
}

function resolveResponsive(value, { isPortrait = false, isAndroid = false } = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, "portrait") && isPortrait) {
        return resolveResponsive(value.portrait, { isPortrait, isAndroid });
    }

    if (Object.prototype.hasOwnProperty.call(value, "android") && isAndroid) {
        return resolveResponsive(value.android, { isPortrait, isAndroid });
    }

    if (Object.prototype.hasOwnProperty.call(value, "default")) {
        return resolveResponsive(value.default, { isPortrait, isAndroid });
    }

    return value;
}

function resolveVarRef(value, vars = {}, runtime = {}) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        if (value === "$isPortrait") return Boolean(runtime?.isPortrait);
        if (value === "$isAndroid") return Boolean(runtime?.isAndroid);
        return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, "fromVar")) {
        if (value.fromVar === "$isPortrait") return Boolean(runtime?.isPortrait);
        if (value.fromVar === "$isAndroid") return Boolean(runtime?.isAndroid);
        return vars[value.fromVar];
    }

    return value;
}

function evaluateCondition(test, vars = {}, runtime = {}) {
    if (!test || typeof test !== "object") {
        return Boolean(test);
    }

    if (test.op === "and" || test.op === "all") {
        const list = Array.isArray(test.conditions) ? test.conditions : [];
        return list.every((cond) => evaluateCondition(cond, vars, runtime));
    }

    if (test.op === "or" || test.op === "any") {
        const list = Array.isArray(test.conditions) ? test.conditions : [];
        return list.some((cond) => evaluateCondition(cond, vars, runtime));
    }

    if (test.op === "not" || test.op === "!") {
        return !evaluateCondition(test.test ?? test.condition, vars, runtime);
    }

    if (test.op === "truthy" || (!test.op && test.fromVar)) {
        const val = resolveVarRef(test.value ?? test, vars, runtime);
        return Boolean(val);
    }

    if (test.op === "falsy") {
        const val = resolveVarRef(test.value ?? test, vars, runtime);
        return !val;
    }

    const left = resolveVarRef(test.left, vars, runtime);
    const right = resolveVarRef(test.right, vars, runtime);
    const op = test.op || "===";

    switch (op) {
    case "===":
    case "==":
        return left === right;
    case "!==":
    case "!=":
        return left !== right;
    case ">":
        return left > right;
    case ">=":
        return left >= right;
    case "<":
        return left < right;
    case "<=":
        return left <= right;
    case "in":
        return Array.isArray(right) && right.includes(left);
    case "not-in":
        return !Array.isArray(right) || !right.includes(left);
    default:
        return false;
    }
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

function findUpcomingJumpTarget(actions = [], startIndex = 0) {
    for (let index = startIndex; index < actions.length; index++) {
        const action = actions[index];
        if (!action || typeof action !== "object") {
            continue;
        }

        if (action.type === "jump" && typeof action.scene === "string" && action.scene) {
            return action.scene;
        }

        if (action.type !== "log" && action.type !== "wait") {
            return null;
        }
    }

    return null;
}

async function executeActions(actions = [], runtime) {
    const expectedSession = runtime.sessionId ?? getGameSessionId();
    const isSessionAborted = () => getShouldAbortGame() || expectedSession !== getGameSessionId();

    for (let actionIndex = 0; actionIndex < actions.length; actionIndex++) {
        if (isSessionAborted()) {
            return { jumped: false, ended: true };
        }
        const action = actions[actionIndex];
        if (!action || typeof action !== "object") {
            continue;
        }

        const actor = action.actor ? runtime.getActor(action.actor) : null;

        switch (action.type) {
        case "stage":
        case "background.stage":
        case "background.parallax":
        case "background": {
            const gameInstance = runtime.getGame?.();
            if (action.reset) {
                gameInstance?.background?.reset?.();
                if (!action.stage && !action.asset && action.type !== "stage" && action.type !== "background.stage") {
                    gameInstance?.clearParallaxBackground?.();
                }
            }
            const isCatchingUp = isReplayCatchingUp(runtime);
            let defaultDuration = isCatchingUp ? 0 : (action.duration !== undefined ? Number(action.duration) : (action.transition === "none" ? 0 : 0.6));
            let hadPendingSceneTransition = false;
            if (!isCatchingUp && runtime._pendingSceneTransitionDuration !== undefined) {
                defaultDuration = runtime._pendingSceneTransitionDuration;
                runtime._pendingSceneTransitionDuration = undefined;
                hadPendingSceneTransition = true;
            }
            const stageOptions = { ...(action.options || {}) };
            if (action.duration !== undefined || isCatchingUp || hadPendingSceneTransition) {
                stageOptions.duration = defaultDuration;
            }
            if (action.transition !== undefined) {
                stageOptions.transition = action.transition;
            }

            if (action.stage || (action.asset && String(action.asset).endsWith(".vnstage")) || action.type === "stage" || action.type === "background.stage") {
                const stageTarget = action.stage || action.asset || action.file;
                const resolvedTarget = typeof stageTarget === "string" ? (runtime.getAsset?.(stageTarget) || stageTarget) : stageTarget;
                await gameInstance?.loadStage?.(resolvedTarget, stageOptions);
            } else if (action.planes && Array.isArray(action.planes)) {
                const resolvedPlanes = action.planes.map((p) => {
                    const asset = p.asset || p.image || p.src;
                    const img = typeof asset === "string" ? runtime.getAsset(asset) : asset;
                    return {
                        ...p,
                        image: img
                    };
                });
                gameInstance?.setParallaxBackground?.(resolvedPlanes, stageOptions);
            } else if (action.far || action.mid || action.near || action.fore) {
                const depths = { far: 0.2, mid: 0.6, near: 1.0, fore: 1.5 };
                const resolvedPlanes = [];
                for (const key of ["far", "mid", "near", "fore"]) {
                    if (action[key]) {
                        const img = typeof action[key] === "string" ? runtime.getAsset(action[key]) : action[key];
                        resolvedPlanes.push({ image: img, depth: depths[key], id: key });
                    }
                }
                gameInstance?.setParallaxBackground?.(resolvedPlanes, stageOptions);
            } else if (gameInstance && action.asset) {
                const resolvedAsset = runtime.getAsset(action.asset);
                if (typeof gameInstance.changeBackground === "function") {
                    await gameInstance.changeBackground(resolvedAsset, {
                        duration: defaultDuration,
                        transition: action.transition || "crossfade",
                        ...(action.options || {})
                    });
                } else {
                    gameInstance.background = resolvedAsset;
                }
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
        case "actor.bringToFront": {
            const gameInstance = runtime.getGame?.();
            gameInstance?.bringCharactersToFront?.();
            break;
        }
        case "actor.hide": {
            actor?.hide?.();
            break;
        }
        case "actor.fx": {
            actor?.setFx?.(action.fx ?? [], {
                intensity: action.intensity ?? 0.85,
                speed: action.speed ?? 1
            });
            break;
        }
        case "spotlight.config": {
            const opts = action.options && typeof action.options === "object" ? action.options : {
                enabled: action.enabled,
                dimColor: action.dimColor,
                dimStrength: action.dimStrength,
                scaleBoost: action.scaleBoost,
                duration: action.duration,
                autoFocus: action.autoFocus,
                focusZoom: action.focusZoom
            };
            const cleanOpts = Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined));
            runtime.getGame?.()?.spotlight?.configure?.(cleanOpts);
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
            const isCatchingUp = isReplayCatchingUp(runtime);
            let args = Array.isArray(action.args) ? action.args.map((arg) => resolveResponsive(arg, {
                isPortrait: runtime.isPortrait,
                isAndroid: runtime.isAndroid
            })) : [];
            if (isCatchingUp) {
                if (action.method === "slideIn" || action.method === "slideOut") {
                    const targetX = args[0] !== undefined ? args[0] : (action.method === "slideIn" ? 0 : 1.25);
                    args = [targetX, 0];
                }
            }
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
            const actorSnapshot = {};
            const actorMap = runtime.getActors?.() ?? runtime.actors ?? {};
            for (const [id, act] of Object.entries(actorMap)) {
                if (!act) continue;
                actorSnapshot[id] = {
                    x: act.x,
                    y: act.y,
                    visible: act.visible,
                    mood: act.mood
                };
            }
            runtime.rollback?.capture({
                sceneName: runtime.currentSceneName || "",
                actionIndex,
                vars: runtime.vars,
                actors: actorSnapshot,
                camera: runtime.getGame?.()?.camera?.state || null
            });
            const params = resolveDialogParams(action.params, runtime.vars);
            try {
                await dialog(actor ?? null, action.text ?? "", action.wait ?? true, params);
            } catch (err) {
                if (isSessionAborted() || err?.message === "Dialog aborted") {
                    return { jumped: false, ended: true };
                }
                throw err;
            }
            if (isSessionAborted()) {
                return { jumped: false, ended: true };
            }
            break;
        }
        case "input": {
            let value;
            try {
                value = await input(action.message ?? "", action.placeholder);
            } catch (err) {
                if (isSessionAborted() || err?.message?.includes("aborted")) {
                    return { jumped: false, ended: true };
                }
                throw err;
            }
            if (action.trim && typeof value === "string") {
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
            runtime.getGame?.()?.spotlight?.clear?.();
            try {
                runtime.vars[action.var] = await choice(action.message ?? "", options, {}, { multiSelect: action.multiSelect === true });
            } catch (err) {
                if (isSessionAborted() || err?.message?.includes("aborted")) {
                    return { jumped: false, ended: true };
                }
                throw err;
            }
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
        case "camera.pan": {
            const isCatchingUp = isReplayCatchingUp(runtime);
            await runtime.getGame?.()?.camera?.pan?.({
                x: action.x ?? 0,
                y: action.y ?? 0,
                zoom: action.zoom ?? 1,
                rotation: action.rotation ?? 0,
                duration: isCatchingUp ? 0 : (action.duration ?? 0.8),
                easing: action.easing ?? "EaseInOut"
            });
            break;
        }
        case "camera.focus": {
            const isCatchingUp = isReplayCatchingUp(runtime);
            await runtime.getGame?.()?.camera?.focus?.(actor, {
                zoom: action.zoom ?? 1.25,
                duration: isCatchingUp ? 0 : (action.duration ?? 0.7),
                yOffset: action.yOffset ?? -0.05
            });
            break;
        }
        case "camera.reset": {
            const isCatchingUp = isReplayCatchingUp(runtime);
            await runtime.getGame?.()?.camera?.reset?.({ duration: isCatchingUp ? 0 : (action.duration ?? 0.6) });
            break;
        }
        case "camera.lighting": {
            const actorList = runtime.getActors?.() ?? Object.values(runtime.actors || {});
            runtime.getGame?.()?.camera?.setLighting?.(action.preset ?? action.color ?? "day", action.strength, actorList);
            break;
        }
        case "if": {
            const conditionMet = evaluateCondition(action.test, runtime.vars, runtime);
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
            const value = resolveVarRef(action.value, runtime.vars, runtime);
            let matchedBranch = null;

            if (Array.isArray(action.cases)) {
                for (const caseItem of action.cases) {
                    const caseValue = resolveVarRef(caseItem.value, runtime.vars, runtime);
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
            if (isReplayCatchingUp(runtime)) {
                break;
            }
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
            const isCatchingUp = isReplayCatchingUp(runtime);
            const duration = isCatchingUp ? 0 : (action.duration ?? 1000);
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
            const isCatchingUp = isReplayCatchingUp(runtime);
            const duration = isCatchingUp ? 0 : (action.duration ?? 1000);
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
            const isCatchingUp = isReplayCatchingUp(runtime);
            const duration = isCatchingUp ? 0 : (action.duration ?? 500);
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
            const isCatchingUp = isReplayCatchingUp(runtime);
            const duration = isCatchingUp ? 0 : (action.duration ?? 1000);
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
            if (!actor || isReplayCatchingUp(runtime)) {
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
            if (gameInstance && !isReplayCatchingUp(runtime)) {
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
            if (gameInstance && !isReplayCatchingUp(runtime)) {
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
            if (gameInstance && !isReplayCatchingUp(runtime)) {
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
                const isCatchingUp = isReplayCatchingUp(runtime);
                const fadeIn = isCatchingUp ? 0 : (action.fadeIn ?? 0);
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
        case "music.crossfade": {
            const gameInstance = runtime.getGame?.();
            const isCatchingUp = isReplayCatchingUp(runtime);
            if (isCatchingUp && gameInstance && typeof gameInstance.playMusic === "function") {
                await gameInstance.playMusic(action.track, {
                    fadeIn: 0,
                    loop: action.loop !== false,
                    volume: action.volume ?? 1
                });
            } else {
                await gameInstance?.crossfadeMusic?.(action.track, {
                    duration: action.duration ?? 1200,
                    loop: action.loop !== false,
                    volume: action.volume ?? 1
                });
            }
            break;
        }
        case "ambient.play": {
            const gameInstance = runtime.getGame?.();
            const isCatchingUp = isReplayCatchingUp(runtime);
            await gameInstance?.playAmbient?.(action.track, {
                loop: action.loop !== false,
                volume: action.volume ?? 0.5,
                fadeIn: isCatchingUp ? 0 : (action.fadeIn ?? 500)
            });
            break;
        }
        case "ambient.stop": {
            const gameInstance = runtime.getGame?.();
            const isCatchingUp = isReplayCatchingUp(runtime);
            await gameInstance?.stopAmbient?.(isCatchingUp ? 0 : (action.fadeOut ?? 500));
            break;
        }
        case "weather.set": {
            const gameInstance = runtime.getGame?.();
            gameInstance?.weather?.start?.(action.preset, { intensity: action.intensity ?? 0.7 });
            break;
        }
        case "weather.stop": {
            const gameInstance = runtime.getGame?.();
            gameInstance?.weather?.stop?.();
            break;
        }
        case "music.stop": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const isCatchingUp = isReplayCatchingUp(runtime);
                const fadeOut = isCatchingUp ? 0 : (action.fadeOut ?? 500);
                if (typeof gameInstance.stopMusic === "function") {
                    await gameInstance.stopMusic(fadeOut);
                }
            }
            break;
        }
        case "music.fade": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                const isCatchingUp = isReplayCatchingUp(runtime);
                const volume = action.volume ?? 0;
                const duration = isCatchingUp ? 0 : (action.duration ?? 1000);
                if (typeof gameInstance.fadeMusic === "function") {
                    await gameInstance.fadeMusic(volume, duration);
                }
            }
            break;
        }
        case "sfx.play": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance && !isReplayCatchingUp(runtime)) {
                const volume = action.volume ?? 1;
                const targetActor = action.actor ? runtime.actors?.[action.actor] : null;
                if (typeof gameInstance.playSFX === "function") {
                    await gameInstance.playSFX(action.track, volume, {
                        wait: action.wait,
                        pan: action.pan,
                        actor: targetActor,
                        x: action.x,
                        duck: action.duck
                    });
                }
            }
            break;
        }
        case "voice.play": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance && !isReplayCatchingUp(runtime)) {
                const targetActor = action.actor ? runtime.actors?.[action.actor] : null;
                if (typeof gameInstance.playVoice === "function") {
                    await gameInstance.playVoice(action.track, {
                        volume: action.volume ?? 1,
                        actor: targetActor,
                        pan: action.pan,
                        duck: action.duck !== false,
                        duckRatio: action.duckRatio ?? 0.35,
                        wait: action.wait ?? false
                    });
                }
            }
            break;
        }
        case "scene.transition": {
            const gameInstance = runtime.getGame?.();
            if (gameInstance) {
                if (isReplayCatchingUp(runtime)) {
                    break;
                }
                const duration = action.duration ?? 500;
                const transitionType = action.transitionType ?? "fade";
                if (transitionType === "crossfade") {
                    runtime._pendingSceneTransitionDuration = duration / 1000;
                    break;
                }
                const color = action.color ?? "#000000";
                const overlapRatio = action.overlapRatio ?? action.overlap;
                const fadeInRatio = action.fadeInRatio;
                const holdMs = action.holdMs;
                const hintedTarget = typeof action.targetScene === "string" ? action.targetScene : action.scene;
                const upcomingJumpTarget = findUpcomingJumpTarget(actions, actionIndex + 1);
                const prefetchTarget = hintedTarget || upcomingJumpTarget;
                const prefetchPromise = prefetchTarget
                    ? runtime.prefetchScene?.(prefetchTarget)
                    : Promise.resolve();

                if (typeof gameInstance.transitionEffect === "function") {
                    await Promise.all([
                        gameInstance.transitionEffect({
                            type: transitionType,
                            color,
                            duration,
                            overlapRatio,
                            fadeInRatio,
                            holdMs
                        }),
                        prefetchPromise
                    ]);
                } else {
                    await prefetchPromise;
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
                    await runtime.prefetchScene?.(result);
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
            await runtime.prefetchScene?.(action.scene);
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
            initVisualEffectsSystem(gameInstance);
        }

        if (gameInstance && actors && typeof actors === "object") {
            gameInstance.actors = actors;
        }
        if (gameInstance) {
            if (!gameInstance.spotlight) {
                const spotlightCfg = getConfiguration?.()?.["speaker-spotlight"] || {};
                gameInstance.spotlight = new SpeakerSpotlight(gameInstance, spotlightCfg);
            }
            gameInstance.spotlight.attach();
        }
        const runtime = {
            vars: sharedVars ? persistentVars : {},
            scenes,
            story,
            sessionId: getGameSessionId(),
            currentSceneName: sceneName,
            actors,
            rollback: gameInstance ? (gameInstance.rollback || (gameInstance.rollback = new RollbackManager())) : null,
            prefetchScene: resolveScene,
            getActor: resolveActor,
            getActors: () => actors,
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

export { createStoryFromScript, executeActions, evaluateCondition };
export default { createStoryFromScript, executeActions, evaluateCondition };
