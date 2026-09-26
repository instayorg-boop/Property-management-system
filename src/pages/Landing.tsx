import Hero from "../components/Hero";
import FeatureShowcase from "../components/FeatureShowcase";
import IntegrationsSection from "../components/IntegrationsSection";

import Footer from "../components/Footer";
import PricingSection from "../components/PricingSection";
import FaqSection from "../components/FaqSection";
import Background from "../components/background";

export default function Landing() {
  return (
    // 1. Set the main page background to Coursera Light Mist (#F5F8FF)
    // so white & blue cards stand out crisp and clear!
    <div className="min-h-screen bg-white text-[#1F1F1F]">
      <main className="space-y-2">
        {/* Top Hero Section Card */}
        
          <Hero />
    

        {/* Feature Showcase & Integrations */}
        <FeatureShowcase />
        <IntegrationsSection />

        {/* Pricing & FAQ wrapped in Coursera Blue Gradient Card */}
        <Background variant="full">
          <PricingSection />
          <FaqSection />
        </Background>

        
       
      </main>

      <Footer />
    </div>
  );
}