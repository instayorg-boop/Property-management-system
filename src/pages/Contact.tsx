"use client";

import type { FormEvent } from "react";
import { Mail, MessageSquare, Phone } from "lucide-react";

import Button from "../landlord/components/Button";
import Background from "../components/Background";
import Footer from "../components/Footer";
import Nav from "../components/Nav";

const cn = (...classes: (string | boolean | undefined)[]) =>
  classes.filter(Boolean).join(" ");

// Replace with your actual WhatsApp number.
// Include country code, without +, spaces, or brackets.
const WHATSAPP_NUMBER = "260XXXXXXXXX";

const CONTACT_LINES = [
  {
    icon: Mail,
    label: "Email",
    value: "hello@instantmanage.com",
    href: "mailto:hello@instantmanage.com",
    note: "For anything you'd rather put in writing.",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "+260 XXX XXX XXX",
    href: "tel:+260XXXXXXXXX",
    note: "Weekdays, 8am to 5pm.",
  },
  {
    icon: MessageSquare,
    label: "WhatsApp",
    value: "Message us directly",
    href: undefined,
    note: "Usually the fastest way to reach us.",
  },
];

export const Contact = () => {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const form = new FormData(e.currentTarget);

    const name = form.get("name")?.toString().trim() || "";
    const email = form.get("email")?.toString().trim() || "";
    const property = form.get("property")?.toString().trim() || "";
    const subject = form.get("subject")?.toString().trim() || "";
    const message = form.get("message")?.toString().trim() || "";

    const whatsappMessage = `Hi Instant Manage,

My name is ${name}.
Email: ${email}
Property: ${property || "Not specified"}
Enquiry: ${subject || "General enquiry"}

${message}`;

    const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
      whatsappMessage
    )}`;

    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="bg-white text-gray-950">
      <Nav transparent={false} textColor="text-slate-900" />

      <Background variant="top">
        <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-24">
          {/* Header */}
          <div className="max-w-2xl">
            <h1 className="text-3xl font-bold font-display tracking-tight sm:text-4xl lg:text-5xl">
              Talk to someone about your property.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-neutral-500 sm:text-base">
              Questions about pricing, getting set up, or whether Instant
              Manage fits how you run things? Send us the details below and
              we&apos;ll get back to you.
            </p>
          </div>

          {/* Main content */}
          <div className="mt-14 grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-0">
            {/* Contact information — laid out like a statement */}
            <div className="lg:border-r lg:border-neutral-200 lg:pr-12">
              <p className="text-sm font-medium text-neutral-400">
                Reach us directly
              </p>

              <dl className="mt-6 divide-y divide-neutral-100 border-t border-neutral-100">
                {CONTACT_LINES.map(({ icon: Icon, label, value, href, note }) => (
                  <div key={label} className="flex items-start gap-4 py-5">
                    <Icon className="mt-0.5 size-4 shrink-0 text-neutral-400" />
                    <div className="min-w-0">
                      <dt className="text-xs text-neutral-400">{label}</dt>
                      <dd className="mt-1">
                        {href ? (
                          <a
                            href={href}
                            className="text-sm font-medium text-neutral-900 underline decoration-neutral-200 underline-offset-4 transition hover:decoration-neutral-400"
                          >
                            {value}
                          </a>
                        ) : (
                          <span className="text-sm font-medium text-neutral-900">
                            {value}
                          </span>
                        )}
                      </dd>
                      <p className="mt-1 text-xs text-neutral-400">{note}</p>
                    </div>
                  </div>
                ))}
              </dl>

              <div className="mt-10 border-t border-neutral-100 pt-8">
                <h2 className="text-sm font-semibold text-neutral-900">
                  Managing more than one property?
                </h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-neutral-500">
                  We can walk you through the platform and talk through what
                  a larger portfolio would need.
                </p>

                <button
                  type="button"
                  onClick={() => {
                    const message = encodeURIComponent(
                      "Hi Instant Manage, I'd like to book a demo."
                    );

                    window.open(
                      `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`,
                      "_blank",
                      "noopener,noreferrer"
                    );
                  }}
                  className="mt-4 text-sm font-semibold text-neutral-950 underline decoration-neutral-300 underline-offset-4 transition hover:decoration-neutral-950"
                >
                  Book a demo
                </button>
              </div>
            </div>

            {/* Contact form */}
            <div className="lg:pl-12">
              <form onSubmit={handleSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Name" name="name" placeholder="Your name" required />
                  <Field
                    label="Email"
                    name="email"
                    type="email"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div className="mt-5">
                  <Field
                    label="Property"
                    name="property"
                    placeholder="e.g. 120-bed student property"
                  />
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="subject"
                    className="mb-2 block text-sm font-medium text-neutral-800"
                  >
                    What can we help with?
                  </label>

                  <select
                    id="subject"
                    name="subject"
                    defaultValue=""
                    className="h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-700 outline-none transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
                  >
                    <option value="" disabled>
                      Select an option
                    </option>
                    <option value="Book a demo">Book a demo</option>
                    <option value="Pricing">Pricing</option>
                    <option value="Getting started">Getting started</option>
                    <option value="Product support">Product support</option>
                    <option value="Something else">Something else</option>
                  </select>
                </div>

                <div className="mt-5">
                  <label
                    htmlFor="message"
                    className="mb-2 block text-sm font-medium text-neutral-800"
                  >
                    Message
                  </label>

                  <textarea
                    id="message"
                    name="message"
                    rows={5}
                    required
                    placeholder="Tell us a little about what you need..."
                    className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
                  />
                </div>

                <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-xs text-xs leading-5 text-neutral-400">
                    Your message opens in WhatsApp so you can send it
                    straight to our team.
                  </p>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full rounded-lg bg-neutral-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 sm:w-auto"
                  >
                    Continue to WhatsApp
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </section>
      </Background>

      <Footer />
    </main>
  );
};

const Field = ({
  label,
  name,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  type?: string;
  required?: boolean;
}) => {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-medium text-neutral-800">
        {label}
      </label>

      <input
        id={name}
        type={type}
        name={name}
        placeholder={placeholder}
        required={required}
        className={cn(
          "h-11 w-full rounded-lg border border-neutral-200 bg-white px-3",
          "text-sm text-neutral-900 outline-none",
          "placeholder:text-neutral-400",
          "transition focus:border-neutral-400 focus:ring-2 focus:ring-neutral-100"
        )}
      />
    </div>
  );
};

export default Contact;