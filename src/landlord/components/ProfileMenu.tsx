import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { User as UserIcon, GearSix as SettingsIcon, SignOut as LogoutIcon, UserCircle as UserAvatarIcon } from "@phosphor-icons/react";
import { useSettings } from "../SettingsContext";

export default function ProfileMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { propertyName } = useSettings();

  const goTo = (path: string) => {
    onClose();
    navigate(path);
  };

  const signOut = () => {
    onClose();
    navigate("/sign-in");
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: -6 }}
        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        className="absolute top-14 right-8 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-paper shadow-card"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 pt-4 pb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-mist text-muted">
            <UserAvatarIcon size={26} weight="fill" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{propertyName}</p>
            <p className="truncate text-xs text-muted">Property account</p>
          </div>
        </div>

        <div className="h-px bg-line" />

        {/* Menu */}
        <div className="p-1.5">
          <button
            type="button"
            onClick={() => goTo("/settings")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            <UserIcon size={16} weight="duotone" />
            View profile
          </button>
          <button
            type="button"
            onClick={() => goTo("/settings")}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist"
          >
            <SettingsIcon size={16} weight="duotone" />
            Settings
          </button>
        </div>

        <div className="h-px bg-line" />

        <div className="p-1.5">
          <button
            type="button"
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
          >
            <LogoutIcon size={16} weight="duotone" />
            Log out
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
