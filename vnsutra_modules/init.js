import { story } from "../game/story.js";

let loadwin = document.getElementById("loadwin"),
loadimg = loadwin.querySelector("#loadimg"),
loadtitle = loadwin.querySelector("#loadtitle"),
loadstatus = loadwin.querySelector("#loadstatus"),
loadspin = loadwin.querySelector("#loadspin");

(async () => {
    window.onload = () => {
        loadstatus.innerText = "Click To Start";
        loadspin.classList.add("hidden");
        document.onclick = () => {
            document.documentElement.requestFullscreen();
            document.onclick = () => {};
        }
    }
    let CONFIG = await loadJSON("../game/config.json");
    configuration = CONFIG;

    loadimg.src = CONFIG.poster;

    loadtitle.innerText = CONFIG.title;
    loadtitle.style.color = CONFIG.colors.text;
    loadstatus.style.color = CONFIG.colors.text;

    document.title = CONFIG.title;

    document.getElementById("icon").href = CONFIG.icon;

    let fonts = await loadFonts(CONFIG.fonts);

    loadtitle.style.fontFamily = fonts['title'];
    loadstatus.style.fontFamily = fonts['other'];

    let displayMode = 'browser tab';
    if (window.matchMedia('(display-mode: standalone)').matches) {
        displayMode = 'standalone';
    }

    let closeBtn = document.createElement("button");
    closeBtn.innerText = "Cancel";
    closeBtn.className = "btn btn-outline hover:bg-inherit";
    closeBtn.style.borderColor = CONFIG.colors.text;
    closeBtn.style.color = CONFIG.colors.text;
    closeBtn.onclick = () => {
        document.getElementById("alert-win").classList.replace("flex", "hidden");
    }
        
    let proceedBtn = document.createElement("button");
    proceedBtn.innerText = "Reload";
    proceedBtn.className = "btn hover:bg-inherit border-0";
    proceedBtn.style.backgroundColor = CONFIG.colors.primary;
    proceedBtn.style.color = CONFIG.colors['primary-text'];
        
    let alertWin = new AlertWindow("Change orientation?", [ closeBtn, proceedBtn ], CONFIG);
    alertWin.color = CONFIG.colors.primary;

    window.addEventListener("vnsutra-update", () => {
        alertWin.message = "An update is available!";

        proceedBtn.innerText = "Update";

        proceedBtn.onclick = () => {
            alertWin.close();
            location.reload();
        }

        alertWin.show();
    });

    let music = document.getElementById("music");
    music.src = CONFIG.bgm;

    let pages = {
        home: { ui: await home(CONFIG, fonts, navigate), func: (data) => {
            music.pause();
            document.getElementById("sfx").pause();
            if(gameSettings['settings-music'] === true) {
                music.src = CONFIG.bgm;
                music.onloadedmetadata = () => {
                    bgm();
                }
            }
        } },
        game: { ui: await gameUI(CONFIG, fonts, navigate), func: (data) => {
            music.pause();
            music.src = "";
            if(data.scene) {
                activeScene = data.scene;
            } else {
                activeScene = "start"; 
            }
            story[activeScene]();
        } }
    };

    game = new Game(pages.game.ui);

    window.addEventListener("orientationchange", (e) => {
        e.preventDefault();

        window.dispatchEvent(new CustomEvent("resize"));
    });

    window.addEventListener("resize", async (e) => {
        if(!isTyping) {
            let docRect = document.documentElement.getBoundingClientRect();
            konvaStage.width(docRect.width);
            konvaStage.height(docRect.height);
    
            isMobile = checkMobile();
    
            pages.home.ui.layer.destroy();
            pages.game.ui.layer.destroy();
    
            pages = {
                home: { ui: await home(CONFIG, fonts, navigate), func: (data) => {
                    music.pause();
                    document.getElementById("sfx").pause();
                    if(gameSettings['settings-music'] === true) {
                        music.src = CONFIG.bgm;
                        music.onloadedmetadata = () => {
                            bgm();
                        }
                    }
                } },
                game: { ui: await gameUI(CONFIG, fonts, navigate), func: (data) => {
                    music.pause();
                    music.src = "";
                    if(data.scene) {
                        activeScene = data.scene;
                    } else {
                        activeScene = "start"; 
                    }
                    story[activeScene]();
                } }
            };
    
            game.ui = pages.game.ui;
    
            setTimeout(() => {
                navigate(activeLayer, { scene: activeScene ?? null });
                if(!loadwin.classList.contains("hidden")) {
                    loadwin.classList.add("hidden");
                }
            }, 100);
        }
    });

    window.addEventListener("load-game", (e) => {
        let name = e.detail.scene;
        activeScene = name;
        story[activeScene]();
    });

    window.dispatchEvent(new CustomEvent("game-ui-ready"));

    function navigate(name, data) {
        if(pages[name]) {
            konvaStage.removeChildren();
            konvaStage.add(pages[name].ui.layer);
            pages[name].func(data);
            activeLayer = name;
        }
    }

    if(displayMode === "standalone") {
        exitApp = () => {
            window.close();
        }
    } else {
        let installed = false;
        window.onappinstalled = () => {
            installed = true;
        }

        window.onbeforeinstallprompt = (e) => {
            e.preventDefault();
            if(!installed) {
                location.href = `${location.origin}/install/`;
            }
        }
    }
})();