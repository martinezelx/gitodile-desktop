import { useRef, useState } from "react";

import type { ProjectRuntime } from "../runtime/project/runtime";
import {
  useActiveProjectSelector,
  useActiveScreenEffect,
  useScreenLifecycle,
} from "../runtime/screen/module";

const selectActiveProject = (snapshot: ReturnType<ProjectRuntime["getSnapshot"]>): string | null =>
  snapshot.activeId;

/** Minimal screen used to prove the runtime contract without giving a real
 * product feature a test-only responsibility. */
export function RuntimeTestScreen({
  runtime,
  onRender,
  onPoll,
}: {
  runtime: ProjectRuntime;
  onRender: () => void;
  onPoll: () => void;
}): React.JSX.Element {
  onRender();
  const lifecycle = useScreenLifecycle();
  const activeProject = useActiveProjectSelector(runtime, selectActiveProject);
  const [localCount, setLocalCount] = useState(0);
  const pollRef = useRef(onPoll);
  pollRef.current = onPoll;

  useActiveScreenEffect(() => {
    const handle = setInterval(() => pollRef.current(), 20);
    return () => clearInterval(handle);
  }, []);

  return (
    <section aria-label="Runtime test screen">
      <button type="button" onClick={() => setLocalCount((count) => count + 1)}>
        Local {localCount}
      </button>
      <p aria-live={lifecycle === "active" ? "polite" : "off"}>
        Project {activeProject ?? "none"}
      </p>
    </section>
  );
}
