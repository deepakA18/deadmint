import { Lobby } from "@/components/Lobby";
import { WalletButton } from "@/components/WalletButton";
import { GraveyardBackground } from "@/components/GraveyardBackground";
import { ThemeSelector } from "@/components/ThemeSelector";

export default function Home() {
  return (
    <div className="relative min-h-screen">
      {/* Full-viewport pixel-art graveyard background */}
      <GraveyardBackground />

      {/* Header */}
      <header className="fixed top-0 right-0 z-50 p-4 flex items-center gap-3">
        <ThemeSelector />
        <WalletButton />
      </header>

      {/* Main content overlaid on background */}
      <Lobby />
    </div>
  );
}
