import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { fail } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { const store = getStore(); return NextResponse.json({ jobs: store.jobs(), savedJobIds: store.saved(), applications: store.applications() }); }
  catch (error) { return fail(error); }
}
