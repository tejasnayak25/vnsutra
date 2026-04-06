import { Background, Character, IMG, Music } from "../vnsutra_modules/assets/index.js";
import { getIsAndroid, getIsPortrait } from "../vnsutra_modules/runtime-state.js";
import DynamicSprites from "../vnsutra_modules/dynamic-sprites.js";

const futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
const apartment_ext = new Background("backgrounds/Noraneko_Background_Pack_1/Apartment_Exterior.png");

const mary = new Character({
    name: "Mary",
    folder: "characters/Rin",
    scale: getIsPortrait() ? 1 : (getIsAndroid() ? 1.4 : 1.1),
});

const music = new Music("../assets/music/bgm.mp3");

mary.loadOutfit("Casual");

if (DynamicSprites) {
    mary.sprites = new DynamicSprites(mary);
    mary.sprites.defineMany({
        casualSmile: { outfit: "Casual", mood: "Rin_Casual_Smile" },
        casualOpenSmile: { outfit: "Casual", mood: "Rin_Casual_OpenSmile" },
        casualEyesClosed: { outfit: "Casual", mood: "Rin_Casual_OpenSmile_EyesClosed" }
    });

    mary.sprites.preloadOutfits().catch((error) => {
        console.warn("[DynamicSprites] Failed to preload outfits:", error);
    });
}

const obj = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });

export { futon_room, apartment_ext, mary, music, obj };