import { QueryClient } from "@tanstack/react-query";

type ApiLikeError = {
  response?: {
    status?: number;
  };
};

const shouldRetryQuery = (failureCount: number, error: unknown) => {
  const status = (error as ApiLikeError | undefined)?.response?.status;

  if (status && status >= 400 && status < 500) {
    return false;
  }

  return failureCount < 2;
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: shouldRetryQuery,
    },
    mutations: {
      retry: 0,
    },
  },
});
