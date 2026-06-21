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
      name: "presentation-no-infra-direct",
      severity: "error",
      from: {
        path: "^src/features/",
      },
      to: {
        path: "^src/(lib/query|lib/errors|lib/logger|services/api-client)/",
      },
    },
    {
      name: "presentation-no-services-direct",
      severity: "error",
      from: {
        path: "^src/app/",
      },
      to: {
        path: "^src/services/",
      },
    },
    {
      name: "layering-domain-cannot-import-presentation",
      severity: "error",
      from: {
        path: "^src/features/[^/]+/domain/",
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
