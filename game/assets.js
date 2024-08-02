import { Background, Character, IMG, Music, Sfx } from "../vnsutra_modules/asset-utils.js";

let futon_room = new Background("backgrounds/Noraneko_Background_Pack_1/Futon_Room.png");
let apartment_ext = new Background("backgrounds/Noraneko_Background_Pack_1/Apartment_Exterior.png");

let mary = new Character({
    name: "Mary",
    folder: "characters/Rin",
    scale: isMobile ? 0.5 : 1.5
});

let music = new Music("../assets/music/bgm.mp3");

mary.loadOutfit("Casual");

let obj = new IMG({ src: "../assets/images/logo.png", scale: 0.5 });

export { futon_room, apartment_ext, mary, music, obj };