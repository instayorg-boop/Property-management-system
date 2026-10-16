import NotificationsFeed from "./NotificationsFeed";

/** Compact panel anchored under the bell button, the same kind of "open in place" menu the
 * account button already uses, not a full page swap and not a full-height side drawer. All the
 * actual content (header, day-grouped list, footer) lives in NotificationsFeed, shared with the
 * dashboard's "Recent activity" card, which uses the exact same component inside a plain card
 * instead of this floating panel. */
export default function NotificationsDropdown({ onClose }: { onClose: () => void }) {
  return (
    <div className="w-80 origin-top-right overflow-hidden rounded-md border border-line bg-paper shadow-lg sm:w-96">
      <NotificationsFeed onClose={onClose} maxBundles={8} maxHeight="24rem" />
    </div>
  );
}
