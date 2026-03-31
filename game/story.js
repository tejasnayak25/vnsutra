import { futon_room, apartment_ext, mary } from "./assets.js";
import achievements from "../vnsutra_modules/achievements.js";
import { getGame, getIsAndroid, getIsPortrait } from "../vnsutra_modules/runtime-state.js";
import { createStoryFromScript } from "../vnsutra_modules/story-script-runner.js";
import { createRemoteSceneLoader } from "../vnsutra_modules/remote-scene-loader.js";
import startScene from "./scenes/start.scene.js";

const localScenes = {
    start: startScene
};

const safeSceneNamePattern = /^[A-Za-z0-9_-]+$/;

const remoteScenesConfig = globalThis?.VNSUTRA_REMOTE_SCENES;
const remoteLoader = remoteScenesConfig?.enabled
    ? createRemoteSceneLoader({
        baseUrl: remoteScenesConfig.baseUrl || "",
        extension: remoteScenesConfig.extension || ".json",
        cacheBust: remoteScenesConfig.cacheBust !== false
    })
    : null;

const getScene = async (sceneName) => {
    if (Object.prototype.hasOwnProperty.call(localScenes, sceneName)) {
        return localScenes[sceneName];
    }

    if (typeof sceneName === "string" && safeSceneNamePattern.test(sceneName)) {
        try {
            const module = await import(`./scenes/${sceneName}.scene.js`);
            const sceneDefinition = module?.default ?? null;

            if (sceneDefinition) {
                localScenes[sceneName] = sceneDefinition;
                return sceneDefinition;
            }
        } catch (error) {
            // Fall through to remote loading when a local scene is absent.
            if (!remoteLoader) {
                throw error;
            }
        }
    }

    if (!remoteLoader) {
        return null;
    }

    return remoteLoader.getScene(sceneName);
};

export const story = createStoryFromScript({
    scenes: localScenes,
    getScene,
    actors: { mary },
    assets: { futon_room, apartment_ext },
    achievements,
    getGame,
    getIsPortrait,
    getIsAndroid
});

if (typeof globalThis !== "undefined") {
    globalThis.vnsutraStory = {
        get scenes() {
            return story.listScenes?.() ?? [];
        },
        setScene(sceneName, sceneDefinition) {
            return story.setScene?.(sceneName, sceneDefinition) ?? false;
        },
        extendScenes(sceneMap) {
            return story.extendScenes?.(sceneMap) ?? 0;
        },
        invalidateScene(sceneName) {
            return story.invalidateScene?.(sceneName) ?? false;
        },
        async refreshRemoteScene(sceneName) {
            if (!remoteLoader) {
                return false;
            }
            const sceneDefinition = await remoteLoader.refreshScene(sceneName);
            if (!sceneDefinition) {
                return false;
            }
            story.setScene?.(sceneName, sceneDefinition);
            return true;
        },
        startRemotePolling(sceneName, intervalMs = 5000) {
            if (!remoteLoader) {
                return false;
            }
            return remoteLoader.startPolling(sceneName, intervalMs);
        },
        stopRemotePolling(sceneName) {
            remoteLoader?.stopPolling(sceneName);
        }
    };
}