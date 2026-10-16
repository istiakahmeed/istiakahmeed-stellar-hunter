"use client";
import { useState, useEffect } from "react";

export default function StellarCommandCenter() {
  const [mode, setMode] = useState("auto");
  const [category, setCategory] = useState("MedSpa");
  const [location, setLocation] = useState("Miami Florida");
  const [targetFilter, setTargetFilter] = useState("all");
  const [emailList, setEmailList] = useState("");
  const [customTopic, setCustomTopic] = useState("");

  const [leads, setLeads] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [sentHistory, setSentHistory] = useState([]);

  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem("stellar_sent_emails") || "[]");
    setSentHistory(saved);
  }, []);

  // ধাপ ১: লিড খুঁজে বের করা এবং AI ইমেইল ড্রাফট তৈরি করা
  async function handleDiscover(e) {
    e.preventDefault();
    setScanning(true);
    setLeads([]);

    try {
      const payload = mode === "auto"
        ? { action: "discover", category, location, targetFilter }
        : { action: "prepare_manual", emailList, customTopic };

      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        // আগে মেইল পাঠানো হয়েছে এমন ইমেইল মার্ক করে দেওয়া
        const checkedLeads = data.leads.map(l => ({
          ...l,
          status: sentHistory.includes(l.email.toLowerCase()) ? "Already Sent Earlier ⚠️" : "Ready"
        }));
        setLeads(checkedLeads);
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      alert("Scan failed: " + err.message);
    }
    setScanning(false);
  }

  // ধাপ ২: একে একে নিরাপদ বিরতি দিয়ে সব ইমেইল পাঠানো (No Vercel Timeout!)
  async function handleSendAll() {
    setSending(true);
    const updated = [...leads];
    const history = [...sentHistory];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status !== "Ready") continue;

      updated[i].status = "Sending... ⏳";
      setLeads([...updated]);

      try {
        const res = await fetch("/api/hunt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_single",
            to: updated[i].email,
            subject: updated[i].subject,
            text: updated[i].body,
          }),
        });
        const data = await res.json();

        if (data.success) {
          updated[i].status = "Sent ✅";
          history.push(updated[i].email.toLowerCase());
          localStorage.setItem("stellar_sent_emails", JSON.stringify(history));
          setSentHistory([...history]);
        } else {
          updated[i].status = "Failed ❌";
        }
      } catch {
        updated[i].status = "Failed ❌";
      }

      setLeads([...updated]);
      // স্প্যাম ফোল্ডার এড়াতে প্রতি মেইলের মাঝে ১২ সেকেন্ড বিরতি
      if (i < updated.length - 1) {
        await new Promise((r) => setTimeout(r, 12000));
      }
    }
    setSending(false);
  }

  function removeLead(index) {
    setLeads(leads.filter((_, idx) => idx !== index));
  }

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-6xl mx-auto space-y-8">
      {/* Top Navbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              STELLAR WORM <span className="text-emerald-400 font-mono text-sm">// OUTREACH ENGINE v2.0</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            Automated Website Auditor, No-Website Detector & Cold Email Dispatcher
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-400 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg">
            Total Contacted: <strong className="text-emerald-400">{sentHistory.length}</strong>
          </span>
          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setMode("auto")}
              className={`px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                mode === "auto" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Auto-Hunter
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`px-4 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition ${
                mode === "manual" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Manual List
            </button>
          </div>
        </div>
      </div>

      {/* Search / Input Form */}
      <form onSubmit={handleDiscover} className="bg-zinc-900/50 border border-zinc-800/90 rounded-2xl p-6 space-y-6 backdrop-blur">
        {mode === "auto" ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                1. Target Business Category
              </label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Dental Clinic, Law Firm, Restaurant"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                2. Target City / Country
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Austin Texas, London, Dhaka"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                3. Filter Prospects By
              </label>
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
              >
                <option value="all">Both (Bad Websites + No Website)</option>
                <option value="bad_website">Only Bad / Outdated Websites</option>
                <option value="no_website">Only Businesses With NO Website</option>
              </select>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                Paste Client Emails (Comma or Newline separated)
              </label>
              <textarea
                rows={4}
                value={emailList}
                onChange={(e) => setEmailList(e.target.value)}
                placeholder="ceo@company.com&#10;info@dentalmiami.com"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                Custom Pitch Angle (Optional)
              </label>
              <textarea
                rows={4}
                value={customTopic}
                onChange={(e) => setCustomTopic(e.target.value)}
                placeholder="e.g. We noticed your site is slow on mobile. Pitching our Next.js revamp or ready templates from orthinal.com..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-sm text-white focus:border-emerald-500 outline-none"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-4">
          <button
            type="submit"
            disabled={scanning || sending}
            className="flex-1 bg-zinc-100 hover:bg-white disabled:bg-zinc-800 text-black font-semibold py-3.5 px-6 rounded-xl transition cursor-pointer"
          >
            {scanning ? "🔍 Scanning Web & Generating AI Audits..." : "1. Find Prospects & Generate Emails"}
          </button>

          {leads.some((l) => l.status === "Ready") && (
            <button
              type="button"
              onClick={handleSendAll}
              disabled={sending}
              className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold py-3.5 px-6 rounded-xl transition cursor-pointer"
            >
              {sending ? "🚀 Dispatching Emails Safely..." : `2. Send All Ready Emails (${leads.filter(l => l.status === "Ready").length})`}
            </button>
          )}
        </div>
      </form>

      {/* Results & Audit Table */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
        <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4">
          // Discovered Prospects & AI Pitch Queue ({leads.length})
        </h2>

        {leads.length === 0 ? (
          <div className="text-center py-12 text-zinc-500 text-sm">
            {scanning
              ? "Crawling search results, auditing HTML structure, and writing custom pitches..."
              : "No prospects loaded yet. Click 'Find Prospects' above to start."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                  <th className="pb-3">Email</th>
                  <th className="pb-3">Website / Source</th>
                  <th className="pb-3">Audit Score</th>
                  <th className="pb-3">Detected Issue</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {leads.map((item, i) => (
                  <tr key={i} className="hover:bg-zinc-900/60">
                    <td className="py-3.5 font-mono text-emerald-400">{item.email}</td>
                    <td className="py-3.5 text-zinc-300 text-xs">{item.website}</td>
                    <td className="py-3.5 font-mono text-xs">
                      <span className="px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                        {item.score}
                      </span>
                    </td>
                    <td className="py-3.5 text-amber-300/90 text-xs max-w-xs truncate">{item.issue}</td>
                    <td className="py-3.5 font-medium text-xs">{item.status}</td>
                    <td className="py-3.5 text-right space-x-2">
                      <button
                        onClick={() => setSelectedLead({ ...item, index: i })}
                        className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-md text-zinc-200"
                      >
                        Preview / Edit
                      </button>
                      <button
                        onClick={() => removeLead(i)}
                        className="text-xs bg-red-950/60 hover:bg-red-900/60 text-red-300 px-2.5 py-1.5 rounded-md"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Email Preview & Edit Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-white">Edit Pitch for {selectedLead.email}</h3>
              <button onClick={() => setSelectedLead(null)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Subject Line</label>
              <input
                type="text"
                value={selectedLead.subject}
                onChange={(e) => setSelectedLead({ ...selectedLead, subject: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Email Body</label>
              <textarea
                rows={7}
                value={selectedLead.body}
                onChange={(e) => setSelectedLead({ ...selectedLead, body: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white font-mono"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  const copy = [...leads];
                  copy[selectedLead.index] = selectedLead;
                  setLeads(copy);
                  setSelectedLead(null);
                }}
                className="bg-emerald-500 text-black font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
