export type ModelImage = { mime: "image/png" | "image/jpeg" | "image/webp"; data: string; sourceRef?: string };
export function validateImages(images: unknown): ModelImage[] {
  if (!Array.isArray(images) || images.length > 4) throw Error("Invalid image count");
  let total = 0;
  for (const image of images) {
    if (!image || !["image/png", "image/jpeg", "image/webp"].includes(image.mime) || typeof image.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data) || image.data.length > 8 * 1024 * 1024) throw Error("Invalid image input");
    const bytes = Buffer.from(image.data, "base64"); total += bytes.length;
    const valid = image.mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : image.mime === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes.at(-2) === 255 && bytes.at(-1) === 217
      : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP";
    if (!valid || bytes.length > 6 * 1024 * 1024 || total > 12 * 1024 * 1024) throw Error("Invalid image bytes");
  }
  return images;
}
