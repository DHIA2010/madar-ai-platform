/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "feature-no-ui-primitives",
      severity: "error",
      from: {
        path: "^src/features/",
      },
      to: {
        path: "^src/components/ui/",
      },
    },
    {
      name: "feature-no-infrastructure-direct",
      severity: "error",
      from: {
        path: "^src/features/",
        pathNot: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
      },
      to: {
        path: "^src/infrastructure/",
      },
    },
    {
      name: "domain-no-adapters",
      severity: "error",
      from: {
        path: "^src/.*/domain/",
        pathNot: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
      },
      to: {
        path: "^src/(?:infrastructure/.*/adapters/|.*?/adapters/)",
      },
    },
    {
      name: "integration-platform-domain-is-pure",
      severity: "error",
      from: {
        path: "^src/integration-platform/domain/",
        pathNot: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
      },
      to: {
        path: "^src/integration-platform/(?:infrastructure|interfaces|bootstrap)/",
      },
    },
    {
      name: "layering-domain-cannot-import-presentation",
      severity: "error",
      from: {
        path: "^src/features/[^/]+/domain/",
        pathNot: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
      },
      to: {
        path: "^src/features/[^/]+/(presentation|ui|components)/",
      },
    },
    {
      name: "layering-application-cannot-import-presentation",
      severity: "error",
      from: {
        path: "^src/features/[^/]+/application/",
        pathNot: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
      },
      to: {
        path: "^src/features/[^/]+/(presentation|ui|components)/",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    doNotFollow: {
      path: "node_modules",
    },
    includeOnly: "^src",
    exclude: "(?:\\.test\\.|\\.spec\\.|/tests?/)",
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "node_modules/[^/]+",
      },
    },
  },
}
