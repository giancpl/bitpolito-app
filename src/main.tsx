import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { MotionConfig } from "motion/react";
import { FeedbackProvider } from "./components/Feedback";
import { IdentityProvider } from "./lib/identity";
import "./style.css";
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10000 } },
});
const router = createBrowserRouter([{ path: "*", element: <App /> }]);
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <MotionConfig reducedMotion="user">
      <FeedbackProvider>
        <IdentityProvider>
          <RouterProvider router={router} />
        </IdentityProvider>
      </FeedbackProvider>
    </MotionConfig>
  </QueryClientProvider>,
);
