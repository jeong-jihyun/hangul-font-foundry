// 폰에서 보관함으로 zip 을 바로 올리기 위한 '올리기 허가증' 발급 (서버 경유 4.5MB 제한을 피함)
import { handleUpload } from "@vercel/blob/client";
import { isAuthed, json, deny } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

export async function POST(req) {
  if (!(await isAuthed())) return deny();
  const body = await req.json();
  try {
    const result = await handleUpload({
      body, request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^projects\/[a-z0-9]{8,24}\/glyphs\.zip$/.test(pathname)) throw new Error("bad path");
        return { allowedContentTypes: ["application/zip", "application/x-zip-compressed", "application/octet-stream"], maximumSizeInBytes: 30 * 1024 * 1024, allowOverwrite: true, addRandomSuffix: false };
      },
    });
    return json(result);
  } catch {
    return json({ error: { code: "VALIDATION_ERROR", message: "올리기를 허가하지 못했습니다." } }, 400);
  }
}
