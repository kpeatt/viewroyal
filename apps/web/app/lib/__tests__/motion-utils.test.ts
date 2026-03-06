import { describe, it, expect } from "vitest";
import { normalizeMotionResult, type MotionOutcome } from "../motion-utils";

describe("normalizeMotionResult", () => {
  describe("passed outcomes", () => {
    it.each([
      ["CARRIED", "passed"],
      ["CARRIED AS AMENDED", "passed"],
      ["AMENDED", "passed"],
      ["CARRRIED", "passed"], // typo safety net
    ] as const)('maps "%s" to "%s"', (input, expected) => {
      expect(normalizeMotionResult(input)).toBe(expected);
    });
  });

  describe("failed outcomes", () => {
    it.each([
      ["DEFEATED", "failed"],
      ["FAILED", "failed"],
      ["FAILED FOR LACK OF A SECONDER", "failed"],
      ["FAILED FOR LACK OF SECONDER", "failed"],
      ["NOT CARRIED", "failed"],
    ] as const)('maps "%s" to "%s"', (input, expected) => {
      expect(normalizeMotionResult(input)).toBe(expected);
    });
  });

  describe("tabled outcomes", () => {
    it('maps "TABLED" to "tabled"', () => {
      expect(normalizeMotionResult("TABLED")).toBe("tabled");
    });
  });

  describe("withdrawn outcomes", () => {
    it('maps "WITHDRAWN" to "withdrawn"', () => {
      expect(normalizeMotionResult("WITHDRAWN")).toBe("withdrawn");
    });
  });

  describe("null/undefined/unknown handling", () => {
    it("returns null for null input", () => {
      expect(normalizeMotionResult(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(normalizeMotionResult(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(normalizeMotionResult("")).toBeNull();
    });

    it("returns null for unknown values", () => {
      expect(normalizeMotionResult("UNKNOWN VALUE")).toBeNull();
    });
  });

  describe("case insensitivity", () => {
    it("handles lowercase input", () => {
      expect(normalizeMotionResult("carried")).toBe("passed");
    });

    it("handles mixed case input", () => {
      expect(normalizeMotionResult("Carried")).toBe("passed");
    });

    it("handles mixed case defeated", () => {
      expect(normalizeMotionResult("defeated")).toBe("failed");
    });
  });

  describe("whitespace trimming", () => {
    it("trims leading and trailing whitespace", () => {
      expect(normalizeMotionResult("  CARRIED  ")).toBe("passed");
    });

    it("trims whitespace from defeated", () => {
      expect(normalizeMotionResult(" DEFEATED ")).toBe("failed");
    });
  });
});
