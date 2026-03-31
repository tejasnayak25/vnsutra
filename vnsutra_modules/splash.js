function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function playSplashSequence({ config, loadwin, loadspin, loadstatus }) {
    const splashConfig = config?.ui?.splash ?? {};

    const splashLayer = document.getElementById("splash-layer");
    const splashLogo = document.getElementById("splash-logo");
    const splashLabel = document.getElementById("splash-label");

    if (splashConfig.enabled === false) {
        splashLayer?.classList?.add("hidden");
        return;
    }

    if (!loadwin || !loadspin || !loadstatus) {
        splashLayer?.classList?.add("hidden");
        return;
    }

    if (!splashLayer || !splashLogo || !splashLabel) {
        return;
    }

    const logos = Array.isArray(splashConfig.logos) && splashConfig.logos.length > 0
        ? splashConfig.logos
        : [
            {
                src: splashConfig.creatorLogo ?? config.icon,
                label: splashConfig.creatorLabel ?? (config.author ? `${config.author}` : "Creator")
            },
            {
                src: splashConfig.engineLogo ?? config.icon,
                label: splashConfig.engineLabel ?? (config.title || "VN-Sutra")
            }
        ];

    const totalDuration = Number.isFinite(splashConfig.durationMs) ? splashConfig.durationMs : 4000;
    const perLogoDuration = Math.max(1400, Math.floor(totalDuration / Math.max(1, logos.length)));
    const fadeInDuration = Math.floor(perLogoDuration * 0.25);
    const holdDuration = Math.floor(perLogoDuration * 0.5);
    const fadeOutDuration = Math.floor(perLogoDuration * 0.25);

    splashLayer.classList.remove("hidden");
    splashLogo.style.opacity = "0";
    splashLabel.style.opacity = "0";
    splashLogo.style.transition = `opacity ${fadeInDuration}ms ease`;
    splashLabel.style.transition = `opacity ${fadeInDuration}ms ease`;

    loadspin.classList.add("hidden");
    loadstatus.classList.add("hidden");

    for (const item of logos) {
        splashLogo.src = item?.src ?? config.icon;
        splashLabel.textContent = item?.label ?? "";

        splashLogo.style.transition = `opacity ${fadeInDuration}ms ease`;
        splashLabel.style.transition = `opacity ${fadeInDuration}ms ease`;
        await nextFrame();
        splashLogo.style.opacity = "1";
        splashLabel.style.opacity = "1";

        await sleep(fadeInDuration + holdDuration);

        splashLogo.style.transition = `opacity ${fadeOutDuration}ms ease`;
        splashLabel.style.transition = `opacity ${fadeOutDuration}ms ease`;
        splashLogo.style.opacity = "0";
        splashLabel.style.opacity = "0";

        await sleep(fadeOutDuration);
    }

    splashLayer.classList.add("hidden");
}

export default playSplashSequence;
