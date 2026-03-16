'use server';

import { revalidatePath } from 'next/cache';

export async function revalidateMainPageAction(): Promise<void> {
  revalidatePath('/');
}
