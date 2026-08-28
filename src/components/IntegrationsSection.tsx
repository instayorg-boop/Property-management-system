import { Link } from "react-router-dom";

type LogoCardProps = {
  label: string;
  color: string;
  /** Paste a hosted image URL here to swap in the real logo. */
  logoUrl?: string;
  phase2?: boolean;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current" strokeWidth={1.75}>
      <path d="M3.5 8h9M8.5 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlaceholderGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-gray-300" strokeWidth={1.5}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.5" />
      <path d="M21 15l-5-5-9 9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HexIcon({ label, color, logoUrl, phase2 = false }: LogoCardProps) {
  return (
    <div title={label} className={`group relative ${phase2 ? "opacity-40" : ""}`}>
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-full border border-white bg-white shadow-sm ${
          phase2 ? "" : "shadow-gray-200/60"
        }`}
      >
        <div className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${color}`}>
          {logoUrl ? <img src={logoUrl} alt={label} className="h-full w-full object-cover" /> : <PlaceholderGlyph />}
        </div>
      </div>
    </div>
  );
}

/** Two staggered sub-columns that interlock like a honeycomb, mirrored via `flip`. */
function HexCluster({ items, flip = false }: { items: LogoCardProps[]; flip?: boolean }) {
  const colA = items.filter((_, i) => i % 2 === 0);
  const colB = items.filter((_, i) => i % 2 === 1);
  const cols = [
    <div key="a" className="flex flex-col gap-3">
      {colA.map((c) => (
        <HexIcon key={c.label} {...c} />
      ))}
    </div>,
    <div key="b" className="mt-8 flex flex-col gap-3">
      {colB.map((c) => (
        <HexIcon key={c.label} {...c} />
      ))}
    </div>,
  ];
  return <div className="flex justify-center gap-3">{flip ? cols.reverse() : cols}</div>;
}

/** A single diamond-shaped honeycomb cluster combining both sides, for mobile. */
function DiamondCluster({ items }: { items: LogoCardProps[] }) {
  const rows = [items.slice(0, 2), items.slice(2, 5), items.slice(5, 8), items.slice(8, 10), items.slice(10, 12)];
  return (
    <div className="flex flex-col items-center gap-3">
      {rows.map((row, i) => (
        <div key={i} className="flex justify-center gap-3">
          {row.map((c) => (
            <HexIcon key={c.label} {...c} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Fill in `logoUrl` with a hosted image URL for each brand once you have it.
const leftIcons: LogoCardProps[] = [
  {
    label: "MTN MoMo",
    color: "bg-yellow-50",
    logoUrl: "https://cdn.brandfetch.io/idtdXB-ogi/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1667849059567",
  },
  {
    label: "Airtel Money",
    color: "bg-red-50",
    logoUrl: "https://cdn.brandfetch.io/idvMDbAci6/w/400/h/400/theme/dark/icon.jpeg?c=1bxid64Mup7aczewSAYMX&t=1684941040904",
  },
  {
    label: "QuickBooks",
    color: "bg-blue-50",
    logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRyUFe--x-yetPMvdf9gNXRBc71sQ2s0sSPHF1m-rCMjA&s",
  },
  {
    label: "SMS",
    color: "bg-slate-50",
    logoUrl: "https://media.istockphoto.com/id/1047557398/vector/chat-bubble-message-vector-icon-or-typing-chat-or-comment-notification.jpg?s=612x612&w=0&k=20&c=r3ixDRcehZq1Mh9kgRqfuzn3e11MPP5w7CjoFjHkzkk=",
  },
];

const rightIcons: LogoCardProps[] = [
  {
    label: "NAPSA",
    color: "bg-purple-50",
    logoUrl: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQYbgcNZ4ypcDmaXOeBo06pJ0CEdeTRX-0F6sYqz5EVoA&s=10",
  },
  {
    label: "ZRA",
    color: "bg-purple-50",
    logoUrl: "https://media.licdn.com/dms/image/v2/C4D0BAQFgZBGWahnGMA/company-logo_200_200/company-logo_200_200/0/1630464729254/zambia_revenue_authority_zra_logo?e=2147483647&v=beta&t=QTaeuc67XZE4FQ6wVjZ15IEZ9of2lEuCbecyx567yRE",
  },
  {
    label: "Instay Homes",
    color: "bg-red-50",
    logoUrl: "https://rkrdixplbwmjsk8r.public.blob.vercel-storage.com/avatar/cmpz1r4np000004l1qxouaobk-1782814353578.jpg",
  },
  {
    label: "WhatsApp",
    color: "bg-emerald-50",
    logoUrl: "https://static.vecteezy.com/system/resources/previews/021/495/946/non_2x/whatsapp-logo-icon-free-png.png",
  },
];

function TextBlock() {
  return (
    <div className="text-center">
      <p className="text-[11px] font-medium tracking-widest text-brand uppercase">Built in</p>
      <h2 className="my-3 font-display text-2xl leading-snug font-semibold tracking-tight text-ink">
        MTN. Airtel. NAPSA. ZRA. All calculated for you.
      </h2>
      <p className="mx-auto mb-4 max-w-md text-sm leading-relaxed text-muted">
        You do not connect anything. Mobile money payments reconcile automatically.
        Staff pension contributions calculate from your payroll. Tax figures export
        ready for ZRA. It is all built in.
      </p>
      <Link to="/how-it-works" className="inline-flex items-center gap-1 text-sm font-semibold text-brand">
        See how it works
        <ArrowIcon />
      </Link>
    </div>
  );
}

export default function IntegrationsSection() {
  return (
    <section className="bg-paper px-6 py-14">
      <div className="mx-auto max-w-6xl">
        {/* Mobile: text on top, one combined diamond cluster below */}
        <div className="lg:hidden">
          <TextBlock />
          <div className="mt-10">
            <DiamondCluster items={[...leftIcons, ...rightIcons]} />
          </div>
        </div>

        {/* Desktop: text flanked by a cluster on each side */}
        <div className="hidden items-center gap-6 lg:grid lg:grid-cols-3">
          <HexCluster items={leftIcons} />
          <TextBlock />
          <HexCluster items={rightIcons} flip />
        </div>
      </div>
    </section>
  );
}
