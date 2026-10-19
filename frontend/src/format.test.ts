import { describe, expect, it } from "vitest";
import { addDaysISO, brl, date, dayLabel, decToInput, moneyParts, parseDecimal, pct, shortDate } from "./format";

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

  it("separa as partes do valor para a tipografia de extrato", () => {
    expect(moneyParts(1234.5)).toEqual({ symbol: "R$", integer: "1.234", decimal: ",", fraction: "50" });
    expect(moneyParts(0.07).integer).toBe("0");
  });

  it("nomeia dias e datas curtas", () => {
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayLabel("2026-10-19", "2026-10-19")).toBe("Hoje");
    expect(dayLabel("2026-10-18", "2026-10-19")).toBe("Ontem");
    expect(dayLabel("2026-10-14", "2026-10-19")).toBe("quarta, 14 de outubro");
    expect(dayLabel("2025-12-31", "2026-10-19")).toBe("quarta, 31 de dezembro de 2025");
    expect(shortDate("2026-10-04")).toBe("4 out");
  });
});
