"use client";

import type { NavbarProps } from "@heroui/react";

import React from "react";
import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Link,
  Button,
  Divider,
  cn,
} from "@heroui/react";
import { nav } from "../../data/landing";
import BrandMark from "../ui/BrandMark";

/**
 * Rectangular floating bar: N + links + Sign in.
 */
const SiteNavbar = React.forwardRef<HTMLElement, NavbarProps>(
  ({ classNames = {}, ...props }, ref) => {
    const [isMenuOpen, setIsMenuOpen] = React.useState(false);

    return (
      <div className="header-float">
        <Navbar
          ref={ref}
          {...props}
          as="header"
          classNames={{
            ...classNames,
            base: cn(
              "static relative inset-auto z-40 mx-auto w-fit max-w-[calc(100%-1.5rem)]",
              "rounded-xl border border-default-200 bg-content1 px-1.5 py-1",
              {
                "w-[calc(100%-1.5rem)] max-w-sm rounded-xl": isMenuOpen,
              },
              classNames.base,
            ),
            wrapper: cn(
              "h-11 w-fit min-w-0 max-w-none justify-start gap-1 px-1.5 sm:gap-2 sm:px-2",
              classNames.wrapper,
            ),
            item: cn("hidden md:flex", classNames.item),
          }}
          height="44px"
          isBlurred={false}
          isBordered
          isMenuOpen={isMenuOpen}
          maxWidth="full"
          position="static"
          shouldHideOnScroll={false}
          onMenuOpenChange={setIsMenuOpen}
        >
          <NavbarBrand as={Link} className="mr-1 max-w-fit flex-none gap-0 px-0.5" href="/">
            <BrandMark size="sm" />
          </NavbarBrand>

          <NavbarContent
            className="!basis-auto !grow-0 !flex-grow-0 hidden gap-0.5 md:flex"
            justify="start"
          >
            {nav.map((item) => (
              <NavbarItem key={item.href} className="!basis-auto !grow-0">
                <Link
                  className="px-2.5 py-1.5 text-default-600 transition-colors duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-foreground"
                  href={item.href}
                  size="sm"
                >
                  {item.label}
                </Link>
              </NavbarItem>
            ))}
          </NavbarContent>

          <NavbarContent className="!basis-auto !grow-0 !flex-grow-0 ml-1 hidden md:flex" justify="end">
            <NavbarItem className="!basis-auto !grow-0">
              <Button
                as={Link}
                className="t-btn-press t-btn-primary bg-default-foreground font-medium text-background"
                href="/login"
                radius="full"
                size="sm"
              >
                Sign in
              </Button>
            </NavbarItem>
          </NavbarContent>

          <NavbarMenuToggle className="ml-1 text-default-500 md:hidden" />

          <NavbarMenu
            className="left-1/2 top-[calc(var(--navbar-height)+0.5rem)] mx-0 max-h-fit w-[min(20rem,calc(100vw-1.5rem))] max-w-sm -translate-x-1/2 rounded-xl border border-default-200 bg-content1 px-4 pb-5 pt-4 shadow-medium"
            motionProps={{
              initial: { opacity: 0, y: -8 },
              animate: { opacity: 1, y: 0 },
              exit: { opacity: 0, y: -8 },
              transition: { ease: "easeInOut", duration: 0.18 },
            }}
          >
            <NavbarMenuItem className="mb-4">
              <Button
                fullWidth
                as={Link}
                className="t-btn-press t-btn-primary bg-foreground text-background"
                href="/login"
                radius="full"
              >
                Sign in
              </Button>
            </NavbarMenuItem>
            {nav.map((item, index) => (
              <NavbarMenuItem key={item.href}>
                <Link
                  className="mb-2 w-full text-default-600"
                  href={item.href}
                  size="md"
                  onPress={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </Link>
                {index < nav.length - 1 && <Divider className="opacity-50" />}
              </NavbarMenuItem>
            ))}
          </NavbarMenu>
        </Navbar>
      </div>
    );
  },
);
SiteNavbar.displayName = "SiteNavbar";

export default SiteNavbar;
