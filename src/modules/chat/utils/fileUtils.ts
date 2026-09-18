const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'];

export function getFileExtension(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const dot = pathname.lastIndexOf('.');
    if (dot === -1) return '';
    return pathname.substring(dot + 1).toLowerCase();
  } catch {
    const dot = url.lastIndexOf('.');
    if (dot === -1) return '';
    return url.substring(dot + 1).split(/[?#]/)[0].toLowerCase();
  }
}

export function getFileTypeFromUrl(url: string): 'image' | 'video' | 'document' {
  if (typeof url !== 'string') return 'document';
  const ext = getFileExtension(url);
  if (IMAGE_EXTS.includes(ext)) return 'image';
  if (VIDEO_EXTS.includes(ext)) return 'video';
  return 'document';
}

export function getFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split('/');
    const last = segments[segments.length - 1];
    return decodeURIComponent(last) || 'file';
  } catch {
    return 'file';
  }
}

export type FileIconInfo = { icon: string; color: string };

export function getFileIconInfo(ext: string): FileIconInfo {
  switch (ext) {
    case 'pdf':
      return { icon: 'FileText', color: 'text-red-500' };
    case 'doc':
    case 'docx':
      return { icon: 'FileText', color: 'text-blue-500' };
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { icon: 'FileSpreadsheet', color: 'text-green-500' };
    case 'txt':
    case 'md':
      return { icon: 'FileText', color: 'text-muted-foreground' };
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return { icon: 'FileArchive', color: 'text-yellow-500' };
    case 'apk':
      return { icon: 'Smartphone', color: 'text-green-600' };
    default:
      return { icon: 'File', color: 'text-muted-foreground' };
  }
}
