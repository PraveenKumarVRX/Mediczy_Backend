import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import api from "@/utils/api";
import CorporateOhc from "./CorporateOhc";

vi.mock("@/utils/api", () => ({ default: { get: vi.fn(), post: vi.fn(), defaults: { baseURL: "/api" } } }));
vi.mock("@/components/corporate/CorporateLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const UNIT = {
  uid: "JBBBB2", type: "ohc", name: "My SmartHealth OHC", active: true, ownerUid: "KT5EUW", operatorName: "SmartHealth Clinic", parent: { uid: "JAAAA1", name: "SmartHealth Outreach", type: "outreach_clinic" },
  ownership: null, brandName: null, coOwnerUid: null, visitPattern: null, services: ["Pre-employment checkup"], address: { line: null, city: "Chennai", state: null, pincode: null },
  phone: null, email: null, manager: null, corporateUid: "CMSHT1", createdAt: "2026-10-08T00:00:00Z",
  contract: { status: "proposed", ref: "OHC-1", start: null, end: null, initiatedBy: "corporate", acceptedByCorporateAt: null, acceptedByOperatorAt: "2026-10-08T00:00:00Z" },
};
const DASH = {
  unit: UNIT, services: UNIT.services, staff: [{ uid: "D1", name: "Dr Asha", role: "ohc_doctor", active: true }],
  stats: { total: 1, last_30d: 1, fit: 0, restricted: 1, unfit: 0 },
  certificates: [{ id: 1, patientName: "Anil Employee", employeeId: "EMP-1", type: "ohc_fitness", fitnessStatus: "fit_with_restrictions", restrictions: "No heights", validFrom: null, validUntil: "2027-10-07", examinationDate: null, issuedBy: "Dr Asha", doctorRegNo: "TN-77001", remarks: "BP borderline", issuedAt: "2026-10-08T01:00:00Z" }],
};

function serve(units: unknown[] | "fail") {
  get.mockImplementation(async (url: string) => {
    if (url === "/corporate/ohc-units") { if (units === "fail") throw new Error("down"); return { data: { units } } as never; }
    if (/access-log$/.test(url)) return { data: { entries: [{ actorKind: "ohc_staff", actor: "ohc:D1", action: "certificate.issue", subject: "1", at: "2026-10-08T01:00:00Z" }] } } as never;
    if (/\/corporate\/ohc-units\/[^/]+$/.test(url)) return { data: DASH } as never;
    throw new Error(`Unhandled GET ${url}`);
  });
}
const renderPage = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })}><CorporateOhc /></QueryClientProvider></MemoryRouter>);

describe("CorporateOhc", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it("explains the empty state instead of showing placeholder clinics", async () => {
    serve([]);
    renderPage();
    expect(await screen.findByText("No OHC yet")).toBeTruthy();
  });

  it("shows an error when the OHC cannot be loaded", async () => {
    serve("fail");
    renderPage();
    expect(await screen.findByText("Could not load your OHC.")).toBeTruthy();
  });

  it("shows the contract, services, linked staff and the certificates in full, and lets the super-HR accept a proposed contract", async () => {
    serve([UNIT]);
    post.mockResolvedValue({ data: { unit: { ...UNIT, contract: { ...UNIT.contract, status: "active" } } } } as never);
    renderPage();
    expect(await screen.findByText("My SmartHealth OHC")).toBeTruthy();
    expect(await screen.findByText("Anil Employee")).toBeTruthy();
    expect(screen.getByText(/No heights · BP borderline/)).toBeTruthy();       // restrictions and remarks reach the employer (the lead's decision)
    expect(screen.getAllByText(/Dr Asha/).length).toBeGreaterThanOrEqual(2);   // in the staff list and as the issuing doctor
    expect(screen.getByText("Pre-employment checkup")).toBeTruthy();
    expect(screen.getByText(/certificate issue · ohc staff/)).toBeTruthy();    // the access log is visible to the company
    fireEvent.click(screen.getByRole("button", { name: "Accept contract" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/corporate/ohc-units/JBBBB2/accept"));
  });
});
