"use client";

import { useEffect, useState } from "react";

// Placeholder until the workspace shell: proves the /api/* proxy reaches the Starlette server.
export function Runtime() {
  const [runtime, setRuntime] = useState("…");
  useEffect(() => {
    fetch("/api/info")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((info: { runtime: string }) => setRuntime(info.runtime))
      .catch(() => setRuntime("Can't reach the API"));
  }, []);
  return <span className="font-mono text-sm text-muted-foreground">{runtime}</span>;
}
