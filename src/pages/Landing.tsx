import Nav from "../components/Nav";
import Hero from "../components/Hero";
import ProblemSection from "../components/ProblemSection";
import FeatureShowcase from "../components/FeatureShowcase";
import IntegrationsSection from "../components/IntegrationsSection";
import ScaleSection from "../components/ScaleSection";
import CTABanner from "../components/CTABanner";
import Footer from "../components/Footer";

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
    
      <main>
        <Hero />
        
        <FeatureShowcase />
        <IntegrationsSection />
        <ScaleSection />
        <CTABanner />
      </main>
      <Footer />
    </div>
  );
}
