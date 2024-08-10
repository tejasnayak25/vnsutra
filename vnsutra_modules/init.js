let loadwin = document.getElementById("loadwin"),
loadimg = loadwin.querySelector("#loadimg"),
loadtitle = loadwin.querySelector("#loadtitle"),
loadstatus = loadwin.querySelector("#loadstatus"),
loadspin = loadwin.querySelector("#loadspin");

(async () => {
    if ('wakeLock' in navigator && 'request' in navigator.wakeLock) {
        let wakeLock = null;
        const requestWakeLock = async () => {
          wakeLock = await navigator.wakeLock.request('screen');
          wakeLock.addEventListener('release', () => {
            console.log('Wake Lock was released');
          });
          console.log('Wake Lock is active');
        };
        
        const handleVisibilityChange = () => {
          if (wakeLock !== null && document.visibilityState === 'visible') {
            requestWakeLock();
          }
        };
        
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('fullscreenchange', handleVisibilityChange);
    }

    let devMode = false;

    let params = new URLSearchParams(location.search);

    if(params.has("dev")) {
        devMode = true;
    }
    
    let displayMode = 'browser tab';
    if (window.matchMedia('(display-mode: standalone)').matches) {
        displayMode = 'standalone';
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
            if(!installed && !devMode) {
                location.href = `${location.origin}/install/`;
            }
        }

        if(!devMode) document.getElementById("restartWindow").classList.replace("hidden", "flex");
    }

    window.addEventListener("data-loaded", () => {
        loadstatus.innerText = "Click To Start";
        loadspin.classList.add("hidden");
        document.onclick = () => {
            document.documentElement.requestFullscreen();
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent("game-resize"));
            }, 250);
            document.onclick = () => {};
        }
    });
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

    let story_module = await import("../game/story.js");
    let story = story_module.story;

    window.dispatchEvent(new CustomEvent("data-loaded"));

    let pages = {};

    window.addEventListener("orientationchange", (e) => {
        e.preventDefault();

        if(activeLayer === "home") {
            window.location.reload();
        } else {
            alertWin.message = "Reload page? You may lose your progress!";
            proceedBtn.innerText = "Reload";
            proceedBtn.onclick = () => {
                alertWin.close();
                window.location.reload();
            }
            alertWin.show();
        }
    });

    window.addEventListener("game-resize", async (e) => {
        let docRect = document.body.getBoundingClientRect();
        konvaStage.width(docRect.width);
        konvaStage.height(docRect.height);

        isMobile = checkMobile();

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
                game.ui.game.end.visible(false);
                if(data.scene) {
                    activeScene = data.scene;
                } else {
                    activeScene = "start"; 
                }
                story[activeScene]();
            } }
        };

        game = new Game(pages.game.ui);

        setTimeout(() => {
            navigate(activeLayer, { scene: activeScene ?? null });
            if(!loadwin.classList.contains("hidden")) {
                loadwin.classList.add("hidden");
            }
        }, 100);

        window.dispatchEvent(new CustomEvent("game-ui-ready"));
    });

    window.addEventListener("load-game", (e) => {
        let name = e.detail.scene;
        game.ui.game.end.visible(false);
        activeScene = name;
        story[activeScene]();
    });

    function navigate(name, data) {
        if(pages[name]) {
            konvaStage.removeChildren();
            konvaStage.add(pages[name].ui.layer);
            pages[name].func(data);
            activeLayer = name;
        }
    }
})();