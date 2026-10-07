import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import api from "@/utils/api";
import { CollectionOpsPage } from "./CollectionOpsPage";

vi.mock("@/utils/api", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
vi.mock("@/components/lab/LabLayout", () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const get = vi.mocked(api.get);
const post = vi.mocked(api.post);

const SEED_STRINGS = ["Anita Sharma", "Rahul Verma", "LAB-BOOK-10021", "LAB-BOOK-10022", "Kiran", "HSR Layout", "BTM 2nd Stage"];

const task = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111", mode: "home", status: "unassigned", priority: "routine", scheduledStart: null, scheduledEnd: null,
  version: 3, assignmentVersion: 0, patient: { name: "Probe Patient", age: 41, gender: "female", scheduleSlot: "07:00 AM – 09:00 AM" },
  collectedAt: null, closedAt: null, createdAt: "2026-10-07T04:00:00Z", permittedCommands: ["assign", "cancel"], ownerUid: "LDQM9T", sourceKind: "manual",
  sourceRef: null, partnerUid: null, assignedUid: null, assigneeName: null, redrawOf: null, cancelReason: null,
  home: { departedAt: null, arrivedAt: null, address: { line1: "12 Probe Street", city: "Bengaluru" }, contactPhone: null }, ...over,
});
const collector = (over: Record<string, unknown> = {}) => ({
  uid: "F2222A", displayName: "Alice Probe", email: "alice@probe.invalid", phone: null, status: "active", qualification: null,
  qualificationExpires: null, verifiedAt: "2026-10-01T00:00:00Z", mustChangePassword: false, lastLoginAt: null,
  membership: { status: "active", canHome: true, canWard: true, activeTo: null }, workload: { openTasks: 2, carryingSpecimens: 0 }, eligible: true, ...over,
});
const kpis = { windowDays: 30, openBeforeCollection: 1, overdue: 0, inField: 0, collected: 0, handedOverPendingReceipt: 0, labReceived: 0, rejected: 0, refused: 0, redraws: 0, medianCollectToHandoffSeconds: null };
const summary = { byMode: { home: {}, ward: {} }, overdue: 0, unassigned: 1 };

function serve(handlers: { board?: () => unknown; collectors?: unknown[]; detail?: unknown }) {
  get.mockImplementation(async (url: string) => {
    if (url === "/lab/collection/ops") { const b = handlers.board ? handlers.board() : { tasks: [], nextCursor: null, summary }; return { data: b } as never; }
    if (url === "/lab/collection/kpis") return { data: kpis } as never;
    if (url === "/lab/collection/exceptions") return { data: { exceptions: [] } } as never;
    if (url === "/lab/collection/phlebotomists") return { data: { phlebotomists: handlers.collectors ?? [] } } as never;
    if (/\/lab\/collection\/tasks\/[^/]+\/timeline$/.test(url)) return { data: { taskId: "x", items: [{ at: "2026-10-07T04:00:00Z", kind: "task", type: "task.created", to: "unassigned", actor: "lab:LDQM9T", data: { mode: "home" } }] } } as never;
    if (/\/lab\/collection\/tasks\/[^/]+$/.test(url)) return { data: handlers.detail ?? { task: task(), tests: [{ id: "t1", name: "CBC", containerType: "edta", status: "required", specimenId: null, priority: "routine" }], specimens: [] } } as never;
    throw new Error(`Unhandled GET ${url}`);
  });
}

function renderPage(initial = "/lab/collection-ops") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, refetchInterval: false }, mutations: { retry: 0 } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[initial]}><CollectionOpsPage /></MemoryRouter></QueryClientProvider>);
}

describe("CollectionOpsPage", () => {
  beforeEach(() => { cleanup(); vi.clearAllMocks(); });

  it("shows an error, not invented work, when the board cannot be loaded", async () => {
    get.mockImplementation(async (url: string) => {
      if (url === "/lab/collection/kpis") return { data: kpis } as never;
      if (url === "/lab/collection/exceptions") return { data: { exceptions: [] } } as never;
      if (url === "/lab/collection/phlebotomists") return { data: { phlebotomists: [] } } as never;
      throw new Error("network down");
    });
    renderPage();
    expect(await screen.findByText("Could not load the board.")).toBeTruthy();
    for (const s of SEED_STRINGS) expect(screen.queryByText(new RegExp(s, "i"))).toBeNull();
    expect(screen.queryAllByRole("row")).toHaveLength(0);
  });

  it("shows an honest empty state for an empty board (no seed rows)", async () => {
    serve({});
    renderPage();
    expect(await screen.findByText("No home collections yet")).toBeTruthy();
    for (const s of SEED_STRINGS) expect(screen.queryByText(new RegExp(s, "i"))).toBeNull();
  });

  it("lists the server's tasks with status, collector and where", async () => {
    serve({ board: () => ({ tasks: [task(), task({ id: "33333333-3333-4333-8333-333333333333", status: "en_route", assigneeName: "Alice Probe", patient: { name: "Second Patient", age: 30, gender: "male" } })], nextCursor: null, summary }) });
    renderPage();
    expect(await screen.findByText("Probe Patient")).toBeTruthy();
    expect(screen.getByText("Second Patient")).toBeTruthy();
    expect(screen.getByText("En route")).toBeTruthy();
    expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    expect(screen.getAllByText("12 Probe Street, Bengaluru").length).toBe(2);
  });

  it("requests the mode from the URL, and the ward tab asks the server for ward tasks", async () => {
    serve({});
    renderPage("/lab/collection-ops?mode=ward");
    await waitFor(() => expect(get.mock.calls.some(([u, c]) => u === "/lab/collection/ops" && (c as { params: { mode: string } }).params.mode === "ward")).toBe(true));
    expect(await screen.findByText("No ward collections yet")).toBeTruthy();
  });

  it("assigns an eligible collector with the task's version and an idempotency key", async () => {
    serve({
      board: () => ({ tasks: [task()], nextCursor: null, summary }),
      collectors: [collector(), collector({ uid: "F4444B", displayName: "Suspended Sam", eligible: false })],
    });
    post.mockResolvedValue({ data: { success: true } } as never);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Probe Patient" }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign collector" }));
    const dialog = await screen.findByRole("dialog", { name: /assign collector/i });
    expect(within(dialog).queryByText("Suspended Sam")).toBeNull();
    fireEvent.click(await within(dialog).findByRole("radio", { name: /Alice Probe/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, body, config] = post.mock.calls[0];
    expect(url).toBe("/lab/collection/tasks/11111111-1111-4111-8111-111111111111/assign");
    expect(body).toEqual({ expectedVersion: 3, phlebotomistUid: "F2222A" });
    expect((config as { headers: Record<string, string> }).headers["Idempotency-Key"]).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
  });

  it("explains a stale-version conflict and reloads instead of overwriting", async () => {
    serve({ board: () => ({ tasks: [task()], nextCursor: null, summary }), collectors: [collector()] });
    post.mockRejectedValue({ response: { status: 409, data: { code: "version_conflict", message: "The task changed since you loaded it", details: { currentVersion: 4 } } } });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Probe Patient" }));
    fireEvent.click(await screen.findByRole("button", { name: "Assign collector" }));
    const dialog = await screen.findByRole("dialog", { name: /assign collector/i });
    fireEvent.click(await within(dialog).findByRole("radio", { name: /Alice Probe/ }));
    const before = get.mock.calls.filter(([u]) => u === "/lab/collection/ops").length;
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "This task changed", variant: "destructive" })));
    await waitFor(() => expect(get.mock.calls.filter(([u]) => u === "/lab/collection/ops").length).toBeGreaterThan(before));
  });

  it("never offers a collector action the server did not permit", async () => {
    serve({
      board: () => ({ tasks: [task({ status: "collected", permittedCommands: [] })], nextCursor: null, summary }),
      detail: { task: task({ status: "collected", permittedCommands: [] }), tests: [], specimens: [] },
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Probe Patient" }));
    await screen.findByText("Tests and specimens");
    expect(screen.queryByRole("button", { name: "Assign collector" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel task" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Reassign" })).toBeNull();
  });
});
