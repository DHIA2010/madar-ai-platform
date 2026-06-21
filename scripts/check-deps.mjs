import { execSync } from "node:child_process"

function run(command) {
  return execSync(command, { stdio: "pipe", encoding: "utf8" })
}

const reports = []

try {
  const outdated = run("npm outdated --json || true")
  reports.push({ name: "outdated", value: outdated.trim() || "{}" })
} catch {
  reports.push({ name: "outdated", value: "{}" })
}

try {
  const duplicates = run("npm ls --all --json")
  reports.push({ name: "tree", value: duplicates.trim() || "{}" })
} catch (error) {
  reports.push({ name: "tree", value: error.stdout?.toString() || "{}" })
}

console.log("[deps] Dependency health report generated")
for (const report of reports) {
  console.log(`\\n--- ${report.name} ---`)
  console.log(report.value)
}
