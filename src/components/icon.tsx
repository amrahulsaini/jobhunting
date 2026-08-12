import { iconSrc, type IconName } from "@/lib/assets";

/**
 * Icons are painted as a CSS mask filled with `currentColor`, which keeps the
 * twelve SVGs as external cacheable files while still letting them take the
 * colour of whatever they sit inside — something <img> cannot do.
 */
export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: `url(${iconSrc(name)})`,
        WebkitMaskImage: `url(${iconSrc(name)})`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}
