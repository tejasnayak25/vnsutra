import { Background, Character, RiggedCharacter, ParallaxStage, IMG, Music } from "../vnsutra_modules/assets/index.js";
import { getIsAndroid, getIsPortrait } from "../vnsutra_modules/runtime-state.js";
import DynamicSprites from "../vnsutra_modules/dynamic-sprites.js";

const futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
const apartment_ext = new Background("backgrounds/Noraneko_Background_Pack_1/Apartment_Exterior.png");

// Production .vnstage Parallax Stages
const cherry_park = new ParallaxStage({ id: "cherry_park", url: "backgrounds/cherry_park.vnstage" });
const classroom = new ParallaxStage({ id: "classroom", url: "backgrounds/classroom.vnstage" });
const shrine = new ParallaxStage({ id: "shrine", url: "backgrounds/shrine.vnstage" });
const rainy_cafe = new ParallaxStage({ id: "rainy_cafe", url: "backgrounds/rainy_cafe.vnstage" });
const coastal_hill = new ParallaxStage({ id: "coastal_hill", url: "backgrounds/coastal_hill.vnstage" });
const apartment_stage = new ParallaxStage({ id: "apartment_stage", url: "backgrounds/apartment_exterior.vnstage" });
const futon_stage = new ParallaxStage({ id: "futon_stage", url: "backgrounds/futon_room.vnstage" });

// Apartment Exterior 2.5D Parallax Planes
const apartment_sky = new Background("backgrounds/apartment_exterior_parallax/01_sky_far.png");
const apartment_mid = new Background("backgrounds/apartment_exterior_parallax/02_midground_mid.png");
const apartment_near = new Background("backgrounds/apartment_exterior_parallax/03_focal_near.png");
const apartment_fore = new Background("backgrounds/apartment_exterior_parallax/04_framing_fore.png");

// Futon Room 2.5D Parallax Planes
const futon_outside = new Background("backgrounds/futon_room_parallax/01_outside_far.png");
const futon_wall = new Background("backgrounds/futon_room_parallax/02_backwall_mid.png");
const futon_tatami = new Background("backgrounds/futon_room_parallax/03_tatami_near.png");
const futon_door = new Background("backgrounds/futon_room_parallax/04_doorframe_fore.png");

const mary = new Character({
    name: "Mary",
    folder: "characters/Rin",
    scale: getIsPortrait() ? 1 : (getIsAndroid() ? 1.4 : 1.1),
});
mary.accentColor = "#38bdf8";
mary.blip = { mode: "vocal", pitchHz: 360, rate: 2, volume: 0.16 };

const sakura = new RiggedCharacter({
    name: "Sakura",
    folder: "characters/Sakura",
    scale: getIsPortrait() ? 1 : (getIsAndroid() ? 1.4 : 1.1),
});
sakura.accentColor = "#f472b6";
sakura.blip = { mode: "vocal", pitchHz: 480, rate: 2, volume: 0.16 };

const music = new Music("../assets/music/bgm.mp3");

mary.loadOutfit("Casual");
sakura.loadOutfit("Casual");

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

    sakura.sprites = new DynamicSprites(sakura);
    sakura.sprites.defineMany({
        smiling: { outfit: "Casual", mood: "Smiling" },
        happy: { outfit: "Casual", mood: "Happy" },
        shocked: { outfit: "Casual", mood: "Happy" }
    });

    sakura.sprites.preloadOutfits().catch((error) => {
        console.warn("[DynamicSprites] Failed to preload Sakura outfits:", error);
    });
}

const obj = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });

export {
    futon_room,
    apartment_ext,
    cherry_park,
    classroom,
    shrine,
    rainy_cafe,
    coastal_hill,
    apartment_stage,
    futon_stage,
    apartment_sky,
    apartment_mid,
    apartment_near,
    apartment_fore,
    futon_outside,
    futon_wall,
    futon_tatami,
    futon_door,
    mary,
    sakura,
    music,
    obj
};