"use client";

import { useEffect } from "react";

export default function CloseTabPage() {
  useEffect(() => {
    window.close();
    const timer = window.setTimeout(() => {
      window.location.replace("/admin/orders");
    }, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <main className="mx-auto max-w-md p-6 text-center">
      <h1 className="text-xl font-semibold">Returning to Orders...</h1>
      <p className="mt-2 text-sm text-gray-700">
        If this tab does not close automatically, you can close it manually.
      </p>
    </main>
  );
}
