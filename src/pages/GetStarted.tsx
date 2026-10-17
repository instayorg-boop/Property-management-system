import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp, requestSignupOtp, verifySignupOtp } from "../lib/auth";
import Button from "../landlord/components/Button";
import LocationPicker, { type Location } from "../components/LocationPicker";
import PhoneNumberInput from "../landlord/components/PhoneNumberInput";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.92l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56v-3.1H1.27a12 12 0 0 0 0 10.76l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.35.6 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.62l4 3.1C6.22 6.87 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

const input =
  "w-full rounded-md border border-line bg-paper px-3 py-2 text-[14px] outline-none transition-colors placeholder:text-muted/60 focus:border-brand";
const label = "mb-1 block text-[12px] font-medium text-muted";

export default function GetStarted() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [propertyName, setPropertyName] = useState("");
  const [loc, setLoc] = useState<Location>({ address: "", lat: null, lng: null });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  // Phone is verified here, at sign-up, rather than left for Settings > SMS later — otherwise
  // nobody finds that page and the SMS alert number just stays blank. Once verified, the OTP step
  // locks: changing the number afterwards starts verification over.
  const [phone, setPhone] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [devCode, setDevCode] = useState<string | null>(null);

  const changePhone = (v: string) => {
    setPhone(v);
    setPhoneVerified(false);
    setOtpSent(false);
    setOtpCode("");
    setOtpError(null);
    setDevCode(null);
  };

  const sendOtp = async () => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      const { devCode: code } = await requestSignupOtp(phone);
      setOtpSent(true);
      setDevCode(code ?? null);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Couldn't send a code. Try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  const confirmOtp = async () => {
    setOtpError(null);
    setOtpLoading(true);
    try {
      await verifySignupOtp(phone, otpCode);
      setPhoneVerified(true);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setOtpLoading(false);
    }
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!phoneVerified) {
      setError("Verify your phone number to continue.");
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signUp(
        email,
        password,
        name,
        propertyName,
        loc.address.trim(),
        loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null,
        phone,
      );
      if (result.session) {
        navigate("/dashboard", { replace: true });
      } else {
        // Email confirmation is required before Supabase issues a session.
        setCheckEmail(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account. Try again.");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-white grid-cols-1 lg:grid-cols-2">
      {/* Left: form */}
      <div className="flex flex-col items-center justify-center px-6 py-8 sm:px-14 lg:px-24">
        <div className="mx-auto w-full max-w-xl">
          <Link to="/" className="flex items-center gap-3 mb-6">
            <img src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png" alt="Instay Manage" className="h-12 w-12 rounded-md object-contain" />
            <p className="font-sans text-blue-700 text-2xl font-bold tracking-[-0.07em]">Instay Manage</p>
          </Link>

          {checkEmail ? (
            <>
              <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">Check your email</h1>
              <p className="mb-5 text-[14px] text-muted">
                We sent a confirmation link to <span className="font-medium text-ink">{email}</span>. Click it to
                activate your account, then come back and sign in.
              </p>
              <Link to="/sign-in">
                <Button type="button" variant="primary" size="md" className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper">
                  Back to sign in
                </Button>
              </Link>
            </>
          ) : (
            <>
              <div className="mb-4 flex items-center gap-2">
                <span className="h-1 flex-1 rounded-full bg-brand" />
                <span className={`h-1 flex-1 rounded-full ${step === 2 ? "bg-brand" : "bg-line"}`} />
                <span className="ml-1 text-[12px] text-muted">Step {step} of 2</span>
              </div>

              <h1 className="font-sans text-2xl font-semibold tracking-tight mb-1">
                {step === 1 ? "Create your account" : "Tell us about your property"}
              </h1>
              <p className="mb-5 text-[14px] text-muted">
                {step === 1 ? "Free to start. No credit card required." : "This is what tenants will see on their payment page."}
              </p>

              {error && <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600">{error}</p>}

              {step === 1 ? (
                <>
                  <div className="space-y-2 mb-5">
                    <Button
                      type="button"
                      disabled
                      title="Coming soon"
                      size="md"
                      className="w-full flex items-center justify-center gap-2 rounded-md border border-line bg-paper text-[14px] font-medium text-ink opacity-60 cursor-not-allowed"
                    >
                      <GoogleIcon />
                      Continue with Google
                    </Button>
                  </div>
                  <div className="my-6 flex items-center gap-4">
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[12px] text-muted">or</span>
                    <span className="h-px flex-1 bg-line" />
                  </div>
                  <form className="space-y-4" onSubmit={next}>
                    <div>
                      <label htmlFor="name" className={label}>Full name</label>
                      <input id="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={input} />
                    </div>
                    <div>
                      <label htmlFor="email" className={label}>Email address</label>
                      <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@property.co" className={input} />
                    </div>
                    <div>
                      <label htmlFor="password" className={label}>Password</label>
                      <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className={input} />
                    </div>
                    <div>
                      <label htmlFor="phone" className={label}>Phone number</label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <PhoneNumberInput value={phone} onChange={changePhone} />
                        </div>
                        {!phoneVerified && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="md"
                            disabled={!phone.trim() || otpLoading}
                            onClick={sendOtp}
                            className="shrink-0 rounded-md px-3 text-[13px] font-medium disabled:opacity-60"
                          >
                            {otpLoading && !otpSent ? "Sending…" : otpSent ? "Resend" : "Send code"}
                          </Button>
                        )}
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        We'll text a code to confirm it's yours — this becomes your SMS alert number.
                      </p>

                      {phoneVerified ? (
                        <p className="mt-2 flex items-center gap-1 text-[13px] font-medium text-emerald-600">
                          ✓ Phone verified
                        </p>
                      ) : otpSent ? (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                            placeholder="6-digit code"
                            className={`${input} flex-1`}
                          />
                          <Button
                            type="button"
                            variant="primary"
                            size="md"
                            disabled={otpCode.length !== 6 || otpLoading}
                            onClick={confirmOtp}
                            className="shrink-0 rounded-md bg-brand px-4 text-[13px] font-medium text-paper disabled:opacity-60"
                          >
                            {otpLoading ? "Checking…" : "Verify"}
                          </Button>
                        </div>
                      ) : null}

                      {devCode && !phoneVerified && (
                        <p className="mt-1 text-[12px] text-amber-600">Dev mode — code is {devCode}</p>
                      )}
                      {otpError && <p className="mt-1 text-[12px] font-medium text-red-600">{otpError}</p>}
                    </div>
                    <Button type="submit" variant="primary" size="md" className="w-full rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01]">
                      Continue
                    </Button>
                  </form>
                </>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="property-name" className={label}>Property name</label>
                    <input id="property-name" type="text" required value={propertyName} onChange={(e) => setPropertyName(e.target.value)} placeholder="e.g. Kabulonga House" className={input} />
                  </div>
                  <div>
                    <label htmlFor="property-address" className={label}>Property location</label>
                    <LocationPicker id="property-address" value={loc} onChange={setLoc} inputClassName={input} />
                  </div>
                  <p className="pt-1 text-[12px] leading-relaxed text-muted">
                    By creating an account, you agree to Instay Manage's{" "}
                    <Link to="/terms" target="_blank" className="font-medium text-ink underline-offset-2 hover:underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link to="/privacy" target="_blank" className="font-medium text-ink underline-offset-2 hover:underline">
                      Privacy Policy
                    </Link>
                    .
                  </p>

                  <div className="flex gap-2 pt-1">
                    <Button type="button" variant="secondary" size="md" onClick={() => setStep(1)} className="rounded-md px-5 text-[14px] font-medium">
                      Back
                    </Button>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={loading}
                      size="md"
                      className="flex-1 rounded-md bg-brand py-2 text-[14px] font-medium text-paper transition-transform hover:scale-[1.01] disabled:opacity-70 disabled:hover:scale-100"
                    >
                      {loading ? "Creating account…" : "Create account"}
                    </Button>
                  </div>
                </form>
              )}

              <p className="mt-5 text-center text-[13px] text-muted">
                Already have an account?{" "}
                <Link to="/sign-in" className="font-medium text-brand underline-offset-2 hover:underline">
                  Sign in
                </Link>
              </p>
            </>
          )}

          <p className="mt-10 text-center text-[12px] text-muted">
            © {new Date().getFullYear()} Instay Manage. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right: visual */}
      <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <img
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Modern residential building"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
