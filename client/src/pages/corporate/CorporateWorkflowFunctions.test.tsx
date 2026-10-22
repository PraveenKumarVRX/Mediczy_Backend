import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import api from "@/utils/api";
import CorporateMfaSettings from "@/components/corporate/CorporateMfaSettings";
import CorporateSsoSettings from "@/components/corporate/CorporateSsoSettings";
import CorporateAccessManagement from "@/components/corporate/CorporateAccessManagement";
import CorporateProgramAnalytics from "./CorporateProgramAnalytics";
import CorporateAssignedEmployees from "./CorporateAssignedEmployees";
import EmployeeCareFeedback from "@/components/corporate/EmployeeCareFeedback";
vi.mock("@/utils/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn() },
}));
vi.mock("@/components/corporate/CorporateLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <main>{children}</main>
  ),
}));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
const get = vi.mocked(api.get),
  post = vi.mocked(api.post),
  put = vi.mocked(api.put);
const response = (data: unknown) =>
  ({ data: { success: true, data } }) as never;
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);
const show = (node: React.ReactNode) =>
  render(<MemoryRouter>{node}</MemoryRouter>);
it("enables real authenticator protection and replaces both session tokens", async () => {
  let enabled = false;
  get.mockImplementation(async () => response({ enabled, pending: false }));
  post.mockImplementation(async (url) => {
    if (String(url).endsWith("/enroll"))
      return response({
        secret: "SYNTHETIC-SETUP-KEY",
        otpauthUrl: "otpauth://totp/synthetic",
      });
    enabled = true;
    return response({
      enabled: true,
      token: "verified-token",
      refreshToken: "verified-refresh",
    });
  });
  show(<CorporateMfaSettings />);
  await screen.findByText("Not enabled on this account");
  expect(screen.queryByText("SYNTHETIC-SETUP-KEY")).toBeNull();
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "synthetic-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set up authenticator" }));
  await screen.findByText("SYNTHETIC-SETUP-KEY");
  fireEvent.change(screen.getByLabelText("Authenticator code"), {
    target: { value: "123456" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Confirm authenticator" }),
  );
  await screen.findByText("Enabled — authenticator code required at login");
  expect(localStorage.getItem("corporateToken")).toBe("verified-token");
  expect(localStorage.getItem("refreshToken")).toBe("verified-refresh");
  expect(screen.queryByText("SYNTHETIC-SETUP-KEY")).toBeNull();
});
it("never fills an SSO client secret returned as a configured flag", async () => {
  get.mockResolvedValue(
    response({
      enabled: false,
      issuer: "https://issuer.example.com",
      clientId: "client",
      hasClientSecret: true,
      callbackUrl:
        "https://app.mediqzy.com/api/corporate/security/sso/callback",
    }),
  );
  put.mockResolvedValue(response({}));
  show(<CorporateSsoSettings />);
  await screen.findByText(/Register this redirect URI/);
  const secret = screen.getByLabelText(/Client secret/) as HTMLInputElement;
  expect(secret.value).toBe("");
  fireEvent.change(screen.getByLabelText("Confirm current password"), {
    target: { value: "synthetic" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Save identity provider" }),
  );
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith(
      "/corporate/security/sso",
      expect.objectContaining({ clientSecret: "", password: "synthetic" }),
    ),
  );
});
it("persists reduced HR role and selected employee scopes", async () => {
  get.mockResolvedValue(
    response({
      members: [
        {
          id: 42,
          firstName: "HR",
          lastName: "Synthetic",
          email: "hr@example.invalid",
          access: null,
        },
      ],
      departments: ["IT"],
      businessUnits: ["Technology"],
      branches: ["Chennai"],
    }),
  );
  put.mockResolvedValue(response({}));
  show(<CorporateAccessManagement />);
  await screen.findByRole("option", { name: /HR Synthetic/ });
  fireEvent.change(screen.getByLabelText("HR staff member"), {
    target: { value: "42" },
  });
  fireEvent.change(screen.getByLabelText("Access level"), {
    target: { value: "coordinator" },
  });
  fireEvent.click(screen.getByLabelText("IT"));
  fireEvent.click(screen.getByRole("button", { name: "Save access" }));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith("/corporate/access/team/42", {
      level: "coordinator",
      departments: ["IT"],
      businessUnits: [],
      branches: [],
    }),
  );
});
it("shows absent measurements honestly and saves a real zero budget", async () => {
  const year = new Date().getFullYear();
  get.mockImplementation(async (url) =>
    String(url).endsWith("/access/me")
      ? response({ role: "corporate" })
      : response({
          year,
          currency: "INR",
          monthly: [],
          departments: [],
          ages: [],
          vendors: [],
          budget: {
            annual: null,
            paidSpend: 0,
            remaining: null,
            utilizationPercent: null,
          },
          feedback: { responses: 0, average_rating: null },
          notes: [],
        }),
  );
  put.mockResolvedValue(response({}));
  show(<CorporateProgramAnalytics />);
  await screen.findByText("No visit feedback yet");
  expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText("Annual budget in INR"), {
    target: { value: "0" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save budget" }));
  await waitFor(() =>
    expect(put).toHaveBeenCalledWith("/corporate/programs/budget", {
      year,
      amount: 0,
    }),
  );
});
it("read-only coordinators have no scheduling actions or clinical columns", async () => {
  get.mockImplementation(async (url) =>
    String(url).endsWith("/access/me")
      ? response({ policy: { level: "viewer" } })
      : String(url).endsWith("/assigned-employees")
        ? response({
            employees: [
              {
                employeeId: "EMP-1",
                name: "Assigned Synthetic",
                email: "employee@example.invalid",
                department: "IT",
                businessUnit: "Technology",
              },
            ],
          })
        : String(url).endsWith("/access/appointments")
          ? response({ appointments: [] })
          : response({ enabled: false }),
  );
  show(<CorporateAssignedEmployees />);
  await screen.findByText(/Assigned Synthetic/);
  expect(screen.queryByRole("button", { name: "Schedule" })).toBeNull();
  expect(screen.queryByText(/healthStatus/)).toBeNull();
});
it("employees can submit ratings for their returned completed visits", async () => {
  get.mockResolvedValue(
    response([
      {
        key: "consultation:8",
        date: "2026-10-01",
        provider: "Synthetic Doctor",
        company: "Synthetic Corporate",
        feedback: null,
      },
    ]),
  );
  post.mockResolvedValue(response({}));
  show(<EmployeeCareFeedback />);
  await screen.findByText(/Synthetic Doctor/);
  fireEvent.click(
    screen.getByRole("button", { name: "Rate consultation:8 4 out of 5" }),
  );
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith("/corporate/programs/employee/feedback", {
      key: "consultation:8",
      rating: 4,
    }),
  );
});
