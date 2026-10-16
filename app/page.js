"use client";
import { useState, useEffect } from "react";

export default function StellarCommandCenterV4() {
  // Built-in Team Login Lock
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);

  // Dashboard States
  const [activeTab, setActiveTab] = useState("auto"); // 'auto' | 'manual' | 'database'
  const [category, setCategory] = useState("Dental Clinic");
  const [location, setLocation] = useState("Dhaka");
  const [targetFilter, setTargetFilter] = useState("all");
  const [emailList, setEmailList] = useState("");
  const [customTopic, setCustomTopic] = useState("");

  const [leads, setLeads] = useState([]);
  const [dbLeads, setDbLeads] = useState([]);
  const [dbConnected, setDbConnected] = useState(false);
  const [dbFilter, setDbFilter] = useState("ALL");

  const [scanning, setScanning] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusBanner, setStatusBanner] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    const auth = localStorage.getItem("stellar_team_auth");
    if (auth === "unlocked") {
      setIsUnlocked(true);
      loadDatabaseLeads();
    }
  }, []);

  function handleLogin(e) {
    e.preventDefault();
    if (username.trim() === "admin" && password === "stellar2026") {
      localStorage.setItem("stellar_team_auth", "unlocked");
      setIsUnlocked(true);
      setLoginError(false);
      loadDatabaseLeads();
    } else {
      setLoginError(true);
    }
  }

  function handleLogout() {
    localStorage.removeItem("stellar_team_auth");
    setIsUnlocked(false);
  }

  async function loadDatabaseLeads() {
    try {
      const res = await fetch(`/api/hunt?t=${Date.now()}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        setDbLeads(data.leads || []);
        setDbConnected(data.dbConnected);
      }
    } catch {}
  }

  async function handleDiscover(e) {
    e.preventDefault();
    setScanning(true);
    setLeads([]);
    setStatusBanner("🔍 Scanning Map & Web Databases for real businesses...");

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
        setLeads(data.leads || []);
        await loadDatabaseLeads();
        if ((data.leads || []).length > 0) {
          setStatusBanner(`✅ Found ${data.leads.length} real prospects and saved them to your Database!`);
        } else {
          setStatusBanner("⚠️ No businesses found for this exact keyword. Try a broader category like 'Dentist', 'Restaurant', 'Gym', 'Clinic', or 'Hotel'.");
        }
      } else {
        setStatusBanner("❌ Error: " + data.error);
      }
    } catch (err) {
      setStatusBanner("❌ Request failed: " + err.message);
    }
    setScanning(false);
  }

  // Anti-Spam Human Delay Sender (25-35s random gap)
  async function handleSendAll(targetArray, isFromDb = false) {
    setSending(true);
    const updated = [...targetArray];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "Sent ✅" || updated[i].status.includes("Phone/WhatsApp")) continue;

      updated[i].status = "Sending... ⏳";
      isFromDb ? setDbLeads([...updated]) : setLeads([...updated]);
      setStatusBanner(`✉️ Sending plain-text pitch to ${updated[i].email}...`);

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

      // Random 25 to 35 seconds delay between emails so Gmail NEVER flags as spam
      if (i < updated.length - 1) {
        const randomWait = Math.floor(Math.random() * 10000) + 25000;
        setStatusBanner(`⏳ Anti-Spam Protection: Waiting ${Math.round(randomWait / 1000)}s before next email...`);
        await new Promise((r) => setTimeout(r, randomWait));
      }
    }
    setSending(false);
    setStatusBanner("🎉 Campaign finished! Check your Gmail Sent folder.");
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

  // LOCK SCREEN UI
  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">STELLAR WORM</h1>
              <p className="text-xs text-emerald-400 mt-1 font-mono">// TEAM ACCESS PORTAL v4.0</p>
            </div>
            <span className="text-2xl">🔒</span>
          </div>

          {loginError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-xs p-3 rounded-xl">
              Invalid username or password!
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
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
                placeholder="••••••••"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3.5 rounded-xl transition cursor-pointer"
          >
            Unlock Dashboard →
          </button>
        </form>
      </div>
    );
  }

  const filteredDbLeads = dbLeads.filter(l => {
    if (dbFilter === "BAD_WEBSITE") return l.lead_type === "BAD_WEBSITE";
    if (dbFilter === "NO_WEBSITE") return l.lead_type === "NO_WEBSITE";
    if (dbFilter === "WITH_PHONE") return l.phone && l.phone !== "Not Found" && l.phone !== "N/A";
    return true;
  });

  // MAIN DASHBOARD UI
  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              STELLAR WORM <span className="text-emerald-400 font-mono text-sm">// CLIENT ENGINE v4.0</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-sm mt-1">
            OpenStreetMap Geo-Scraper, Website Auditor, WhatsApp & Anti-Spam Outreach CRM
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className={`text-xs font-mono px-3 py-2 rounded-lg border ${dbConnected ? "bg-emerald-950/40 border-emerald-800 text-emerald-300" : "bg-amber-950/40 border-amber-800 text-amber-300"}`}>
            {dbConnected ? `● DB Connected (${dbLeads.length} Leads)` : "○ DB Offline"}
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

          <button
            onClick={handleLogout}
            className="text-xs bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 px-3 py-2 rounded-lg"
          >
            Lock 🔒
          </button>
        </div>
      </div>

      {/* Live Status Banner */}
      {statusBanner && (
        <div className="bg-zinc-900 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-sm font-mono flex items-center justify-between">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner("")} className="text-zinc-500 hover:text-white">✕</button>
        </div>
      )}

      {activeTab !== "database" ? (
        <>
          <form onSubmit={handleDiscover} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
            {activeTab === "auto" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    1. Business Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Dentist, Gym, Restaurant, Clinic, Hotel, Real Estate"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    2. City Name
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Dhaka, London, Miami, Austin, Dubai"
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
                    <option value="all">Both (Bad Websites + Map Listings With No Website)</option>
                    <option value="bad_website">Only Bad / Slow Websites</option>
                    <option value="no_website">Businesses With NO Website (Map Listings)</option>
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
                {scanning ? "🔍 Hunting Real Businesses & Saving to DB..." : "1. Hunt Prospects & Save to Database"}
              </button>

              {leads.some((l) => l.status === "Ready") && (
                <button
                  type="button"
                  onClick={() => handleSendAll(leads, false)}
                  disabled={sending}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold py-3.5 px-6 rounded-xl transition cursor-pointer"
                >
                  {sending ? "🚀 Sending with Anti-Spam Delay..." : `2. Auto-Send Emails Safely (${leads.filter(l => l.status === "Ready").length})`}
                </button>
              )}
            </div>
          </form>

          {/* Current Queue */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400 mb-4">
              // Current Discovery Queue ({leads.length} Found)
            </h2>
            {leads.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 text-sm">
                {scanning ? "Querying OpenStreetMap & Web Databases..." : "Enter a Category (e.g. Dentist, Gym, Restaurant) & City above, then click Hunt Prospects."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                      <th className="pb-3">Business</th>
                      <th className="pb-3">Email</th>
                      <th className="pb-3">Phone / WhatsApp</th>
                      <th className="pb-3">Website / Status</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {leads.map((item, i) => {
                      const cleanDigits = (item.phone || "").replace(/\D/g, "");
                      const waText = encodeURIComponent(`Hi ${item.business_name} team! I came across your business in ${item.location} and put together a quick 2-minute website preview for you. Mind if I share the link? - Istiak, Stellar Worm`);
                      return (
                        <tr key={i} className="hover:bg-zinc-900/60">
                          <td className="py-3 font-semibold text-white text-xs">{item.business_name}</td>
                          <td className="py-3 font-mono text-emerald-400 text-xs">{item.email}</td>
                          <td className="py-3 font-mono text-zinc-200 text-xs">
                            <div className="flex items-center gap-2">
                              <span>{item.phone}</span>
                              {cleanDigits.length >= 10 && (
                                <a
                                  href={`https://wa.me/${cleanDigits}?text=${waText}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500 hover:text-black"
                                >
                                  WhatsApp ↗
                                </a>
                              )}
                            </div>
                          </td>
                          <td className="py-3 text-zinc-300 text-xs">{item.website}</td>
                          <td className="py-3 font-medium text-xs">{item.status}</td>
                          <td className="py-3 text-right space-x-2">
                            <button
                              onClick={() => setSelectedLead({ ...item, index: i })}
                              className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-zinc-200"
                            >
                              Preview Pitch
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
        </>
      ) : (
        /* SAVED LEADS DATABASE CRM */
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
                  {f === "NO_WEBSITE" && `No Website (${dbLeads.filter(l => l.lead_type === "NO_WEBSITE").length})`}
                  {f === "WITH_PHONE" && `With Phone (${dbLeads.filter(l => l.phone && l.phone !== "Not Found" && l.phone !== "N/A").length})`}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={exportToCSV}
                className="bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold px-4 py-2 rounded-lg border border-zinc-700"
              >
                ⬇ Export CSV
              </button>
              <button
                onClick={() => handleSendAll(filteredDbLeads, true)}
                disabled={sending}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-4 py-2 rounded-lg"
              >
                {sending ? "Sending..." : "🚀 Auto-Email All Ready"}
              </button>
            </div>
          </div>

          {filteredDbLeads.length === 0 ? (
            <p className="text-center py-12 text-zinc-500 text-sm">
              No leads in this view yet. Go to Auto-Hunter and click Hunt Prospects!
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                    <th className="pb-3">Business & City</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Phone / WhatsApp</th>
                    <th className="pb-3">Website / Type</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredDbLeads.map((item, i) => {
                    const cleanDigits = (item.phone || "").replace(/\D/g, "");
                    const waText = encodeURIComponent(`Hi ${item.business_name} team! I came across your business in ${item.location} and mocked up a fast, modern website concept for you. Mind if I share the preview link? - Istiak, Stellar Worm`);
                    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(item.email)}&su=${encodeURIComponent(item.subject || '')}&body=${encodeURIComponent(item.body || '')}`;

                    return (
                      <tr key={i} className="hover:bg-zinc-900/60">
                        <td className="py-3.5">
                          <div className="font-semibold text-white text-xs">{item.business_name}</div>
                          <div className="text-zinc-500 text-[11px]">{item.category} • {item.location}</div>
                        </td>
                        <td className="py-3.5 font-mono text-emerald-400 text-xs">{item.email}</td>
                        <td className="py-3.5 font-mono text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-200">{item.phone}</span>
                            {cleanDigits.length >= 10 && (
                              <a
                                href={`https://wa.me/${cleanDigits}?text=${waText}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] hover:bg-emerald-500 hover:text-black"
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
                        <td className="py-3.5 text-xs font-medium">{item.status}</td>
                        <td className="py-3.5 text-right space-x-1.5">
                          <a
                            href={gmailUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-1 rounded hover:bg-blue-500 hover:text-black"
                          >
                            1-Click Gmail ↗
                          </a>
                          <button
                            onClick={() => setSelectedLead({ ...item, index: i })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded text-zinc-200"
                          >
                            Edit
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

      {/* Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-white">Pitch for {selectedLead.business_name}</h3>
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
              <label className="block text-xs text-zinc-400 mb-1">Body (Zero-Link Anti-Spam Format)</label>
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
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
