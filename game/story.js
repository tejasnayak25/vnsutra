import { futon_room, apartment_ext, mary, music, obj } from "./assets.js";
import { dialog, next, input, choice, storage, end } from "../vnsutra_modules/game-utils.js";

export const story = {
    start: async function () {
        game.background.reset();
        mary.reset(["scale"]);
        game.background = futon_room;
        mary.outfit = mary.outfits['Casual'];
        mary.mood = "Rin_Casual_Smile";
        mary.x = -0.25;
        await mary.slideIn(0.5, 1);
        await dialog(mary, "Hello, developer!");
        await dialog(mary, "I have been tasked with introducing VN-Sutra to you");
        await dialog(mary, "Before we get started, how about we introduce ourselves?");
        let name = await input("What's your name?", "Peanut");
        storage.setItem("name", name);
        if(name === "Peanut") {
            await mary.to({mood: "Rin_Casual_OpenSmile_EyesClosed"});
            await dialog(mary, "No way, you seriously went with my suggestion");
        } else {
            await dialog(mary, `Hello, ${name}. Nice to meet you!`);
        }
        await mary.to({mood: "Rin_Casual_OpenSmile"});
        await dialog(mary, "Anyway, my name is Mary.");
        await dialog(mary, "So, do you know what is VN-Sutra?");
        let que1 = await choice("What do you think is VN-Sutra?", ["Cookie", "SDK for Visual Novels"]);
        if(que1 === "Cookie") {
            await dialog(mary, "Of course, not. It's a SDK for visual novels.");
        } else {
            await dialog(mary, "Yes, you are correct");
        }
        await dialog(mary, "So, what can you do with VN-Sutra?");
        next(this.scene2);
    },
    scene2: async function () {
        game.background.reset();
        mary.reset(["scale"]);
        game.background = apartment_ext;
    
        mary.outfit = mary.outfits['Casual'];
        mary.mood = "Rin_Casual_OpenSmile";

        mary.x = 0.5;

        mary.show();

        await dialog(mary, "You can make scenes like these");
        await dialog(mary, "You can add backgrounds, characters, images, music, sound effects, and more");
        await dialog(mary, "What else can you do?");
        mary.grayscale = true;
        await dialog(mary, "You can make me go black and white!");
        mary.grayscale = false;
        await dialog(mary, "Not just me, you can even make the background into grayscale");
        game.background.grayscale = true;
        await dialog(mary, "Cool, isn't it?");
        game.background.grayscale = false;
        await dialog(mary, "That's not all, there are many more filters that you cann add.");
        await dialog(mary, "Since this is a basic game, I won't be going into depth.");
        await dialog(mary, "However, you can check the documentation for more details.");
        await dialog(mary, "Have fun developing your game.");
        let name = await storage.getItem("name");
        await dialog(mary, `Bye, ${name}`);
        await mary.slideOut();
        end();
    }
}