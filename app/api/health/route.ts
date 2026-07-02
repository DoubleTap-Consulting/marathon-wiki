import { NextResponse } from "next/server";

import { checkStorage } from "@/src/db/smoke";

export const dynamic = "force-dynamic";

export async function GET() {
  const storage = await checkStorage();
  const status = storage.ok ? 200 : storage.configured ? 503 : 200;

  return NextResponse.json(
    {
      ok: storage.ok,
      service: "marathon-wiki",
      storage,
    },
    { status },
  );
}
