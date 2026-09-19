import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import api from "@/utils/api";
import { useHospitalAuth } from "@/hooks/useHospitalAuth";

export interface HospitalBranch {
  id: number;
  organization_id: number;
  name: string;
  address?: string | null;
  is_main: boolean;
  role?: string;
}

const SELECTED_BRANCH_KEY = "selectedBranchId";

export function getSelectedBranchId(): number | null {
  const raw = localStorage.getItem(SELECTED_BRANCH_KEY);
  return raw ? Number(raw) : null;
}

/**
 * Persistent branch switcher for the hospital top nav. Renders nothing when
 * the tenant has 0 or 1 branch — Phase 1 of multi-branch (see
 * hospital-branch.service.js) means most tenants have exactly one "Main"
 * branch and this would just be clutter. Selection is stored in
 * localStorage and broadcast via a "branch-changed" window event so any
 * page can opt in to branch-scoped filtering without a shared context.
 */
export default function BranchSwitcher() {
  const { hospitalData } = useHospitalAuth();
  const [selectedId, setSelectedId] = useState<number | null>(getSelectedBranchId());

  const { data: branches } = useQuery<HospitalBranch[]>({
    queryKey: ["hospital-staff-branches", hospitalData?.id],
    queryFn: async () => {
      if (!hospitalData?.id) return [];
      const res = await api.get(`/hospital-branch/staff/${hospitalData.id}/branches`);
      return res?.data?.data ?? [];
    },
    enabled: Boolean(hospitalData?.id),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const list = branches ?? [];

  useEffect(() => {
    if (list.length === 0) return;
    const stillValid = list.some((b) => b.id === selectedId);
    if (!stillValid) {
      const initial = list.find((b) => b.is_main) ?? list[0];
      setSelectedId(initial.id);
      localStorage.setItem(SELECTED_BRANCH_KEY, String(initial.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length]);

  if (list.length <= 1) return null;

  const current = list.find((b) => b.id === selectedId) ?? list[0];

  const selectBranch = (branch: HospitalBranch) => {
    setSelectedId(branch.id);
    localStorage.setItem(SELECTED_BRANCH_KEY, String(branch.id));
    window.dispatchEvent(new CustomEvent("branch-changed", { detail: branch }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="hidden sm:flex items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5"
        >
          <Building2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span className="text-sm font-medium text-slate-900 dark:text-white max-w-[140px] truncate">
            {current?.name ?? "Branch"}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs text-muted-foreground">Switch branch</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onClick={() => selectBranch(branch)}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex flex-col">
              <span className="text-sm">{branch.name}{branch.is_main ? " (Main)" : ""}</span>
              {branch.address && <span className="text-xs text-muted-foreground">{branch.address}</span>}
            </div>
            {branch.id === current?.id && <Check className="w-4 h-4 text-teal-600" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
