import { Link } from "react-router-dom";

import Button from "../landlord/components/Button";
import { motion } from "framer-motion";
import Nav from "./Nav";

export default function Hero() {
  return (
    // Removed overflow-hidden so the image can extend past the bottom
    <section className="relative bg-slate-900 pt-4 pb-12 sm:pb-16 ">
      <Nav />

      {/* Hero Content */}
      <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-10 text-center lg:pt-16">

        {/* Title */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.8, type: "spring" }}
          className="max-w-3xl font-display text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-white sm:text-5xl"
        >
          Property software that takes the manual work out of renting.
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7, type: "spring" }}
          className="mt-5 max-w-2xl text-balance text-base text-slate-200 sm:text-lg"
        >
          Manage property accounting, rent collection, payroll and maintenance in one place - saving your team hours every week.
        </motion.p>

        {/* CTA - MOBILE OPTIMIZED SIZE */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7, duration: 0.6, type: "spring" }}
          className="mt-8 flex w-full flex-col items-center justify-center sm:w-auto"
        >
          <Button
            variant="primary"
            className="inline-block bg-[#0056D2] hover:bg-[#0041A3] text-white font-medium text-base px-6 py-2.5 sm:px-8 sm:py-3.5 sm:text-base text-sm shadow-sm hover:shadow transition-all"
          >
            Book Free Demo
          </Button>
        </motion.div>

        {/* OVERLAPPING PRODUCT IMAGE CONTAINER */}
        {/* z-20 pushes it above the next section, -mb-* pulls it down outside the Hero */}
        <div
          
          className="relative z-20 mt-12 -mb-28 sm:-mb-36 lg:-mb-80 w-full max-w-4xl"
        >
          {/* Dashboard Image */}
          <img
            src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Landing%20page%20illustrations/Hero%20illustration.png"
            alt="Property management software product dashboard"
            className="h-auto w-full rounded-b-xl object-cover block"
          />
        </div>
      </div>

      {/* Background Layer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.1, duration: 1 }}
        className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-hidden"
      >
        <img
          src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Untitled%20design%20(6).png"
          alt="Background pattern"
          className="h-full w-full object-cover object-center"
        />
      </motion.div>
    </section>
  );
}
