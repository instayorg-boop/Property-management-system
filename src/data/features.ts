export type FeatureDetail = {
  slug: string;
  panelLabel: string;
  gradient: string;
  title: string;
  desc: string;
  points: string[];
  navLabel: string;
};

export const featureDetails: FeatureDetail[] = [
  {
    slug: "rent-collection",
    panelLabel: "Collect rent",
    gradient: "from-sky-100 via-sky-50 to-indigo-100",
    title: "See who's paid and who owes you, instantly.",
    desc: "Collect rent by mobile money or cash, and know exactly where every tenant stands. No more chasing balances across notebooks and WhatsApp threads.",
    points: [
      "Pay by mobile money (MTN, Airtel) or cash",
      "Reminders sent automatically before and after due dates",
      "Balances update in real time, per tenant and per property",
      "Receipts sent instantly on every payment",
    ],
    navLabel: "Rent collection",
  },
  {
    slug: "rooms-occupancy",
    panelLabel: "Rooms - 92% occupied",
    gradient: "from-emerald-100 via-lime-50 to-emerald-50",
    title: "Know which rooms are open, without checking a file.",
    desc: "Room status updates live, so nothing gets double-booked by mistake — whether you manage one block or a whole portfolio.",
    points: [
      "Live status per room and per property",
      "Move-ins and move-outs tracked automatically",
      "Occupancy at a glance, rolled up across buildings",
      "No more double bookings from stale spreadsheets",
    ],
    navLabel: "Rooms & occupancy",
  },
  {
    slug: "tenants",
    panelLabel: "Tenant reminders",
    gradient: "from-rose-100 via-pink-50 to-orange-100",
    title: "Every tenant, one record, no chasing.",
    desc: "Reminders go out on their own, and guardians get notified if a payment is missed — so nothing falls through the cracks.",
    points: [
      "Add a tenant in minutes, with full lease history",
      "Deposits kept separate from rent, always reconciled",
      "Guardians and next-of-kin alerted automatically",
      "Full payment history, month by month",
    ],
    navLabel: "Tenant management",
  },
  {
    slug: "reports",
    panelLabel: "Monthly report",
    gradient: "from-violet-100 via-purple-50 to-fuchsia-100",
    title: "Every report you need, ready to share.",
    desc: "Collection rates, arrears, rent roll — branded and easy to hand to an owner, without building a spreadsheet by hand every month.",
    points: [
      "Income and expenses, broken down per property",
      "Arrears sorted by how overdue they are",
      "Share as PDF, email, or WhatsApp in one tap",
      "Tax figures export ready for ZRA",
    ],
    navLabel: "Reports",
  },
  {
    slug: "payroll",
    panelLabel: "Staff & payroll",
    gradient: "from-amber-100 via-yellow-50 to-orange-100",
    title: "Staff hours and pay, calculated for you.",
    desc: "Clock staff in from a kiosk, and let payroll — including NAPSA contributions — calculate itself at the end of the month.",
    points: [
      "Clock-in kiosk for caretakers and site staff",
      "NAPSA pension contributions calculated automatically",
      "Payslips generated and shareable in one tap",
      "Staff hours tied directly to each property",
    ],
    navLabel: "Staff & payroll",
  },
];
