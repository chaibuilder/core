import { BASE64_PATH_MAX_SIZE } from "../digital-asset-manager/upload-files";
import { panelCategoriesFor, panelCategoryOfFile, panelMaxBytesForFile, videoBlocksForAsset } from "./images-panel-utils";

const MB = 1024 * 1024;

const fileOf = (name: string, type: string) => new File(["x"], name, { type });

describe("panelCategoriesFor", () => {
  it("offers images and videos when the host sets no restriction", () => {
    expect(panelCategoriesFor(undefined)).toEqual(["image", "video"]);
    expect(panelCategoriesFor([])).toEqual(["image", "video"]);
  });

  it("drops a category the host disabled", () => {
    expect(panelCategoriesFor(["image", "document"])).toEqual(["image"]);
    expect(panelCategoriesFor(["video"])).toEqual(["video"]);
  });
});

describe("panelCategoryOfFile", () => {
  const both = panelCategoriesFor(undefined);

  it("classifies by extension, whatever the browser reports as mime type", () => {
    expect(panelCategoryOfFile(fileOf("photo.jpg", "image/jpeg"), both)).toBe("image");
    expect(panelCategoryOfFile(fileOf("clip.mp4", "video/mp4"), both)).toBe("video");
    expect(panelCategoryOfFile(fileOf("clip.mov", ""), both)).toBe("video");
    expect(panelCategoryOfFile(fileOf("clip.mov", "application/octet-stream"), both)).toBe("video");
  });

  it("rejects extensions the server would refuse, even with a matching mime type", () => {
    expect(panelCategoryOfFile(fileOf("clip.mkv", "video/x-matroska"), both)).toBeNull();
    expect(panelCategoryOfFile(fileOf("photo.heic", "image/heic"), both)).toBeNull();
  });

  it("rejects files outside the allowed categories", () => {
    expect(panelCategoryOfFile(fileOf("brochure.pdf", "application/pdf"), both)).toBeNull();
    expect(panelCategoryOfFile(fileOf("clip.mp4", "video/mp4"), ["image"])).toBeNull();
  });
});

describe("panelMaxBytesForFile", () => {
  it("caps a video at the video category limit, under the transport ceiling", () => {
    const video = fileOf("clip.mp4", "video/mp4");
    expect(panelMaxBytesForFile(video, "video", 100 * MB)).toBe(50 * MB);
    expect(panelMaxBytesForFile(video, "video", 4 * MB)).toBe(4 * MB);
    expect(panelMaxBytesForFile(video, "video", 100 * MB, { video: 10 * MB })).toBe(10 * MB);
  });

  it("bounds SVGs by the base64 endpoint", () => {
    const svg = fileOf("logo.svg", "image/svg+xml");
    expect(panelMaxBytesForFile(svg, "image", 100 * MB, { image: 200 * MB })).toBe(BASE64_PATH_MAX_SIZE);
  });
});

describe("videoBlocksForAsset", () => {
  it("builds a looping, muted Custom Video block playing the asset", () => {
    const [block] = videoBlocksForAsset({ url: "https://cdn.test/clip.mp4", name: "clip.mp4" });
    expect(block).toMatchObject({
      _type: "Video",
      _name: "clip.mp4",
      videoSource: "Custom",
      url: "https://cdn.test/clip.mp4",
      customUrl: "https://cdn.test/clip.mp4",
      controls: { autoplay: true, controls: false, loop: true, muted: true },
    });
  });
});
