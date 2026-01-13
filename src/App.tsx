import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BackupProgressProvider } from "@/contexts/BackupProgressContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { BackupProgressBar } from "@/components/backup/BackupProgressBar";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Instances from "./pages/Instances";
import Jobs from "./pages/Jobs";
import Destinations from "./pages/Destinations";
import Executions from "./pages/Executions";
import ExecutionDetails from "./pages/ExecutionDetails";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import NotFound from "./pages/NotFound";
const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BackupProgressProvider>
        <Toaster />
        <Sonner />
        <BackupProgressBar />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              } />
              <Route path="/instances" element={
                <ProtectedRoute>
                  <Instances />
                </ProtectedRoute>
              } />
              <Route path="/jobs" element={
                <ProtectedRoute>
                  <Jobs />
                </ProtectedRoute>
              } />
              <Route path="/destinations" element={
                <ProtectedRoute>
                  <Destinations />
                </ProtectedRoute>
              } />
              <Route path="/executions" element={
                <ProtectedRoute>
                  <Executions />
                </ProtectedRoute>
              } />
              <Route path="/executions/:id" element={
                <ProtectedRoute>
                  <ExecutionDetails />
                </ProtectedRoute>
              } />
              <Route path="/alerts" element={
                <ProtectedRoute>
                  <Alerts />
                </ProtectedRoute>
              } />
              <Route path="/settings" element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              } />
              <Route path="/users" element={
                <ProtectedRoute requiredRole="admin">
                  <Users />
                </ProtectedRoute>
              } />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </BackupProgressProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
