import { describe, it, expect } from "vitest";
import { useState, useEffect } from "react";
import api from "@/utils/api";
import { assertNoInventedData } from "./assertNoInventedData";

/** Self-test for the WP-0.3a helper itself: proves it actually catches the bug it exists to catch,
 * and doesn't false-positive on a page that's already fixed. Individual page migrations (WP-0.3b/c/d)
 * call assertNoInventedData directly against the real page component — see this file's own usage as
 * the template. */

function BrokenPage() {
  const [state, setState] = useState<{ name: string } | null>(null);
  useEffect(() => {
    api
      .get("/some/endpoint")
      .then((res: { data: { name: string } }) => setState(res.data))
      .catch(() => setState({ name: "Ajay Kumar" })); // the exact anti-pattern this check exists for
  }, []);
  return <div>{state ? state.name : "Loading..."}</div>;
}

function FixedPage() {
  const [state, setState] = useState<{ name: string } | "loading" | "error">("loading");
  useEffect(() => {
    api
      .get("/some/endpoint")
      .then((res: { data: { name: string } }) => setState(res.data))
      .catch(() => setState("error"));
  }, []);
  if (state === "loading") return <div>Loading...</div>;
  if (state === "error") return <div>Could not load patient data.</div>;
  return <div>{state.name}</div>;
}

describe("assertNoInventedData", () => {
  it("fails when a page falls back to hardcoded seed data on API failure", async () => {
    await expect(
      assertNoInventedData(() => <BrokenPage />, ["Ajay Kumar"])
    ).rejects.toThrow(/Ajay Kumar/);
  });

  it("passes when a page shows an honest error/empty state instead", async () => {
    await expect(
      assertNoInventedData(() => <FixedPage />, ["Ajay Kumar"])
    ).resolves.not.toThrow();
  });
});
