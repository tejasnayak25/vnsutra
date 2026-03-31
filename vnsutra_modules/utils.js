import errorTracking from "./error-tracking.js";

function load(fpath) {
    return new Promise((resolve, reject) => {
        // Fetch and use the JSON configuration
        try {
            fetch(fpath)
                .then(response => {
                    if (!response.ok) {
                        resolve(404);
                    }
                    resolve(response);
                })
                .catch(() => {
                    errorTracking?.captureError("Failed to load resource", {
                        type: "warning",
                        message: "[Utils] Failed to load resource",
                        context: { scope: "utils", path: fpath }
                    });
                    resolve(404);
                });
        } catch(e) {
            errorTracking?.captureError(e, {
                message: "[Utils] Failed to load resource",
                context: { scope: "utils", path: fpath }
            });
            resolve(404);
        }
    });
}

async function loadJSON(fpath) {
    const response = await load(fpath);
    if(response === 404) {
        return 404;
    } else {
        const json = await response.json();
        return json;
    }
}

function loadFonts(fonts, root = "./") {
    return new Promise((resolve) => {
        const entries = Object.entries(fonts ?? {});
        const fontList = {};

        if (entries.length === 0) {
            resolve(fontList);
            return;
        }

        let pending = entries.length;

        const finalize = () => {
            pending -= 1;
            if (pending <= 0) {
                resolve(fontList);
            }
        };

        entries.forEach(([key, value]) => {
            const font = new FontFace(value.name, `url(${root}${value.url})`);

            font
                .load()
                .then((loadedFont) => {
                    document.fonts.add(loadedFont);
                    fontList[key] = `'${loadedFont.family}'`;
                })
                .catch((error) => {
                    errorTracking?.captureError(error, {
                        type: "warning",
                        message: "[Utils] Failed to load font",
                        context: { scope: "utils", font: value?.name }
                    });
                    fontList[key] = value?.name ? `'${value.name}'` : "sans-serif";
                })
                .finally(finalize);
        });
    });
}

// Export as ES module
export { load, loadJSON, loadFonts };