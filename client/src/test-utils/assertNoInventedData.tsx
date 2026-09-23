import { vi, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import api from "@/utils/api";

/**
 * WP-0.3a test helper: proves a page does not fall back to hardcoded/invented data when its real API
 * calls fail or come back empty — the exact bug docs/WP0.3_INVENTED_DATA_INVENTORY.md targets. A page
 * migrated off a seed array should get one call to `assertNoInventedData` with the literal strings
 * that used to be hardcoded (a patient name, a fabricated balance, etc.) copied from the old seed —
 * if any of them ever renders again, something regressed back to inventing data.
 *
 * This mocks `@/utils/api` globally for any test file that imports this module (vitest hoists the
 * `vi.mock` call below regardless of which file it's written in, as long as it runs before the module
 * graph under test is loaded — importing this helper before rendering the page under test is enough).
 * A page's OWN test file still needs its own `vi.mock(...)` calls for anything else it depends on
 * (a layout shell, an auth context, a socket service) exactly like
 * doctor/DoctorDashboard.degraded-state.test.tsx already does — this helper only owns the API layer
 * and the render/assert loop, not a page's full dependency graph.
 */
vi.mock("@/utils/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

type ApiMode = "fail" | "empty";

function configureMockApi(mode: ApiMode) {
  const impl = async () => {
    if (mode === "fail") throw new Error("mocked API failure (assertNoInventedData helper)");
    return { data: {} };
  };
  for (const method of ["get", "post", "put", "patch", "delete"] as const) {
    vi.mocked(api[method]).mockImplementation(impl as never);
  }
}

function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

/** Renders `ui` once, with every `api.*` call behaving per `mode`. Wraps in the two providers almost
 * every page needs (react-query, react-router); wrap `ui` in anything more specific yourself first
 * (an auth provider, a theme provider) before passing it in. */
export function renderWithMockedApi(ui: ReactElement, mode: ApiMode) {
  configureMockApi(mode);
  const queryClient = createTestClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

interface AssertNoInventedDataOptions {
  /** How long to let each render settle before asserting (async fetches, react-query retries-off
   * still need a tick). Raise this for a page with a slower failure/empty path. Default 50ms. */
  settleMs?: number;
}

/**
 * Renders `ui` twice — once with every API call failing, once with every API call returning an empty
 * response — and asserts none of `seedStrings` appears in the rendered output either time. Does NOT
 * assert an error or empty state IS shown (a page's own test should check that specifically); this
 * only proves the old invented data can't leak back in.
 */
export async function assertNoInventedData(
  makeUi: () => ReactElement,
  seedStrings: string[],
  options: AssertNoInventedDataOptions = {}
) {
  const settleMs = options.settleMs ?? 50;

  for (const mode of ["fail", "empty"] as const) {
    renderWithMockedApi(makeUi(), mode);
    await new Promise((resolve) => setTimeout(resolve, settleMs));

    for (const text of seedStrings) {
      const match = screen.queryByText(text);
      expect(
        match,
        `Found invented-data text "${text}" while the API was mocked to ${mode} — a page must never ` +
          `show hardcoded seed content as if it were live data (see docs/WP0.3_INVENTED_DATA_INVENTORY.md).`
      ).toBeNull();
    }

    cleanup();
  }
}
