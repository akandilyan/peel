"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Building and downloading the file: per-decal progress, cancel, error with Retry,
// auto-download and re-downloading the finished file (saveAgain).
// - Generators (numbers) build the PDF / ZIP in the browser (job.run).
// - Static decals serve the ready source file (job.href).

export type BuildState =
  | { status: "idle" }
  | { status: "building"; done: number; total: number }
  | { status: "done"; fileName: string }
  | { status: "failed"; message?: string };

export interface BuiltFile {
  name: string;
  bytes: Uint8Array;
  type: string;
}

export type BuildJob =
  | { kind: "file"; href: string; fileName: string }
  | {
      kind: "generate";
      total: number;
      run: (onProgress: (done: number, total: number) => void, isCancelled: () => boolean) => Promise<BuiltFile>;
    };

function saveFile(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function useBuild() {
  const [state, setState] = useState<BuildState>({ status: "idle" });
  const lastJob = useRef<BuildJob | null>(null);
  // The last built file — a repeat Download without rebuilding
  const lastFile = useRef<{ url: string; name: string } | null>(null);
  // Current build number: a cancel or a new build makes the old one stale
  const runId = useRef(0);

  const dropFile = useCallback(() => {
    if (lastFile.current?.url.startsWith("blob:")) URL.revokeObjectURL(lastFile.current.url);
    lastFile.current = null;
  }, []);

  useEffect(
    () => () => {
      runId.current++;
      dropFile();
    },
    [dropFile],
  );

  const start = useCallback(
    async (job: BuildJob) => {
      const id = ++runId.current;
      lastJob.current = job;
      dropFile();

      if (job.kind === "file") {
        lastFile.current = { url: job.href, name: job.fileName };
        saveFile(job.href, job.fileName);
        setState({ status: "done", fileName: job.fileName });
        return;
      }

      setState({ status: "building", done: 0, total: job.total });
      try {
        const file = await job.run(
          (done, total) => {
            if (id === runId.current) setState({ status: "building", done, total });
          },
          () => id !== runId.current,
        );
        if (id !== runId.current) return;
        const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.type }));
        lastFile.current = { url, name: file.name };
        saveFile(url, file.name);
        setState({ status: "done", fileName: file.name });
      } catch (e) {
        if (id !== runId.current) return; // cancelled — don't show the error
        console.error(e);
        setState({ status: "failed", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [dropFile],
  );

  const cancel = useCallback(() => {
    runId.current++;
    setState({ status: "idle" });
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    setState((s) => (s.status === "idle" ? s : { status: "idle" }));
  }, []);

  const retry = useCallback(() => {
    if (lastJob.current) void start(lastJob.current);
  }, [start]);

  const saveAgain = useCallback(() => {
    const f = lastFile.current;
    if (f) saveFile(f.url, f.name);
  }, []);

  return { state, start, cancel, reset, retry, saveAgain };
}
