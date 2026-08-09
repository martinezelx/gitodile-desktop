/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-unresolved-local-imports",
      severity: "error",
      comment: "Local architecture edges must resolve so ownership checks cannot be bypassed.",
      from: { path: "^src/" },
      to: { couldNotResolve: true, dependencyTypes: ["local", "localmodule"] },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|target|coverage)(/|$)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.app.json" },
    enhancedResolveOptions: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
    },
    reporterOptions: {
      dot: { collapsePattern: "node_modules/[^/]+" },
    },
  },
};
