import { Link } from "react-router-dom";
import Nav from "./Nav";

export default function Hero() {
  return (
    
    <section className="relative h-screen overflow-hidden bg-white  pb-24 lg:pb-32">
<Nav/>
  

  <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-6 pt-12 text-center lg:pt-20">
    {/* Title */}
    <h1 className="max-w-2xl font-display  text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.09em] text-white sm:text-6xl">
      All in one property management system
    </h1>

    {/* Description */}
    <p className="mt-5 max-w-2xl text-balance text-base text-white sm:text-lg">
    Manage property accounting, rent collection and maintenance in one place - saving your team hours every week.
    </p>

    {/* Call to Actions */}
    <div className="mt-8 flex flex-col items-center justify-center sm:flex-row w-full sm:w-auto">
      <Link
        to="/get-started"
        className="w-full rounded-lg bg-brand px-6 py-3 text-sm font-medium text-paper transition-transform hover:scale-[1.02] sm:w-auto"
      >
        Book Free Demo
      </Link>
    </div>

    
  </div>

  {/* Full Background Scene Layer */}
  <div className="pointer-events-none absolute inset-0 z-0 h-full w-full overflow-hidden">
    <img
      src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Untitled%20design%20(6).png"
      alt="Background pattern"
      className="h-full w-full object-cover object-center  "
    />
  </div>
</section>
  );
}
