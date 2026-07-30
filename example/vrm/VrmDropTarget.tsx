import { useEffect, useState } from "react";
import { useVrmStore } from "./useVrmStore";

export function VrmDropTarget() {
  const setVrm = useVrmStore((state) => state.setVrm);
  const [isDragging, setIsDragging] = useState(false);
  const [invalidDrop, setInvalidDrop] = useState(false);

  useEffect(() => {
    let dragDepth = 0;
    let invalidDropTimeout: ReturnType<typeof setTimeout> | undefined;

    const isFileDrag = (event: DragEvent) =>
      event.dataTransfer?.types.includes("Files") ?? false;

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth += 1;
      setIsDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };

    const onDragLeave = (event: DragEvent) => {
      if (dragDepth === 0 && !isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) setIsDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      dragDepth = 0;
      setIsDragging(false);
      const file = Array.from(event.dataTransfer?.files ?? []).find((item) =>
        item.name.toLowerCase().endsWith(".vrm")
      );
      if (file) {
        setInvalidDrop(false);
        setVrm(URL.createObjectURL(file), file.name);
        return;
      }

      setInvalidDrop(true);
      if (invalidDropTimeout) clearTimeout(invalidDropTimeout);
      invalidDropTimeout = setTimeout(() => setInvalidDrop(false), 1500);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      if (invalidDropTimeout) clearTimeout(invalidDropTimeout);
    };
  }, [setVrm]);

  if (!isDragging && !invalidDrop) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        background: "rgba(0, 0, 0, 0.55)",
        color: "white",
        fontSize: "clamp(24px, 5vw, 48px)",
        fontWeight: 700,
      }}
    >
      {isDragging ? "Drop .vrm file" : "Not a .vrm file"}
    </div>
  );
}
