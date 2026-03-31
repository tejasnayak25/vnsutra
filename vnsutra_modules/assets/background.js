import { loadImg } from "../ui/utils.js";

const config = {
    assets: "assets/game-assets"
};

class Background {
    /**
     * Creates a background image asset from a game-assets relative path.
     * @param {string} url
     */
    constructor(url) {
        const img = loadImg(`./${config.assets}/${url}`);
        return img;
    }
}

export { Background };
