import { NextRequest, NextResponse } from "next/server";

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL;

export async function POST(req: NextRequest) {
  if (!HELIUS_RPC_URL) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "RPC not configured" }, id: null },
      { status: 500 }
    );
  }

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
