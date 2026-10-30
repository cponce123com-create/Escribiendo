import type { SVGProps } from "react";

const paths = {
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  list: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  timeline: "M5 4v16M5 7h6M5 16h6M11 4h9v6h-9zM11 13h9v6h-9z",
  people:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M13 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  alignLeft: "M4 5h16M4 10h10M4 15h16M4 20h10",
  alignCenter: "M4 5h16M7 10h10M4 15h16M7 20h10",
  search: "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  history: "M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2",
  book: "M12 5C9 2 5 2 2 3v17c4-1 7-1 10 1 3-2 6-2 10-1V3c-3-1-7-1-10 2Zm0 0v16",
  pen: "M14 4H4v16h16V10M10 14l1-4 8-8 3 3-8 8-4 1",
  note: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  chart: "M5 20V11M12 20V4M19 20V8",
  settings:
    "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1 1-3Zm7 9a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  compare: "M4 7h15l-3-3M20 17H5l3 3M19 7l-3 3M5 17l3-3",
  bulb: "M9 18h6M10 21h4M8 15a7 7 0 1 1 8 0l-1 3H9l-1-3M12 1v1M2 5l2 1M20 6l2-1",
  expand: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5",
  image: "M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M16 7h.01",
  chevrons: "M13 7l-5 5 5 5M18 7l-5 5 5 5",
  plus: "M12 5v14M5 12h14",
  check: "M5 12l4 4L19 6",
  trash: "M3 6h18M8 6V4h8v2m1 0-.8 14H7.8L7 6m3 4v6m4-6v6",
} as const;

export function StudioIcon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: keyof typeof paths }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d={paths[name]} />
    </svg>
  );
}
