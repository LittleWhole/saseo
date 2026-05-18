import type { CSSProperties } from "react";

export function Ruby({
  text,
  ruby,
  rtClassName,
  rtStyle,
}: Readonly<{ text: string; ruby: string; rtClassName?: string; rtStyle?: CSSProperties }>) {
  return (
    <ruby className="ruby-headword mx-[0.03em]">
      <span>{text}</span>
      <rt className={rtClassName} style={rtStyle}>{ruby}</rt>
    </ruby>
  );
}
