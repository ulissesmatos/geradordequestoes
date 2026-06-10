"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/guards";
import { prisma } from "@/lib/prisma";

export async function updateStudyMaterialAction(id: string, content: string) {
  const user = await requireUser();
  await prisma.studyMaterial.updateMany({
    where: { id, userId: user.id },
    data: { content }
  });
  revalidatePath(`/materiais/${id}`);
}
