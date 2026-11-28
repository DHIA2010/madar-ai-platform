// The company profiles (PDF brochures) staff can send to a lead from the CRM. Each one lives in
// public/profiles/ and is opened from the website, so the link works for anyone. Add a new
// profile here (and its PDF in public/profiles/) to offer it in "إرسال الملف التعريفي".

export interface CompanyProfile {
  key: string
  // The category shown to staff.
  title: string
  description: string
  // The file in public/profiles/.
  file: string
  pages: number
}

export const COMPANY_PROFILES: CompanyProfile[] = [
  {
    key: "retail-restaurants",
    title: "المحلات والمطاعم",
    description:
      "للسوبرماركت والملابس والعطور والمطاعم والمقاهي: الكاشير، تذكرة المطبخ، المخزون، الولاء، والتقارير. بدون أسعار.",
    file: "madar-retail-restaurants.pdf",
    pages: 12,
  },
]

const SITE = "https://www.madar.my"
const PATH_SEPARATOR = String.fromCharCode(47)

export const companyProfileUrl = (profile: CompanyProfile) =>
  [SITE, "profiles", profile.file].join(PATH_SEPARATOR)
