import { describe, it } from "vitest"

import type { Clock, UuidGenerator } from "./types"

export class FixedClock implements Clock {
  constructor(private readonly value: Date) {}
  now() {
    return this.value
  }
  nowIso() {
    return this.value.toISOString()
  }
}

export class DeterministicUuidGenerator implements UuidGenerator {
  private counter = 0

  generate() {
    this.counter += 1
    return `00000000-0000-0000-0000-${String(this.counter).padStart(12, "0")}`
  }
}

export function defineRepositoryContract(name: string, run: () => void) {
  describe(`repository-contract:${name}`, () => {
    it("satisfies the repository contract", async () => {
      run()
    })
  })
}
