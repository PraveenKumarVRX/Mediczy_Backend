import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import api from "@/utils/api";
import { CareUnitsManager } from "./CareUnitsManager";

vi.mock("@/utils/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), defaults: { baseURL: "/api" } } }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const unit = (o: Record<string, unknown>) => ({
  uid: "J00001", type: "outreach_clinic", name: "Unit", active: true, ownerUid: "KT5EUW", parent: null, ownership: "owned", brandName: null, coOwnerUid: null,
  visitPattern: null, services: [], address: { line: null, city: null, state: null, pincode: null }, phone: null, email: null, manager: null, createdAt: "2026-10-08T00:00:00Z", staffCount: 0, childCount: 0, ...o,
});
const OUTREACH = unit({ uid: "JAAAA1", name: "Industrial Area Outreach", visitPattern: "weekly", address: { line: null, city: "Chennai", state: null, pincode: null }, childCount: 1 });
const OHC = unit({
  uid: "JBBBB2", type: "ohc", name: "Test Corp OHC", parent: { uid: "JAAAA1", name: "Industrial Area Outreach", type: "outreach_clinic" }, ownership: null, corporateUid: "CAF030", corporateName: "Test Corporate Ltd",
  staffCount: 2, contract: { status: "proposed", ref: "TC-1", start: null, end: null, initiatedBy: "corporate", acceptedByCorporateAt: null, acceptedByOperatorAt: "2026-10-08T00:00:00Z" },
});

function serve(units: unknown[] | "fail", staff: unknown[] = []) {
  get.mockImplementation(async (url: string) => {
    if (url === "/care-units") { if (units === "fail") throw new Error("down"); return { data: { units } } as never; }
    if (/\/care-units\/[^/]+\/staff$/.test(url)) return { data: { staff } } as never;
    if (/\/access-log$/.test(url)) return { data: { entries: [{ actorKind: "corporate", actor: "corporate:x", action: "dashboard.read", subject: null, at: "2026-10-08T01:00:00Z" }] } } as never;
    throw new Error(`Unhandled GET ${url}`);
  });
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: 0 } } });
  return render(<QueryClientProvider client={client}><CareUnitsManager /></QueryClientProvider>);
}

describe("CareUnitsManager", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows an error, not invented units, when the list cannot be loaded", async () => {
    serve("fail");
    renderPage();
    expect(await screen.findByText("Could not load your units.")).toBeTruthy();
    expect(screen.queryByText(/Mobile Health Van|Community Health Camp/i)).toBeNull();
  });

  it("shows an honest empty state with a way to add the first unit", async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText("No units yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add an outreach clinic" })).toBeTruthy();
  });

  it("nests an OHC under its outreach clinic and shows the company and contract state", async () => {
    serve([OUTREACH, OHC]);
    renderPage();
    expect(await screen.findByText("Industrial Area Outreach")).toBeTruthy();
    expect(screen.getByText(/Test Corporate Ltd/)).toBeTruthy();
    expect(screen.getByText("Awaiting acceptance")).toBeTruthy();
    expect(screen.getByText(/Weekly/)).toBeTruthy();
  });

  it("opens an OHC: contract, staff with roles, access log; ending the contract needs a reason", async () => {
    serve([OUTREACH, OHC], [{ uid: "D11111", name: "Dr Asha Probe", email: "asha@x.example", role: "ohc_doctor", active: true }]);
    post.mockResolvedValue({ data: { unit: { ...OHC, contract: { ...(OHC as unknown as { contract: object }).contract, status: "ended" } } } } as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Test Corp OHC/ }));
    const sheet = await screen.findByRole("dialog");
    expect(await within(sheet).findByText("Dr Asha Probe")).toBeTruthy();
    expect(within(sheet).getByText(/OHC doctor/)).toBeTruthy();
    expect(within(sheet).getByText(/Waiting for the company to accept/)).toBeTruthy();
    expect(await within(sheet).findByText(/dashboard read/)).toBeTruthy();
    fireEvent.click(within(sheet).getByRole("button", { name: "End contract" }));
    const dlg = (await screen.findAllByRole("dialog")).find((d) => within(d).queryByText("End this contract?"))!;
    const confirm = within(dlg).getByRole("button", { name: "End contract" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dlg).getByLabelText("Reason"), { target: { value: "Not renewed" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(post).toHaveBeenCalledWith("/care-units/JBBBB2/end-contract", { reason: "Not renewed" }));
  });
});
