import { NextResponse } from "next/server";
import { getStore } from "@/lib/store";
import { fail } from "@/lib/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return NextResponse.json({ application: getStore().apply(await request.json()) }, { status: 201 }); }
  catch (error) { return fail(error); }
}
