import { compileUiLayout } from "../scripts/ui-layout-compiler.js";

describe("ui-layout compiler", () => {
    test("maps css properties and compiles dynamic units", () => {
        const xmlSource = [
            "<view id=\"root\">",
            "    <rect id=\"panel\" class=\"menu\" />",
            "</view>"
        ].join("\n");

        const cssSource = [
            "#root { width: 100%; height: 100%; }",
            ".menu { x: 10%; y: calc(12px + 1vh); width: 30%; height: 100%; background-color: #101418; opacity: 0.8; }"
        ].join("\n");

        const plan = compileUiLayout({
            screen: "home",
            xmlSource,
            cssSource
        });

        expect(plan.engineVersion).toBe("0.1.0");
        expect(plan.screen).toBe("home");
        expect(plan.nodes).toHaveLength(2);

        const panelNode = plan.nodes.find((node) => node.id === "panel");
        expect(panelNode).toBeDefined();
        expect(panelNode.attrs.fill).toBe("#101418");
        expect(panelNode.attrs.opacity).toBe(0.8);
        expect(panelNode.dynamic.width).toEqual({ kind: "percent", value: 30, base: "parentWidth" });
        expect(panelNode.dynamic.height).toEqual({ kind: "percent", value: 100, base: "parentHeight" });
        expect(panelNode.dynamic.x).toEqual({ kind: "percent", value: 10, base: "parentWidth" });
        expect(panelNode.dynamic.y).toEqual({
            kind: "calc",
            op: "+",
            left: { kind: "static", value: 12 },
            right: { kind: "viewport", axis: "height", value: 1 }
        });
    });

    test("throws on unsupported css property in strict mode", () => {
        const xmlSource = "<view id=\"root\" />";
        const cssSource = "#root { transform: scale(1.2); }";

        expect(() => compileUiLayout({
            screen: "home",
            xmlSource,
            cssSource
        })).toThrow("Unsupported CSS property");
    });

    test("@portrait block compiles into portraitAttrs/portraitDynamic", () => {
        const xmlSource = [
            "<view id=\"root\">",
            "    <rect id=\"sidebar\" class=\"sidebar\" />",
            "</view>"
        ].join("\n");

        const cssSource = [
            "#root { width: 100%; height: 100%; }",
            ".sidebar { width: 25%; height: 100%; }",
            "@portrait {",
            "    .sidebar { visible: false; width: 0px; }",
            "}"
        ].join("\n");

        const plan = compileUiLayout({ screen: "home", xmlSource, cssSource });
        const sidebar = plan.nodes.find((node) => node.id === "sidebar");

        expect(sidebar).toBeDefined();
        expect(sidebar.dynamic.width).toEqual({ kind: "percent", value: 25, base: "parentWidth" });
        expect(sidebar.portraitAttrs).toBeDefined();
        expect(sidebar.portraitAttrs.visible).toBe(false);
        expect(sidebar.portraitAttrs.width).toBe(0);
        expect(sidebar.landscapeAttrs).toBeUndefined();
    });

    test("@landscape block compiles into landscapeAttrs", () => {
        const xmlSource = "<view id=\"root\" class=\"main\" />";
        const cssSource = [
            ".main { width: 100%; height: 100%; }",
            "@landscape {",
            "    .main { opacity: 0.95; }",
            "}"
        ].join("\n");

        const plan = compileUiLayout({ screen: "home", xmlSource, cssSource });
        const root = plan.nodes[0];

        expect(root.landscapeAttrs).toBeDefined();
        expect(root.landscapeAttrs.opacity).toBe(0.95);
        expect(root.portraitAttrs).toBeUndefined();
    });

    test("@android-landscape block compiles into androidLandscapeAttrs", () => {
        const xmlSource = "<view id=\"root\" class=\"main\" />";
        const cssSource = [
            ".main { width: 100%; height: 100%; }",
            "@android-landscape {",
            "    .main { opacity: 0.77; }",
            "}"
        ].join("\n");

        const plan = compileUiLayout({ screen: "home", xmlSource, cssSource });
        const root = plan.nodes[0];

        expect(root.androidLandscapeAttrs).toBeDefined();
        expect(root.androidLandscapeAttrs.opacity).toBe(0.77);
    });

    test("coerces px literals for static text attrs like padding", () => {
        const xmlSource = "<text id=\"title\" />";
        const cssSource = "#title { padding: 60px; wrap: word; }";

        const plan = compileUiLayout({ screen: "home", xmlSource, cssSource });
        const title = plan.nodes[0];

        expect(title.attrs.padding).toBe(60);
        expect(typeof title.attrs.padding).toBe("number");
        expect(title.attrs.wrap).toBe("word");
    });

    test("supports declarative src on image nodes", () => {
        const xmlSource = [
            "<view id=\"root\">",
            "    <image id=\"logo\" class=\"logo\" />",
            "</view>"
        ].join("\n");

        const cssSource = ".logo { src: \"./assets/images/logo.png\"; width: 120px; height: 80px; }";

        const plan = compileUiLayout({ screen: "home", xmlSource, cssSource });
        const logo = plan.nodes.find((node) => node.id === "logo");

        expect(logo).toBeDefined();
        expect(logo.attrs.src).toBe("./assets/images/logo.png");
        expect(logo.attrs.width).toBe(120);
        expect(logo.attrs.height).toBe(80);
    });
});
