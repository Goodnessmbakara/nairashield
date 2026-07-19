"use client";

/**
 * App nav for dashboard views — highlights the active view only.
 * No scroll-spy / landing-page jump links.
 */

import React from "react";
import { Button, Tooltip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";

export type SidebarItem = {
  key: string;
  title: string;
  icon?: string;
};

export type SidebarNavProps = {
  items: SidebarItem[];
  activeKey: string;
  isCompact?: boolean;
  onSelect: (key: string) => void;
  className?: string;
};

const SidebarNav = React.forwardRef<HTMLElement, SidebarNavProps>(
  ({ items, activeKey, isCompact, onSelect, className }, ref) => {
    return (
      <nav
        ref={ref}
        aria-label="Dashboard views"
        className={cn("flex w-full flex-col gap-1", className)}
      >
        {items.map((item) => {
          const active = item.key === activeKey;
          const icon = item.icon ? (
            <Icon
              className={cn(active ? "text-primary" : "text-default-500")}
              icon={item.icon}
              width={20}
            />
          ) : null;

          if (isCompact) {
            return (
              <Tooltip key={item.key} content={item.title} placement="right">
                <Button
                  isIconOnly
                  aria-current={active ? "page" : undefined}
                  aria-label={item.title}
                  className={cn(
                    active && "bg-primary-50 text-primary",
                    !active && "text-default-600",
                  )}
                  color={active ? "primary" : "default"}
                  radius="lg"
                  size="md"
                  variant={active ? "flat" : "light"}
                  onPress={() => onSelect(item.key)}
                >
                  {icon}
                </Button>
              </Tooltip>
            );
          }

          return (
            <Button
              key={item.key}
              aria-current={active ? "page" : undefined}
              className={cn(
                "h-11 justify-start gap-3 px-3",
                active
                  ? "bg-primary-50 font-semibold text-primary data-[hover=true]:bg-primary-100"
                  : "text-default-600 data-[hover=true]:bg-primary-50/70 data-[hover=true]:text-primary-700",
              )}
              color={active ? "primary" : "default"}
              radius="lg"
              startContent={icon}
              variant={active ? "flat" : "light"}
              onPress={() => onSelect(item.key)}
            >
              <span className="text-small font-medium">{item.title}</span>
            </Button>
          );
        })}
      </nav>
    );
  },
);

SidebarNav.displayName = "SidebarNav";

export default SidebarNav;
