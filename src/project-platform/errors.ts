import { ProjectError } from "./application/errors/ProjectError"

export function mapProjectError(error: unknown) {
  if (error instanceof ProjectError) {
    return {
      status: error.status,
      body: {
        code: error.code,
        category: error.category,
        message: error.message,
        details: error.details,
      },
    }
  }

  return {
    status: 500,
    body: {
      code: "PROJECT_INTERNAL_ERROR",
      category: "security",
      message: error instanceof Error ? error.message : "Project platform failure.",
    },
  }
}
