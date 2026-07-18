"use client";

/**
 * App sidebar: brand + views on top; profile + sign out at the bottom.
 * Run check lives only in the top header (once).
 */

import React from "react";
import {
  Avatar,
  Button,
  Chip,
  ScrollShadow,
  Tooltip,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import BrandMark from "../ui/BrandMark";
import type { AuthUser } from "../../lib/auth";
import SidebarNav from "./SidebarNav";
import { dashboardNav, type DashboardView } from "./sidebar-items";

export type DashboardSidebarProps = {
  user: AuthUser | null;
  activeView: DashboardView;
  onViewChange: (view: DashboardView) => void;
  isCompact: boolean;
  onToggleCompact: () => void;
  onNavigate?: () => void;
  onLogout: () => void;
  connected: boolean;
  className?: string;
  hideCollapse?: boolean;
};

const DashboardSidebar = React.memo(
  React.forwardRef<HTMLDivElement, DashboardSidebarProps>(
  (
    {
      user,
      activeView,
      onViewChange,
      isCompact,
      onToggleCompact,
      onNavigate,
      onLogout,
      connected,
      className,
      hideCollapse,
    },
    ref,
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          "flex h-full w-full flex-col bg-content1",
          isCompact ? "items-center px-2 py-4" : "px-4 py-4",
          className,
        )}
      >
        <div
          className={cn(
            "flex w-full shrink-0 items-center gap-2",
            isCompact ? "flex-col gap-3" : "justify-between",
          )}
        >
          <a
            aria-label="Retegol home"
            className={cn("flex min-w-0 items-center gap-2", isCompact && "justify-center")}
            href="/"
          >
            <BrandMark size="sm" />
            {!isCompact && (
              <span className="font-display truncate text-small font-bold tracking-tight text-foreground">
                Retegol
              </span>
            )}
          </a>
          {!hideCollapse && (
            <Tooltip content={isCompact ? "Expand sidebar" : "Collapse sidebar"} placement="right">
              <Button
                isIconOnly
                aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
                className="text-default-500"
                radius="full"
                size="sm"
                variant="light"
                onPress={onToggleCompact}
              >
                <Icon
                  icon={
                    isCompact ? "solar:alt-arrow-right-linear" : "solar:alt-arrow-left-linear"
                  }
                  width={20}
                />
              </Button>
            </Tooltip>
          )}
        </div>

        <ScrollShadow className="mt-5 min-h-0 w-full flex-1">
          <SidebarNav
            activeKey={activeView}
            isCompact={isCompact}
            items={dashboardNav}
            onSelect={(key) => {
              onViewChange(key as DashboardView);
              onNavigate?.();
            }}
          />
        </ScrollShadow>

        <div
          className={cn(
            "mt-3 flex w-full shrink-0 flex-col gap-3 border-t border-divider pt-3",
            isCompact && "items-center",
          )}
        >
          <div
            className={cn("flex w-full items-center gap-3", isCompact ? "justify-center" : "")}
          >
            {isCompact ? (
              <Tooltip content={user?.email || user?.name || "Account"} placement="right">
                <Avatar
                  isBordered
                  className="shrink-0"
                  name={user?.name || "U"}
                  size="sm"
                  src={user?.picture}
                />
              </Tooltip>
            ) : (
              <>
                <Avatar
                  isBordered
                  className="shrink-0"
                  name={user?.name || "U"}
                  size="sm"
                  src={user?.picture}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <p className="truncate text-small font-medium text-default-700">
                    {user?.name || "Signed in"}
                  </p>
                  <p className="truncate text-tiny text-default-400">{user?.email}</p>
                </div>
              </>
            )}
          </div>

          {!isCompact && (
            <Chip
              classNames={{ content: "font-medium text-[0.65rem]" }}
              color={connected ? "success" : "warning"}
              radius="sm"
              size="sm"
              variant="flat"
            >
              {connected ? "Agent live" : "Agent limited"}
            </Chip>
          )}

          {isCompact ? (
            <Tooltip content="Sign out" placement="right">
              <Button
                isIconOnly
                color="danger"
                radius="full"
                size="sm"
                variant="light"
                onPress={onLogout}
              >
                <Icon icon="solar:logout-2-linear" width={18} />
              </Button>
            </Tooltip>
          ) : (
            <Button
              className="justify-start text-default-500 data-[hover=true]:text-danger"
              color="danger"
              radius="full"
              startContent={<Icon icon="solar:logout-2-linear" width={20} />}
              variant="light"
              onPress={onLogout}
            >
              Sign out
            </Button>
          )}
        </div>
      </div>
    );
  },
  ),
);

DashboardSidebar.displayName = "DashboardSidebar";

export default DashboardSidebar;
