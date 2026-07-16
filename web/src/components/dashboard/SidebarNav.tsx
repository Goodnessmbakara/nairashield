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
              className={cn(active ? "text-foreground" : "text-default-500")}
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
                    active && "bg-default-100 text-foreground",
                    !active && "text-default-600",
                  )}
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
                  ? "bg-default-100 font-semibold text-foreground"
                  : "text-default-600 data-[hover=true]:bg-default-100/80 data-[hover=true]:text-foreground",
              )}
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
