import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RootLayout from "@/layouts/RootLayout";
import Home from "@/pages/Home";
import Products from "@/pages/Products";
import Explore from "@/pages/Explore";
import NewAnalysis from "@/pages/NewAnalysis";
import ThemeDetails from "@/pages/ThemeDetails";
import Dashboard from "@/pages/Dashboard";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import TestAnalytics from "./pages/TestAnalytics";
import ExperimentPage from "./pages/ExperimentPage";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<RootLayout />}>
              {/* Public/Landing */}
              <Route index element={<Home />} />

              {/* Analytics Dashboard */}
              <Route path="dashboard" element={<Dashboard />} />

              {/* Product Listing Map View */}
              <Route path="products" element={<Products />} />

              {/* Main Visualizer for a Product */}
              <Route path="products/:productId" element={<Explore />} />

              {/* New Analysis / Ingestion */}
              <Route path="new" element={<NewAnalysis />} />

              {/* A/B Testing Mission */}
              <Route
                path="experiment/:productId"
                element={<ExperimentPage />}
              />

              {/* Deep dive into a specific Theme */}
              <Route
                path="products/:productId/theme/:themeId"
                element={<ThemeDetails />}
              />

              {/* Test Analytics */}
              <Route path="test-analytics" element={<TestAnalytics />} />

              {/* Admin */}
              <Route path="admin/login" element={<AdminLogin />} />
              <Route path="admin" element={<AdminDashboard />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
