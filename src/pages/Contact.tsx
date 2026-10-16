import { Mail, MessageSquare, Phone, ArrowUpRight } from "lucide-react";

import Background from "../components/Background";
import Footer from "../components/Footer";
import Nav from "../components/Nav";
import { SUPPORT_PHONE_DISPLAY, SUPPORT_PHONE_TEL, SUPPORT_EMAIL, SUPPORT_WHATSAPP_URL, supportWhatsappUrl } from "../lib/supportContact";

const CONTACT_LINES = [
  {
    icon: MessageSquare,
    label: "WhatsApp",
    value: "Message us directly",
    href: SUPPORT_WHATSAPP_URL,
    note: "Usually the fastest way to reach us.",
  },
  {
    icon: Mail,
    label: "Email",
    value: SUPPORT_EMAIL,
    href: `mailto:${SUPPORT_EMAIL}`,
    note: "For anything you'd rather put in writing.",
  },
  {
    icon: Phone,
    label: "Phone",
    value: SUPPORT_PHONE_DISPLAY,
    href: SUPPORT_PHONE_TEL,
    note: "Weekdays, 8am to 5pm.",
  },
];

export const Contact = () => {
  return (
    <main className="bg-white text-gray-950">
      <Nav transparent={false} textColor="text-slate-900" />

      <Background variant="top">
        <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6 lg:py-24">
          {/* Header */}
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold font-display tracking-tight sm:text-4xl lg:text-5xl">
              Talk to someone about your property.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
              Questions about pricing, getting set up, or whether Instay Manage fits how you run
              things? Reach us directly, whichever way is easiest for you.
            </p>
          </div>

          {/* Contact options */}
          <div className="mt-14 grid gap-4 sm:grid-cols-3">
            {CONTACT_LINES.map(({ icon: Icon, label, value, href, note }) => (
              <a
                key={label}
                href={href}
                target={label === "WhatsApp" ? "_blank" : undefined}
                rel={label === "WhatsApp" ? "noopener noreferrer" : undefined}
                className="group flex flex-col rounded-xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-400 hover:shadow-sm"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                  <Icon className="size-4.5" />
                </span>
                <span className="mt-4 text-xs font-medium text-neutral-400">{label}</span>
                <span className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-neutral-950">
                  {value}
                  <ArrowUpRight className="size-3.5 shrink-0 text-neutral-400 transition group-hover:text-neutral-700" />
                </span>
                <p className="mt-2 text-xs leading-5 text-neutral-400">{note}</p>
              </a>
            ))}
          </div>

          {/* Demo callout */}
          <div className="mt-10 rounded-xl border border-neutral-200 bg-neutral-50 px-6 py-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div>
              <h2 className="text-sm font-semibold text-neutral-900">Managing more than one property?</h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                We can walk you through the platform and talk through what a larger portfolio would
                need.
              </p>
            </div>

            <a
              href={supportWhatsappUrl("Hi Instay Manage, I'd like to book a demo.")}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 sm:mt-0"
            >
              Book a demo
              <ArrowUpRight className="size-4" />
            </a>
          </div>
        </section>
      </Background>

      <Footer />
    </main>
  );
};

export default Contact;
