import { jest } from "@jest/globals";
import { KeyboardControls, isTextInputTarget } from "../vnsutra_modules/keyboard.js";
import { setActiveLayer } from "../vnsutra_modules/runtime-state.js";

describe("Input & Advance Resilience", () => {
    describe("isTextInputTarget", () => {
        it("returns true for actual text entry elements", () => {
            expect(isTextInputTarget({ tagName: "TEXTAREA" })).toBe(true);
            expect(isTextInputTarget({ isContentEditable: true })).toBe(true);
            expect(isTextInputTarget({ tagName: "INPUT", type: "text" })).toBe(true);
            expect(isTextInputTarget({ tagName: "INPUT", type: "password" })).toBe(true);
            expect(isTextInputTarget({ tagName: "INPUT", type: "email" })).toBe(true);
            expect(isTextInputTarget({ tagName: "INPUT", type: "number" })).toBe(true);
            expect(isTextInputTarget({ tagName: "INPUT", type: "search" })).toBe(true);
        });

        it("returns false for non-text inputs such as volume range sliders and buttons", () => {
            expect(isTextInputTarget(null)).toBe(false);
            expect(isTextInputTarget(undefined)).toBe(false);
            expect(isTextInputTarget({ tagName: "INPUT", type: "range" })).toBe(false);
            expect(isTextInputTarget({ tagName: "INPUT", type: "checkbox" })).toBe(false);
            expect(isTextInputTarget({ tagName: "INPUT", type: "radio" })).toBe(false);
            expect(isTextInputTarget({ tagName: "BUTTON" })).toBe(false);
            expect(isTextInputTarget({ tagName: "DIV" })).toBe(false);
        });
    });

    describe("KeyboardControls with volume and range controls", () => {
        let controls;
        let originalDocument;
        let originalWindow;

        beforeEach(() => {
            originalDocument = global.document;
            originalWindow = global.window;
            setActiveLayer("game");
            controls = new KeyboardControls();
        });

        afterEach(() => {
            global.document = originalDocument;
            global.window = originalWindow;
        });

        it("does not drop Enter when focused element is an input type=range (volume slider)", () => {
            const blurSpy = jest.fn();
            const bodyDispatchSpy = jest.fn();
            const windowDispatchSpy = jest.fn();

            const mockRangeSlider = {
                tagName: "INPUT",
                type: "range",
                blur: blurSpy
            };

            global.document = {
                body: {
                    dispatchEvent: bodyDispatchSpy
                },
                activeElement: mockRangeSlider
            };

            global.window = {
                dispatchEvent: windowDispatchSpy
            };

            const preventDefaultSpy = jest.fn();
            const event = {
                key: "Enter",
                target: mockRangeSlider,
                preventDefault: preventDefaultSpy
            };

            controls.handleKeydown(event);

            expect(preventDefaultSpy).toHaveBeenCalled();
            expect(blurSpy).toHaveBeenCalled();
            expect(bodyDispatchSpy).toHaveBeenCalledTimes(1);
            expect(bodyDispatchSpy.mock.calls[0][0].key).toBe("Enter");
            expect(bodyDispatchSpy.mock.calls[0][0]._synthetic).toBe(true);
            expect(windowDispatchSpy).toHaveBeenCalledTimes(1);
        });

        it("correctly ignores Enter when focused element is a text input", () => {
            const bodyDispatchSpy = jest.fn();

            const mockTextInput = {
                tagName: "INPUT",
                type: "text",
                blur: jest.fn()
            };

            global.document = {
                body: {
                    dispatchEvent: bodyDispatchSpy
                },
                activeElement: mockTextInput
            };

            const preventDefaultSpy = jest.fn();
            const event = {
                key: "Enter",
                target: mockTextInput,
                preventDefault: preventDefaultSpy
            };

            controls.handleKeydown(event);

            expect(preventDefaultSpy).not.toHaveBeenCalled();
            expect(bodyDispatchSpy).not.toHaveBeenCalled();
        });
    });
});
