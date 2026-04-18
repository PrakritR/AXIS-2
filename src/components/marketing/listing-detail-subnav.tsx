"use client";

const nav = [
  { id: "floor-plans", label: "Floor plans" },
  { id: "listing-bathrooms", label: "Bathrooms" },
  { id: "listing-shared", label: "Shared spaces" },
  { id: "lease-basics", label: "Lease basics" },
  { id: "amenities", label: "Amenities" },
  { id: "bundles", label: "Bundles & leasing" },
  { id: "location", label: "Location" },
];

/** Sticks below the public marketing navbar while scrolling listing content. */
export function ListingStickySubnav() {
  return (
    <nav
      className="sticky z-[35] -mx-4 border-b border-slate-200/90 bg-[#f4f7fb]/92 px-2 py-2 shadow-sm backdrop-blur-md sm:-mx-0 sm:rounded-2xl sm:px-3 sm:py-2.5"
      style={{ top: "max(4.5rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))" }}
    >
      <ul className="-mx-1 flex flex-nowrap items-center justify-start gap-1 overflow-x-auto overscroll-x-contain px-1 py-0.5 text-[13px] font-semibold text-slate-600 [-webkit-overflow-scrolling:touch] sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0">
        {nav.map((item) => (
          <li key={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              className="inline-flex min-h-[44px] items-center rounded-full px-3.5 py-2 text-slate-600 transition hover:bg-white hover:text-primary sm:min-h-0 sm:py-1.5"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
