"use client";

import React from "react";
import { HeroUIProvider } from "@heroui/react";
import SiteNavbar from "./landing/SiteNavbar";
import Hero from "./landing/Hero";
import BuiltOnMarquee from "./landing/BuiltOnMarquee";
import Agitation from "./landing/Agitation";
import Solution from "./landing/Solution";
import BentoGrid from "./landing/BentoGrid";
import Faq from "./landing/Faq";
import NeedHelp from "./landing/NeedHelp";
import SiteFooter from "./landing/SiteFooter";

/**
 * PAS landing:
 * Problem (hero) → Agitation → Solution → How it works → FAQ → Help
 */
export default function Landing() {
  return (
    <HeroUIProvider>
      <div className="relative flex min-h-dvh w-full flex-col overflow-x-hidden bg-background">
        <div className="hero-atmosphere w-full">
          <div className="hero-atmosphere__media" aria-hidden="true">
            <img alt="" decoding="async" fetchpriority="high" src="/bg.jpg" />
          </div>
          <div className="hero-atmosphere__veil" aria-hidden="true" />

          <div className="hero-atmosphere__content flex w-full flex-col items-center">
            <SiteNavbar />
            <Hero />
            <BuiltOnMarquee />
          </div>
        </div>

        <main className="page-surface flex w-full flex-col items-center">
          <Agitation />
          <Solution />
          <BentoGrid />
          <Faq />
          <NeedHelp />
        </main>
        <SiteFooter />
      </div>
    </HeroUIProvider>
  );
}
