import React from "react";
import {
  ChevronRight,
  // Removed unused imports for icons that aren't in use now
} from "lucide-react";
import { motion } from "framer-motion";

// Types
interface DashedLineProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

interface FeatureItem {
  title: string;
  imageUrl: string; // New field for image URL
  href: string;
}

// Helper component for dashed border dividers
const DashedLine: React.FC<DashedLineProps> = ({
  orientation = "horizontal",
  className = "",
}) => {
  if (orientation === "vertical") {
    return (
      <div
        className={`w-[1px] h-full border-r  border-neutral-300 ${className}`}
      />
    );
  }
  return (
    <div
      className={`w-full h-[1px] border-b border-neutral-300 ${className}`}
    />
  );
};

/* ==========================================================================
   SHOWCASE ITEMS (using preview images instead of mockups)
   ========================================================================== */
const items: FeatureItem[] = [
  {
    title: " Automated rent collection, reconciled for you",
    imageUrl: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/First%20illustration%20image.png", // Example image path
    href: "/features/rent-collection",
  },
  {
    title: "Automated invoicing & instant tenant reminders",
    imageUrl: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/I%20message%20illustration.png",
    href: "/features/invoicing",
  },
  {
    title: "Digital clock-in/out & automatic payroll calculation",
    imageUrl: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Payroll%20Illustration.png",
    href: "/features/payroll",
  },
];

/* ==========================================================================
   MAIN COMPONENT WITH MINIMAL APPLE-LIKE MOTION
   ========================================================================== */
const appleMotionVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
  hover: { scale: 1.018, y: -2, boxShadow: "0 3px 16px 0 rgba(30,41,59,0.06)" },
};

export const FeatureShowcase: React.FC = () => {
  return (
    <section
      id="feature-showcase"
      className="pt-20 sm:pt-80 mb-12 bg-white text-neutral-900 overflow-hidden"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Header Section */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.78, ease: [0.39, 0.575, 0.565, 1] }}
          className="mx-auto grid items-start gap-4 md:gap-8 lg:grid-cols-2 mb-12 lg:mb-16"
        >
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl font-display lg:text-5xl leading-[1.15]">
            Everything you need to run your properties effortlessly.
          </h2>
          <p className="text-neutral-500 leading-relaxed text-base md:text-lg pt-1">
            From automated mobile money rent collection to staff attendance and WhatsApp invoicing designed to eliminate hours of manual work every week.
          </p>
        </motion.div>
        {/* Main Features Card Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.39, 0.575, 0.565, 1] }}
          className="rounded-3xl border border-neutral-200 bg-white p-2 md:p-4 shadow-xs"
        >
          <div className="flex max-md:flex-col">
            {items.map((item, i) => (
              <motion.div
                key={i}
                variants={appleMotionVariants}
                initial="hidden"
                whileInView="visible"
                whileHover="hover"
                viewport={{ once: true, amount: 0.4 }}
                transition={{
                  y: { type: "spring", stiffness: 56, damping: 26 },
                  opacity: { duration: 0.5 },
                  scale: { type: "spring", stiffness: 185, damping: 18 },
                  boxShadow: { duration: 0.25 },
                  delay: i * 0.07,
                }}
                className="flex flex-1 max-md:flex-col bg-white transition-all"
                style={{ willChange: "transform, box-shadow" }}
              >
                <div className="flex-1 flex flex-col justify-between p-4 md:p-6">
                  {/* Image Preview Container */}
                  <motion.div
                    layout
                    className="relative w-full overflow-hidden"
                  >
                    <motion.img
                      src={item.imageUrl}
                      alt={item.title}
                      className="object-cover w-full rounded-md h-full"
                      initial={{ scale: 1.03, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 92,
                        damping: 28,
                        opacity: { duration: 0.32, delay: 0.06 * i },
                        delay: 0.09 * i,
                      }}
                    />
                    {/* Bottom gradient overlay */}
                    <div className="absolute inset-0 z-10 bg-gradient-to-t from-white via-transparent to-transparent pointer-events-none" />
                  </motion.div>
                  {/* Title & Arrow Link */}
                  <motion.a
                    href={item.href}
                    className="group flex items-center justify-between gap-4 pt-6 text-neutral-900 transition-colors"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.36,
                      delay: 0.11 + 0.08 * i,
                    }}
                  >
                    <h3 className="font-bold text-lg  leading-snug tracking-tight ">
                      {item.title}
                    </h3>
                    <motion.span
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      initial={{ opacity: 0, x: 0 }}
                      whileHover={{ opacity: 1, x: 4 }}
                      transition={{ type: "spring", stiffness: 160, damping: 14, duration: 0.18 }}
                    >
                      <ChevronRight className="size-4 text-neutral-400" />
                    </motion.span>
                  </motion.a>
                </div>
                {/* Vertical Divider (Desktop) */}
                {i < items.length - 1 && (
                  <div className="relative hidden md:block my-4">
                    <DashedLine orientation="vertical" />
                  </div>
                )}
                {/* Horizontal Divider (Mobile) */}
                {i < items.length - 1 && (
                  <div className="relative block md:hidden my-2">
                    <DashedLine orientation="horizontal" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default FeatureShowcase;