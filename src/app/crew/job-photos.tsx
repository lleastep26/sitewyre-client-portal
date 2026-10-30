"use client";

import { useRef, useTransition } from "react";
import { addJobPhoto } from "@/app/(app)/jobs/actions";

export function JobPhotos({
  jobId,
  photos,
}: {
  jobId: string;
  photos: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-3 space-y-2">
      {photos.length ? (
        <div className="flex flex-wrap gap-2">
          {photos.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt="Job photo"
              className="h-16 w-16 rounded object-cover"
            />
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("jobId", jobId);
          fd.set("photo", file);
          start(() => {
            void addJobPhoto(fd);
          });
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={pending}
        className="text-sm text-copper disabled:opacity-50"
        onClick={() => inputRef.current?.click()}
      >
        {pending ? "Uploading…" : "Add photo"}
      </button>
    </div>
  );
}
