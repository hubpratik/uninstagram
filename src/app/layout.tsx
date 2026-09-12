import type { Metadata } from "next";
import { Grand_Hotel } from "next/font/google";
import "./globals.css";
import IdentityProvider from "@/components/IdentityProvider";
import TopBar from "@/components/TopBar";
import { loadViewer } from "@/lib/feed";
import { store } from "@/lib/store";

const grandHotel = Grand_Hotel({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-grand-hotel",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const profile = await store.getProfile();
  return {
    title: `${profile.displayName || profile.username} • Uninstagram`,
    description: profile.bio || "Photos, shared quietly.",
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}) {
  const { profile, admin, visitor } = await loadViewer();

  // Only the owner sees this, and only the owner pays for the lookup — a visitor
  // never triggers a scan of the visitor table just to render the top bar.
  const pendingResets = admin
    ? (await store.listVisitors()).filter((v) => v.codeResetRequestedAt).length
    : 0;

  return (
    <html lang="en" className={grandHotel.variable}>
      <body>
        <IdentityProvider
          isAdmin={admin}
          ownerName={profile.displayName || profile.username}
          initialVisitor={
            visitor
              ? {
                  id: visitor.id,
                  nickname: visitor.nickname,
                  email: visitor.email,
                  code: visitor.code,
                  avatar: visitor.avatar ?? null,
                  animal: visitor.animal,
                }
              : null
          }
        >
          <TopBar profile={profile} pendingResets={pendingResets} />
          <main className="mx-auto max-w-[975px] pt-[60px]">{children}</main>
          {modal}
        </IdentityProvider>
      </body>
    </html>
  );
}
