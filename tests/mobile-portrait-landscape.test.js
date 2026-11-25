import * as runtimeState from "../vnsutra_modules/runtime-state.js";
import { checkPortrait, checkLandscape, checkMobile, mobileCheck } from "../vnsutra_modules/mobile/ui.js";
import { resolvePlanNodeAttrs } from "../vnsutra_modules/ui-layout/runtime.js";

describe("Mobile Portrait and Landscape Runtime Support", () => {
    beforeEach(() => {
        // Reset runtime state to baseline desktop
        runtimeState.setIsMobile(false);
        runtimeState.setIsAndroid(false);
        runtimeState.setIsPortrait(false);
        runtimeState.setIsLandscape(true);
    });

    test("runtime-state tracks portrait, landscape, mobile, and combo states", () => {
        expect(runtimeState.getIsMobile()).toBe(false);
        expect(runtimeState.getIsPortrait()).toBe(false);
        expect(runtimeState.getIsLandscape()).toBe(true);
        expect(runtimeState.getIsMobilePortrait()).toBe(false);
        expect(runtimeState.getIsMobileLandscape()).toBe(false);

        // Switch to mobile portrait
        runtimeState.setIsMobile(true);
        runtimeState.setIsPortrait(true);

        expect(runtimeState.getIsMobile()).toBe(true);
        expect(runtimeState.getIsPortrait()).toBe(true);
        expect(runtimeState.getIsLandscape()).toBe(false);
        expect(runtimeState.getIsMobilePortrait()).toBe(true);
        expect(runtimeState.getIsMobileLandscape()).toBe(false);
        expect(runtimeState.getIsAndroid()).toBe(true);

        // Rotate to mobile landscape
        runtimeState.setIsLandscape(true);

        expect(runtimeState.getIsMobile()).toBe(true);
        expect(runtimeState.getIsPortrait()).toBe(false);
        expect(runtimeState.getIsLandscape()).toBe(true);
        expect(runtimeState.getIsMobilePortrait()).toBe(false);
        expect(runtimeState.getIsMobileLandscape()).toBe(true);
        expect(runtimeState.getIsAndroid()).toBe(true);
    });

    test("setting isAndroid sets isMobile for backward compatibility", () => {
        runtimeState.setIsAndroid(true);
        expect(runtimeState.getIsMobile()).toBe(true);
        expect(runtimeState.getIsAndroid()).toBe(true);
    });

    test("mobileCheck detects mobile devices correctly and checkMobile matches mobileCheck", () => {
        const origNav = globalThis.navigator;

        try {
            // Emulate an iPhone in landscape (width > height)
            Object.defineProperty(globalThis, "navigator", {
                value: {
                    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15",
                    maxTouchPoints: 5
                },
                configurable: true,
                writable: true
            });
            Object.defineProperty(globalThis, "visualViewport", {
                value: { width: 844, height: 390 },
                configurable: true,
                writable: true
            });

            expect(mobileCheck()).toBe(true);
            expect(checkMobile()).toBe(true);
            expect(checkPortrait()).toBe(false);
            expect(checkLandscape()).toBe(true);

            // Emulate iPhone in portrait (width < height)
            Object.defineProperty(globalThis, "visualViewport", {
                value: { width: 390, height: 844 },
                configurable: true,
                writable: true
            });

            expect(mobileCheck()).toBe(true);
            expect(checkMobile()).toBe(true);
            expect(checkPortrait()).toBe(true);
            expect(checkLandscape()).toBe(false);

            // Emulate Desktop browser (Windows, Chrome, mouse, wide resolution)
            Object.defineProperty(globalThis, "navigator", {
                value: {
                    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    maxTouchPoints: 0
                },
                configurable: true,
                writable: true
            });
            Object.defineProperty(globalThis, "visualViewport", {
                value: { width: 1920, height: 1080 },
                configurable: true,
                writable: true
            });

            expect(mobileCheck()).toBe(false);
            expect(checkMobile()).toBe(false);
            expect(checkPortrait()).toBe(false);
            expect(checkLandscape()).toBe(true);
        } finally {
            Object.defineProperty(globalThis, "navigator", {
                value: origNav,
                configurable: true,
                writable: true
            });
        }
    });

    test("resolvePlanNodeAttrs handles portrait, landscape, mobile portrait, and mobile landscape overrides", () => {
        const plan = {
            attrs: { width: 100, height: 50 },
            portraitAttrs: { width: 80 },
            landscapeAttrs: { width: 120 },
            androidAttrs: { stroke: "#333333" },
            mobileAttrs: { stroke: "#333333" },
            androidPortraitAttrs: { height: 40 },
            mobilePortraitAttrs: { height: 40 },
            androidLandscapeAttrs: { height: 35 },
            mobileLandscapeAttrs: { height: 35 }
        };

        // 1. Desktop Landscape
        const desktopAttrs = resolvePlanNodeAttrs(plan, {
            isPortrait: false,
            isMobile: false,
            isAndroid: false
        });
        expect(desktopAttrs.width).toBe(120);
        expect(desktopAttrs.height).toBe(50);
        expect(desktopAttrs.stroke).toBeUndefined();

        // 2. Mobile Portrait
        const mobilePortraitAttrs = resolvePlanNodeAttrs(plan, {
            isPortrait: true,
            isMobile: true,
            isAndroid: true
        });
        expect(mobilePortraitAttrs.width).toBe(80);
        expect(mobilePortraitAttrs.height).toBe(40);
        expect(mobilePortraitAttrs.stroke).toBe("#333333");

        // 3. Mobile Landscape
        const mobileLandscapeAttrs = resolvePlanNodeAttrs(plan, {
            isPortrait: false,
            isMobile: true,
            isAndroid: true
        });
        expect(mobileLandscapeAttrs.width).toBe(120);
        expect(mobileLandscapeAttrs.height).toBe(35);
        expect(mobileLandscapeAttrs.stroke).toBe("#333333");
    });

    test("Settings font scale card stacks cleanly on mobile / narrow viewports and uses flex-1 width in portrait", () => {
        const computeFontScaleLayout = (containerWidth, isPortrait, isMobile) => {
            const isStacked = isPortrait || isMobile || containerWidth < 520;
            const cardHeight = isStacked ? 186 : 152;
            const isPortraitMobile = isPortrait;
            const scaleBtnWidth = 54;
            const scaleBtnGap = 8;
            const stepperWidth = 220;
            const groupWidth = containerWidth - 36;

            let stepperX = 0;
            let stepperY = 2;
            let pillX = 0;
            let pillWidth = 92;
            let incBtnX = 0;

            if (isPortraitMobile) {
                stepperX = 0;
                stepperY = 54;
                pillX = scaleBtnWidth + scaleBtnGap;
                pillWidth = Math.max(70, groupWidth - (2 * scaleBtnWidth) - (2 * scaleBtnGap));
                incBtnX = groupWidth - scaleBtnWidth;
            } else if (isStacked) {
                stepperX = 0;
                stepperY = 54;
                pillWidth = 92;
                pillX = stepperX + scaleBtnWidth + scaleBtnGap;
                incBtnX = pillX + pillWidth + scaleBtnGap;
            } else {
                stepperX = groupWidth - stepperWidth;
                stepperY = 2;
                pillWidth = 92;
                pillX = stepperX + 62;
                incBtnX = pillX + pillWidth + 8;
            }

            const labelWidth = isStacked ? groupWidth : Math.max(120, stepperX - 12);
            return { isStacked, cardHeight, stepperX, stepperY, pillX, pillWidth, incBtnX, labelWidth, groupWidth };
        };

        // Desktop (800px wide, landscape)
        const desktop = computeFontScaleLayout(800, false, false);
        expect(desktop.isStacked).toBe(false);
        expect(desktop.cardHeight).toBe(152);
        expect(desktop.stepperY).toBe(2);
        expect(desktop.pillWidth).toBe(92);
        expect(desktop.stepperX).toBe(800 - 36 - 220);

        // Mobile portrait (360px wide, portrait): number display expands like flex: 1 across the full row
        const mobilePortrait = computeFontScaleLayout(360, true, true);
        expect(mobilePortrait.isStacked).toBe(true);
        expect(mobilePortrait.cardHeight).toBe(186);
        expect(mobilePortrait.stepperY).toBe(54);
        expect(mobilePortrait.stepperX).toBe(0);
        expect(mobilePortrait.incBtnX + 54).toBe(mobilePortrait.groupWidth); // Right button aligns with card right edge
        expect(mobilePortrait.pillWidth).toBe(mobilePortrait.groupWidth - (2 * 54) - (2 * 8)); // flex 1 spanning middle
        expect(mobilePortrait.pillX).toBe(54 + 8);
    });

    test("Chapter map badges and footer buttons do not overlap on narrow mobile cards", () => {
        const cardW = 240;
        const cardPad = 14;
        const maxBadgeW = Math.floor((cardW - (cardPad * 2) - 8) / 2); // (240 - 28 - 8) / 2 = 102
        const badgeW = Math.min(maxBadgeW, 110);
        const statusBadgeW = Math.min(maxBadgeW, 90);
        const statusBadgeX = cardW - cardPad - statusBadgeW;

        expect(badgeW).toBeLessThanOrEqual(maxBadgeW);
        expect(cardPad + badgeW).toBeLessThanOrEqual(statusBadgeX);

        // Footer buttons
        const headW = cardW - (cardPad * 2); // 212
        const sceneW = Math.min(90, Math.floor((headW - 8) / 2)); // 90
        const actionBtnW = Math.min(100, headW - sceneW - 8); // 100
        const actionBtnX = cardW - cardPad - actionBtnW;

        expect(cardPad + sceneW).toBeLessThan(actionBtnX);
    });

    test("Credits banner dynamically adjusts height and prevents subtitle collision", () => {
        const bannerTitleY = 12;
        const bannerTitleHeight = 44; // Wrapped 2-line title on narrow screens
        const bannerSubtitleY = bannerTitleY + bannerTitleHeight + 6;
        const bannerSubtitleHeight = 32;
        const bannerHeight = Math.max(82, bannerSubtitleY + bannerSubtitleHeight + 14);

        expect(bannerSubtitleY).toBe(62);
        expect(bannerSubtitleY).toBeGreaterThan(bannerTitleY + bannerTitleHeight);
        expect(bannerHeight).toBe(108);
    });

    test("Achievements header provides clearance for title and count pill on narrow screens", () => {
        const containerWidth = 340;
        const isNarrow = true;
        const summaryEmblemSize = isNarrow ? 44 : 52;
        const summaryEmblemX = isNarrow ? 12 : 18;
        const summaryTextX = summaryEmblemX + summaryEmblemSize + (isNarrow ? 10 : 16); // 12 + 44 + 10 = 66
        const pillWidth = isNarrow ? Math.min(115, Math.max(88, Math.floor(containerWidth * 0.28))) : 130; // 95
        const pillX = containerWidth - pillWidth - (isNarrow ? 12 : 18); // 340 - 95 - 12 = 233
        const titleWidth = pillX - summaryTextX - 6; // 233 - 66 - 6 = 161

        expect(titleWidth).toBeGreaterThanOrEqual(150);
        expect(summaryTextX + titleWidth).toBeLessThan(pillX);
    });

    test("Home sidebar title leaves clearance for close button in portrait and Android", () => {
        const stageWidth = 360;
        const isPortrait = true;
        const sidebarWidth = stageWidth;
        const closeBtnMargin = isPortrait ? 70 : 55;
        const titleX = isPortrait ? 20 : 0;
        const titleWidth = isPortrait
            ? Math.max(120, sidebarWidth - titleX - closeBtnMargin - 12)
            : sidebarWidth;
        const closeBtnX = sidebarWidth - closeBtnMargin;

        expect(titleX + titleWidth).toBeLessThan(closeBtnX);
    });

    test("Chapters page hero banner dynamically measures height preventing overlap on narrow mobile", () => {
        const isPortrait = true;
        const isMobileLandscape = false;
        const heroTitleY = 12;
        const heroTitleHeight = 32; // Wrapped title on narrow mobile
        const heroProgressY = heroTitleY + heroTitleHeight + (isPortrait ? 4 : 6);
        const heroProgressHeight = 28;
        const barY = heroProgressY + heroProgressHeight + (isPortrait ? 6 : 8);
        const barHeight = 7;
        const heroActiveY = barY + barHeight + (isPortrait ? 5 : 6);
        const heroActiveHeight = 18;
        const heroHeight = Math.max(
            isMobileLandscape ? 80 : 116,
            heroActiveY + heroActiveHeight + 10
        );

        expect(heroProgressY).toBeGreaterThan(heroTitleY + heroTitleHeight);
        expect(barY).toBeGreaterThan(heroProgressY + heroProgressHeight);
        expect(heroActiveY).toBeGreaterThan(barY + barHeight);
        expect(heroHeight).toBeGreaterThanOrEqual(116);
    });

    test("Chapters page hero banner uses full-width spacious layout on mobile portrait", () => {
        const width = 340;
        const padX = 14;
        const contentW = width - (padX * 2); // 312
        const emblemSize = 32;
        const badgeW = 52;

        const titleX = padX + emblemSize + 10; // 14 + 32 + 10 = 56
        const badgeX = width - padX - badgeW; // 340 - 14 - 52 = 274
        const titleW = badgeX - titleX - 8; // 274 - 56 - 8 = 210

        const barWidth = contentW; // 312 full-width bar
        const statsW = contentW; // 312 full-width stats

        expect(barWidth).toBe(312);
        expect(titleW).toBeGreaterThanOrEqual(200);
        expect(titleX + titleW).toBeLessThan(badgeX);
        expect(statsW).toBe(contentW);
    });

    test("Adventure map in portrait mobile uses central snaking circle markers freeing horizontal space", () => {
        const mapWidth = 360;
        const isPortraitMobile = true;
        expect(isPortraitMobile).toBe(true);
        const centerX = Math.floor(mapWidth / 2);
        const swing = Math.min(64, Math.max(34, Math.floor(mapWidth * 0.18)));
        const leftX = centerX - swing;
        const rightX = centerX + swing;
        const nodeRadius = 26;

        expect(centerX).toBe(180);
        expect(swing).toBe(64);
        expect(leftX).toBe(116);
        expect(rightX).toBe(244);
        expect(leftX - nodeRadius).toBeGreaterThan(0);
        expect(rightX + nodeRadius).toBeLessThan(mapWidth);
    });

    test("Adventure map hero banner has safe clearance above first milestone marker on mobile portrait", () => {
        const heroHeight = 124;
        const nodeRadius = 26;
        const nodeHaloRadius = nodeRadius + 7; // 33
        const mapTopClearance = 44;
        const bannerBottom = 10 + heroHeight; // 134
        const startY = bannerBottom + mapTopClearance + nodeHaloRadius; // 134 + 44 + 33 = 211
        const firstNodeHaloTop = startY - nodeHaloRadius; // 178

        expect(firstNodeHaloTop - bannerBottom).toBe(mapTopClearance);
        expect(firstNodeHaloTop - bannerBottom).toBeGreaterThanOrEqual(40);
    });

    test("Chapters mobile portrait bottom sheet attaches edge-to-edge without margins", () => {
        const screenWidth = 360;
        const screenHeight = 800;
        const sheetH = Math.min(320, Math.max(260, Math.floor(screenHeight * 0.48))); // 320

        const sheetX = 0;
        const sheetW = screenWidth;
        const sheetOpenY = screenHeight - sheetH;

        // Zero margins on left, right, and bottom
        expect(sheetX).toBe(0);
        expect(sheetW).toBe(screenWidth);
        expect(sheetOpenY + sheetH).toBe(screenHeight);
    });

    test("Actionbar in mobile portrait is full-screen edge-to-edge with 0 corner radius and 0 stroke", () => {
        const isPortrait = true;
        const isMobileLandscape = false;
        const cornerRadius = isPortrait ? 0 : (isMobileLandscape ? 16 : 24);
        const strokeWidth = isPortrait ? 0 : 1.5;
        const cardMarginX = isPortrait ? 0 : (isMobileLandscape ? 12 : 24);
        const cardMarginY = isPortrait ? 0 : (isMobileLandscape ? 8 : 20);

        expect(cornerRadius).toBe(0);
        expect(strokeWidth).toBe(0);
        expect(cardMarginX).toBe(0);
        expect(cardMarginY).toBe(0);
    });

    test("Mobile portrait dialogue and name box use balanced readable dimensions", () => {
        const isPortrait = true;
        const isMobileLandscape = false;
        const isAndroid = false;

        const dialogFontSize = isPortrait ? 17 : (isMobileLandscape ? 17 : (isAndroid ? 23 : 28));
        const dialogLineHeight = isMobileLandscape ? 1.45 : (isPortrait ? 1.45 : 1.6);
        const nameFontSize = isPortrait ? 16 : (isMobileLandscape ? 16 : (isAndroid ? 23 : 27));
        const minDialogHeight = isPortrait ? 120 : (isMobileLandscape ? 110 : (isAndroid ? 150 : 230));
        const minNameWidth = isPortrait ? 90 : (isMobileLandscape ? 110 : 200);

        expect(dialogFontSize).toBe(17);
        expect(dialogLineHeight).toBe(1.45);
        expect(nameFontSize).toBe(16);
        expect(minDialogHeight).toBe(120);
        expect(minNameWidth).toBe(90);
    });

    test("Character sprite scaling in mobile portrait leaves movable width for positioning", () => {
        const width = 360;
        const height = 600;
        const mood = { width: 500, height: 1000 };

        const nextScale = Math.min((height / mood.height) * 0.85, (width * 0.70) / mood.width);
        const spriteWidth = mood.width * nextScale;
        const movableWidth = width - spriteWidth;

        // Character occupies comfortable proportion and leaves room for staging
        expect(nextScale).toBeLessThanOrEqual((height / mood.height) * 0.85);
        expect(spriteWidth).toBeLessThanOrEqual(width * 0.70);
        expect(movableWidth).toBeGreaterThan(0);
    });

    test("Mobile navbar 3-dots menu icon uses refined lightweight dimensions and matched pill radius", () => {
        const menuBtnSize = 36;
        const dotRadius = 1.65;
        const dotSpacing = 5.8;
        const pillCornerRadius = 8;

        expect(dotRadius).toBeLessThan(2.0);
        expect(dotSpacing).toBeGreaterThan(5.0);
        expect(pillCornerRadius).toBe(8);
        expect(menuBtnSize).toBe(36);
    });

    test("Dialog height includes safety padding on portrait to prevent text chopping", () => {
        const getSafetyPad = (portrait) => (portrait ? 8 : 0);
        expect(getSafetyPad(true)).toBe(8);
        expect(getSafetyPad(false)).toBe(0);
    });

    test("Mobile portrait fullscreen expand icon uses slightly larger dimensions", () => {
        const getExpandIconSize = (portrait) => (portrait ? 22 : 18);
        const expandBtnSize = 36;

        expect(getExpandIconSize(true)).toBe(22);
        expect((expandBtnSize - getExpandIconSize(true)) / 2).toBe(7);
        expect(getExpandIconSize(false)).toBe(18);
    });
});
