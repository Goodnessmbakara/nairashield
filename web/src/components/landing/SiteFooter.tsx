"use client";

/**
 * Design ProMax footer - brand column + link columns + bottom bar.
 * No newsletter clutter (waitlist removed). No social spam.
 * @see sources/Marketing/footers (4)__App.tsx
 */

import React from "react";
import { Link } from "@heroui/react";
import BrandMark from "../ui/BrandMark";

const product = [
  { name: "How it works", href: "#how" },
  { name: "Get started", href: "/login" },
];

const support = [
  { name: "FAQ", href: "#faq" },
  { name: "Need help", href: "#help" },
  { name: "Sign in", href: "/login" },
];

function FooterList({
  title,
  items,
}: {
  title: string;
  items: { name: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="text-small font-semibold text-default-600">{title}</h3>
      <ul className="mt-5 space-y-3">
        {items.map((item) => (
          <li key={item.name}>
            <Link
              className="text-default-400 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground"
              href={item.href}
              size="sm"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SiteFooter() {
  return (
    <footer className="flex w-full flex-col border-t border-default-200 bg-content1">
      <div className="mx-auto w-full max-w-6xl px-6 pb-8 pt-14 sm:pt-16 lg:px-8">
        <div className="grid gap-10 md:grid-cols-3 md:gap-8">
          <div className="space-y-4 md:pr-6">
            <div className="flex items-center gap-2.5">
              <BrandMark size="sm" />
              <span className="font-display text-small font-semibold tracking-tight text-foreground">
                Edgeora
              </span>
            </div>
            <p className="max-w-xs text-small leading-6 text-default-500">
              Earn while you wait. Move only when it pays.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 md:col-span-2 md:grid-cols-2">
            <FooterList title="Product" items={product} />
            <FooterList title="Support" items={support} />
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-default-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-tiny text-default-400">
            © {new Date().getFullYear()} Edgeora
          </p>
          <p className="text-tiny text-default-300">Not financial advice</p>
        </div>
      </div>
    </footer>
  );
}
