import { describe, it, expect } from "vitest";
import { classifyIntent } from "~/lib/intent";
import type { QueryIntent } from "~/lib/intent";

describe("classifyIntent", () => {
  describe("question mark detection", () => {
    it("classifies query ending with ? as question", () => {
      expect(classifyIntent("parking?")).toBe("question");
    });

    it("classifies multi-word query ending with ? as question", () => {
      expect(classifyIntent("what about trees?")).toBe("question");
    });

    it("classifies short query ending with ? as question", () => {
      expect(classifyIntent("why?")).toBe("question");
    });
  });

  describe("question starter words", () => {
    const singleWordStarters = [
      "who",
      "what",
      "when",
      "where",
      "why",
      "how",
      "is",
      "are",
      "was",
      "were",
      "do",
      "does",
      "did",
      "can",
      "could",
      "will",
      "would",
      "should",
      "has",
      "have",
    ];

    for (const starter of singleWordStarters) {
      it(`classifies "${starter} ..." as question`, () => {
        expect(classifyIntent(`${starter} council decide on housing`)).toBe(
          "question",
        );
      });
    }
  });

  describe("multi-word starters", () => {
    it('classifies "tell me about housing" as question', () => {
      expect(classifyIntent("tell me about housing")).toBe("question");
    });

    it('classifies "explain the tree bylaw" as question', () => {
      expect(classifyIntent("explain the tree bylaw")).toBe("question");
    });

    it('classifies "describe the rezoning proposal" as question', () => {
      expect(classifyIntent("describe the rezoning proposal")).toBe("question");
    });

    it('classifies "compare councillor positions" as question', () => {
      expect(classifyIntent("compare councillor positions")).toBe("question");
    });

    it('classifies bare "tell me" as question', () => {
      expect(classifyIntent("tell me")).toBe("question");
    });
  });

  describe("short keyword queries (1-3 words)", () => {
    it("classifies single word as keyword", () => {
      expect(classifyIntent("parking")).toBe("keyword");
    });

    it("classifies two words as keyword", () => {
      expect(classifyIntent("tree bylaw")).toBe("keyword");
    });

    it("classifies three words as keyword", () => {
      expect(classifyIntent("view royal budget")).toBe("keyword");
    });
  });

  describe("long phrases (5+ words without markers)", () => {
    it("classifies 5-word phrase without question markers as question", () => {
      expect(classifyIntent("council decision about housing development")).toBe(
        "question",
      );
    });

    it("classifies long phrase as question", () => {
      expect(
        classifyIntent(
          "rezoning application for colwood road property near school",
        ),
      ).toBe("question");
    });
  });

  describe("4-word ambiguous queries (default to question)", () => {
    it("classifies 4-word query without markers as question", () => {
      expect(classifyIntent("budget increase this year")).toBe("question");
    });

    it("classifies another 4-word query as question", () => {
      expect(classifyIntent("council vote on housing")).toBe("question");
    });
  });

  describe("empty and whitespace handling", () => {
    it("classifies empty string as keyword", () => {
      expect(classifyIntent("")).toBe("keyword");
    });

    it("classifies whitespace-only string as keyword", () => {
      expect(classifyIntent("   ")).toBe("keyword");
    });

    it("handles trailing whitespace correctly", () => {
      expect(classifyIntent("parking  ")).toBe("keyword");
    });

    it("handles leading whitespace correctly", () => {
      expect(classifyIntent("  parking")).toBe("keyword");
    });
  });

  describe("case insensitivity", () => {
    it("recognizes uppercase question starter", () => {
      expect(classifyIntent("What did council decide")).toBe("question");
    });

    it("recognizes mixed case question starter", () => {
      expect(classifyIntent("HOW much was the budget")).toBe("question");
    });

    it("recognizes mixed case Tell Me", () => {
      expect(classifyIntent("Tell Me about housing")).toBe("question");
    });
  });

  describe("edge cases", () => {
    it("classifies single question word alone as question starter", () => {
      // "what" is a single word, matches as question starter, but also <= 3 words
      // However, question starter check comes before word count check
      expect(classifyIntent("what")).toBe("question");
    });

    it("classifies 'explain' alone as question starter", () => {
      expect(classifyIntent("explain")).toBe("question");
    });

    it("returns correct type annotation", () => {
      const result: QueryIntent = classifyIntent("test");
      expect(result).toBe("keyword");
    });
  });
});
