// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  filesFromDataTransfer,
  firstVideoFileFromDataTransfer,
  isVideoUploadFile,
} from "@/lib/listing-media-drop";

function mockDataTransfer(input: { files?: File[]; items?: File[] }): DataTransfer {
  const files = input.files ?? [];
  const itemFiles = input.items ?? [];
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* () {
      for (const file of files) yield file;
    },
  } as FileList;
  return {
    files: fileList,
    items: itemFiles.map((file) => ({
      kind: "file",
      getAsFile: () => file,
    })),
    types: ["Files"],
  } as unknown as DataTransfer;
}

describe("listing-media-drop", () => {
  it("accepts videos by extension when MIME type is empty (Finder drag-and-drop)", () => {
    const file = new File(["bytes"], "walkthrough.mov", { type: "" });
    expect(isVideoUploadFile(file)).toBe(true);
  });

  it("reads files from dataTransfer.items when files list is empty", () => {
    const file = new File(["bytes"], "tour.mp4", { type: "" });
    const dt = mockDataTransfer({ files: [], items: [file] });

    expect(filesFromDataTransfer(dt)).toHaveLength(1);
    expect(firstVideoFileFromDataTransfer(dt)?.name).toBe("tour.mp4");
  });

  it("picks the first video when multiple files are dropped", () => {
    const dt = mockDataTransfer({
      files: [
        new File(["a"], "notes.txt", { type: "text/plain" }),
        new File(["b"], "room.mov", { type: "" }),
      ],
    });

    expect(firstVideoFileFromDataTransfer(dt)?.name).toBe("room.mov");
  });
});
