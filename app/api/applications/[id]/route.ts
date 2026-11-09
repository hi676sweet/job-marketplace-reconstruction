import { NextResponse } from "next/server";
import { DomainError, getStore } from "@/lib/store";
import { fail } from "@/lib/http";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const data = await request.json();
    if (!data || !["candidate", "employer"].includes(data.actor)) throw new DomainError("Choose a demo workspace role.");
    return NextResponse.json({ application: getStore().move(id, data.status, data.actor) });
  } catch (error) { return fail(error); }
}
