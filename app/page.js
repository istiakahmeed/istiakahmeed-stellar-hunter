"use client";
import { useState, useEffect } from "react";

export default function StellarCommandCenterV3() {
  const [activeTab, setActiveTab] = useState("auto"); // 'auto' | 'manual' | 'database'
  const [category, setCategory] = useState("Dental Clinic");
  const [location, setLocation] = useState("Miami Florida");
  const [targetFilter, setTargetFilter] = useState("all");
  const [emailList, setEmailList] = useState("");
  const [customTopic, setCustomTopic] = useState("");

  const [leads, setLeads] = useState([]);
  const [dbLeads, setDbLeads] = useState([]);
  const [dbConnected, setDbConnected] = useState(false);
  const [dbFilter, setDbFilter] = useState("ALL");

  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  async function loadDatabaseLeads() {
    try {
      const res = await fetch("/api/hunt");
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads || []);
        setDbConnected(data.dbConnected);
      }
    } catch {}
  }

  useEffect(() => {
    loadDatabaseLeads();
  }, []);

  async function handleDiscover(e) {
    e.preventDefault();
    setScanning(true);
    setLeads([]);

    try {
      const payload =
        activeTab === "auto"
          ? { action: "discover", category, location, targetFilter }
          : { action: "prepare_manual", emailList, customTopic };

      const res = await fetch("/api/hunt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (data.success) {
        setLeads(data.leads);
        loadDatabaseLeads(); // সাথে সাথে ডাটাবেস রিফ্রেশ হবে
      } else {
        alert("Error: " + data.error);
      }
    } catch (err) {
      alert("Scan failed: " + err.message);
    }
    setScanning(false);
  }

  async function handleSendAll(targetArray, isFromDb = false) {
    setSending(true);
    const updated = [...targetArray];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "Sent ✅") continue;

      updated[i].status = "Sending... ⏳";
      isFromDb ? setDbLeads([...updated]) : setLeads([...updated]);

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
        updated[i].status = data.success ? "Sent ✅" : "Failed ❌";
      } catch {
        updated[i].status = "Failed ❌";
      }

      isFromDb ? setDbLeads([...updated]) : setLeads([...updated]);
      if (i < updated.length - 1) {
        await new Promise((r) => setTimeout(r, 12000));
      }
    }
    setSending(false);
    loadDatabaseLeads();
  }

  async function deleteFromDb(email) {
    await fetch("/api/hunt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_lead", email }),
    });
    loadDatabaseLeads();
  }

  function exportToCSV() {
    const headers = ["Business Name", "Category", "Location", "Email", "Phone", "Website", "Type", "Audit Score", "Issue", "Status"];
    const rows = dbLeads.map(l => [
      `"${l.business_name || ''}"`,
      `"${l.category || ''}"`,
      `"${l.location || ''}"`,
      `"${l.email || ''}"`,
      `"${l.phone || ''}"`,
      `"${l.website || ''}"`,
      `"${l.lead_type || ''}"`,
      `"${l.audit_score || ''}"`,
      `"${(l.issue || '').replace(/"/g, "'")}"`,
      `"${l.status || ''}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `stellar_worm_leads_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
  }

  const filteredDbLeads = dbLeads.filter(l => {
    if (dbFilter === "BAD_WEBSITE") return l.lead_type === "BAD_WEBSITE";
    if (dbFilter === "NO_WEBSITE") return l.lead_type === "NO_WEBSITE";
    if (dbFilter === "WITH_PHONE") return l.phone && l.phone !== "Not Found" && l.phone !== "N/A";
    return true;
  });

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              STELLAR WORM <span className="text-emerald-400 font-mono text-sm">// CRM & OUTREACH ENGINE v3.0</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            PostgreSQL Lead Database, Phone & Email Extractor, GBP No-Website & Bad-Website Hunter
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-mono px-3 py-2 rounded-lg border ${dbConnected ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-amber-950/40 border-amber-800 text-amber-300"}`}>
            {dbConnected ? `● DB Connected (${dbLeads.length} Saved)` : "○ Add DATABASE_URL in Vercel"}
          </span>

          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setActiveTab("auto")}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "auto" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Auto-Hunter
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "manual" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Manual List
            </button>
            <button
              onClick={() => { setActiveTab("database"); loadDatabaseLeads(); }}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "database" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Saved Leads DB ({dbLeads.length})
            </button>
          </div>
        </div>
      </div>

      {/* TAB 1 & 2: HUNTER & MANUAL */}
      {activeTab !== "database" ? (
        <>
          <form onSubmit={handleDiscover} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
            {activeTab === "auto" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    1. Target Business Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Dental Clinic, MedSpa, Plumber, Restaurant"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    2. Target City & Country
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. London UK, Austin Texas, Miami Florida"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    3. Target Filter
                  </label>
                  <select
                    value={targetFilter}
                    onChange={(e) => setTargetFilter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                  >
                    <option value="all">Both (Bad Websites + GBP With No Website)</option>
                    <option value="bad_website">Only Bad / Outdated Websites (+Phone/Email)</option>
                    <option value="no_website">Active GBP / Social With NO Website (+Phone/Email)</option>
                  </select>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    Paste Client Emails
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
                    Custom Pitch Context
                  </label>
                  <textarea
                    rows={4}
                    value={customTopic}
                    onChange={(e) => setCustomTopic(e.target.value)}
                    placeholder="e.g. Noticed your mobile layout is slow..."
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
                {scanning ? "🔍 Scraping Emails, Phones & Saving to DB..." : "1. Hunt Prospects & Save to Database"}
              </button>

              {leads.some((l) => l.status !== "Sent ✅") && (
                <button
                  type="button"
                  onClick={() => handleSendAll(leads, false)}
                  disabled={sending}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold py-3.5 px-6 rounded-xl transition cursor-pointer"
                >
                  {sending ? "🚀 Sending Safely..." : `2. Send Emails to Discovered List (${leads.length})`}
                </button>
              )}
            </div>
          </form>

          {/* Current Session Results */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4">
              // Current Discovery Queue ({leads.length} Found & Auto-Saved to DB)
            </h2>
            {leads.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 text-sm">
                {scanning ? "Scanning websites, extracting phone numbers & emails..." : "Click 'Hunt Prospects' above to find clients."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Phone / WhatsApp</th>
                      <th className="pb-3">Website / GBP Status</th>
                      <th className="pb-3">Audit</th>
                      <th className="pb-3">Detected Issue</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {leads.map((item, i) => (
                      <tr key={i} className="hover:bg-zinc-900/60">
                        <td className="py-3 font-mono text-emerald-400 text-xs">{item.email}</td>
                        <td className="py-3 font-mono text-zinc-200 text-xs">{item.phone || "Not Found"}</td>
                        <td className="py-3 text-zinc-300 text-xs">{item.website}</td>
                        <td className="py-3 font-mono text-xs">
                          <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                            {item.audit_score}
                          </span>
                        </td>
                        <td className="py-3 text-amber-300/90 text-xs max-w-xs truncate">{item.issue}</td>
                        <td className="py-3 font-medium text-xs">{item.status}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setSelectedLead({ ...item, index: i })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-zinc-200"
                          >
                            Preview
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* TAB 3: SAVED DATABASE CRM VIEW */
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800 pb-4">
            <div className="flex flex-wrap gap-2">
              {["ALL", "BAD_WEBSITE", "NO_WEBSITE", "WITH_PHONE"].map((f) => (
                <button
                  key={f}
                  onClick={() => setDbFilter(f)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono transition ${
                    dbFilter === f ? "bg-emerald-500 text-black font-bold" : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                  }`}
                >
                  {f === "ALL" && `All Saved (${dbLeads.length})`}
                  {f === "BAD_WEBSITE" && `Bad Websites (${dbLeads.filter(l => l.lead_type === "BAD_WEBSITE").length})`}
                  {f === "NO_WEBSITE" && `No Website / GBP (${dbLeads.filter(l => l.lead_type === "NO_WEBSITE").length})`}
                  {f === "WITH_PHONE" && `Has Phone Number (${dbLeads.filter(l => l.phone && l.phone !== "Not Found" && l.phone !== "N/A").length})`}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={exportToCSV}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold px-4 py-2 rounded-lg border border-zinc-700"
              >
                ⬇ Export CSV / Excel
              </button>
              <button
                onClick={() => handleSendAll(filteredDbLeads, true)}
                disabled={sending}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-4 py-2 rounded-lg"
              >
                {sending ? "Sending..." : "🚀 Email All Unsent in View"}
              </button>
            </div>
          </div>

          {filteredDbLeads.length === 0 ? (
            <p className="text-center py-12 text-zinc-500 text-sm">
              No saved leads match this filter yet. Run Auto-Hunter to populate your database!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                    <th className="pb-3">Business / Location</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Phone & WhatsApp</th>
                    <th className="pb-3">Website / Type</th>
                    <th className="pb-3">Audit Issue</th>
                    <th className="pb-3">Email Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredDbLeads.map((item, i) => {
                    const cleanDigits = (item.phone || "").replace(/\D/g, "");
                    return (
                      <tr key={i} className="hover:bg-zinc-900/60">
                        <td className="py-3.5">
                          <div className="font-semibold text-white text-xs">{item.business_name}</div>
                          <div className="text-zinc-500 text-[11px]">{item.category} • {item.location}</div>
                        </td>
                        <td className="py-3.5 font-mono text-emerald-400 text-xs">{item.email}</td>
                        <td className="py-3.5 font-mono text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-200">{item.phone || "Not Found"}</span>
                            {cleanDigits.length >= 10 && (
                              <a
                                href={`https://wa.me/${cleanDigits}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500 hover:text-black transition"
                              >
                                WhatsApp ↗
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 text-xs">
                          {item.website?.startsWith("http") ? (
                            <a href={item.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
                              {item.website}
                            </a>
                          ) : (
                            <span className="text-amber-400 font-medium">{item.website}</span>
                          )}
                        </td>
                        <td className="py-3.5 text-zinc-400 text-xs max-w-xs truncate">{item.issue}</td>
                        <td className="py-3.5 text-xs font-medium">{item.status}</td>
                        <td className="py-3.5 text-right space-x-2">
                          <button
                            onClick={() => setSelectedLead({ ...item, index: i })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded text-zinc-200"
                          >
                            View
                          </button>
                          <button
                            onClick={() => deleteFromDb(item.email)}
                            className="text-xs bg-red-950/60 hover:bg-red-900 text-red-300 px-2 py-1 rounded"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-white">Pitch for {selectedLead.email}</h3>
              <button onClick={() => setSelectedLead(null)} className="text-zinc-400 hover:text-white">✕</button>
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Subject</label>
              <input
                type="text"
                value={selectedLead.subject}
                onChange={(e) => setSelectedLead({ ...selectedLead, subject: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Body</label>
              <textarea
                rows={7}
                value={selectedLead.body}
                onChange={(e) => setSelectedLead({ ...selectedLead, body: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white font-mono"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setSelectedLead(null)}
                className="bg-emerald-500 text-black font-semibold px-4 py-2 rounded-lg text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
