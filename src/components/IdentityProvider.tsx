"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import IdentityGate from "./IdentityGate";
import type { MediaAsset } from "@/lib/types";

export type VisitorIdentity = {
  id: string;
  nickname: string;
  email: string;
  code: string;
  avatar: MediaAsset | null;
  animal: string;
};

type IdentityContextValue = {
  visitor: VisitorIdentity | null;
  isAdmin: boolean;
  /** Resolves true once we know who this is, false if they backed out. */
  ensureIdentity: (reason?: string) => Promise<boolean>;
  editIdentity: () => void;
};

const IdentityContext = createContext<IdentityContextValue | null>(null);

export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);
  if (!value) throw new Error("useIdentity must be used inside IdentityProvider");
  return value;
}

export default function IdentityProvider({
  children,
  initialVisitor,
  isAdmin,
  ownerName,
}: {
  children: React.ReactNode;
  initialVisitor: VisitorIdentity | null;
  isAdmin: boolean;
  ownerName: string;
}) {
  const router = useRouter();
  const [visitor, setVisitor] = useState<VisitorIdentity | null>(initialVisitor);
  const [gate, setGate] = useState<{ open: boolean; reason?: string; editing: boolean }>({
    open: false,
    editing: false,
  });
  const pending = useRef<((ok: boolean) => void) | null>(null);

  const ensureIdentity = useCallback(
    (reason?: string) => {
      if (isAdmin || visitor) return Promise.resolve(true);
      return new Promise<boolean>((resolve) => {
        pending.current = resolve;
        setGate({ open: true, reason, editing: false });
      });
    },
    [isAdmin, visitor],
  );

  const editIdentity = useCallback(() => {
    setGate({ open: true, editing: true });
  }, []);

  const settle = useCallback((ok: boolean) => {
    const resolve = pending.current;
    pending.current = null;
    setGate({ open: false, editing: false });
    resolve?.(ok);
  }, []);

  const value = useMemo(
    () => ({ visitor, isAdmin, ensureIdentity, editIdentity }),
    [visitor, isAdmin, ensureIdentity, editIdentity],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
      {gate.open && (
        <IdentityGate
          ownerName={ownerName}
          reason={gate.reason}
          existing={gate.editing ? visitor : null}
          onCancel={() => settle(false)}
          onSaved={(saved) => {
            setVisitor(saved);
            settle(true);
            router.refresh();
          }}
        />
      )}
    </IdentityContext.Provider>
  );
}
