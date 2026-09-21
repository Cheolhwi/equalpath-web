import { ArrowUpRight, Clock3, Info } from "lucide-react";

// These are deliberately external leads, not part of the EqualPath catalogue.
// Keep the copy about what a site does, never about a child's same-day vacancy.
export const SHORT_CARE_RESOURCES = [
  {
    name: "Kiddocare",
    description: "Book a trained babysitter for a few hours at your place.",
    href: "https://kiddocare.my/",
  },
  {
    name: "Babysits Malaysia",
    description: "Search local babysitters and choose who to contact.",
    href: "https://www.babysits.my/",
  },
  {
    name: "Kiddy123",
    description: "Browse more childcare centres and ask about short visits.",
    href: "https://www.kiddy123.com/",
  },
];

export function hasExplicitShortCareMatch(items = []) {
  return items.some((item) => {
    const conditions = item.fit?.conditions ?? [];
    return item.fit?.counts?.conflict === 0 &&
      !conditions.filter((condition) => condition.id !== "transfer").some((condition) => condition.state === "unknown");
  });
}

export default function ShortCareAlternatives() {
  return (
    <section className="short-care-alternatives" aria-labelledby="short-care-alternatives-title">
      <div className="short-care-alternatives-heading">
        <span className="short-care-alternatives-icon" aria-hidden="true"><Clock3 size={20} /></span>
        <div>
          <p className="short-care-alternatives-kicker">Another way to find care</p>
          <h2 id="short-care-alternatives-title">No centre is a confirmed match</h2>
          <p>Try one of these short-care websites. Check the date, your child’s age and the place with them.</p>
        </div>
      </div>
      <div className="short-care-alternatives-list">
        {SHORT_CARE_RESOURCES.map((resource) => (
          <article className="short-care-alternative" key={resource.name}>
            <div>
              <h3>{resource.name}</h3>
              <p>{resource.description}</p>
            </div>
            <a href={resource.href} target="_blank" rel="noreferrer">
              Open website <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          </article>
        ))}
      </div>
      <p className="short-care-alternatives-note"><Info size={15} aria-hidden="true" />These websites are outside EqualPath. They do not show a confirmed place in this search.</p>
    </section>
  );
}
