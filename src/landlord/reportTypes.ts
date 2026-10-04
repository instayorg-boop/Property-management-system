import {
  WarningCircle,
  ChartLineUp,
  DoorOpen,
  type Icon,
} from "@phosphor-icons/react";

export type ReportCategory = "financial" | "occupancy";

export type ReportType = {
  slug: string;
  title: string;
  description: string;
  category: ReportCategory;
  icon: Icon;
  tint: string;
};

// One entry per report a landlord can generate — the Reports hub renders these as cards, and the
// generate page looks itself up by slug. Titles/descriptions match the existing in-app dashboard
// pages at the same slugs (src/landlord/pages/reports/*.tsx) so the two don't drift apart in wording.
export const REPORT_TYPES: ReportType[] = [
  {
    slug: "arrears-delinquency",
    title: "Overdue rent",
    description: "See who's behind on rent and by how much.",
    category: "financial",
    icon: WarningCircle,
    tint: "bg-red-50 text-red-600",
  },
  {
    slug: "income-expenses",
    title: "Income vs expenses",
    description: "A detailed income and expense statement, month to month.",
    category: "financial",
    icon: ChartLineUp,
    tint: "bg-emerald-50 text-emerald-600",
  },
  {
    slug: "occupancy-rate",
    title: "Occupancy rate",
    description: "Track room and bed occupancy across your property.",
    category: "occupancy",
    icon: DoorOpen,
    tint: "bg-blue-50 text-blue-600",
  },
];

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  financial: "Financial",
  occupancy: "Occupancy",
};

export function getReportType(slug: string | undefined): ReportType | undefined {
  return REPORT_TYPES.find((r) => r.slug === slug);
}
