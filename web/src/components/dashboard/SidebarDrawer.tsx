"use client";

/**
 * Mobile drawer only when open — avoids stacking backdrop/shadow portals
 * under rapid open/close stress.
 */

import React from "react";
import { Drawer, DrawerBody, DrawerContent } from "@heroui/react";

type SidebarDrawerProps = {
  children: React.ReactNode;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const SidebarDrawer = React.forwardRef<HTMLDivElement, SidebarDrawerProps>(
  ({ children, isOpen = false, onOpenChange }, ref) => {
    // Unmount drawer tree when closed so no residual overlay / shadow operator
    if (!isOpen) return null;

    return (
      <Drawer
        ref={ref}
        hideCloseButton={false}
        classNames={{
          base: "w-[min(18rem,88vw)] max-w-[18rem] !m-0 rounded-none",
          body: "p-0",
          backdrop: "bg-black/40",
          closeButton: "z-50",
        }}
        isOpen
        placement="left"
        radius="none"
        scrollBehavior="inside"
        shouldBlockScroll
        onOpenChange={onOpenChange}
      >
        <DrawerContent>
          <DrawerBody className="h-full p-0">{children}</DrawerBody>
        </DrawerContent>
      </Drawer>
    );
  },
);

SidebarDrawer.displayName = "SidebarDrawer";

export default SidebarDrawer;
