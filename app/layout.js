export const metadata = {
  title: "Stellar Worm // Autonomous Client Hunter",
  description: "Lead Discovery, Audit & Cold Outreach Engine",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-[#070709] text-zinc-100 antialiased selection:bg-emerald-500 selection:text-black">
        {children}
      </body>
    </html>
  );
}
