import type { ReactNode } from "react";
import { Link } from "react-router-dom";

/** Same two-column layout as the sign-in page: form on the left, photo on the right. */
export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-2">
      <div className="flex flex-col items-center justify-center px-6 py-10 sm:px-14 lg:px-24">
        <div className="mx-auto w-full max-w-xl">
          <Link to="/" className="mb-6 flex items-center gap-3">
            <img
              src="https://rlmcuhejgfftcdshbrbe.supabase.co/storage/v1/object/public/Company%20assets/Instay_Manage_Logo-removebg-preview.png"
              alt="Instay Manage"
              className="h-12 w-12 rounded-md object-contain"
            />
            <p className="font-sans text-2xl font-bold tracking-[-0.07em] text-blue-700">Instay Manage</p>
          </Link>
          {children}
          <p className="mt-10 text-center text-[12px] text-muted">© {new Date().getFullYear()} Instay Manage. All rights reserved.</p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden lg:flex lg:items-center lg:justify-center">
        <img
          src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?q=80&w=735&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Modern residential building"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
