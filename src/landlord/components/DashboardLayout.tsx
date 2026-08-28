import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { ThemeProvider, useTheme } from "../ThemeContext";
import { ExpensesProvider } from "../ExpensesContext";
import { StaffProvider } from "../StaffContext";

function Shell() {
  const { isDark } = useTheme();

  return (
    <div className={`flex h-screen flex-col overflow-hidden bg-mist ${isDark ? "theme-dark" : ""}`}>
      <Topbar />
      <div className="flex flex-1 gap-3 overflow-hidden px-3 pb-3">
        <Sidebar />
        <main className="flex-1 overflow-y-auto rounded-2xl border border-line bg-paper">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  return (
    <ThemeProvider>
      <ExpensesProvider>
        <StaffProvider>
          <Shell />
        </StaffProvider>
      </ExpensesProvider>
    </ThemeProvider>
  );
}
