// Who inside the chosen places a Snapchat ad set is shown to, beyond age and gender: the
// languages people use Snapchat in, and what they are interested in.
//
// Both lists are Snapchat's own (GET /targeting/demographics/languages and GET
// /targeting/v1/interests/scls?country_code=..., the "Snap Lifestyle Categories"). An ad set
// names them like this -- the shape read from a live ad set:
//   demographics: [{ min_age, languages: ["ar"], operation: "INCLUDE" }]
//   interests:    [{ category_id: ["SLC_28", "SLC_104"], operation: "INCLUDE" }]
// People who match any one of the interests are reached; no language or no interest means
// everyone.

type Json = Record<string, unknown>

export interface SnapchatLanguage {
  id: string
  name: string
  nameAr: string | null
}

export interface SnapchatInterest {
  id: string
  // Snapchat's own name, and the Arabic one where Madar knows it.
  name: string
  nameAr: string | null
  // The wider interest this one belongs to; null for the widest ones.
  parentId: string | null
}

export const SNAPCHAT_LANGUAGE_ID = /^[a-z]{2,3}$/
export const SNAPCHAT_INTEREST_ID = /^SLC_\d{1,6}$/
export const SNAPCHAT_MAX_LANGUAGES = 30
export const SNAPCHAT_MAX_INTERESTS = 100

const LANGUAGES_AR: Record<string, string> = {
  ar: "العربية",
  zh: "الصينية",
  da: "الدنماركية",
  nl: "الهولندية",
  en: "الإنجليزية",
  fi: "الفنلندية",
  fr: "الفرنسية",
  de: "الألمانية",
  el: "اليونانية",
  id: "الإندونيسية",
  it: "الإيطالية",
  ja: "اليابانية",
  ko: "الكورية",
  nb: "النرويجية",
  pl: "البولندية",
  pt: "البرتغالية",
  ro: "الرومانية",
  ru: "الروسية",
  es: "الإسبانية",
  sv: "السويدية",
  tr: "التركية",
}

// The Arabic names of Snapchat's interests, by Snapchat's id (the list it gives for Saudi Arabia).
const INTERESTS_AR: Record<string, string> = {
  SLC_1: "محبو المغامرات",
  SLC_2: "محبو الفنون والثقافة",
  SLC_3: "محبو السيارات",
  SLC_4: "مرتادو الشواطئ وركوب الأمواج",
  SLC_5: "المهتمون بالجمال والتجميل",
  SLC_6: "محبو القراءة والكتب",
  SLC_123: "محبو القصص التفاعلية",
  SLC_7: "محبو السهر والحفلات",
  SLC_8: "طلاب الجامعات",
  SLC_9: "محبو القصص المصورة والرسوم المتحركة",
  SLC_249: "صنّاع المحتوى",
  SLC_229: "المهتمون بالعملات الرقمية",
  SLC_252: "علوم البيانات والذكاء الاصطناعي",
  SLC_250: "المبرمجون والمطوّرون",
  SLC_10: "محبو الأعمال اليدوية",
  SLC_11: "المهتمون بالموضة والأناقة",
  SLC_12: "محبو الأفلام والتلفزيون",
  SLC_13: "محبو أفلام الأكشن والإثارة",
  SLC_14: "محبو الكوميديا",
  SLC_15: "مشاهدو البث عبر الإنترنت",
  SLC_98: "محبو أفلام الجريمة والغموض",
  SLC_16: "محبو الدراما",
  SLC_17: "محبو الأفلام العائلية",
  SLC_18: "محبو أفلام الرعب",
  SLC_99: "محبو الأفلام المستقلة والأجنبية",
  SLC_19: "مرتادو دور السينما",
  SLC_20: "محبو برامج الواقع",
  SLC_21: "محبو الأفلام الرومانسية",
  SLC_22: "محبو الخيال العلمي والفانتازيا",
  SLC_23: "محبو أفلام الأبطال الخارقين",
  SLC_100: "محبو برامج المواهب والمسابقات",
  SLC_101: "محبو البرامج الحوارية",
  SLC_102: "محبو أعمال المراهقين والشباب",
  SLC_24: "محبو اللياقة البدنية",
  SLC_25: "محبو ركوب الدراجات",
  SLC_26: "محبو الجري",
  SLC_27: "محبو اليوغا",
  SLC_28: "محبو الطعام",
  SLC_103: "محبو البرجر",
  SLC_29: "محبو الحلويات",
  SLC_104: "محبو القهوة",
  SLC_30: "محبو الطبخ",
  SLC_110: "مستهلكو مشروبات الطاقة",
  SLC_31: "محبو الوجبات السريعة",
  SLC_105: "محبو البيتزا",
  SLC_111: "مستهلكو المشروبات الغازية",
  SLC_32: "النباتيون ومحبو الطعام العضوي",
  SLC_121: "محبو المسابقات والألغاز",
  SLC_33: "محبو الألعاب الإلكترونية",
  SLC_155: "لاعبو ألعاب القتال والتصويب",
  SLC_35: "لاعبو الكونسول والكمبيوتر",
  SLC_241: "لاعبو الكونسول والكمبيوتر: أكشن ومغامرات",
  SLC_242: "لاعبو الكونسول والكمبيوتر: قتال وتصويب",
  SLC_244: "لاعبو الكونسول والكمبيوتر: سباقات",
  SLC_243: "لاعبو الكونسول والكمبيوتر: تقمّص أدوار",
  SLC_245: "لاعبو الكونسول والكمبيوتر: رياضة",
  SLC_246: "لاعبو الكونسول والكمبيوتر: استراتيجية",
  SLC_220: "لاعبو الكونسول",
  SLC_221: "لاعبو الكمبيوتر",
  SLC_34: "لاعبو الجوال",
  SLC_222: "لاعبو الجوال: ألعاب خفيفة",
  SLC_227: "لاعبو الجوال: ألعاب سريعة جدًا",
  SLC_225: "لاعبو الجوال: ألعاب تلقائية",
  SLC_228: "لاعبو الجوال: ألعاب المطابقة",
  SLC_226: "لاعبو الجوال: ألعاب المحترفين",
  SLC_152: "لاعبو الجوال: ألغاز",
  SLC_154: "لاعبو الجوال: تقمّص أدوار",
  SLC_224: "لاعبو الجوال: محاكاة",
  SLC_156: "لاعبو الجوال: رياضة",
  SLC_157: "لاعبو الجوال: استراتيجية",
  SLC_158: "لاعبو الجوال: معلومات عامة",
  SLC_150: "محبو الرياضات الإلكترونية",
  SLC_36: "المهتمون بالحياة الصديقة للبيئة",
  SLC_90: "طلاب الثانوية",
  SLC_37: "متابعو الصيحات الجديدة",
  SLC_38: "محبو ديكور المنزل",
  SLC_39: "المستثمرون ورواد الأعمال",
  SLC_40: "محبو الرياضيات والعلوم",
  SLC_122: "متابعو الميمز",
  SLC_41: "أسلوب حياة الرجال",
  SLC_42: "الرجال المهتمون بالأناقة",
  SLC_128: "المهتمون بإدارة المال",
  SLC_43: "محبو الموسيقى",
  SLC_44: "مرتادو الحفلات والمهرجانات",
  SLC_45: "محبو موسيقى الكانتري",
  SLC_46: "محبو الموسيقى الإلكترونية",
  SLC_51: "محبو موسيقى الهيب هوب",
  SLC_47: "محبو الموسيقى المستقلة والبديلة",
  SLC_237: "محبو الكيبوب",
  SLC_94: "محبو الموسيقى اللاتينية",
  SLC_48: "محبو موسيقى البوب",
  SLC_49: "محبو البانك والميتال",
  SLC_50: "محبو موسيقى الروك",
  SLC_95: "محبو السول والآر أند بي",
  SLC_96: "محبو موسيقى العالم",
  SLC_126: "الباحثون عن جوال جديد",
  SLC_52: "متابعو الأخبار",
  SLC_53: "متابعو أخبار الأعمال",
  SLC_54: "متابعو أخبار المشاهير",
  SLC_55: "متابعو الأخبار السياسية",
  SLC_56: "محبو الطبيعة والهواء الطلق",
  SLC_57: "الآباء والأمهات والمهتمون بالعائلة",
  SLC_58: "محبو الحيوانات الأليفة",
  SLC_178: "محبو القطط",
  SLC_179: "محبو الكلاب",
  SLC_59: "المهتمون بالعمل الخيري",
  SLC_60: "المصوّرون",
  SLC_61: "المتسوّقون",
  SLC_89: "متسوّقو السيارات",
  SLC_62: "متسوّقو المتاجر الكبرى",
  SLC_162: "متسوّقو مستحضرات التجميل",
  SLC_63: "متسوّقو المتاجر متعددة الأقسام",
  SLC_118: "الباحثون عن الخصومات",
  SLC_166: "متسوّقو المجوهرات والساعات",
  SLC_64: "متسوّقو المنتجات الفاخرة",
  SLC_167: "متسوّقو أزياء الرجال",
  SLC_65: "المتسوّقون عبر الإنترنت",
  SLC_171: "متسوّقو منتجات العناية بالفم",
  SLC_106: "مرتادو المراكز التجارية",
  SLC_66: "متسوّقو الألعاب",
  SLC_176: "متسوّقو أزياء النساء",
  SLC_253: "أصحاب المنشآت الصغيرة ورواد الأعمال",
  SLC_109: "محبو الأحذية الرياضية",
  SLC_248: "أصحاب الأعمال الفردية",
  SLC_67: "محبو الرياضة",
  SLC_69: "محبو كرة القدم الأمريكية",
  SLC_70: "محبو البيسبول",
  SLC_71: "محبو كرة السلة",
  SLC_68: "محبو كرة السلة الجامعية",
  SLC_72: "محبو كرة القدم الأمريكية الجامعية",
  SLC_97: "محبو الكريكت",
  SLC_73: "محبو القتال والمصارعة",
  SLC_74: "لاعبو الجولف",
  SLC_75: "محبو الهوكي",
  SLC_76: "محبو رياضات المحركات",
  SLC_77: "محبو الألعاب الأولمبية",
  SLC_78: "محبو الرياضات الشتوية",
  SLC_79: "محبو كرة القدم",
  SLC_80: "محبو رياضات الشارع",
  SLC_81: "محبو التنس ورياضات المضرب",
  SLC_82: "محبو الرياضات المائية",
  SLC_230: "محبو كأس العالم",
  SLC_251: "قادة الشركات الناشئة",
  SLC_83: "محبو التقنية والأجهزة",
  SLC_84: "محبو السفر",
  SLC_85: "المسافرون للأعمال",
  SLC_86: "المسافرون مع العائلة",
  SLC_182: "كثيرو السفر الداخلي",
  SLC_183: "كثيرو السفر بالطيران",
  SLC_184: "كثيرو الإقامة في الفنادق",
  SLC_181: "كثيرو السفر الدولي",
  SLC_87: "كثيرو السفر",
  SLC_108: "زوار المدن الترفيهية",
  SLC_180: "المسافرون حول العالم",
  SLC_91: "المهتمون بالصحة ونمط الحياة الصحي",
  SLC_88: "أسلوب حياة النساء",
}

export const languageNameAr = (id: string): string | null => LANGUAGES_AR[id] ?? null
export const interestNameAr = (id: string): string | null => INTERESTS_AR[id] ?? null

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []
const unique = (list: readonly string[] | null | undefined) => [...new Set(list ?? [])]

// The languages and interests an ad set's targeting names, read back. Interests the ad set
// leaves out (operation EXCLUDE) and interests of other kinds than Snapchat's own are not these.
export function readSnapchatAudience(targeting: unknown): {
  languages: string[]
  interestIds: string[]
} {
  const spec = (targeting ?? {}) as Json
  const demographics = Array.isArray(spec.demographics) ? (spec.demographics as Json[]) : []
  const interests = Array.isArray(spec.interests) ? (spec.interests as Json[]) : []
  return {
    languages: unique(demographics.flatMap((entry) => strings(entry.languages))),
    interestIds: unique(
      interests
        .filter((entry) => String(entry.operation ?? "INCLUDE").toUpperCase() !== "EXCLUDE")
        .flatMap((entry) => strings(entry.category_id))
        .filter((id) => SNAPCHAT_INTEREST_ID.test(id))
    ),
  }
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

// An ad set's targeting with the languages and the interests asked for. A list left out
// (undefined or null) stays as it is; an empty one removes the limit. Everything else about the
// targeting is kept, and the very same object comes back when nothing differs.
export function withSnapchatAudience(
  targeting: unknown,
  languages: readonly string[] | null | undefined,
  interestIds: readonly string[] | null | undefined
): unknown {
  const before = readSnapchatAudience(targeting)
  let next = targeting
  if (languages != null && !sameSet(before.languages, unique(languages))) {
    const spec = { ...((next ?? {}) as Json) }
    const demographics = (
      Array.isArray(spec.demographics) ? (spec.demographics as Json[]) : []
    ).map((entry) => ({ ...entry }))
    for (const entry of demographics) delete entry.languages
    if (languages.length > 0) {
      const first = demographics[0] ?? { operation: "INCLUDE" }
      first.languages = unique(languages)
      demographics[0] = first
    }
    // A demographic left with nothing but its operation says nothing; Snapchat refuses it.
    const kept = demographics.filter((entry) =>
      Object.keys(entry).some((key) => key !== "operation")
    )
    if (kept.length > 0) spec.demographics = kept
    else delete spec.demographics
    next = spec
  }
  if (interestIds != null && !sameSet(before.interestIds, unique(interestIds))) {
    const spec = { ...((next ?? {}) as Json) }
    // Whatever else is under "interests" (left-out ones, other kinds) is kept as it is.
    const others = (Array.isArray(spec.interests) ? (spec.interests as Json[]) : [])
      .map((entry) => {
        if (String(entry.operation ?? "INCLUDE").toUpperCase() === "EXCLUDE") return entry
        const rest = strings(entry.category_id).filter((id) => !SNAPCHAT_INTEREST_ID.test(id))
        return rest.length > 0 ? { ...entry, category_id: rest } : null
      })
      .filter((entry): entry is Json => entry !== null)
    const interests = [
      ...(interestIds.length > 0
        ? [{ category_id: unique(interestIds), operation: "INCLUDE" }]
        : []),
      ...others,
    ]
    if (interests.length > 0) spec.interests = interests
    else delete spec.interests
    next = spec
  }
  return next
}
