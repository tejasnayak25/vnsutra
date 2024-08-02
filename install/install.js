loadJSON("../game/config.json").then(async (CONFIG) => {
    document.title = CONFIG.title;

    document.getElementById("icon").href = "../" + CONFIG.icon;
    document.getElementById("game-logo").src = "../" + CONFIG.icon;
    document.getElementById("game-title").innerText = CONFIG.title;
    document.getElementById("game-author").innerText = CONFIG.author;
    document.getElementById("game-author-email").href = `mailto:${CONFIG['author-email']}`;
    document.getElementById("game-about-url").href = CONFIG['about-url'];
    document.getElementById("game-support-url").href = CONFIG['support-url'];
    document.getElementById("game-description").innerText = CONFIG.description;
    document.getElementById("install-btn").style.backgroundColor = CONFIG.colors.primary;
    document.getElementById("install-btn").style.color = CONFIG.colors['primary-text'];

    let shareData = {
        url: `${location.origin}/install`,
        text: CONFIG.description,
        title: CONFIG.title
    };

    document.getElementById("share-btn").onclick = () => {
        if(navigator.canShare(shareData)) {
            navigator.share(shareData);
        }
    }

    let installed = false;
    window.onappinstalled = () => {
        installed = true;
        document.getElementById("restartWindow").classList.replace("hidden", "flex");
    }

    window.onbeforeinstallprompt = (e) => {
        e.preventDefault();
        if(!installed) {
            document.getElementById("install-btn").onclick = async () => {
                const result = await e.prompt();
                console.log(`Install prompt was: ${result.outcome}`);
            }
        }
    }

    let related_apps = await navigator.getInstalledRelatedApps();

    if(related_apps.length > 0) {
        document.getElementById("install-btn").innerText = "Open App";
        document.getElementById("install-btn").onclick = () => {
            window.open(`web+${CONFIG['project-name']}://open`, "_blank");
        }
    }

    let fonts = await loadFonts(CONFIG.fonts, "../");

    document.body.style.fontFamily = fonts['other'];

    document.body.style.backgroundImage = `url(../${CONFIG.poster})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundRepeat = "no-repeat";

    let sstext = "";
    if(CONFIG.screenshots.length > 0) {
        for (const screenshot of CONFIG.screenshots) {
            sstext += `<img src="../${screenshot}" class=" aspect-video rounded-md lg:h-64 md:h-64 h-36" alt="Screenshot">`;
        }
        document.getElementById("screenshots").innerHTML = sstext;
    } else {
        document.getElementById("screenshots").innerHTML = "<p class='text-xl'>No screenshots available!</p>"
    }
});