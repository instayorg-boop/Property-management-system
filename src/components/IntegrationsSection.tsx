import React from "react";

// Utility for combining class names
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// Helper DashedLine Component
interface DashedLineProps {
  orientation?: "horizontal" | "vertical";
  className?: string;
}

export const DashedLine: React.FC<DashedLineProps> = ({
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
      className={`w-full h-[1px] border-b  border-neutral-300 ${className}`}
    />
  );
};

/* ==========================================================================
   IMAGE FIELDS (Replace mockups with images)
   ========================================================================== */

// Now, instead of a React component for the mockup, we use an imageURL field to be filled in later.

const topItems = [
  {
    title: "Tenant & Lease Management.",
    description: "Store tenant KYC documentation, manage security deposits, track lease start/end dates and trigger automated renewal alerts before leases expire.",
    imageURL: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/tenant%20pfp.png", // <- Fill your image URL here
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-6 [&>.image-container]:translate-x-2",
    fade: [""],
  },
  {
    title: "Maintenance & Repair Tracking.",
    description: "Log repair requests from tenants, assign tasks to local handymen, track material costs and monitor job completion statuses in real time.",
    imageURL: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Maintenance%20illustration.png", // <- Fill your image URL here
    className:
      "flex-1 [&>.title-container]:mb-5 md:[&>.title-container]:mb-8 md:[&>.title-container]:translate-x-2 xl:[&>.title-container]:translate-x-4 [&>.title-container]:translate-x-0",
    fade: [],
  },
];

const bottomItems = [
  {
    title: "Expense & Utility Tracking.",
    description: "Log property expenses like ZESCO prepaid tokens, water bills, council rates and general maintenance costs to keep your net income accurate.",
    imageURL: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Expensense%20illustration.png", // <- Fill your image URL here
    className:
      "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-2 [&>.image-container]:translate-x-0",
    fade: ["bottom"],
  },
  {
    title: "Tenant Self-Service Portal.",
    description: "Give tenants a mobile-friendly way to view and pay their balances, download past receipts and log maintenance issues",
    imageURL: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Pay%20potal%20illustration.png", // <- Fill your image URL here
    className:
      "justify-normal [&>.title-container]:mb-5 md:[&>.title-container]:mb-0 [&>.image-container]:flex-1 md:[&>.image-container]:place-items-center md:[&>.image-container]:-translate-y-3",
    fade: [""],
  },
  {
    title: "Instant Financial Analytics.",
    description: "Generate professional profit-and-loss reports, occupancy breakdowns and tax summaries with one click to share directly with landlords or partners.",
    imageURL: "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Reports%20illustration%202.png", // <- Fill your image URL here
    className:
      "[&>.title-container]:mb-5 md:[&>.title-container]:mb-8 xl:[&>.image-container]:translate-x-2 [&>.image-container]:translate-x-0",
    fade: ["bottom"],
  },
];

/* ==========================================================================
   MAIN COMPONENT
   ========================================================================== */

export const IntegrationsSection: React.FC = () => {
  return (
    <section
      id="resource-allocation"
      className="overflow-hidden pb-12  pt-8 bg-white text-neutral-900"
    >
      <div>
        <h2 className="container mx-auto px-4 text-center text-3xl font-extrabold font-display tracking-tight text-balance sm:text-4xl md:text-5xl lg:text-6xl max-w-4xl">
        The full platform
        </h2>

        <div className="mt-8 md:mt-12 lg:mt-20">
          <DashedLine
            orientation="horizontal"
            className="container mx-auto scale-x-105"
          />

          {/* Top Features Grid - 2 items */}
          <div className="relative container mx-auto max-w-6xl flex max-md:flex-col">
            {topItems.map((item, i) => (
              <Item key={i} item={item} isLast={i === topItems.length - 1} />
            ))}
          </div>

          <DashedLine
            orientation="horizontal"
            className="container mx-auto max-w-6xl scale-x-110"
          />

          {/* Bottom Features Grid - 3 items */}
          <div className="relative container mx-auto max-w-6xl grid md:grid-cols-3">
            {bottomItems.map((item, i) => (
              <Item
                key={i}
                item={item}
                isLast={i === bottomItems.length - 1}
                className="md:pb-0"
              />
            ))}
          </div>
        </div>

        <DashedLine
          orientation="horizontal"
          className="container mx-auto max-w-6xl scale-x-110"
        />
      </div>
    </section>
  );
};

/* ==========================================================================
   ITEM COMPONENT
   ========================================================================== */

interface ItemProps {
  item: (typeof topItems)[number] | (typeof bottomItems)[number];
  isLast?: boolean;
  className?: string;
}

const Item: React.FC<ItemProps> = ({ item, isLast, className }) => {
  return (
    <div
      className={cn(
        "relative flex flex-col justify-between px-4 py-6 md:px-6 md:py-8",
        className,
        item.className
      )}
    >
      {/* Title & Description */}
      <div className="title-container text-balance">
        <h3 className="inline font-bold font-display text-neutral-900 text-base md:text-lg">
          {item.title}{" "}
        </h3>
        <span className="text-neutral-500 text-sm md:text-base">
          {item.description}
        </span>
      </div>

      {/* Bottom Fade Gradient for Mobile/Specific Cards */}
      {item.fade.includes("bottom") && (
        <div className="from-white via-transparent to-transparent absolute inset-0 z-10 bg-gradient-to-t md:hidden pointer-events-none" />
      )}

      {/* Image Container */}
      <div className="image-container flex items-center justify-center w-full my-4">
        {item.imageURL ? (
          <img
            src={item.imageURL}
            alt={item.title}
            className="w-full  border border-neutral-200 shadow-xs object-cover"
          />
        ) : (
          <div className="w-full h-40 flex items-center justify-center bg-neutral-100 rounded-xl border border-dashed border-neutral-300 text-neutral-400 text-sm">
            {/* PLACEHOLDER: Insert image URL in the imageURL field */}
            Image here
          </div>
        )}
      </div>

      {/* Grid Dashed Dividers */}
      {!isLast && (
        <>
          <DashedLine
            orientation="vertical"
            className="absolute top-0 right-0 max-md:hidden"
          />
          <DashedLine
            orientation="horizontal"
            className="absolute inset-x-0 bottom-0 md:hidden"
          />
        </>
      )}
    </div>
  );
};

export default IntegrationsSection;