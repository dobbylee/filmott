'use server';

import { revalidatePath } from 'next/cache';

export async function revalidateContentDetail(type: string, tmdbId: string) {
  revalidatePath(`/contents/${type}/${tmdbId}`);
}
