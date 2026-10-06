"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useState } from "react";
import { ApiError } from "@/services/api-client";

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            // The backend already answered (401/403/404/...) — retrying
            // won't change that, UNLESS the error envelope explicitly marked
            // itself `retryable` (5xx/429 — see contracts/json-schemas.md >
            // Error Schema). Network blips (not a typed ApiError) are always
            // worth one retry.
            retry: (failureCount, error) =>
              (!(error instanceof ApiError) || error.retryable) && failureCount < 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
