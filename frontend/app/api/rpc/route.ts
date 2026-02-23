import { NextRequest, NextResponse } from "next/server";

const HELIUS_RPC_URL =
  process.env.HELIUS_RPC_URL ||
  "https://devnet.helius-rpc.com/?api-key=90a86d9d-6820-4f75-9f5b-c8099b59eef9";

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();

    const res = await fetch(HELIUS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const data = await res.text();
    return new NextResponse(data, {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: e.message }, id: null },
      { status: 502 }
    );
  }
}
