"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const router = useRouter();

  function handleLogin(e) {
    e.preventDefault();
    // Apnar pochhondo moto username ebong password ekhane set kore din
    if (username === "admin" && password === "stellar2026") {
      localStorage.setItem("stellar_auth", "true");
      router.push("/");
    } else {
      setError(true);
    }
  }

  return (
    <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-4">
      <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full space-y-6">
        <div>
          <h1 className="text-xl font-bold text-white">STELLAR WORM</h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono">// SECURE ACCESS PORTAL</p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-3 rounded-xl">
            Incorrect username or password. Please try again.
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
              required
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3.5 rounded-xl transition cursor-pointer"
        >
          Unlock Engine 🔓
        </button>
      </form>
    </div>
  );
}
