import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import OhcLogin from "./OhcLogin";
import OhcWorkspace from "./OhcWorkspace";

vi.mock("@/utils/api", () => ({ default: { defaults: { baseURL: "/api" } } }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

type Reply = { status?: number; body: unknown };
let routes: Record<string, (init: RequestInit) => Reply>;
const calls: { url: string; init: RequestInit }[] = [];

// Radix Select needs these in jsdom
Element.prototype.scrollIntoView = vi.fn();
Element.prototype.hasPointerCapture = vi.fn(() => false);
Element.prototype.releasePointerCapture = vi.fn();

beforeEach(() => {
  cleanup(); toast.mockReset(); calls.length = 0; localStorage.clear(); routes = {};
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const key = `${init.method} ${url.replace("/api/ohc-workspace", "").split("?")[0]}`;
    const r = (routes[key] ?? (() => ({ status: 404, body: { code: "not_found", message: "no route" } })))(init);
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body, clone() { return this; }, headers: new Headers(), blob: async () => new Blob() } as unknown as Response;
  }));
});
afterEach(() => vi.unstubAllGlobals());

const ME = (over: Record<string, unknown> = {}) => ({
  success: true, worker: { uid: "D1ABCD", displayName: "Dr Asha", role: "ohc_doctor", mustChangePassword: false, registrationNumberOnFile: true, canSign: true, ...over },
  units: [{ uid: "JBBBB2", name: "Test Corp OHC", corporateUid: "CAF030", corporateName: "Test Corporate Ltd", operatorUid: "KT5EUW", operatorName: "SmartHealth Clinic", services: [] }], serverTime: "2026-10-08T00:00:00Z",
});
const EMPLOYEES = { employees: [{ id: 41, uid: "U00041", name: "Anil Employee", employeeId: "EMP-1", department: "Operations", designation: "Operator" }] };

function renderAt(path: string) {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/ohc/login" element={<OhcLogin />} /><Route path="/ohc" element={<OhcWorkspace />} />
  </Routes></MemoryRouter>);
}

describe("OHC sign-in", () => {
  it("explains a wrong password plainly, without saying which part was wrong", async () => {
    routes["POST /auth/login"] = () => ({ status: 401, body: { code: "invalid_credentials", message: "Invalid email or password" } });
    renderAt("/ohc/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.example" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/do not match/);
  });

  it("tells a worker whose contract has ended or who is unassigned to ask their administrator", async () => {
    routes["POST /auth/login"] = () => ({ status: 403, body: { code: "account_unavailable", message: "x" } });
    renderAt("/ohc/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.example" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/administrator/);
  });

  it("signs in and lands in the workspace", async () => {
    routes["POST /auth/login"] = () => ({ body: { accessToken: "at", refreshToken: "rt", worker: { uid: "D1ABCD", displayName: "Dr Asha", role: "ohc_doctor" }, units: ME().units } });
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /employees"] = () => ({ body: EMPLOYEES });
    renderAt("/ohc/login");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "a@b.example" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "right-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Test Corp OHC")).toBeTruthy();
    expect(localStorage.getItem("ohcAccessToken")).toBe("at");
  });
});

describe("OHC workspace", () => {
  beforeEach(() => { localStorage.setItem("ohcAccessToken", "at"); localStorage.setItem("ohcRefreshToken", "rt"); });

  it("sends a worker with no session to the sign-in page", async () => {
    localStorage.clear();
    renderAt("/ohc");
    expect(await screen.findByText("Doctor and staff sign-in")).toBeTruthy();
  });

  it("forces a temporary password to be changed before anything else", async () => {
    routes["GET /me"] = () => ({ body: ME({ mustChangePassword: true }) });
    renderAt("/ohc");
    expect(await screen.findByText("Choose a new password")).toBeTruthy();
    expect(screen.queryByText("Anil Employee")).toBeNull();
  });

  it("an OHC doctor with a registration number can issue; the request names no unit-owner or company, only the employee", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /employees"] = () => ({ body: EMPLOYEES });
    routes["POST /certificates"] = (init) => ({ status: 201, body: { success: true, certificate: { id: 9 }, pdfUrl: "/x", echo: JSON.parse(String(init.body)) } });
    renderAt("/ohc");
    fireEvent.click(await screen.findByRole("button", { name: "Issue certificate" }));
    fireEvent.click(await screen.findByRole("button", { name: "Sign and issue" }));
    await waitFor(() => expect(calls.some((c) => c.init.method === "POST" && c.url.endsWith("/certificates"))).toBe(true));
    const body = JSON.parse(String(calls.find((c) => c.init.method === "POST" && c.url.endsWith("/certificates"))!.init.body));
    expect(body).toMatchObject({ unit: "JBBBB2", employeeUserId: 41, fitnessStatus: "fit" });
    expect(Object.keys(body)).not.toContain("corporateUid");
    expect(Object.keys(body)).not.toContain("organizationId");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Certificate issued" }));
  });

  it("OHC staff (not a doctor) can look up employees but cannot sign, and the page says why", async () => {
    routes["GET /me"] = () => ({ body: ME({ role: "ohc_staff", canSign: false }) });
    routes["GET /employees"] = () => ({ body: EMPLOYEES });
    renderAt("/ohc");
    expect(await screen.findByText("Anil Employee")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Issue certificate" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Only an OHC doctor can sign/)).toBeTruthy();
  });

  it("a restricted result needs the restrictions written before it can be signed", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /employees"] = () => ({ body: EMPLOYEES });
    renderAt("/ohc");
    fireEvent.click(await screen.findByRole("button", { name: "Issue certificate" }));
    const trigger = await screen.findByLabelText("Result");
    fireEvent.click(trigger);
    fireEvent.click(await screen.findByRole("option", { name: "Fit with restrictions" }));
    expect((screen.getByRole("button", { name: "Sign and issue" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(await screen.findByLabelText("Restrictions"), { target: { value: "No heights" } });
    expect((screen.getByRole("button", { name: "Sign and issue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("assigns an available OHC responder from an active emergency without supplying corporate ownership", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /emergencies"] = () => ({ body: { emergencies: [{ id: 71, unit_uid: "JBBBB2", corporate_uid: "CAF030", employee_user_id: 41, employee_name: "Anil Employee", incident_type: "injury", severity: "critical", description: "Hand injury", location: "Assembly", occurred_at: "2026-10-08T08:00:00Z", status: "open", triage_notes: null, resolution: null, active_assignment_count: 0, acknowledged_assignment_count: 0 }] } });
    routes["GET /responders"] = () => ({ body: { responders: [{ uid: "N00001", name: "Nurse Bina", role: "ohc_staff", availability: "available", updatedAt: null }] } });
    routes["POST /emergencies/71/assignments"] = () => ({ status: 201, body: { assignment: { id: 9, status: "assigned" } } });
    renderAt("/ohc");
    const emergencyTab = await screen.findByRole("tab", { name: "Emergencies" });
    fireEvent.pointerDown(emergencyTab, { button: 0, ctrlKey: false });
    fireEvent.pointerUp(emergencyTab, { button: 0 });
    fireEvent.click(emergencyTab);
    await screen.findByText("Hand injury");
    fireEvent.change(screen.getByLabelText("Assign responder for emergency 71"), { target: { value: "N00001" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(calls.some((call) => call.init.method === "POST" && call.url.endsWith("/emergencies/71/assignments"))).toBe(true));
    const assignment = calls.find((call) => call.init.method === "POST" && call.url.endsWith("/emergencies/71/assignments"))!;
    expect(JSON.parse(String(assignment.init.body))).toEqual({ unit: "JBBBB2", responderUid: "N00001" });
  });

  it("lets the assigned responder acknowledge an emergency with the OHC unit scope", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /emergencies"] = () => ({ body: { emergencies: [{ id: 71, unit_uid: "JBBBB2", corporate_uid: "CAF030", employee_user_id: 41, employee_name: "Anil Employee", incident_type: "injury", severity: "critical", description: "Hand injury", location: "Assembly", occurred_at: "2026-10-08T08:00:00Z", status: "open", triage_notes: null, resolution: null, active_assignment_count: 1, acknowledged_assignment_count: 0, my_assignment_id: 9, my_assignment_status: "assigned", my_pending_assignment_id: 9 }] } });
    routes["GET /responders"] = () => ({ body: { responders: [] } });
    routes["PATCH /emergencies/71/assignments/9/respond"] = () => ({ body: { assignment: { id: 9, status: "acknowledged" } } });
    renderAt("/ohc");
    fireEvent.click(await screen.findByRole("tab", { name: "Emergencies" }));
    await screen.findByText("Hand injury");
    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));
    await waitFor(() => expect(calls.some((call) => call.init.method === "PATCH" && call.url.endsWith("/emergencies/71/assignments/9/respond"))).toBe(true));
    const response = calls.find((call) => call.init.method === "PATCH" && call.url.endsWith("/emergencies/71/assignments/9/respond"))!;
    expect(JSON.parse(String(response.init.body))).toEqual({ unit: "JBBBB2", status: "acknowledged" });
  });

  it("records an attributed field note against the selected emergency", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /emergencies"] = () => ({ body: { emergencies: [{ id: 71, unit_uid: "JBBBB2", corporate_uid: "CAF030", employee_user_id: 41, employee_name: "Anil Employee", incident_type: "injury", severity: "critical", description: "Hand injury", location: "Assembly", occurred_at: "2026-10-08T08:00:00Z", status: "open", triage_notes: null, resolution: null, active_assignment_count: 0, acknowledged_assignment_count: 0 }] } });
    routes["GET /responders"] = () => ({ body: { responders: [] } });
    routes["GET /emergencies/71"] = () => ({ body: { emergency: { id: 71, incident_type: "injury" }, assignments: [], events: [], notes: [], report: null, amendments: [] } });
    routes["POST /emergencies/71/notes"] = () => ({ status: 201, body: { note: { id: 2 } } });
    renderAt("/ohc");
    fireEvent.click(await screen.findByRole("tab", { name: "Emergencies" }));
    fireEvent.click(await screen.findByRole("button", { name: "Operational timeline" }));
    fireEvent.change(await screen.findByLabelText("Add field note"), { target: { value: "First aider en route" } });
    fireEvent.click(screen.getByRole("button", { name: "Add note" }));
    await waitFor(() => expect(calls.some((call) => call.init.method === "POST" && call.url.endsWith("/emergencies/71/notes"))).toBe(true));
    const note = calls.find((call) => call.init.method === "POST" && call.url.endsWith("/emergencies/71/notes"))!;
    expect(JSON.parse(String(note.init.body))).toEqual({ unit: "JBBBB2", body: "First aider en route", noteType: "operational" });
  });

  it("schedules a Mediqzy occupational visit with unit-scoped employee data", async () => {
    routes["GET /me"] = () => ({ body: ME() });
    routes["GET /appointments"] = () => ({ body: { appointments: [] } });
    routes["GET /encounters"] = () => ({ body: { encounters: [] } });
    routes["GET /staff-messages"] = () => ({ body: { messages: [] } });
    routes["GET /occupational-summary"] = () => ({ body: { summary: { appointments: { total: 0, completed: 0, no_show: 0 }, encounters: { total: 0, finalized: 0 }, screenings: { total: 0, attention_required: 0 } } } });
    routes["POST /appointments"] = () => ({ status: 201, body: { appointment: { id: 3 } } });
    renderAt("/ohc");
    fireEvent.click(await screen.findByRole("tab", { name: "Occupational care" }));
    fireEvent.change(await screen.findByLabelText("Employee user ID"), { target: { value: "41" } });
    fireEvent.change(screen.getByLabelText("Date and time"), { target: { value: "2026-10-10T10:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule visit" }));
    await waitFor(() => expect(calls.some((call) => call.init.method === "POST" && call.url.endsWith("/appointments"))).toBe(true));
    const appointment = calls.find((call) => call.init.method === "POST" && call.url.endsWith("/appointments"))!;
    expect(JSON.parse(String(appointment.init.body))).toMatchObject({ unit: "JBBBB2", employeeUserId: 41, appointmentType: "occupational_visit" });
  });

  it("an ended contract (account_unavailable) signs the worker out of the workspace", async () => {
    routes["GET /me"] = () => ({ status: 403, body: { code: "account_unavailable", message: "x" } });
    renderAt("/ohc");
    expect(await screen.findByText("Doctor and staff sign-in")).toBeTruthy();
    expect(localStorage.getItem("ohcAccessToken")).toBeNull();
  });
});
