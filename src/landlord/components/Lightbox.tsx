import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, CaretLeft, CaretRight } from "@phosphor-icons/react";

/** Full-screen photo viewer — opened from a small square thumbnail grid. Handles any number of
 * photos: arrows only show up when there's more than one to step between. */
export default function Lightbox({ photos, startIndex, onClose }: { photos: string[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIndex((i) => (i - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") setIndex((i) => (i + 1) % photos.length);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [photos.length, onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/90 p-6"
        onClick={onClose}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
        >
          <X size={18} weight="bold" />
        </button>

        {photos.length > 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIndex((i) => (i - 1 + photos.length) % photos.length);
            }}
            aria-label="Previous photo"
            className="absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
          >
            <CaretLeft size={18} weight="bold" />
          </button>
        )}

        <motion.img
          key={index}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
          src={photos[index]}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
        />

        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => (i + 1) % photos.length);
              }}
              aria-label="Next photo"
              className="absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-paper/10 text-paper transition-colors hover:bg-paper/20"
            >
              <CaretRight size={18} weight="bold" />
            </button>
            <span className="absolute bottom-6 rounded-full bg-paper/10 px-3 py-1 text-xs font-medium text-paper">
              {index + 1} / {photos.length}
            </span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
