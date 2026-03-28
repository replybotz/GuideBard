"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { useAuthStore } from "@/store/authStore";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, fetchMe } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    if (!isAuthenticated) fetchMe();
  }, [isAuthenticated, fetchMe, router]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-muted/30 p-6">{children}</main>
    </div>
  );
}
