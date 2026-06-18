# Template Inventory & Cleanup Plan

This report is an analysis-only inventory. No files were deleted.

Category definitions:
- A: Keep exactly as is
- B: Keep and rebrand
- C: Keep but refactor later
- D: Remove after replacement

## Feature Inventory (Grouped)

| Category | Feature area | Scope | Notes |
|---|---|---|---|
| A | Core route behavior | / redirect | Root redirect is stable and aligned with current entry UX. |
| B | Core product surfaces | dashboard/*, account/*, auth/*, error/*, applications/calendar | Keep these experiences and rebrand content, copy, and real data bindings. |
| C | Transitional business templates | eCommerce/*, charts/*, applications/chatbox, applications/file-manager, applications/invoice, tables/data-tables | Keep through MVP but refactor architecture/data contracts later. |
| D | Template showcase surfaces | ui-components/*, forms/*, icons/*, widgets/*, docs, faq, pricing-tables, tables/basic-tables, tables/advance-tables | Remove after MADAR-native replacements are delivered. |

## Route Inventory

| Category | Route | Purpose | Dependencies | Reusable components | Recommendation |
|---|---|---|---|---|---|
| B | /account/edit-profile | User account and profile settings | next/react defaults | ui/button, ui/card, ui/input, ui/label, ui/switch, ui/tabs, ui/textarea | Keep and rebrand. |
| B | /account/notifications | User account and profile settings | next/react defaults | ui/button, ui/card, ui/switch | Keep and rebrand. |
| B | /account/password-setting | User account and profile settings | lucide-react, react | ui/button, ui/card, ui/input, ui/label | Keep and rebrand. |
| B | /account/profile | User account and profile settings | lucide-react | ui/badge, ui/button, ui/card, ui/switch | Keep and rebrand. |
| B | /applications/calendar | Calendar workflow app | next/react defaults | calendar/shadcn-full-calendar | Keep and rebrand. |
| C | /applications/chatbox | Chat workflow template | lucide-react, react | ui/avatar, ui/button, ui/dropdown-menu, ui/input, ui/scroll-area | Keep but refactor later. |
| C | /applications/file-manager | File management workflow template | lucide-react | ui/button, ui/input, ui/progress, ui/table | Keep but refactor later. |
| C | /applications/invoice | Invoice detail workflow template | lucide-react | ui/button, ui/card, ui/separator | Keep but refactor later. |
| C | /charts/apexcharts | Charting library showcase and experiments | next/react defaults | Feature-local only | Keep but refactor later. |
| C | /charts/recharts | Charting library showcase and experiments | next/react defaults | Feature-local only | Keep but refactor later. |
| B | /dashboard/analytics | Primary dashboard experience | react | Feature-local only | Keep and rebrand. |
| B | /dashboard/crm | Primary dashboard experience | react | Feature-local only | Keep and rebrand. |
| B | /dashboard/eCommerce | Primary dashboard experience | react | Feature-local only | Keep and rebrand. |
| D | /docs | Template documentation page | lucide-react | ui/button, ui/card | Remove after replacement. |
| C | /eCommerce/add-product | Commerce template workflows | lucide-react, react | ui/button, ui/card, ui/input, ui/label, ui/select, ui/switch, ui/textarea | Keep but refactor later. |
| C | /eCommerce/categories | Commerce template workflows | lucide-react, react | ui/badge, ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input, ui/label, ui/select, ui/sheet, ui/table, ui/textarea | Keep but refactor later. |
| C | /eCommerce/customer-details | Commerce template workflows | lucide-react | ui/badge, ui/button, ui/card, ui/select, ui/separator, ui/table | Keep but refactor later. |
| C | /eCommerce/customer-list | Commerce template workflows | lucide-react, react | ui/badge, ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input, ui/label, ui/select, ui/sheet, ui/table, ui/textarea | Keep but refactor later. |
| C | /eCommerce/invoice | Commerce template workflows | lucide-react | ui/badge, ui/button, ui/card, ui/separator | Keep but refactor later. |
| C | /eCommerce/order-details | Commerce template workflows | lucide-react | ui/badge, ui/button, ui/card, ui/select, ui/separator, ui/table | Keep but refactor later. |
| C | /eCommerce/order-list | Commerce template workflows | lucide-react, react | ui/badge, ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input, ui/label, ui/select, ui/sheet, ui/table, ui/textarea | Keep but refactor later. |
| C | /eCommerce/product-grid | Commerce template workflows | lucide-react, next/link, react | ui/badge, ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input | Keep but refactor later. |
| C | /eCommerce/product-list | Commerce template workflows | lucide-react, next/link, react | ui/badge, ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input, ui/select, ui/table | Keep but refactor later. |
| D | /faq | FAQ presentation page | next/react defaults | ui/accordion | Remove after replacement. |
| D | /forms/basic-inputs | Form element showcase pages | next/react defaults | ui/card, ui/input, ui/label, ui/select, ui/slider, ui/textarea | Remove after replacement. |
| D | /forms/checkboxes-radios | Form element showcase pages | react | ui/card, ui/checkbox, ui/label, ui/radio-group, ui/switch | Remove after replacement. |
| D | /forms/date-pickers | Form element showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /forms/file-upload | Form element showcase pages | lucide-react, react | ui/button, ui/card, ui/tooltip | Remove after replacement. |
| D | /forms/form-layouts | Form element showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /forms/form-repeat | Form element showcase pages | lucide-react, react | ui/button, ui/card, ui/input, ui/label | Remove after replacement. |
| D | /forms/form-wizard | Form element showcase pages | react | Feature-local only | Remove after replacement. |
| D | /forms/input-groups | Form element showcase pages | next/react defaults | ui/button, ui/card, ui/checkbox, ui/dropdown-menu, ui/input, ui/radio-group, ui/textarea | Remove after replacement. |
| D | /forms/select | Form element showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /forms/text-editor | Form element showcase pages | react, react-simple-wysiwyg | ui/card | Remove after replacement. |
| D | /icons/bootstrap | Icon set showcase pages | next/react defaults | ui/button | Remove after replacement. |
| D | /icons/boxicons | Icon set showcase pages | next/react defaults | ui/button | Remove after replacement. |
| D | /icons/lucide | Icon set showcase pages | lucide-react | ui/button | Remove after replacement. |
| D | /pricing-tables | Pricing presentation page | lucide-react, react | ui/button, ui/card, ui/toggle-group | Remove after replacement. |
| D | /tables/advance-tables | Table patterns and demos | next/react defaults | Feature-local only | Remove after replacement. |
| D | /tables/basic-tables | Table patterns and demos | next/react defaults | ui/table | Remove after replacement. |
| C | /tables/data-tables | Table patterns and demos | @tanstack/react-table | data-table, ui/badge | Keep but refactor later. |
| D | /ui-components/accordion | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/alerts | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/badges | UI component showcase pages | @radix-ui/react-separator | Feature-local only | Remove after replacement. |
| D | /ui-components/buttons | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/cards | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/list-groups | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/media-object | UI component showcase pages | next/react defaults | ui/card | Remove after replacement. |
| D | /ui-components/navbars | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/progressbars | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/sooner | UI component showcase pages | next/react defaults | Feature-local only | Remove after replacement. |
| D | /ui-components/spinners | UI component showcase pages | next/react defaults | ui/card | Remove after replacement. |
| D | /widgets/data | Dashboard widget showcase | react | Feature-local only | Remove after replacement. |
| D | /widgets/statistics | Dashboard widget showcase | lucide-react, react | Feature-local only | Remove after replacement. |
| B | /auth/basic/forgot-password | Authentication flow screens | lucide-react | ui/button, ui/card, ui/input, ui/label | Keep and rebrand. |
| B | /auth/basic/login | Authentication flow screens | lucide-react | login-form | Keep and rebrand. |
| B | /auth/basic/password-reset-success | Authentication flow screens | lucide-react | ui/button, ui/card | Keep and rebrand. |
| B | /auth/basic/register | Authentication flow screens | lucide-react | signup-form | Keep and rebrand. |
| B | /auth/basic/reset-password | Authentication flow screens | lucide-react, react | ui/button, ui/card, ui/input, ui/label | Keep and rebrand. |
| B | /auth/basic/verify-email | Authentication flow screens | lucide-react | ui/button, ui/card | Keep and rebrand. |
| B | /auth/cover/forgot-password | Authentication flow screens | lucide-react | ui/button, ui/card, ui/input, ui/label | Keep and rebrand. |
| B | /auth/cover/login | Authentication flow screens | lucide-react | login-form | Keep and rebrand. |
| B | /auth/cover/password-reset-success | Authentication flow screens | lucide-react | ui/button, ui/card | Keep and rebrand. |
| B | /auth/cover/register | Authentication flow screens | lucide-react | signup-form | Keep and rebrand. |
| B | /auth/cover/reset-password | Authentication flow screens | lucide-react, react | ui/button, ui/card, ui/input, ui/label | Keep and rebrand. |
| B | /auth/cover/verify-email | Authentication flow screens | lucide-react | ui/button, ui/card | Keep and rebrand. |
| B | /error/coming-soon | Error and fallback screens | framer-motion, lucide-react, next-themes, react | ui/button, ui/input | Keep and rebrand. |
| B | /error/error-404 | Error and fallback screens | framer-motion, lucide-react, next-themes, next/link | ui/button | Keep and rebrand. |
| B | /error/error-500 | Error and fallback screens | framer-motion, lucide-react, next-themes, next/link | ui/button | Keep and rebrand. |
| A | / | Root redirect to primary dashboard | next/navigation | Feature-local only | Keep exactly as is. |

## Component Inventory

| Category | Component name | Used by | Generic or business specific | MADAR Design System? |
|---|---|---|---|---|
| B | app-sidebar.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |
| B | appLauncher-dropdown.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |
| C | calendar/event-dialog.tsx | Not referenced currently | Business specific | Partial |
| C | calendar/shadcn-full-calendar.tsx | 1 files (e.g. app/(layout-pages)/applications/calendar/CalendarPage.tsx) | Business specific | Yes (after abstraction) |
| C | calendar/types.ts | Not referenced currently | Business specific | Partial |
| B | data-table.tsx | 1 files (e.g. app/(layout-pages)/tables/data-tables/DataTablePage.tsx) | Mixed | Yes (after abstraction) |
| D | file-manager/data.ts | Not referenced currently | Business specific | No |
| D | file-manager/file-card.tsx | Not referenced currently | Business specific | No |
| D | file-manager/folder-card.tsx | Not referenced currently | Business specific | No |
| D | file-manager/sidebar.tsx | Not referenced currently | Business specific | No |
| D | file-manager/toolbar.tsx | Not referenced currently | Business specific | No |
| D | Footer.tsx | Not referenced currently | Mixed | No |
| B | global-search.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Mixed | Partial |
| B | language-dropdown.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |
| B | layout/admin-layout.tsx | 1 files (e.g. app/(layout-pages)/layout.tsx) | Business specific (shell) | Partial |
| B | layout/Footer.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific (shell) | Partial |
| B | login-form.tsx | 2 files (e.g. app/(no-layout-pages)/auth/basic/login/BasicLoginPage.tsx; app/(no-layout-pages)/auth/cover/login/CoverLoginPage.tsx) | Business specific | Partial |
| B | nav-main.tsx | 1 files (e.g. components/app-sidebar.tsx) | Business specific | Partial |
| D | nav-projects.tsx | Not referenced currently | Business specific | No |
| B | nav-secondary.tsx | 1 files (e.g. components/app-sidebar.tsx) | Business specific | Partial |
| B | nav-user.tsx | 1 files (e.g. components/app-sidebar.tsx) | Business specific | Partial |
| B | notification-dropdown.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |
| B | signup-form.tsx | 2 files (e.g. app/(no-layout-pages)/auth/basic/register/BasicRegisterPage.tsx; app/(no-layout-pages)/auth/cover/register/CoverRegisterPage.tsx) | Business specific | Partial |
| D | team-switcher.tsx | Not referenced currently | Mixed | No |
| B | theme-customizer.tsx | 1 files (e.g. app/(layout-pages)/layout.tsx) | Business specific | Partial |
| B | theme-toggle.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |
| A | ui/accordion.tsx | 4 files (e.g. app/(layout-pages)/faq/FAQPage.tsx; app/(layout-pages)/ui-components/accordion/AccordionCard.tsx; app/(layout-pages)/ui-components/accordion/BasicAccordion.tsx) | Generic | Yes |
| A | ui/alert.tsx | 4 files (e.g. app/(layout-pages)/ui-components/alerts/BasicAlerts.tsx; app/(layout-pages)/ui-components/alerts/IconCircleAlerts.tsx; app/(layout-pages)/ui-components/alerts/LightBgColorAlerts.tsx) | Generic | Yes |
| A | ui/avatar.tsx | 8 files (e.g. app/(layout-pages)/applications/chatbox/Chatbox.tsx; app/(layout-pages)/forms/checkboxes-radios/TeamMemberList.tsx; app/(layout-pages)/forms/select/SelectTwoAvatars.tsx) | Generic | Yes |
| A | ui/badge.tsx | 29 files (e.g. app/(layout-pages)/account/profile/UserProfile.tsx; app/(layout-pages)/dashboard/analytics/LandingPage.tsx; app/(layout-pages)/dashboard/analytics/SocialStatsCard.tsx) | Generic | Yes |
| A | ui/breadcrumb.tsx | Not referenced currently | Generic | Yes |
| A | ui/button.tsx | 109 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/account/notifications/NotificationSettings.tsx; app/(layout-pages)/account/password-setting/PasswordSettings.tsx) | Generic | Yes |
| A | ui/calendar.tsx | 3 files (e.g. app/(layout-pages)/forms/date-pickers/DatePickerInput.tsx; app/(layout-pages)/forms/date-pickers/DatePickerWithRange.tsx; app/(layout-pages)/forms/date-pickers/SimpleDatePicker.tsx) | Generic | Yes |
| A | ui/card.tsx | 129 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/account/notifications/NotificationSettings.tsx; app/(layout-pages)/account/password-setting/PasswordSettings.tsx) | Generic | Yes |
| C | ui/chart.tsx | 22 files (e.g. app/(layout-pages)/charts/recharts/AreaChartPage.tsx; app/(layout-pages)/charts/recharts/BarChartPage.tsx; app/(layout-pages)/charts/recharts/ChartPieDonutActive.tsx) | Generic | Yes |
| A | ui/checkbox.tsx | 20 files (e.g. app/(layout-pages)/dashboard/eCommerce/RecentOrdersTable.tsx; app/(layout-pages)/eCommerce/categories/CategoryList.tsx; app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx) | Generic | Yes |
| A | ui/collapsible.tsx | 1 files (e.g. components/nav-main.tsx) | Generic | Yes |
| C | ui/colored-progress.tsx | 1 files (e.g. app/(layout-pages)/widgets/statistics/ProjectProgressCard.tsx) | Generic | Yes |
| A | ui/command.tsx | 1 files (e.g. components/global-search.tsx) | Generic | Yes |
| A | ui/dialog.tsx | 3 files (e.g. components/calendar/event-dialog.tsx; components/global-search.tsx; components/ui/command.tsx) | Generic | Yes |
| A | ui/dropdown-menu.tsx | 37 files (e.g. app/(layout-pages)/applications/chatbox/Chatbox.tsx; app/(layout-pages)/dashboard/analytics/CompletionRate.tsx; app/(layout-pages)/dashboard/analytics/SocialStatsCard.tsx) | Generic | Yes |
| A | ui/field.tsx | 4 files (e.g. app/(layout-pages)/forms/date-pickers/DatePickerInput.tsx; app/(layout-pages)/forms/date-pickers/DatePickerWithRange.tsx; app/(layout-pages)/forms/date-pickers/SimpleDatePicker.tsx) | Generic | Yes |
| A | ui/input-group.tsx | 1 files (e.g. app/(layout-pages)/forms/date-pickers/DatePickerInput.tsx) | Generic | Yes |
| A | ui/input.tsx | 47 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/account/password-setting/PasswordSettings.tsx; app/(layout-pages)/applications/chatbox/Chatbox.tsx) | Generic | Yes |
| A | ui/label.tsx | 29 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/account/password-setting/PasswordSettings.tsx; app/(layout-pages)/eCommerce/add-product/AddProduct.tsx) | Generic | Yes |
| A | ui/pagination.tsx | 4 files (e.g. app/(layout-pages)/tables/advance-tables/ProductTable.tsx; app/(layout-pages)/tables/advance-tables/ProjectTable.tsx; app/(layout-pages)/tables/advance-tables/TeamTable.tsx) | Generic | Yes |
| A | ui/popover.tsx | 3 files (e.g. app/(layout-pages)/forms/date-pickers/DatePickerInput.tsx; app/(layout-pages)/forms/date-pickers/DatePickerWithRange.tsx; app/(layout-pages)/forms/date-pickers/SimpleDatePicker.tsx) | Generic | Yes |
| A | ui/progress.tsx | 12 files (e.g. app/(layout-pages)/applications/file-manager/FileManagerPage.tsx; app/(layout-pages)/dashboard/analytics/WebsiteAnalytics.tsx; app/(layout-pages)/tables/advance-tables/ProjectTable.tsx) | Generic | Yes |
| A | ui/radio-group.tsx | 5 files (e.g. app/(layout-pages)/forms/checkboxes-radios/ChecksAndRadiosPage.tsx; app/(layout-pages)/forms/checkboxes-radios/DeliveryCards.tsx; app/(layout-pages)/forms/checkboxes-radios/DesignerType.tsx) | Generic | Yes |
| A | ui/scroll-area.tsx | 3 files (e.g. app/(layout-pages)/applications/chatbox/Chatbox.tsx; components/appLauncher-dropdown.tsx; components/notification-dropdown.tsx) | Generic | Yes |
| A | ui/select.tsx | 21 files (e.g. app/(layout-pages)/eCommerce/add-product/AddProduct.tsx; app/(layout-pages)/eCommerce/categories/CategoryList.tsx; app/(layout-pages)/eCommerce/customer-details/CustomerDetails.tsx) | Generic | Yes |
| A | ui/separator.tsx | 6 files (e.g. app/(layout-pages)/applications/invoice/InvoiceCard.tsx; app/(layout-pages)/eCommerce/customer-details/CustomerDetails.tsx; app/(layout-pages)/eCommerce/invoice/InvoicePage.tsx) | Generic | Yes |
| A | ui/sheet.tsx | 5 files (e.g. app/(layout-pages)/eCommerce/categories/CategoryList.tsx; app/(layout-pages)/eCommerce/customer-list/CustomerList.tsx; app/(layout-pages)/eCommerce/order-list/OrderList.tsx) | Generic | Yes |
| A | ui/sidebar.tsx | 7 files (e.g. components/app-sidebar.tsx; components/layout/admin-layout.tsx; components/nav-main.tsx) | Generic | Yes |
| A | ui/skeleton.tsx | 1 files (e.g. components/ui/sidebar.tsx) | Generic | Yes |
| A | ui/slider.tsx | 1 files (e.g. app/(layout-pages)/forms/basic-inputs/BasicInputs.tsx) | Generic | Yes |
| C | ui/sonner.tsx | Not referenced currently | Generic | Yes |
| A | ui/switch.tsx | 5 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/account/notifications/NotificationSettings.tsx; app/(layout-pages)/account/profile/UserProfile.tsx) | Generic | Yes |
| A | ui/table.tsx | 14 files (e.g. app/(layout-pages)/applications/file-manager/FileManagerPage.tsx; app/(layout-pages)/dashboard/analytics/TrafficTable.tsx; app/(layout-pages)/dashboard/eCommerce/RecentOrdersTable.tsx) | Generic | Yes |
| A | ui/tabs.tsx | 4 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/forms/date-pickers/ComponentPreview.tsx; app/(layout-pages)/forms/select/ComponentPreview.tsx) | Generic | Yes |
| A | ui/textarea.tsx | 12 files (e.g. app/(layout-pages)/account/edit-profile/EditProfile.tsx; app/(layout-pages)/eCommerce/add-product/AddProduct.tsx; app/(layout-pages)/eCommerce/categories/CategoryList.tsx) | Generic | Yes |
| A | ui/toggle-group.tsx | 1 files (e.g. app/(layout-pages)/pricing-tables/PricingPage.tsx) | Generic | Yes |
| A | ui/toggle.tsx | 1 files (e.g. components/ui/toggle-group.tsx) | Generic | Yes |
| A | ui/tooltip.tsx | 5 files (e.g. app/(layout-pages)/forms/file-upload/FileUpload01.tsx; app/(layout-pages)/layout.tsx; components/theme-customizer.tsx) | Generic | Yes |
| B | UserDropdown.tsx | 1 files (e.g. components/layout/admin-layout.tsx) | Business specific | Partial |

## Cleanup Plan

### Phase 1 — Files That Can Be Removed Immediately (safe, unreferenced)

These are currently not referenced by imports in the codebase and can be removed with low risk.

- src/components/Footer.tsx
- src/components/nav-projects.tsx
- src/components/team-switcher.tsx
- src/components/file-manager/data.ts
- src/components/file-manager/file-card.tsx
- src/components/file-manager/folder-card.tsx
- src/components/file-manager/sidebar.tsx
- src/components/file-manager/toolbar.tsx
- src/components/calendar/event-dialog.tsx
- src/components/calendar/types.ts

### Phase 2 — Remove After Replacements Exist

These are active template/demo surfaces that should remain until equivalent MADAR modules are shipped.

Route groups:
- src/app/(layout-pages)/ui-components/**
- src/app/(layout-pages)/forms/**
- src/app/(layout-pages)/icons/**
- src/app/(layout-pages)/widgets/**
- src/app/(layout-pages)/pricing-tables/**
- src/app/(layout-pages)/docs/**
- src/app/(layout-pages)/faq/**
- src/app/(layout-pages)/tables/basic-tables/**
- src/app/(layout-pages)/tables/advance-tables/**

Supporting navigation and copy updates should be applied first so removed routes are no longer discoverable.

### Phase 3 — Legacy Code To Keep Until MVP

These should remain to preserve functional breadth while MVP stabilizes, then be refactored incrementally.

Route groups:
- src/app/(layout-pages)/eCommerce/**
- src/app/(layout-pages)/charts/**
- src/app/(layout-pages)/applications/chatbox/**
- src/app/(layout-pages)/applications/file-manager/**
- src/app/(layout-pages)/applications/invoice/**
- src/app/(layout-pages)/tables/data-tables/**

Shared components to retain through MVP:
- src/components/data-table.tsx
- src/components/calendar/shadcn-full-calendar.tsx
- src/components/theme-customizer.tsx
- src/components/appLauncher-dropdown.tsx

## Execution Notes

- Do not delete category D routes until replacements are deployed and linked in navigation.
- Prefer deprecating via navigation removal first, then route/file removal in a controlled PR.
- Reclassify components periodically as product modules replace template pages.
