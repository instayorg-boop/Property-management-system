import {
  Rocket,
  UsersThree,
  DoorOpen,
  CurrencyCircleDollar,
  Bank,
  Wrench,
  Receipt,
  ChartBar,
  GearSix,
  Bell,
  Question,
  type Icon,
} from "@phosphor-icons/react";

// help_groups.icon stores a plain string naming one of these icons (see the add_help_docs_ia
// seed data), so content changes in Supabase never require a code change here unless a brand new
// group is introduced. Question is the fallback for an icon name this map doesn't recognize yet.
const HELP_GROUP_ICONS: Record<string, Icon> = {
  Rocket,
  UsersThree,
  DoorOpen,
  CurrencyCircleDollar,
  Bank,
  Wrench,
  Receipt,
  ChartBar,
  GearSix,
  Bell,
};

export function resolveHelpIcon(name: string | null | undefined): Icon {
  if (name && HELP_GROUP_ICONS[name]) return HELP_GROUP_ICONS[name];
  return Question;
}
