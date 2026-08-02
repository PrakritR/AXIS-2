/** Video pickers and drop zones accept these extensions when the browser omits MIME type. */
const VIDEO_EXT = /\.(mp4|mov|m4v|webm|avi|mkv|wmv|flv)$/i;

export function isVideoUploadFile(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  return VIDEO_EXT.test(file.name);
}

export function isImageUploadFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|avif)$/i.test(file.name);
}

/** Read dropped files when `dataTransfer.files` is empty (common on macOS Finder drops). */
export function filesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const fromList = Array.from(dataTransfer.files ?? []);
  if (fromList.length > 0) return fromList;
  const fromItems: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

export function firstVideoFileFromDataTransfer(dataTransfer: DataTransfer): File | null {
  return filesFromDataTransfer(dataTransfer).find(isVideoUploadFile) ?? null;
}

export function imageFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  return filesFromDataTransfer(dataTransfer).filter(isImageUploadFile);
}

export function fileListFromFiles(files: File[]): FileList | null {
  if (files.length === 0) return null;
  const dt = new DataTransfer();
  for (const file of files) dt.items.add(file);
  return dt.files;
}
