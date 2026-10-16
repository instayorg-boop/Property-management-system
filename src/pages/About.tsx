
"use client";

import { ArrowDown } from "lucide-react";


import Nav from "../components/Nav";
import Background from "../components/Background";
import Footer from "../components/Footer";

const team = [
  {
    name: "Marcus",
    role: "Product & Engineering",
    image: "https://ailsausnebzlvikttqkh.supabase.co/storage/v1/object/public/logo//WhatsApp%20Image%202025-05-11%20at%2018%20(1).54",
  },
  {
    name: "Jackson",
    role: "Operations",
    image: "https://ailsausnebzlvikttqkh.supabase.co/storage/v1/object/public/logo//WhatsApp%20Image%202025-05-10%20at%2016.07.35_4083aa12.jpg",
  }
];

const journeyImages = [
  "https://ailsausnebzlvikttqkh.supabase.co/storage/v1/object/public/logo//WhatsApp%20Image%202025-06-12%20at%2019.11.15_db03df6b.jpg",
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/IMG_1993.jpg",
  "https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/555675041_17897852349297592_6885517465935823949_n.jpg",
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#fafaf8] text-neutral-950">
      <Nav
        transparent={false}
        textColor="text-slate-900"
      />

      {/* ───────────────────────── HERO ───────────────────────── */}
      <Background variant="top" >
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 lg:pb-32 lg:pt-24">
        <div className="max-w-3xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-700">
            About Instay Manage
          </p>

          <h1 className="mt-5 text-4xl font-semibold font-display leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-[64px]">
            We&apos;re building software for people who manage property.
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-7 text-neutral-500 sm:text-lg sm:leading-8">
            Instay Manage started from working closely with property owners
            and seeing how much of their day was still being managed manually.
            We decided to build something better.
          </p>
        </div>

        {/* Team */}
        <div className="mt-16 flex flex-wrap items-center gap-7 sm:mt-20">
          {team.map((person) => (
            <div
              key={person.name}
              className="flex items-center gap-3"
            >
              <img
                src={person.image}
                alt={person.name}
                className="w-32 h-32 rounded-full object-cover"
              />

              <div>
                <p className="text-sm font-medium">{person.name}</p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {person.role}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-16 flex items-center gap-2 text-xs text-neutral-400">
          <ArrowDown className="size-3.5" />
          <span>How it started</span>
        </div>
      </section>
      </Background>

      {/* ─────────────────────── INSTAYHOMES ─────────────────────── */}

      <section className="">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 ">
          <div className="grid gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Before Instay Manage
              </p>

              <h2 className="mt-4 text-3xl font-semibold font-display leading-tight tracking-[-0.03em] sm:text-4xl">
                It started with InstayHomes.
              </h2>
            </div>

            <div className="space-y-6 text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              <p>
                Before building Instay Manage, we were already working with
                property owners through InstayHomes, our student accommodation
                marketplace.
              </p>

              <p>
                We helped property owners market their rooms, connect with
                students and fill their properties. That meant spending a lot
                of time talking to the people actually running these
                properties.
              </p>

              <p>
                And the more properties we worked with, the more we noticed
                something beyond finding tenants.
              </p>
            </div>
          </div>

          {/* Journey images */}
          <div className="mt-20 grid gap-4 sm:grid-cols-3">
            {journeyImages.map((image, index) => (
              <div
                key={image}
                className={`overflow-hidden rounded-xl ${
                  index === 1 ? "sm:translate-y-8" : ""
                }`}
              >
                <img
                  src={image}
                  alt="InstayHomes journey"
                  className="aspect-[4/5] w-full object-cover"
                />
              </div>
            ))}
          </div>

          <p className="mt-12 max-w-xl text-xs leading-5 text-neutral-400">
            Our journey working with property owners through InstayHomes gave
            us a much closer look at how properties are actually operated.
          </p>
        </div>
      </section>

      {/* ───────────────────── THE PROPERTY MANAGER ───────────────────── */}

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
          <div className="max-w-3xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
              The turning point
            </p>

            <h2 className="mt-5 text-3xl font-semibold font-display leading-[1.12] tracking-[-0.035em] sm:text-4xl lg:text-5xl">
              Then a property manager came to us with a different problem.
            </h2>

            <div className="mt-8 space-y-6 text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              <p>
                We were already working with one of their properties through
                InstayHomes. But eventually, the conversation moved beyond
                marketing rooms.
              </p>

              <p>
                They were managing a large number of units and needed a better
                way to handle the day-to-day operation of the property.
              </p>

              <p>
                Rent. Tenants. Payments. Maintenance. Staff. Records.
              </p>

              <p className="font-medium text-neutral-950">
                There were too many things to keep track of, and too much of it
                was still being done manually.
              </p>
            </div>
          </div>

          {/* Pull quote */}
          <div className="mt-12 py-10 ">
            <p className="max-w-4xl text-2xl font-medium leading-[1.25] tracking-[-0.025em] sm:text-3xl lg:text-4xl">
              That conversation changed what we thought Instay could become.
            </p>
          </div>
        </div>
      </section>

      {/* ───────────────────── THE REALIZATION ───────────────────── */}

      <section className="bg-[#fafaf8]">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
          <div className="grid gap-16 lg:grid-cols-2 lg:gap-24">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                The realization
              </p>

              <h2 className="mt-5 text-3xl font-semibold font-display leading-[1.12] tracking-[-0.035em] sm:text-4xl">
                We started building for one property. Then we realized it was
                a much bigger problem.
              </h2>
            </div>

            <div className="space-y-6 text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              <p>
                The more we understood their workflow, the more we saw the
                same patterns we had encountered across other properties.
              </p>

              <p>
                Spreadsheets for payments. WhatsApp for communication.
                Separate records for tenants. Manual maintenance tracking.
                Payroll calculated by hand.
              </p>

              <p>
                The software available to many property operators simply
                wasn&apos;t built around the way they actually worked.
              </p>

              <p className="font-medium text-neutral-950">
                So we decided to build it ourselves.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ───────────────────── INSTAY MANAGE ───────────────────── */}

      <section className="bg-neutral-950 text-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
          <div className="max-w-3xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/40">
              Instay Manage
            </p>

            <h2 className="mt-5 text-3xl font-semibold font-display leading-[1.1] tracking-[-0.035em] sm:text-4xl lg:text-5xl">
              One place to run the property.
            </h2>

            <p className="mt-7 max-w-2xl text-base leading-7 text-white/60 sm:text-lg sm:leading-8">
              Instay Manage brings the everyday operations of a property
              together, from tenants and rooms to rent collection,
              maintenance, payroll and reporting.
            </p>
          </div>

          {/* Product capabilities */}
          <div className="mt-20 grid border-l border-t border-white/10 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["01", "Rent collection"],
              ["02", "Tenant management"],
              ["03", "Rooms & availability"],
              ["04", "Maintenance"],
              ["05", "Payroll"],
              ["06", "Reports & insights"],
            ].map(([number, title]) => (
              <div
                key={number}
                className="border-b border-r border-white/10 p-6 sm:p-8"
              >
                <span className="text-xs text-white/30">
                  {number}
                </span>

                <p className="mt-10 text-sm font-medium sm:text-base">
                  {title}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────────────────── BUILT IN ZAMBIA ───────────────────── */}

      <section className="bg-white">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-36">
          <div className="grid gap-16 lg:grid-cols-[1fr_0.8fr] lg:gap-24">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-400">
                Where we&apos;re building
              </p>

              <h2 className="mt-5 text-3xl font-semibold leading-[1.12] tracking-[-0.035em] sm:text-4xl lg:text-5xl">
                Built in Zambia. Built around real workflows.
              </h2>
            </div>

            <div className="space-y-6 text-base leading-7 text-neutral-600 sm:text-lg sm:leading-8">
              <p>
                We&apos;re building from Zambia because this is where we first
                experienced the problem.
              </p>

              <p>
                That means understanding the realities of local property
                management, from mobile money and local payment workflows to
                the way landlords, managers and tenants actually communicate.
              </p>

              <p>
                We&apos;re starting with the problems we know firsthand and
                building from there.
              </p>
            </div>
          </div>
        </div>
      </section>

    

     <Footer/>
    </main>
  );
}

