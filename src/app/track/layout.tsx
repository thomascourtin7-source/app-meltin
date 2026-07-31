import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Mission Tracking",
  robots: { index: false, follow: false },
};

export default function TrackLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-[#070d18] text-white antialiased">
      {children}
    </div>
  );
}
