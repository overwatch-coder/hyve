import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import RootLayout from "@/layouts/RootLayout";
import AdminLayout from "@/layouts/AdminLayout";
import { Toaster } from "@/components/ui/sonner";
import Home from "@/pages/Home";
import Products from "@/pages/Products";
import Explore from "@/pages/Explore";
import NewAnalysis from "@/pages/NewAnalysis";
import ThemeDetails from "@/pages/ThemeDetails";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import AdminExperimentReview from "./pages/AdminExperimentReview";
import TestAnalytics from "./pages/TestAnalytics";
import ExperimentPage from "./pages/ExperimentPage";
import AmazonSearch from "@/pages/AmazonSearch";
import AmazonProductPage from "@/pages/AmazonProductPage";
import About from "@/pages/About";
import FAQ from "@/pages/FAQ";
import Team from "@/pages/Team";
import Privacy from "@/pages/Privacy";
import StudyLanding from "@/pages/StudyLanding";
import StudySession from "@/pages/StudySession";
import AdminStudies from "@/pages/AdminStudies";
import AdminStudyDetail from "@/pages/AdminStudyDetail";
import AdminExperimentAnalysis from "@/pages/AdminExperimentAnalysis";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <BrowserRouter>
          <Routes>
            {/* Invite-only study routes — full-screen, no nav shell */}
            <Route path="study" element={<StudyLanding />} />
            <Route path="study/:inviteCode" element={<StudyLanding />} />
            <Route path="study/:inviteCode/session" element={<StudySession />} />

            {/* Admin login — standalone page */}
            <Route path="admin/login" element={<AdminLogin />} />

            {/* Admin section — sidebar layout */}
            <Route path="admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboard />} />
              <Route path="experiments/review" element={<AdminExperimentReview />} />
              <Route path="experiments/studies" element={<AdminStudies />} />
              <Route path="experiments/studies/:studyId" element={<AdminStudyDetail />} />
              <Route path="experiments/analysis" element={<AdminExperimentAnalysis />} />
            </Route>

            <Route path="/" element={<RootLayout />}>
              {/* Public/Landing */}
              <Route index element={<Home />} />

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

              {/* Amazon Product Search & Native Reviews */}
              <Route path="amazon" element={<AmazonSearch />} />
              <Route path="amazon/:asin" element={<AmazonProductPage />} />

              {/* About, FAQ & Legal */}
              <Route path="about" element={<About />} />
              <Route path="faq" element={<FAQ />} />
              <Route path="team" element={<Team />} />
              <Route path="privacy" element={<Privacy />} />
            </Route>
          </Routes>
          <Toaster />
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
