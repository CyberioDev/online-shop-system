/** Web counterpart of `upload-form.ts`: the picker returns a data:/blob: URI, so read it into a Blob. */
export async function imageFormData(uri: string) {
  const blob = await (await fetch(uri)).blob();
  const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
  const form = new FormData();
  form.append('file', blob, `image.${extension}`);
  return form;
}
