"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateJobStatus } from "./actions";

export function JobStatusButtons({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        onClick={() =>
          start(() => {
            void updateJobStatus({ jobId, status: "en_route" });
          })
        }
      >
        Start route
      </Button>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("Mark this job complete? This starts the review request.")) {
            return;
          }
          start(() => {
            void updateJobStatus({ jobId, status: "complete" });
          });
        }}
      >
        Complete
      </Button>
    </div>
  );
}
