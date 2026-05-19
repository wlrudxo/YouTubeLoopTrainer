import { describe, expect, it } from "vitest";
import { validateDraftMarkers } from "../shared/validation";

describe("draft marker validation", () => {
  it("rejects missing marker A", () => {
    expect(validateDraftMarkers(null, 10)).toMatchObject({ ok: false, error: "missing-a" });
  });

  it("rejects missing marker B", () => {
    expect(validateDraftMarkers(10, null)).toMatchObject({ ok: false, error: "missing-b" });
  });

  it("rejects loops under one second", () => {
    expect(validateDraftMarkers(10, 10.5)).toMatchObject({ ok: false, error: "too-short" });
  });

  it("sorts reversed marker order", () => {
    expect(validateDraftMarkers(20, 10)).toEqual({ ok: true, start: 10, end: 20 });
  });
});
