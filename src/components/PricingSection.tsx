"use client";

import React, { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Button from "../landlord/components/Button";

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

interface Plan {
  name: string;
  bedRange: string;
  monthlyPrice: number;
  setupFee: number;
  priceIsFrom?: boolean;
  features: string[];
  additionalFeatures?: string[];
  isFeatured?: boolean;
}

const ANNUAL_MONTHS_CHARGED = 10;

const plans: Plan[] = [
  {
    name: "Starter",
    bedRange: "Up to 80 beds",
    monthlyPrice: 799,
    setupFee: 999,
    features: [
      "Tenant & room management",
      "Automatic rent collection",
      "Rent tracking & digital receipts",
      "Automated reminders",
      "Maintenance management",
      "Reports & dashboard",
    ],
    additionalFeatures: [
      "Up to 200 SMS/month",
      "Up to 2 staff logins",
    ],
  },

  {
    name: "Growth",
    bedRange: "81–299 beds",
    monthlyPrice: 1499,
    setupFee: 1999,
    isFeatured: true,
    features: [
      "Everything in Starter",
      "Unlimited automated reminders",
      "Advanced reports & analytics",
      "Staff attendance tracking",
      "Automatic payroll calculation",
      "Up to 5 staff logins",
    ],
    additionalFeatures: [
      "Increased document storage",
    ],
  },

  {
    name: "Enterprise",
    bedRange: "300+ beds",
    monthlyPrice: 2499,
    setupFee: 2999,
    priceIsFrom: true,
    features: [
      "Everything in Growth",
      "Unlimited staff logins",
      "Custom invoice & receipt branding",
      "Guided onboarding",
      "Data migration",
      "Custom pricing",
    ],
    additionalFeatures: [
      "Dedicated setup support",
      "Custom requirements",
    ],
  },
];

const formatKwacha = (amount: number) =>
  `K${amount.toLocaleString("en-ZM", {
    maximumFractionDigits: 0,
  })}`;

export const PricingSection = ({
  className,
}: {
  className?: string;
}) => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

  return (
    <section className={cn("text-neutral-950", className)}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 ">

        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Simple, transparent pricing
          </h2>

          <p className="mt-4 text-sm leading-6 text-neutral-500 sm:text-base">
            Choose a plan based on the size of your property. Every plan
            includes the tools you need to manage tenants and collect rent.
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setIsAnnual(false)}
            className={cn(
              "text-sm font-medium transition-colors",
              !isAnnual ? "text-neutral-950" : "text-neutral-400"
            )}
          >
            Monthly
          </button>

          <button
            type="button"
            role="switch"
            aria-checked={isAnnual}
            onClick={() => setIsAnnual(!isAnnual)}
            className={cn(
              "relative h-6 w-11 rounded-full transition-colors",
              isAnnual ? "bg-neutral-950" : "bg-neutral-300"
            )}
          >
            <motion.span
              animate={{ x: isAnnual ? 20 : 0 }}
              transition={{
                type: "spring",
                stiffness: 500,
                damping: 30,
              }}
              className="absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm"
            />
          </button>

          <button
            type="button"
            onClick={() => setIsAnnual(true)}
            className={cn(
              "text-sm font-medium transition-colors",
              isAnnual ? "text-neutral-950" : "text-neutral-400"
            )}
          >
            Annual
          </button>

          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
            2 months free
          </span>
        </div>

        {/* Pricing cards */}
        <div className="mt-10 grid items-start gap-5 lg:grid-cols-3 lg:gap-6">
          {plans.map((plan) => {
            const displayedMonthly = isAnnual
              ? Math.round(
                  (plan.monthlyPrice * ANNUAL_MONTHS_CHARGED) / 12
                )
              : plan.monthlyPrice;

            const annualTotal =
              plan.monthlyPrice * ANNUAL_MONTHS_CHARGED;

            const isExpanded = expandedPlan === plan.name;

            return (
              <motion.div
                key={plan.name}
                whileHover={{ y: -3 }}
               
                className={cn(
                  "h-fit rounded-md border bg-white p-6",
                  plan.isFeatured
                    ? "border-brand "
                    : "border-neutral-200 "
                )}
              >
                {/* Plan heading */}
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">
                      {plan.name}
                    </h3>

                    {plan.isFeatured && (
                      <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-semibold text-white">
                        Most popular
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-neutral-500">
                    {plan.bedRange}
                  </p>
                </div>

                {/* Price */}
                <div className="mt-7">
                  <div className="flex items-baseline gap-1.5">
                    {plan.priceIsFrom && (
                      <span className="text-sm text-neutral-500">
                        From
                      </span>
                    )}

                    <AnimatePresence mode="wait">
                      <motion.span
                        key={isAnnual ? "annual" : "monthly"}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        transition={{ duration: 0.15 }}
                        className="text-3xl font-bold tracking-tight"
                      >
                        {formatKwacha(displayedMonthly)}
                      </motion.span>
                    </AnimatePresence>

                    <span className="text-sm text-neutral-500">
                      /month
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-neutral-400">
                    + {formatKwacha(plan.setupFee)} one-time setup
                    {isAnnual && (
                      <>
                        {" "}
                        · {formatKwacha(annualTotal)} billed annually
                      </>
                    )}
                  </p>
                </div>

                {/* CTA */}
                <Button
                  variant={plan.isFeatured ? "primary" : "outline"}
             
                  className={cn(
                    "mt-7 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
                    plan.isFeatured
                      ? "bg-neutral-950 text-white hover:bg-neutral-800"
                      : "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                  )}
                >
                  Talk to us
                </Button>

                {/* Divider */}
                <div className="my-6 h-px bg-neutral-100" />

                {/* Features */}
                <ul className="space-y-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-neutral-600"
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                        <Check className="size-2.5 text-neutral-700" />
                      </span>

                      <span className="leading-5">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Additional features */}
                {plan.additionalFeatures &&
                  plan.additionalFeatures.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedPlan(
                            isExpanded ? null : plan.name
                          )
                        }
                        className="mt-5 flex items-center gap-1.5 text-xs font-semibold text-neutral-500 hover:text-neutral-900"
                      >
                        {isExpanded
                          ? "Hide additional features"
                          : "View additional features"}

                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            isExpanded && "rotate-180"
                          )}
                        />
                      </button>

                      <AnimatePresence initial={false}>
                        {isExpanded && (
                          <motion.ul
                            initial={{
                              height: 0,
                              opacity: 0,
                            }}
                            animate={{
                              height: "auto",
                              opacity: 1,
                            }}
                            exit={{
                              height: 0,
                              opacity: 0,
                            }}
                            className="overflow-hidden"
                          >
                            <div className="space-y-3 pt-4">
                              {plan.additionalFeatures.map(
                                (feature) => (
                                  <li
                                    key={feature}
                                    className="flex items-start gap-2.5 text-sm text-neutral-500"
                                  >
                                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-neutral-100">
                                      <Check className="size-2.5" />
                                    </span>

                                    <span className="leading-5">
                                      {feature}
                                    </span>
                                  </li>
                                )
                              )}
                            </div>
                          </motion.ul>
                        )}
                      </AnimatePresence>
                    </>
                  )}
              </motion.div>
            );
          })}
        </div>

        {/* Small note */}
        <p className="mt-8 text-center text-xs text-neutral-400">
          Online rent collection is optional. Processing fees are charged
          separately.
        </p>
      </div>
    </section>
  );
};

export default PricingSection;