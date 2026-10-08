const TYPES: Record<string, string> = {
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Multipart body with the picked image in the `file` field. Web uses `upload-form.web.ts`. */
export async function imageFormData(uri: string) {
  const name = uri.split('/').pop()?.split('?')[0] || 'image.jpg';
  const type = TYPES[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'image/jpeg';
  const form = new FormData();
  // React Native's FormData takes a { uri, name, type } descriptor and streams the file.
  form.append('file', { uri, name, type } as unknown as Blob);
  return form;
}
