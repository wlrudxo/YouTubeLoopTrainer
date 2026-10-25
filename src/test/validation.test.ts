import { describe, expect, it } from "vitest";
import { validateDraftMarkers } from "../shared/validation";

describe("draft marker validation", () => {
  it("rejects missing marker A", () => {
    expect(validateDraftMarkers(null, 10)).toMatchObject({ ok: false, error: "missing-a" });
  });

  it("rejects missing marker B", () => {
    expect(validateDraftMarkers(10, null)).toMatchObject({ ok: false, error: "missing-b" });
  });

  it.each([
    [Number.NaN, 10],
    [0, Number.NaN],
    [Number.POSITIVE_INFINITY, 10],
    [0, Number.POSITIVE_INFINITY],
    [Number.NEGATIVE_INFINITY, 10],
    [0, Number.NEGATIVE_INFINITY],
    [-1, 10],
    [0, -1]
  ])("rejects non-finite or negative media markers (%s, %s)", (start, end) => {
    expect(validateDraftMarkers(start, end)).toMatchObject({ ok: false, error: "invalid-range" });
  });

  it("accepts zero and the existing one-second minimum", () => {
    expect(validateDraftMarkers(0, 1)).toEqual({ ok: true, start: 0, end: 1 });
  });

  it("rejects loops under one second", () => {
    expect(validateDraftMarkers(10, 10.5)).toMatchObject({ ok: false, error: "too-short" });
  });

  it("rejects marker B before marker A", () => {
    expect(validateDraftMarkers(20, 10)).toMatchObject({ ok: false, error: "invalid-order" });
  });

  it("accepts marker B after marker A", () => {
    expect(validateDraftMarkers(10, 20)).toEqual({ ok: true, start: 10, end: 20 });
  });
});
