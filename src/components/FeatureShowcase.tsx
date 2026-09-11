import { motion } from "framer-motion";
import { Link } from "react-router-dom";

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 fill-none stroke-emerald-600" strokeWidth={2}>
      <circle cx="10" cy="10" r="8.5" className="stroke-emerald-200" />
      <path d="M6.5 10.2l2.3 2.3 4.7-4.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 fill-none stroke-current transition-transform group-hover:translate-x-1" strokeWidth={2}>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Feature = {
  tag: string;
  title: string;
  emoji?: string;
  desc: string;
  points: string[];
  linkText: string;
  linkHref: string;
  imageSrc: string;
  imageAlt: string;
  overlayBadge?: {
    title: string;
    subtitle?: string;
    status?: string;
    statusColor?: string;
  };
};

const topFeatures: Feature[] = [
  {
    tag: "Rent & Financials",
    title: "Collect rent automatically without tracking receipts",
    emoji: "💳",
    desc: "Know exactly who has paid across every property and unit. Mobile money payments match directly to tenants, tracking partial payments and carried-over balances effortlessly.",
    points: [
      "Automated mobile money & bank reconciliation",
      "Partial payment tracking & overdue alerts",
      "Customizable grace periods per property"
    ],
    linkText: "See rent collection tools",
    linkHref: "/features/rent-collection",
    imageSrc: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Financial dashboard on laptop screen",
    overlayBadge: {
      title: "Mobile Money Match",
      subtitle: "K1,200 received from A. Mwansa",
      status: "Verified",
      statusColor: "bg-emerald-100 text-emerald-800"
    }
  },
  {
    tag: "Invoicing & Communication",
    title: "Automated invoices & WhatsApp reminders",
    emoji: "📩",
    desc: "Stop calling tenants every month. System-generated invoices calculate balances automatically and deliver directly to tenants or guardians via WhatsApp.",
    points: [
      "Pre-filled invoices with auto-calculated balances",
      "Scheduled reminders before and after due dates",
      "Instant PDF receipts sent upon payment"
    ],
    linkText: "Explore messaging & invoicing",
    linkHref: "/features/invoicing",
    imageSrc: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Property manager using tablet",
    overlayBadge: {
      title: "WhatsApp Dispatch",
      subtitle: "128 Rent Reminders Sent",
      status: "Delivered",
      statusColor: "bg-sky-100 text-sky-800"
    }
  },
  {
    tag: "Staff & Operations",
    title: "Clock-in kiosk & automatic payroll calculation",
    emoji: "⏱️",
    desc: "Ditch manual timesheets. On-site staff clock in via tablet, and working hours, overtime, and monthly pay auto-populate directly into payroll.",
    points: [
      "Tablet clock-in kiosk with photo verification",
      "Automatic overtime and penalty calculations",
      "One-click payroll reporting"
    ],
    linkText: "See time & attendance tools",
    linkHref: "/features/payroll",
    imageSrc: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Team collaboration",
    overlayBadge: {
      title: "Attendance Live",
      subtitle: "J. Tembo (07:58 – 17:02)",
      status: "Clocked In",
      statusColor: "bg-amber-100 text-amber-800"
    }
  },
  {
    tag: "Occupancy & Units",
    title: "Real-time room availability & lease management",
    emoji: "🏠",
    desc: "Always know your occupancy rate without checking spreadsheets. Track upcoming move-ins, vacant units, and lease renewals at a glance.",
    points: [
      "Interactive property map & status updates",
      "Digital tenant onboarding and document storage",
      "Automated lease renewal alerts"
    ],
    linkText: "Explore room & occupancy tools",
    linkHref: "/features/occupancy",
    imageSrc: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1200&q=80",
    imageAlt: "Modern apartment building",
    overlayBadge: {
      title: "Property Occupancy",
      subtitle: "92% Occupied (14 Units Open)",
      status: "Optimal",
      statusColor: "bg-purple-100 text-purple-800"
    }
  }
];

export default function DynamicFeatureShowcase() {
  return (
    <section className="py-24 overflow-hidden">
      <div className="mx-auto max-w-6xl px-6">
        
        {/* Section Header */}
        <div className="mx-auto max-w-2xl text-center mb-20">
          <span className="rounded-full bg-emerald-100/80 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800">
            All-In-One Platform
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Everything you need to run your properties effortlessly.
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            From rent collection to staff attendance—designed to eliminate hours of manual work every week.
          </p>
        </div>

        {/* Feature Blocks */}
        <div className="space-y-24 lg:space-y-32">
          {topFeatures.map((feature, index) => {
            const isEven = index % 2 === 0;

            return (
              <div 
                key={feature.title} 
                className={`grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-16 ${
                  isEven ? "" : "lg:grid-flow-dense"
                }`}
              >
                {/* Text Content */}
                <div className={`lg:col-span-6 ${isEven ? "" : "lg:col-start-7"}`}>
                  <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 shadow-sm">
                    {feature.tag}
                  </span>

                  <h3 className="mt-4 font-display text-2xl font-bold text-slate-900 sm:text-4xl leading-tight">
                    {feature.title} {feature.emoji && <span>{feature.emoji}</span>}
                  </h3>

                  <p className="mt-4 text-base leading-relaxed text-slate-600 sm:text-lg">
                    {feature.desc}
                  </p>

                  <ul className="mt-6 space-y-3">
                    {feature.points.map((pt) => (
                      <li key={pt} className="flex items-start gap-3 text-sm font-medium text-slate-700">
                        <CheckIcon />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-8">
                    <Link
                      to={feature.linkHref}
                      className="group inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-900 transition-colors"
                    >
                      <span>{feature.linkText}</span>
                      <ArrowIcon />
                    </Link>
                  </div>
                </div>

                {/* Media Side with Gusto-Style Shape & Floating Card */}
                <div className={`relative lg:col-span-6 ${isEven ? "" : "lg:col-start-1"}`}>
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-100px" }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="relative mx-auto max-w-md lg:max-w-none"
                  >
                    {/* Background Glow */}
                    <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-emerald-100 to-sky-100 opacity-60 blur-xl -z-10" />

                    {/* Styled Image Container with Soft Polygon Clipping */}
                    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-3 ">
                      <div className="relative h-72 sm:h-96 w-full overflow-hidden rounded-2xl">
                        <img
                          src={feature.imageSrc}
                          alt={feature.imageAlt}
                          className="h-full w-full object-cover object-center transition-transform duration-700 hover:scale-105"
                        />
                      </div>

                      {/* Floating UI Badge Card */}
                      {feature.overlayBadge && (
                        <div className="absolute top-6 left-6 z-10 max-w-xs rounded-2xl border border-white/80 bg-white/90 p-4 shadow-xl backdrop-blur-md">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-900">
                              {feature.overlayBadge.title}
                            </span>
                            {feature.overlayBadge.status && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${feature.overlayBadge.statusColor}`}>
                                {feature.overlayBadge.status}
                              </span>
                            )}
                          </div>
                          {feature.overlayBadge.subtitle && (
                            <p className="mt-1 text-xs text-slate-500">
                              {feature.overlayBadge.subtitle}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                </div>

              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}