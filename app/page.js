"use client";
import { useState, useEffect } from "react";

export default function StellarCommandCenterV5() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState(false);

  const [activeTab, setActiveTab] = useState("manual"); // 'auto' | 'manual' | 'database'
  const [category, setCategory] = useState("MedSpa");
  const [location, setLocation] = useState("Miami Florida");
  const [targetFilter, setTargetFilter] = useState("all");

  // Custom Email Composer States
  const [emailList, setEmailList] = useState("");
  const [customSubject, setCustomSubject] = useState("quick question for {name}");
  const [customBody, setCustomBody] = useState(
`Hi {name},

I came across your profile earlier today and wanted to reach out directly.

At Stellar Worm, we engineer fast, modern websites and custom web platforms designed to help you stand out and convert more visitors into clients.

Mind if I send over a quick 2-minute concept I put together for you?

Best,
Istiak Ahmed
Founder, Stellar Worm`
  );

  const [leads, setLeads] = useState([]);
  const [dbLeads, setDbLeads] = useState([]);
  const [dbConnected, setDbConnected] = useState(false);
  const [senderEmail, setSenderEmail] = useState("stellarworm56@gmail.com");
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
        if (data.senderEmail) setSenderEmail(data.senderEmail);
      }
    } catch {}
  }

  async function handleDiscover(e) {
    e.preventDefault();
    setScanning(true);
    setLeads([]);
    setStatusBanner("⏳ Preparing your email campaign...");

    try {
      const payload =
        activeTab === "auto"
          ? { action: "discover", category, location, targetFilter, customSubject, customBody }
          : { action: "prepare_manual", emailList, customSubject, customBody };

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
          setStatusBanner(`✅ Prepared ${data.leads.length} emails! Click 'Send All Emails Now' below to dispatch from ${senderEmail}.`);
        } else {
          setStatusBanner("⚠️ No leads found. Try another keyword or city.");
        }
      } else {
        setStatusBanner("❌ Error: " + data.error);
      }
    } catch (err) {
      setStatusBanner("❌ Request failed: " + err.message);
    }
    setScanning(false);
  }

  // Apply custom message to all leads currently in Queue or DB
  function applyCustomMessageToList(isDb = false) {
    const target = isDb ? [...dbLeads] : [...leads];
    const updated = target.map((item) => {
      const nameVal = item.business_name || "there";
      return {
        ...item,
        subject: customSubject.replace(/\{name\}/gi, nameVal),
        body: customBody.replace(/\{name\}/gi, nameVal),
        status: "Ready"
      };
    });
    if (isDb) setDbLeads(updated);
    else setLeads(updated);
    setStatusBanner(`✅ Applied your custom email template to all ${updated.length} leads!`);
  }

  async function handleSendAll(targetArray, isFromDb = false) {
    setSending(true);
    const updated = [...targetArray];

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === "Sent ✅") continue;

      updated[i].status = "Sending... ⏳";
      isFromDb ? setDbLeads([...updated]) : setLeads([...updated]);
      setStatusBanner(`✉️ Sending from ${senderEmail} to ${updated[i].email}...`);

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
        const randomWait = Math.floor(Math.random() * 8000) + 18000;
        setStatusBanner(`⏳ Anti-Spam Protection: Waiting ${Math.round(randomWait / 1000)}s before next email...`);
        await new Promise((r) => setTimeout(r, randomWait));
      }
    }
    setSending(false);
    setStatusBanner(`🎉 All emails sent successfully from ${senderEmail}!`);
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

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#070709] text-zinc-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-zinc-900/90 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full space-y-6 shadow-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">STELLAR WORM</h1>
              <p className="text-xs text-emerald-400 mt-1 font-mono">// TEAM ACCESS PORTAL v5.0</p>
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

  return (
    <div className="min-h-screen p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse"></span>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              STELLAR WORM <span className="text-emerald-400 font-mono text-sm">// CUSTOM OUTREACH ENGINE v5.0</span>
            </h1>
          </div>
          <p className="text-zinc-400 text-xs font-mono mt-1.5">
            Active Sender: <span className="text-emerald-400 font-semibold">{senderEmail}</span> • {dbConnected ? `DB Connected (${dbLeads.length} Saved)` : "DB Offline"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
            <button
              onClick={() => setActiveTab("manual")}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "manual" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Custom Mail Sender
            </button>
            <button
              onClick={() => setActiveTab("auto")}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "auto" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Auto-Hunter
            </button>
            <button
              onClick={() => { setActiveTab("database"); loadDatabaseLeads(); }}
              className={`px-3.5 py-2 rounded-md text-xs font-semibold uppercase transition ${
                activeTab === "database" ? "bg-emerald-500 text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              Saved DB ({dbLeads.length})
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

      {statusBanner && (
        <div className="bg-zinc-900 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-xl text-sm font-mono flex items-center justify-between">
          <span>{statusBanner}</span>
          <button onClick={() => setStatusBanner("")} className="text-zinc-500 hover:text-white">✕</button>
        </div>
      )}

      {activeTab !== "database" ? (
        <>
          <form onSubmit={handleDiscover} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-6">
            {activeTab === "auto" && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 border-b border-zinc-800 pb-6">
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-2">
                    1. Business Category
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Dentist, Gym, Restaurant, MedSpa"
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
                    placeholder="Miami Florida, London UK, Austin Texas"
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
                    <option value="all">Both (Bad Websites + No Website)</option>
                    <option value="bad_website">Only Bad / Slow Websites</option>
                    <option value="no_website">Businesses With NO Website</option>
                  </select>
                </div>
              </div>
            )}

            {/* Custom Email Composer Section (Works for both Manual & Auto!) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {activeTab === "manual" && (
                <div className="md:col-span-5 space-y-2">
                  <label className="block text-xs font-mono uppercase text-emerald-400">
                    1. Paste Recipient Emails (One per line)
                  </label>
                  <textarea
                    rows={9}
                    value={emailList}
                    onChange={(e) => setEmailList(e.target.value)}
                    placeholder={"john@gmail.com\nApex Dental - info@apexdental.com\nsarah@medspamiami.com"}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                    required
                  />
                  <p className="text-[11px] text-zinc-500">
                    Tip: You can paste just emails, or <code className="text-zinc-300">Business Name - email@domain.com</code>
                  </p>
                </div>
              )}

              <div className={`${activeTab === "manual" ? "md:col-span-7" : "md:col-span-12"} space-y-4`}>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-mono uppercase text-emerald-400">
                      Custom Email Subject (Use {"{name}"} for dynamic client name)
                    </label>
                    <button
                      type="button"
                      onClick={() => { setCustomSubject(""); setCustomBody(""); }}
                      className="text-[11px] text-zinc-400 hover:text-white underline"
                    >
                      Clear (Use AI Auto-Pitch instead)
                    </button>
                  </div>
                  <input
                    type="text"
                    value={customSubject}
                    onChange={(e) => setCustomSubject(e.target.value)}
                    placeholder="e.g. quick question for {name}"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:border-emerald-500 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-emerald-400 mb-2">
                    Custom Email Body (Write your exact message — {"{name}"} will auto-replace!)
                  </label>
                  <textarea
                    rows={6}
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="Write your custom email here... Leave blank if you want the bot to auto-generate."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-sm text-white font-mono focus:border-emerald-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-2">
              <button
                type="submit"
                disabled={scanning || sending}
                className="flex-1 bg-zinc-100 hover:bg-white disabled:bg-zinc-800 text-black font-semibold py-3.5 px-6 rounded-xl transition cursor-pointer"
              >
                {scanning
                  ? "⏳ Loading Queue..."
                  : activeTab === "manual"
                  ? "1. Load Emails with My Custom Message"
                  : "1. Hunt Prospects & Apply Custom Message"}
              </button>

              {leads.some((l) => l.status === "Ready") && (
                <button
                  type="button"
                  onClick={() => handleSendAll(leads, false)}
                  disabled={sending}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-700 text-black font-bold py-3.5 px-6 rounded-xl transition cursor-pointer"
                >
                  {sending
                    ? "🚀 Sending from stellarworm56@gmail.com..."
                    : `2. Send All Emails Now (${leads.filter(l => l.status === "Ready").length})`}
                </button>
              )}
            </div>
          </form>

          {/* Queue Table */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
                // Outbox Queue ({leads.length} Emails Ready)
              </h2>
              {leads.length > 0 && (
                <button
                  onClick={() => applyCustomMessageToList(false)}
                  className="text-xs bg-zinc-800 hover:bg-zinc-700 text-emerald-300 px-3 py-1.5 rounded-lg border border-zinc-700"
                >
                  ↻ Re-Apply Above Custom Text to All
                </button>
              )}
            </div>

            {leads.length === 0 ? (
              <p className="text-center py-10 text-zinc-500 text-sm">
                Paste your emails or hunt prospects above, then click button #1 to preview before sending.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                      <th className="pb-3">Name</th>
                      <th className="pb-3">Recipient Email</th>
                      <th className="pb-3">Subject Line</th>
                      <th className="pb-3">Status</th>
                      <th className="pb-3 text-right">Preview / Edit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {leads.map((item, i) => (
                      <tr key={i} className="hover:bg-zinc-900/60">
                        <td className="py-3 font-semibold text-white text-xs">{item.business_name}</td>
                        <td className="py-3 font-mono text-emerald-400 text-xs">{item.email}</td>
                        <td className="py-3 text-zinc-300 text-xs">{item.subject}</td>
                        <td className="py-3 font-medium text-xs">{item.status}</td>
                        <td className="py-3 text-right">
                          <button
                            onClick={() => setSelectedLead({ ...item, index: i, isDb: false })}
                            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded text-zinc-200"
                          >
                            Edit Individual Mail
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

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => applyCustomMessageToList(true)}
                className="bg-zinc-800 hover:bg-zinc-700 text-emerald-300 text-xs font-semibold px-3.5 py-2 rounded-lg border border-zinc-700"
              >
                ✍️ Apply My Custom Mail to All DB Leads
              </button>
              <button
                onClick={() => handleSendAll(filteredDbLeads, true)}
                disabled={sending}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-4 py-2 rounded-lg"
              >
                {sending ? "Sending..." : "🚀 Send to All in View"}
              </button>
            </div>
          </div>

          {filteredDbLeads.length === 0 ? (
            <p className="text-center py-12 text-zinc-500 text-sm">
              No saved leads in this filter yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-400 text-xs font-mono uppercase">
                    <th className="pb-3">Business</th>
                    <th className="pb-3">Email</th>
                    <th className="pb-3">Phone</th>
                    <th className="pb-3">Subject</th>
                    <th className="pb-3">Status</th>
                    <th className="pb-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {filteredDbLeads.map((item, i) => (
                    <tr key={i} className="hover:bg-zinc-900/60">
                      <td className="py-3 font-semibold text-white text-xs">{item.business_name}</td>
                      <td className="py-3 font-mono text-emerald-400 text-xs">{item.email}</td>
                      <td className="py-3 font-mono text-zinc-300 text-xs">{item.phone}</td>
                      <td className="py-3 text-zinc-300 text-xs truncate max-w-xs">{item.subject}</td>
                      <td className="py-3 text-xs font-medium">{item.status}</td>
                      <td className="py-3 text-right space-x-2">
                        <button
                          onClick={() => setSelectedLead({ ...item, index: i, isDb: true })}
                          className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2.5 py-1 rounded text-zinc-200"
                        >
                          Edit Mail
                        </button>
                        <button
                          onClick={() => deleteFromDb(item.email)}
                          className="text-xs bg-red-950/60 hover:bg-red-900 text-red-300 px-2 py-1 rounded"
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
      )}

      {/* Individual Email Editor Modal */}
      {selectedLead && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-3">
              <h3 className="font-semibold text-white">Edit Email for {selectedLead.email}</h3>
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
              <label className="block text-xs text-zinc-400 mb-1">Message Body</label>
              <textarea
                rows={8}
                value={selectedLead.body}
                onChange={(e) => setSelectedLead({ ...selectedLead, body: e.target.value })}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-sm text-white font-mono"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  if (selectedLead.isDb) {
                    const copy = [...dbLeads];
                    copy[selectedLead.index] = selectedLead;
                    setDbLeads(copy);
                  } else {
                    const copy = [...leads];
                    copy[selectedLead.index] = selectedLead;
                    setLeads(copy);
                  }
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
