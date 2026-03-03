import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 120000, // 2 minutes to allow for Playwright scraping + LLM extracting claims
  headers: {
    "Content-Type": "application/json",
  },
});

// Add a response interceptor for easier error handling if needed
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Standardize error reporting
    console.error("API Error:", error.response?.data || error.message);
    return Promise.reject(error);
  },
);

export default api;
