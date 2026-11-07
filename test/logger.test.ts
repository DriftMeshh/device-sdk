import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/logger.js";

describe("createLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("text format", () => {
    it("formats info with fields as key=value pairs", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      createLogger("text").info("reading", { epoch: 3, value: 2500, accepted: true });
      expect(spy).toHaveBeenCalledWith("[device-sdk] reading epoch=3 value=2500 accepted=true");
    });

    it("formats info with no fields without a trailing space", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      createLogger("text").info("startup");
      expect(spy).toHaveBeenCalledWith("[device-sdk] startup");
    });

    it("prefixes warn with WARNING", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createLogger("text").warn("region_code_mismatch", { detail: "drift" });
      expect(spy).toHaveBeenCalledWith("[device-sdk] WARNING: region_code_mismatch detail=drift");
    });

    it("prefixes error with ERROR", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      createLogger("text").error("submit_failed", { error: "boom" });
      expect(spy).toHaveBeenCalledWith("[device-sdk] ERROR: submit_failed error=boom");
    });
  });

  describe("json format", () => {
    it("emits info as a JSON object with level and event", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      createLogger("json").info("reading", { epoch: 3, accepted: true });
      const printed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(printed).toEqual({ level: "info", event: "reading", epoch: 3, accepted: true });
    });

    it("emits warn with level warn via console.warn", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      createLogger("json").warn("region_code_mismatch", { detail: "drift" });
      const printed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(printed).toEqual({ level: "warn", event: "region_code_mismatch", detail: "drift" });
    });

    it("emits error with level error via console.error", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      createLogger("json").error("submit_failed", { error: "boom" });
      const printed = JSON.parse(spy.mock.calls[0][0] as string);
      expect(printed).toEqual({ level: "error", event: "submit_failed", error: "boom" });
    });

    it("produces valid JSON with no fields", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      createLogger("json").info("startup");
      expect(JSON.parse(spy.mock.calls[0][0] as string)).toEqual({ level: "info", event: "startup" });
    });
  });
});
