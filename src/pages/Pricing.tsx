"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import Button from "../landlord/components/Button";
import Background from "../components/Background";
import Nav from "../components/Nav";
import Footer from "../components/Footer";
import { PLAN_TIERS, COMPARISON_FEATURES, type FeatureValue } from "../lib/plans";

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// Plan/feature data now lives in src/lib/plans.ts so it can't drift from what Settings/Header
// show in-app — `plans` and `comparisonFeatures` below are just this page's local aliases,
// shaped the way the rest of this file already expects them.
const plans = PLAN_TIERS.map((t) => ({
  name: t.label,
  bedRange: t.bedRange,
  monthlyPrice: t.monthlyPrice,
  setupFee: t.setupFee,
  priceIsFrom: t.priceIsFrom,
  isFeatured: t.isFeatured,
  features: t.features,
  additionalFeatures: t.additionalFeatures,
}));

const comparisonFeatures = COMPARISON_FEATURES;

const ANNUAL_MONTHS_CHARGED = 10;

const formatKwacha = (amount: number) =>
  `K${amount.toLocaleString("en-ZM", {
    maximumFractionDigits: 0,
  })}`;

const renderFeatureValue = (value: FeatureValue) => {
  if (value === true) {
    return (
      <span className="flex size-5 items-center justify-center rounded-full bg-brand">
        <Check className="size-3 text-white" />
      </span>
    );
  }

  if (value === false || value === null) {
    return <X className="size-4 text-red-300" />;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-">
        <Check className="size-3 text-neutral-700" />
      </span>
      <span className="text-sm text-neutral-500">{value}</span>
    </div>
  );
};

export const Pricing = () => {
  const [isAnnual, setIsAnnual] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(1);

  return (
    <main className="text-neutral-950 bg-white">
      <Nav
        transparent={false}
        textColor="text-slate-900"
      />
      {/* Hero + pricing */}
      <Background variant="top" >

        <section>
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 lg:pt-16">
            {/* Compact hero */}
            <div className="mx-auto max-w-2xl text-center">
              <p className="mb-3 text-xs uppercase tracking-[0.16em] text-neutral-400">
                Pricing
              </p>

              <h1 className="text-3xl font-bold font-display tracking-tight sm:text-4xl lg:text-5xl">
                Simple pricing for growing properties
              </h1>

              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
                Choose a plan based on the size of your property and manage
                tenants, payments, maintenance, and operations in one place.
              </p>
            </div>

            {/* Billing toggle */}
            <div className="mt-8 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsAnnual(false)}
                className={cn(
                  "text-sm font-medium transition-colors",
                  !isAnnual ? "text-neutral-950" : "text-neutral-600"
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

              <span className="rounded-full border border-gray-400 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
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
                      "h-fit rounded-xl border bg-white p-6",
                      plan.isFeatured
                        ? "border-brand"
                        : "border-neutral-200"
                    )}
                  >
                    {/* Header */}
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-lg font-bold">
                          {plan.name}
                        </h2>

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
                      <div className="flex font-display items-baseline gap-1.5">
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
                      onClick={() => window.location.assign("/contact")}
                      className={cn(
                        "mt-7 w-full rounded-lg px-4 py-2.5 text-sm font-semibold",
                        plan.isFeatured
                          ? "bg-neutral-950 text-white hover:bg-neutral-800"
                          : "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50"
                      )}
                    >
                      Talk to us
                    </Button>

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

                          <span className="leading-5">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* Additional */}
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
                              <motion.div
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
                                <ul className="space-y-3 pt-4">
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
                                </ul>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </>
                      )}
                  </motion.div>
                );
              })}
            </div>

            <p className="mt-7 text-center text-xs text-neutral-400">
              Online rent collection is optional. Processing fees are
              charged separately.
            </p>
          </div>
        </section>
      </Background>

      {/* Comparison */}
      <section className="border-t border-neutral-100">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 ">
          {/* Comparison heading */}
          <div className="mb-10 max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-400">
              Compare plans
            </p>

            <h2 className="mt-2 text-2xl font-bold font-display tracking-tight sm:text-3xl">
              Everything you need to run your property
            </h2>

            <p className="mt-3 text-sm leading-6 text-neutral-500">
              Compare features across each plan and choose what fits
              your property.
            </p>
          </div>

          {/* Mobile plan selector */}
          <div className="md:hidden">
            <MobilePlanSelector
              selectedPlan={selectedPlan}
              onPlanChange={setSelectedPlan}
            />
          </div>

          {/* Desktop headers */}
          <div
            className="hidden border-b border-neutral-200 pb-5 md:grid md:grid-cols-4 md:gap-6 md:sticky md:top-[72px] bg-white z-20"
            style={{ /* Adjust top offset if Nav height changes */ }}
          >
            <div />

            {plans.map((plan) => (
              <div key={plan.name}>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{plan.name}</h3>

                  {plan.isFeatured && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[9px] font-semibold text-white">
                      Popular
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-neutral-400">
                  {plan.bedRange}
                </p>
              </div>
            ))}
          </div>
     

          {/* Feature sections */}
          <div>
            {comparisonFeatures.map((section) => (
              <div key={section.category}>
                <div className="border-b border-neutral-200 py-5">
                  <h3 className="text-sm font-semibold">
                    {section.category}
                  </h3>
                </div>

                {section.features.map((feature) => (
                  <div
                    key={feature.name}
                    className="grid grid-cols-2 border-b border-neutral-100 md:grid-cols-4 md:gap-6"
                  >
                    <div className="flex items-center py-4 pr-4">
                      <span className="text-sm font-medium text-neutral-700">
                        {feature.name}
                      </span>
                    </div>

                    {/* Mobile */}
                    <div className="flex items-center justify-end py-4 md:hidden">
                      {renderFeatureValue(
                        [
                          feature.starter,
                          feature.growth,
                          feature.enterprise,
                        ][selectedPlan]
                      )}
                    </div>

                    {/* Desktop */}
                    <div className="hidden md:col-span-3 md:grid md:grid-cols-3 md:gap-6">
                      {[
                        feature.starter,
                        feature.growth,
                        feature.enterprise,
                      ].map((value, index) => (
                        <div
                          key={index}
                          className="flex items-center py-4"
                        >
                          {renderFeatureValue(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <p className="mt-8 text-xs text-neutral-400">
            Need something specific for your property? Enterprise plans
            can be tailored to your requirements.
          </p>
        </div>
      </section>
      <Footer />
    </main>
  );
};

const MobilePlanSelector = ({
  selectedPlan,
  onPlanChange,
}: {
  selectedPlan: number;
  onPlanChange: (index: number) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-6">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
      >
        <div className="text-left">
          <p className="text-xs text-neutral-400">Showing</p>
          <p className="mt-0.5 font-semibold">
            {plans[selectedPlan].name}
          </p>
        </div>

        <ChevronsUpDown
          className={cn(
            "size-4 text-neutral-500 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-1 rounded-lg border border-neutral-200 bg-white p-1">
              {plans.map((plan, index) => (
                <button
                  key={plan.name}
                  type="button"
                  onClick={() => {
                    onPlanChange(index);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition-colors",
                    selectedPlan === index
                      ? "bg-neutral-100 font-semibold text-neutral-950"
                      : "text-neutral-600 hover:bg-neutral-50"
                  )}
                >
                  <span>{plan.name}</span>
                  <span className="text-xs text-neutral-400">
                    {plan.bedRange}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Pricing;