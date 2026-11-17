import { File } from 'expo-file-system';
import { supabase } from '@/lib/supabase';

/**
 * Uploads a local file (from the image or document picker) to a private bucket under the
 * signed-in user's folder, which is what the storage policies require. Returns the object path.
 */
export async function uploadLocalFile(bucket: 'onboarding' | 'incident-photos', uri: string, fileName: string, contentType: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sign in again to upload.');
  const safe = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80) || 'file';
  const path = `${u.user.id}/${Date.now()}-${safe}`;
  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('That file is empty.');
  if (bytes.byteLength > 15 * 1024 * 1024) throw new Error('That file is over 15 MB. Choose a smaller one.');
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
