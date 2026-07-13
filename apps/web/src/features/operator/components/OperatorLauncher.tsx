"use client";

import { motion } from "framer-motion";
import { TaskListIcon } from "@/components/shared/icons/brand-icons";
import { useUIStore } from "@/store/ui.store";

/** Floating entry point to the Operator — always bottom-right, hidden while the drawer is open. */
export function OperatorLauncher() {
  const openOperator = useUIStore((s) => s.openOperator);
  const operatorOpen = useUIStore((s) => s.operatorOpen);

  if (operatorOpen) return null;

  return (
    <motion.button
      type="button"
      onClick={openOperator}
      aria-label="Open Operator"
      whileTap={{ scale: 0.96 }}
      className="surface-primary-gradient shadow-fab fixed bottom-5 right-[30px] z-40 flex h-[58px] w-[58px] items-center justify-center rounded-full"
    >
      <span
        className="surface-brand-gradient absolute inset-0 -z-10 rounded-full opacity-70 blur-md"
        aria-hidden
      />
      <TaskListIcon className="h-[34px] w-[34px]" />
    </motion.button>
  );
}
