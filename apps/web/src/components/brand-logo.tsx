import Image from "next/image";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  symbolOnly?: boolean;
  variant?: "color" | "white";
};

export function BrandLogo({
  alt = "Prumo",
  className = "",
  symbolOnly = false,
  variant = "color",
}: BrandLogoProps) {
  const src = symbolOnly
    ? "/brand/favicon-prumo.svg"
    : variant === "white"
      ? "/brand/logo-prumo-white.svg"
      : "/brand/logo-prumo.svg";

  return (
    <span
      className={`brand-logo ${symbolOnly ? "brand-logo--symbol" : ""} ${className}`.trim()}
    >
      <Image
        className="brand-logo__image"
        src={src}
        alt={alt}
        width={symbolOnly ? 500 : 1200}
        height={symbolOnly ? 500 : 600}
      />
    </span>
  );
}
