export function AboutSection() {
  return (
    <section id="about" className="bg-slate-50 py-20 sm:py-28">
      <div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">About MADAR</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Built to make marketing data easier to understand.
        </h2>
        <p className="mt-6 text-lg leading-8 text-slate-600">
          MADAR is building a marketing intelligence platform focused on helping e-commerce
          businesses make sense of their advertising and commerce data. Rather than requiring teams
          to piece together performance from separate ad accounts and store dashboards, MADAR brings
          that data into one place and organizes it into metrics that are actually useful for
          day-to-day decisions.
        </p>
        <p className="mt-4 text-lg leading-8 text-slate-600">
          The platform is under active development, with new integrations and analytics capabilities
          added as they are built and tested.
        </p>
      </div>
    </section>
  )
}
