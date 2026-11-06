import { useEffect, useRef } from "react";

import { mountSimulator } from "./simulator.js";
import "./_group.css";

export function Current() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!rootRef.current) return;
    return mountSimulator(rootRef.current);
  }, []);

  return <div ref={rootRef} />;
}
