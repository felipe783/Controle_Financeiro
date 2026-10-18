import { describe, expect, it } from "vitest";
import { brl, date, decToInput, parseDecimal, pct } from "./format";

describe("formatação brasileira", () => {
  it("formata moeda e percentual", () => {
    expect(brl("1234.5").replace(/\s/g, " ")).toBe("R$ 1.234,50");
    expect(brl(null)).toBe("—");
    expect(pct("0.1234")).toMatch(/12,34\s?%/);
  });

  it("formata data ISO sem deslocar o fuso", () => {
    expect(date("2026-01-01")).toBe("01/01/2026");
  });

  it("interpreta valores digitados", () => {
    expect(parseDecimal("1.234,56")).toBe("1234.56");
    expect(parseDecimal("R$ 10")).toBe("10");
    expect(parseDecimal("1234.56")).toBe("1234.56");
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect(decToInput("12.30")).toBe("12,30");
  });
});
