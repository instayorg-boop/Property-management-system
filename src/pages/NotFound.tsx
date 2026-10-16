import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-slate-600">The page you are looking for does not exist or has moved.</p>
      <div className="mt-6 flex gap-3">
        <Link to="/" className="rounded-md bg-[#0056D2] px-4 py-2 text-sm font-medium text-white hover:bg-[#0041A3]">
          Go home
        </Link>
        <Link to="/sign-in" className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50">
          Sign in
        </Link>
      </div>
    </div>
  );
}
