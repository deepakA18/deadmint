"use client";

import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export function WalletButton() {
  return (
    <div className="wallet-button-wrapper">
      <WalletMultiButton
        style={{
          background: "linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 100%)",
          borderRadius: "4px",
          fontSize: "14px",
          fontFamily: "var(--font-medieval-sharp), serif",
          height: "40px",
        }}
      />
    </div>
  );
}
