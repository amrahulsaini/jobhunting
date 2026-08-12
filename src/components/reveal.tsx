"use client";

import { useEffect, useRef, type ElementType, type ReactNode } from "react";

/**
 * Reveals children once they scroll into view.
 *
 * The visible flag is written straight to the DOM node rather than held in React
 * state: this is a one-way visual transition that never feeds back into render,
 * so keeping it out of state avoids a re-render per element and sidesteps any
 * server/client mismatch over whether IntersectionObserver exists.
 *
 * Falls open, not closed — if the API is unavailable the content is shown
 * immediately, so a missing observer can never leave the page blank.
 */
export function Reveal({
  children,
  as: Tag = "div",
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  as?: ElementType;
  /** Stagger in milliseconds. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const show = () => node.setAttribute("data-visible", "true");

    if (typeof IntersectionObserver === "undefined") {
      show();
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show();
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      data-visible="false"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}
