export class EmailAddress {
  readonly value: string

  constructor(input: string) {
    const normalized = input.trim().toLowerCase()
    if (!normalized || !normalized.includes("@")) {
      throw new Error("Invalid email address")
    }
    this.value = normalized
  }
}
