const MB = 1024 * 1024;

export const MEDIA_LIMIT_MESSAGES = {
  maxTotal: "Bạn có thể đăng tối đa 30 file media trong một bài viết.",
  imageTooLarge: "Ảnh này vượt quá 20MB. Vui lòng chọn ảnh nhẹ hơn.",
  videoTooLarge: "Video này vượt quá giới hạn dung lượng cho tài khoản của bạn.",
  videoTooLong: "Video tối đa hiện được hỗ trợ là 4 giờ.",
  unsupportedType: "Định dạng media này chưa được hỗ trợ.",
} as const;

export const MEDIA_LIMITS = {
  maxTotalMediaPerPost: 30,
  maxImagesPerPost: 30,
  maxVideosPerPost: 10,
  maxImageSizeMB: 20,
  maxVideoSizeMBUser: 2048,
  maxVideoSizeMBPremium: 10240,
  maxVideoDurationMinutes: 240,
  allowedImageExt: ["jpg", "jpeg", "png", "webp"] as const,
  allowedImageMime: ["image/jpeg", "image/png", "image/webp"] as const,
  allowedVideoExt: ["mp4", "mov", "webm"] as const,
  allowedVideoMime: ["video/mp4", "video/quicktime", "video/webm"] as const,
} as const;

export type MediaKind = "image" | "video";

export type MediaValidationCode =
  | "MEDIA_LIMIT_EXCEEDED"
  | "IMAGE_LIMIT_EXCEEDED"
  | "VIDEO_LIMIT_EXCEEDED"
  | "IMAGE_TOO_LARGE"
  | "VIDEO_TOO_LARGE"
  | "VIDEO_DURATION_TOO_LONG"
  | "UNSUPPORTED_MEDIA_TYPE";

export interface MediaValidationError {
  code: MediaValidationCode;
  message: string;
}

export const IMAGE_MAX_BYTES = MEDIA_LIMITS.maxImageSizeMB * MB;
export const VIDEO_MAX_BYTES_USER = MEDIA_LIMITS.maxVideoSizeMBUser * MB;
export const VIDEO_MAX_BYTES_PREMIUM = MEDIA_LIMITS.maxVideoSizeMBPremium * MB;
export const VIDEO_MAX_DURATION_SECONDS = MEDIA_LIMITS.maxVideoDurationMinutes * 60;

function getExtension(nameOrKey = ""): string {
  const clean = nameOrKey.split("?")[0].split("#")[0];
  return clean.includes(".") ? clean.split(".").pop()!.toLowerCase() : "";
}

function inList(values: readonly string[], value = ""): boolean {
  return values.includes(value.toLowerCase());
}

export function getBucketFromKey(key = ""): string {
  return key.split("/")[0] || "";
}

export function isPostUploadKey(key = ""): boolean {
  const bucket = getBucketFromKey(key);
  return bucket === "posts" || bucket === "videos";
}

export function getMaxVideoBytes(isElevatedMediaAccount = false): number {
  return isElevatedMediaAccount ? VIDEO_MAX_BYTES_PREMIUM : VIDEO_MAX_BYTES_USER;
}

export function inferMediaKind(input: { contentType?: string | null; fileName?: string | null; key?: string | null; fileType?: string | null }): MediaKind | null {
  const contentType = String(input.contentType || "").toLowerCase();
  const ext = getExtension(input.fileName || input.key || "");
  const fileType = String(input.fileType || "").toLowerCase();
  if (fileType === "image" || inList(MEDIA_LIMITS.allowedImageMime, contentType) || inList(MEDIA_LIMITS.allowedImageExt, ext)) return "image";
  if (fileType === "video" || inList(MEDIA_LIMITS.allowedVideoMime, contentType) || inList(MEDIA_LIMITS.allowedVideoExt, ext)) return "video";
  return null;
}

export function validateMediaType(input: { contentType?: string | null; fileName?: string | null; key?: string | null; fileType?: string | null }, expectedKind?: MediaKind): MediaValidationError | null {
  const contentType = String(input.contentType || "").toLowerCase();
  const ext = getExtension(input.fileName || input.key || "");
  if (expectedKind === "image") {
    return inList(MEDIA_LIMITS.allowedImageMime, contentType) && inList(MEDIA_LIMITS.allowedImageExt, ext)
      ? null
      : { code: "UNSUPPORTED_MEDIA_TYPE", message: MEDIA_LIMIT_MESSAGES.unsupportedType };
  }
  if (expectedKind === "video") {
    return inList(MEDIA_LIMITS.allowedVideoMime, contentType) && inList(MEDIA_LIMITS.allowedVideoExt, ext)
      ? null
      : { code: "UNSUPPORTED_MEDIA_TYPE", message: MEDIA_LIMIT_MESSAGES.unsupportedType };
  }
  return inferMediaKind(input) ? null : { code: "UNSUPPORTED_MEDIA_TYPE", message: MEDIA_LIMIT_MESSAGES.unsupportedType };
}

export function validateUploadMedia(input: {
  key: string;
  contentType: string;
  fileSize?: number | null;
  durationSeconds?: number | null;
  isElevatedMediaAccount?: boolean;
  enforce?: boolean;
}): MediaValidationError | null {
  if (!input.enforce && !isPostUploadKey(input.key)) return null;
  const kind = inferMediaKind({ contentType: input.contentType, key: input.key });
  if (!kind) return { code: "UNSUPPORTED_MEDIA_TYPE", message: MEDIA_LIMIT_MESSAGES.unsupportedType };
  const typeError = validateMediaType({ contentType: input.contentType, key: input.key }, kind);
  if (typeError) return typeError;
  const fileSize = Number(input.fileSize);
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { code: kind === "image" ? "IMAGE_TOO_LARGE" : "VIDEO_TOO_LARGE", message: kind === "image" ? MEDIA_LIMIT_MESSAGES.imageTooLarge : MEDIA_LIMIT_MESSAGES.videoTooLarge };
  }
  if (kind === "image" && fileSize > IMAGE_MAX_BYTES) {
    return { code: "IMAGE_TOO_LARGE", message: MEDIA_LIMIT_MESSAGES.imageTooLarge };
  }
  if (kind === "video" && fileSize > getMaxVideoBytes(input.isElevatedMediaAccount)) {
    return { code: "VIDEO_TOO_LARGE", message: MEDIA_LIMIT_MESSAGES.videoTooLarge };
  }
  if (
    kind === "video"
    && typeof input.durationSeconds === "number"
    && Number.isFinite(input.durationSeconds)
    && input.durationSeconds > VIDEO_MAX_DURATION_SECONDS
  ) {
    return { code: "VIDEO_DURATION_TOO_LONG", message: MEDIA_LIMIT_MESSAGES.videoTooLong };
  }
  return null;
}

export function validatePostMediaCounts(counts: { images: number; videos: number }): MediaValidationError | null {
  const total = counts.images + counts.videos;
  if (total > MEDIA_LIMITS.maxTotalMediaPerPost) {
    return { code: "MEDIA_LIMIT_EXCEEDED", message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  if (counts.images > MEDIA_LIMITS.maxImagesPerPost) {
    return { code: "IMAGE_LIMIT_EXCEEDED", message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  if (counts.videos > MEDIA_LIMITS.maxVideosPerPost) {
    return { code: "VIDEO_LIMIT_EXCEEDED", message: MEDIA_LIMIT_MESSAGES.maxTotal };
  }
  return null;
}

export async function isElevatedMediaAccount(adminClient: any, userId: string): Promise<boolean> {
  const { data } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

export function mediaLimitResponse(error: MediaValidationError, status = 400): Response {
  return new Response(
    JSON.stringify({ error: error.message, code: error.code }),
    { status, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } },
  );
}
