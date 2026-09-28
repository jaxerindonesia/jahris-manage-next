export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import prisma from "@/lib/prisma";
import { ensureTenantScope, requireSessionUser } from "@/lib/auth/tenant";
import { requirePermission } from "@/lib/auth/permission";

type Params = {
  params: {
    id: string;
  };
};

export async function GET(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submission_types", "get-by-id");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const submissionType = await prisma.submissionType.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
    });

    if (!submissionType) {
      return NextResponse.json(
        { message: "Submission type not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(submissionType);
  } catch {
    return NextResponse.json(
      { message: "Failed to retrieve submission type" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submission_types", "update");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.submissionType.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Submission type not found" }, { status: 404 });

    const body = await req.json();

    const updateData: Prisma.SubmissionTypeUpdateInput = {};

    if (body.name) updateData.name = body.name;

    const submissionType = await prisma.submissionType.update({
      where: { id: p.id },
      data: updateData,
    });

    return NextResponse.json({
      message: "Submission type successfully updated",
      data: submissionType,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          message:
            "Submission type name masih terkena unique constraint. Jalankan migration terbaru untuk menghapus unique index.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: "Failed to update submission type" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const p = await params;
  try {
    const auth = await requireSessionUser();
    if (auth.error) return auth.error;
    const forbid = requirePermission(auth.user, "submission_types", "delete");
    if (forbid) return forbid;
    const scopedTenantId = ensureTenantScope(auth.user);

    const existing = await prisma.submissionType.findFirst({
      where: { id: p.id, ...(scopedTenantId ? { tenantId: scopedTenantId } : {}) },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ message: "Submission type not found" }, { status: 404 });

    await prisma.submissionType.delete({
      where: { id: p.id },
    });

    return NextResponse.json({
      message: "Submission type successfully deleted",
    });
  } catch {
    return NextResponse.json(
      { message: "Failed to delete submission type" },
      { status: 500 }
    );
  }
}
