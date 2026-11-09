import { NextResponse } from "next/server";
import { DomainError, getStore } from "@/lib/store";
import { fail } from "@/lib/http";
export const runtime = "nodejs";
export async function PUT(request: Request) {
  try {
    const data = await request.json();
    if (!data || typeof data.jobId !== "string" || typeof data.saved !== "boolean") throw new DomainError("Provide a role and a saved state.");
    return NextResponse.json({ savedJobIds: getStore().save(data.jobId, data.saved) });
  } catch (error) { return fail(error); }
}
