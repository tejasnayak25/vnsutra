import { jest } from "@jest/globals";
import { registerAbortHandler, rejectWithAbortCleanup } from "../vnsutra_modules/abort-utils.js";

describe("Abort Utils", () => {
    it("invokes abort callback only once", () => {
        let registered = () => {};
        const setAbortInstruction = (handler) => {
            registered = handler;
        };

        let calls = 0;
        registerAbortHandler(setAbortInstruction, () => {
            calls += 1;
        });

        registered();
        registered();

        expect(calls).toBe(1);
    });

    it("clear function disables callback", () => {
        let registered = () => {};
        const setAbortInstruction = (handler) => {
            registered = handler;
        };

        let calls = 0;
        const clear = registerAbortHandler(setAbortInstruction, () => {
            calls += 1;
        });

        clear();
        registered();

        expect(calls).toBe(0);
    });

    it("returns no-op clear for invalid setter", () => {
        const clear = registerAbortHandler(null, () => {
            throw new Error("Should not run");
        });

        expect(typeof clear).toBe("function");
        clear();
    });

    it("applies prompt abort cleanup and rejects with message", () => {
        const cleanup = jest.fn();
        const closeAlert = jest.fn();
        const setInputFocused = jest.fn();
        const reject = jest.fn();

        rejectWithAbortCleanup({
            cleanup,
            closeAlert,
            setInputFocused,
            reject,
            errorMessage: "Input aborted"
        });

        expect(cleanup).toHaveBeenCalledTimes(1);
        expect(closeAlert).toHaveBeenCalledTimes(1);
        expect(setInputFocused).toHaveBeenCalledWith(false);
        expect(reject).toHaveBeenCalledWith(expect.objectContaining({ message: "Input aborted" }));
    });
});
