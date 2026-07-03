function parseSemver(version: string) {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) {
    return null
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  }
}

export function isSemver(value: string) {
  return parseSemver(value) !== null
}

export function compareSemver(a: string, b: string) {
  const left = parseSemver(a)
  const right = parseSemver(b)
  if (!left || !right) {
    throw new Error(`Invalid semver comparison: ${a} vs ${b}`)
  }
  if (left.major !== right.major) {
    return left.major - right.major
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor
  }
  return left.patch - right.patch
}

export function isWithinVersionRange(version: string, minimum: string, maximum: string) {
  return compareSemver(version, minimum) >= 0 && compareSemver(version, maximum) <= 0
}
