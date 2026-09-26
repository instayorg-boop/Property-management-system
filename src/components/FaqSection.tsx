import React, { useState, type ElementType } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

// Utility for combining CSS class names
const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

interface QuestionItem {
  question: string;
  answer: string;
}

interface Category {
  title: string;
  questions: QuestionItem[];
}

const categories: Category[] = [
  {
    title: "Pricing & Plans",
    questions: [
      {
        question: "How much does IPM cost?",
        answer:
          "Plans are priced by how many units you manage, from a Small plan for smaller portfolios up to a custom Enterprise plan for 150+ units. Pricing is benchmarked against what local property owners already pay for POS-style software.",
      },
      {
        question: "What happens if I grow past my current plan?",
        answer:
          "You simply move up to the next tier as your unit count grows. There's no penalty for growing, and no need to migrate your data.",
      },
      {
        question: "Are there setup fees or long-term contracts?",
        answer:
          "No hidden setup fees. Your subscription covers the platform, and onboarding support is included to get you started.",
      },
    ],
  },
  {
    title: "Payments & Fees",
    questions: [
      {
        question: "How do tenants pay rent, and do they need to create an account?",
        answer:
          "No account or app download needed. Each tenant gets a secure payment link by SMS every month and pays by mobile money directly from that link.",
      },
      {
        question: "What fees apply to mobile money payments, and who pays them?",
        answer:
          "There's a small processing fee on each mobile money payment, built into the tenant-facing collection rather than added on top of your payout as a surprise deduction.",
      },
      {
        question: "When do I get paid out, and can I request an early payout?",
        answer:
          "Payouts run on a regular schedule, and on-demand payouts are available to every landlord regardless of plan, so you're not locked into waiting for a fixed payout date.",
      },
      {
        question: "Is the payout fee itemized, or bundled into the rent amount?",
        answer:
          "Itemized. Your payout statement shows the fee as a clearly labeled line item at cost, never rolled invisibly into the rent figure.",
      },
    ],
  },
  {
    title: "Tenant Experience",
    questions: [
      {
        question: "How do tenants get their payment link, and what if they lose it?",
        answer:
          "It arrives by SMS with the monthly rent reminder. If a tenant loses it or switches phones, they can request it again by phone number, no need to contact you directly.",
      },
      {
        question: "Is a tenant's payment history private from other tenants?",
        answer:
          "Yes. Each link is unique to that tenant and only shows their own balance and history, never anyone else's.",
      },
      {
        question: "What happens if a tenant pays late?",
        answer:
          "Late penalties accrue daily and follow a grace period you configure, so the rules match how you already run your property.",
      },
    ],
  },
  {
    title: "Security Deposits",
    questions: [
      {
        question: "Is deposit money kept separate from rent collections?",
        answer:
          "Yes. Deposits sit in their own ledger, separate from rent, so they're never mixed into your regular cash flow by accident.",
      },
      {
        question: "How do I return a deposit at move-out?",
        answer:
          "You process the return directly against that tenant's deposit ledger, keeping a clear record of what was collected and what was returned.",
      },
    ],
  },
  {
    title: "Onboarding & Support",
    questions: [
      {
        question: "What does the Instay team handle versus what I manage myself?",
        answer:
          "The Instay team's role is onboarding only, getting your units, tenants, and settings set up correctly. Day-to-day management is yours to run.",
      },
      {
        question: "How long does setup take, and do I need technical skills?",
        answer:
          "Most landlords are up and running within a few days. No technical background required, the interface is built for everyday use.",
      },
      {
        question: "Can I import my existing tenant and unit data?",
        answer:
          "Yes, your current tenants, units, and lease details can be brought over during onboarding so you're not starting from scratch.",
      },
    ],
  },
  {
    title: "Day-to-Day Use",
    questions: [
      {
        question: "Can I manage IPM from my phone, or do I need a computer?",
        answer:
          "Either works. The dashboard is fully usable on mobile, so you can check on properties without being at a desk.",
      },
      {
        question: "Does IPM work without internet?",
        answer:
          "Yes. You can keep viewing and updating records offline, and everything syncs automatically once you're back online.",
      },
      {
        question: "What does the daily briefing show me?",
        answer:
          "A quick snapshot of what needs your attention that day, payments in, overdue accounts, and anything else worth a glance before you start work.",
      },
    ],
  },
  {
    title: "Trust & Data",
    questions: [
      {
        question: "Is my financial data secure?",
        answer:
          "Yes. Rent, deposits, and payout data are handled with the same separation and care as the tenant-facing links, nothing is exposed beyond who needs to see it.",
      },
      {
        question: "What happens to my data if I cancel?",
        answer:
          "Your records remain yours. Reach out to the Instay team about exporting your data before closing your account.",
      },
    ],
  },
];

interface FaqSectionProps {
  headerTag?: "h1" | "h2";
  className?: string;
  className2?: string;
}

export const FaqSection: React.FC<FaqSectionProps> = ({
  headerTag = "h2",
  className,
  className2,
}) => {
  // Track which category is expanded, and which question within it is open
  const [openCategory, setOpenCategory] = useState<number | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);

  const toggleCategory = (categoryIndex: number) => {
    setOpenCategory((prev) => (prev === categoryIndex ? null : categoryIndex));
    // Collapse any open answer when switching categories
    setOpenItem(null);
  };

  const toggleItem = (id: string) => {
    setOpenItem((prev) => (prev === id ? null : id));
  };

  const HeaderComponent: ElementType = headerTag;

  return (
    <section className={cn("py-24 lg:py-32 text-neutral-900 bg-transparent", className)}>
      <div className="container mx-auto max-w-5xl px-6 lg:px-8">
        <div className={cn("mx-auto grid gap-12 lg:grid-cols-2 lg:gap-16", className2)}>

          {/* Left Side Header */}
          <div className="space-y-3">
            <HeaderComponent className="text-3xl font-extrabold font-display tracking-tight sm:text-4xl lg:text-5xl text-neutral-950">
              Got Questions?
            </HeaderComponent>
            <p className="text-xs sm:text-sm text-neutral-500 font-medium leading-relaxed max-w-sm">
              If you can't find what you're looking for,{" "}
              <Link
                to="/contact"
                className="text-neutral-600 underline underline-offset-4 hover:text-neutral-950 transition-colors"
              >
                get in touch
              </Link>
              .
            </p>
          </div>

          {/* Right Side Categories & Questions */}
          <div className="text-start">
            {categories.map((category, categoryIndex) => {
              const isCategoryOpen = openCategory === categoryIndex;

              return (
                <div
                  key={category.title}
                  className="border-b border-neutral-200/80 last:border-b-0"
                >
                  {/* Category Header (toggles the question list) */}
                  <button
                    type="button"
                    onClick={() => toggleCategory(categoryIndex)}
                    className="flex w-full items-center justify-between py-4 text-left group cursor-pointer"
                  >
                    <h3 className="text-sm sm:text-base font-semibold text-neutral-600 tracking-wide group-hover:text-neutral-900 transition-colors">
                      {category.title}
                    </h3>
                    <motion.span
                      animate={{ rotate: isCategoryOpen ? 90 : 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                      className="shrink-0"
                    >
                      <ChevronRight className="size-4 text-neutral-500" />
                    </motion.span>
                  </button>

                  {/* Collapsible Questions List */}
                  <AnimatePresence initial={false}>
                    {isCategoryOpen && (
                      <motion.div
                        key="questions"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-neutral-200/80 pl-4 sm:pl-6 border-l border-l-neutral-200">
                          {category.questions.map((item, questionIndex) => {
                            const itemId = `${categoryIndex}-${questionIndex}`;
                            const isOpen = openItem === itemId;

                            return (
                              <div
                                key={questionIndex}
                                className="border-b border-neutral-200/40 last:border-b-0 transition-colors"
                              >
                                <button
                                  type="button"
                                  onClick={() => toggleItem(itemId)}
                                  className="flex w-full items-center justify-between py-3.5 text-left text-sm sm:text-base font-bold text-neutral-900 hover:text-neutral-600 transition-colors group cursor-pointer"
                                >
                                  <span className="pr-4 leading-snug">{item.question}</span>
                                  <motion.span
                                    animate={{ rotate: isOpen ? 90 : 0 }}
                                    transition={{ duration: 0.2, ease: "easeOut" }}
                                    className="shrink-0"
                                  >
                                    <ChevronRight className="size-4 text-neutral-800" />
                                  </motion.span>
                                </button>

                                {/* Collapsible Answer */}
                                <AnimatePresence initial={false}>
                                  {isOpen && (
                                    <motion.div
                                      key="content"
                                      initial={{ height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={{ height: 0, opacity: 0 }}
                                      transition={{ duration: 0.2, ease: "easeOut" }}
                                      className="overflow-hidden"
                                    >
                                      <div className="pb-4 pt-1 text-sm sm:text-base text-neutral-500 font-normal leading-relaxed">
                                        {item.answer}
                                      </div>
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </section>
  );
};

export default FaqSection;