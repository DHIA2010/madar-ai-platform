export const CAMPAIGN_SELECT_TRIGGER_CLASSNAME =
  "!h-12 w-full rounded-xl border border-border/70 bg-background px-4 text-sm font-medium shadow-none transition-colors hover:border-border focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"

export const CAMPAIGN_SELECT_CONTENT_CLASSNAME =
  "rounded-xl border border-border/70 bg-popover p-1.5 shadow-lg ring-1 ring-foreground/5"

export const CAMPAIGN_SELECT_ITEM_CLASSNAME =
  // Room is kept at the row's end for the tick of the chosen item, so it never sits on the text
  // (in Arabic the text starts from the right, where a fixed "right" tick used to land).
  "rounded-lg ps-3 pe-9 py-2 text-sm focus:bg-accent/70 data-[state=checked]:bg-accent/60"
