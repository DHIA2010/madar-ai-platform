import Anthropic from "@anthropic-ai/sdk"

// Saudi occasions the blog and Instagram agents write around: fixed-date national days and retail
// seasons, and Islamic occasions placed with the Umm al-Qura calendar (the official Saudi one).
// Islamic dates depend on the moon sighting, so they can move by a day: posts say "قريباً" or greet
// on the day rather than promising a date. A weekly web search adds anything this list doesn't know.

export interface SaudiOccasion {
  key: string
  name: string
  // YYYY-MM-DD (Riyadh).
  date: string
  kind: "national" | "religious" | "retail" | "social"
  // True for Islamic dates (Umm al-Qura estimate, may shift a day).
  approximate: boolean
  // What a merchant-facing post could do for it.
  idea: string
}

const DAY_MS = 86_400_000

const FIXED: Array<{
  key: string
  name: string
  month: number
  day: number
  kind: SaudiOccasion["kind"]
  idea: string
}> = [
  {
    key: "founding-day",
    name: "يوم التأسيس",
    month: 2,
    day: 22,
    kind: "national",
    idea: "تهنئة بيوم التأسيس، وفكرة عرض أو تجهيز المحل لزحمة الإجازة.",
  },
  {
    key: "flag-day",
    name: "يوم العلم",
    month: 3,
    day: 11,
    kind: "national",
    idea: "منشور وطني بسيط بألوان مدار، بدون مبالغة.",
  },
  {
    key: "mothers-day",
    name: "يوم الأم",
    month: 3,
    day: 21,
    kind: "social",
    idea: "أفكار هدايا وعروض للمحلات، وبطاقات الهدايا في مدار.",
  },
  {
    key: "national-day",
    name: "اليوم الوطني السعودي",
    month: 9,
    day: 23,
    kind: "national",
    idea: "تهنئة باليوم الوطني، وتجهيز المحل والمتجر لعروض اليوم الوطني.",
  },
]

const HIJRI: Array<{
  key: string
  name: string
  month: number
  day: number
  kind: SaudiOccasion["kind"]
  idea: string
}> = [
  {
    key: "ramadan-prep",
    name: "قبل رمضان بعشرة أيام",
    month: 8,
    day: 20,
    kind: "retail",
    idea: "جهّز محلك لرمضان: المخزون، ساعات العمل الليلية، العروض، والكاشير وقت الزحمة.",
  },
  {
    key: "ramadan",
    name: "بداية شهر رمضان",
    month: 9,
    day: 1,
    kind: "religious",
    idea: "تهنئة بقدوم رمضان (رمضان كريم / مبارك عليكم الشهر)، ونصائح لتشغيل المحل في رمضان.",
  },
  {
    key: "last-ten-ramadan",
    name: "العشر الأواخر من رمضان",
    month: 9,
    day: 21,
    kind: "retail",
    idea: "موسم تسوق العيد: الزحمة، العروض، المخزون، الدفع السريع.",
  },
  {
    key: "eid-al-fitr",
    name: "عيد الفطر",
    month: 10,
    day: 1,
    kind: "religious",
    idea: "تهنئة بعيد الفطر (عيدكم مبارك)، بدون بيع مباشر في يوم العيد نفسه.",
  },
  {
    key: "dhul-hijjah",
    name: "بداية العشر من ذي الحجة",
    month: 12,
    day: 1,
    kind: "religious",
    idea: "تذكير لطيف بفضل الأيام العشر، وتجهيز المحل لموسم عيد الأضحى.",
  },
  {
    key: "arafah",
    name: "يوم عرفة",
    month: 12,
    day: 9,
    kind: "religious",
    idea: "منشور دعاء وتهنئة هادئ، بدون عروض.",
  },
  {
    key: "eid-al-adha",
    name: "عيد الأضحى",
    month: 12,
    day: 10,
    kind: "religious",
    idea: "تهنئة بعيد الأضحى (عيدكم مبارك، كل عام وأنتم بخير).",
  },
  {
    key: "hijri-new-year",
    name: "رأس السنة الهجرية",
    month: 1,
    day: 1,
    kind: "religious",
    idea: "تهنئة بالعام الهجري الجديد، وفكرة بداية جديدة لترتيب حسابات المحل.",
  },
]

const riyadhDay = (time: number) => new Date(time + 3 * 3_600_000).toISOString().slice(0, 10)

// The Umm al-Qura day and month of a Riyadh date.
function hijriOf(time: number): { month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    timeZone: "Asia/Riyadh",
    day: "numeric",
    month: "numeric",
  }).formatToParts(new Date(time))
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0)
  return { month: value("month"), day: value("day") }
}

// The last Friday of November -- the "White Friday" sales week in Saudi retail.
function whiteFriday(year: number): string {
  const lastDay = new Date(Date.UTC(year, 10, 30))
  const back = (lastDay.getUTCDay() - 5 + 7) % 7
  return new Date(lastDay.getTime() - back * DAY_MS).toISOString().slice(0, 10)
}

// Occasions from `from` (inclusive) through the next `days` days, soonest first.
export function upcomingSaudiOccasions(from: Date, days = 21): SaudiOccasion[] {
  const out: SaudiOccasion[] = []
  const start = from.getTime()
  for (let offset = 0; offset <= days; offset += 1) {
    const time = start + offset * DAY_MS
    const date = riyadhDay(time)
    const [year, month, day] = date.split("-").map(Number)
    for (const entry of FIXED) {
      if (entry.month === month && entry.day === day) {
        out.push({ ...entry, date, approximate: false })
      }
    }
    if (day === 27) {
      out.push({
        key: "salary-day",
        name: "يوم الراتب",
        date,
        kind: "retail",
        approximate: false,
        idea: "الناس تتسوق بعد الراتب: عرض أو تذكير بتجهيز المخزون والكاشير لنهاية الشهر.",
      })
    }
    if (date === whiteFriday(year)) {
      out.push({
        key: "white-friday",
        name: "الجمعة البيضاء (موسم التخفيضات)",
        date,
        kind: "retail",
        approximate: false,
        idea: "موسم التخفيضات: العروض والكوبونات، والمخزون، ومعرفة أي إعلان يبيع.",
      })
    }
    const hijri = hijriOf(time)
    for (const entry of HIJRI) {
      if (entry.month === hijri.month && entry.day === hijri.day) {
        out.push({
          key: entry.key,
          name: entry.name,
          date,
          kind: entry.kind,
          approximate: true,
          idea: entry.idea,
        })
      }
    }
  }
  return out
}

// The occasions as the agents read them.
export function occasionsSection(occasions: SaudiOccasion[], searchNotes: string | null): string {
  const list = occasions.length
    ? occasions
        .map(
          (entry) =>
            `- ${entry.date}: ${entry.name}${entry.approximate ? " (تاريخ هجري تقريبي، قد يتغير يوماً حسب الرؤية)" : ""} — ${entry.idea}`
        )
        .join("\n")
    : "- لا مناسبات معروفة في الأيام القادمة"
  return `مناسبات سعودية قادمة (التقويم):
${list}
${searchNotes ? `\nما وجده البحث على الإنترنت عن مناسبات ومواسم قادمة في السعودية:\n${searchNotes}` : ""}`
}

// A weekly web search for Saudi occasions and retail seasons the fixed list may miss.
export interface OccasionResearcher {
  search(from: string, days: number): Promise<string | null>
}

export class ClaudeOccasionResearcher implements OccasionResearcher {
  private readonly client: Anthropic

  constructor(
    apiKey: string,
    private readonly model: string
  ) {
    this.client = new Anthropic({ apiKey })
  }

  async search(from: string, days: number): Promise<string | null> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4000,
      output_config: { effort: "low" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
      messages: [
        {
          role: "user",
          content: `ابحث في الإنترنت عن المناسبات والمواسم في السعودية خلال ${days} يوماً بدءاً من ${from}: المناسبات الوطنية والدينية، الإجازات الرسمية والمدرسية، مواسم التسوق والتخفيضات، الفعاليات الكبيرة (مثل موسم الرياض)، وأي يوم عالمي يهم أصحاب المحلات.
أجب بقائمة قصيرة بالعربية فقط: سطر لكل مناسبة بالشكل «YYYY-MM-DD: الاسم — لماذا تهم أصحاب المحلات». اذكر فقط ما وجدته في مصادر موثوقة، ولا تخترع تواريخ. إن لم تجد شيئاً فاكتب «لا شيء».`,
        },
      ],
    })
    if (response.stop_reason === "refusal") return null
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim()
    if (!text || text === "لا شيء") return null
    return text.slice(0, 2500)
  }
}

// What the agents call: the calendar for the next three weeks plus the web search, the search
// kept for the day so the blog and Instagram agents share one.
export function saudiOccasionsSource(
  researcher: OccasionResearcher | null,
  days = 21
): (from: Date) => Promise<string> {
  let cached: { day: string; notes: string | null } | null = null
  return async (from: Date) => {
    const day = riyadhDay(from.getTime())
    if (!cached || cached.day !== day) {
      const notes = researcher ? await researcher.search(day, days).catch(() => null) : null
      cached = { day, notes }
    }
    return occasionsSection(upcomingSaudiOccasions(from, days), cached.notes)
  }
}
