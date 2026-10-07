import { describe, expect, it } from "vitest";
import { FINAL_STATUSES, STAGES, STATUS_LABEL, formatDuration, formatWhen, isFinal, newOperationKey, statusTone, toProblem, whereOf } from "./format";
import type { TaskStatus } from "./types";

const ALL_STATUSES = Object.keys(STATUS_LABEL) as TaskStatus[];

describe("collection formatting helpers", () => {
  it("labels and tones every status the server can send", () => {
    expect(ALL_STATUSES).toHaveLength(16);
    for (const s of ALL_STATUSES) {
      expect(STATUS_LABEL[s]).toBeTruthy();
      expect(statusTone(s)).toMatch(/bg-/);
    }
  });

  it("stage strips are ordered, mode-specific and end at the lab", () => {
    expect(STAGES.home).toContain("en_route");
    expect(STAGES.home).not.toContain("at_bedside");
    expect(STAGES.ward).toContain("at_bedside");
    expect(STAGES.ward).not.toContain("en_route");
    for (const mode of ["home", "ward"] as const) {
      expect(STAGES[mode][STAGES[mode].length - 1]).toBe("lab_received");
      for (const s of STAGES[mode]) expect(ALL_STATUSES).toContain(s);
    }
  });

  it("knows which statuses are closed", () => {
    expect(FINAL_STATUSES.every(isFinal)).toBe(true);
    expect(isFinal("collected")).toBe(false);
    expect(isFinal("unassigned")).toBe(false);
  });

  it("formats durations and refuses to invent one", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(600)).toBe("10 min");
    expect(formatDuration(7260)).toBe("2 h 1 min");
  });

  it("formatWhen is a dash for missing or invalid times", () => {
    expect(formatWhen(null)).toBe("—");
    expect(formatWhen("not a date")).toBe("—");
    expect(formatWhen("2026-10-07T09:30:00Z")).not.toBe("—");
  });

  it("whereOf shows the address for a home task and ward/bed for a ward task, and nothing invented otherwise", () => {
    expect(whereOf({ mode: "home", home: { address: { line1: "12 MG Road", city: "Bengaluru" } } })).toBe("12 MG Road, Bengaluru");
    expect(whereOf({ mode: "home", home: { address: { street: "12 MG Road", city: "Bengaluru" } } })).toBe("12 MG Road, Bengaluru");
    expect(whereOf({ mode: "home" })).toBe("—");
    expect(whereOf({ mode: "ward", ward: { wardName: "General Ward A", bedLabel: "GEN-11" } })).toBe("General Ward A · GEN-11");
    expect(whereOf({ mode: "ward", ward: { wardName: null, bedLabel: null } })).toBe("—");
  });

  it("reduces any thrown value to a stable problem", () => {
    expect(toProblem({ response: { status: 409, data: { code: "version_conflict", message: "changed", details: { currentVersion: 4 } } } }))
      .toEqual({ status: 409, code: "version_conflict", message: "changed", details: { currentVersion: 4 } });
    expect(toProblem(new Error("boom"))).toMatchObject({ status: 0, code: "network_error" });
    expect(toProblem({ response: { status: 500, data: { message: { evil: true } } } })).toMatchObject({ status: 500, message: "The request failed." });
    expect(toProblem(undefined)).toMatchObject({ code: "network_error" });
  });

  it("operation keys are unique and accepted by the server's pattern", () => {
    const keys = new Set(Array.from({ length: 50 }, newOperationKey));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });
});
