"use client";

import React from "react";
import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
} from "@heroui/react";
import { Icon } from "@iconify/react";

type LogoutConfirmModalProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  /** Optional email shown in the copy */
  email?: string;
};

/** Extra step: confirm before ending the session. */
export default function LogoutConfirmModal({
  isOpen,
  onOpenChange,
  onConfirm,
  email,
}: LogoutConfirmModalProps) {
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      backdrop="opaque"
      isDismissable={!busy}
      isKeyboardDismissDisabled={busy}
      isOpen
      placement="center"
      onOpenChange={onOpenChange}
    >
      <ModalContent>
        {(onClose) => (
          <>
            <ModalHeader className="flex flex-col gap-1 font-display">
              Sign out?
            </ModalHeader>
            <ModalBody>
              <p className="text-small leading-6 text-default-600">
                Are you sure you want to sign out
                {email ? (
                  <>
                    {" "}
                    of <span className="font-medium text-foreground">{email}</span>
                  </>
                ) : null}
                ? You can sign in again with Google anytime.
              </p>
            </ModalBody>
            <ModalFooter>
              <Button
                className="t-btn-press"
                isDisabled={busy}
                radius="full"
                variant="flat"
                onPress={onClose}
              >
                Stay signed in
              </Button>
              <Button
                className="t-btn-press"
                color="danger"
                isLoading={busy}
                radius="full"
                startContent={
                  !busy && <Icon icon="solar:logout-2-linear" width={16} />
                }
                onPress={() => void handleConfirm()}
              >
                Yes, sign out
              </Button>
            </ModalFooter>
          </>
        )}
      </ModalContent>
    </Modal>
  );
}
