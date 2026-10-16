"use client";

import { AppProvider } from "@/store/AppStore";
import { AppShell } from "@/components/layout/AppShell";

export default function Page() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}