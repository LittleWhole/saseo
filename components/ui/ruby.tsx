export function Ruby({ text, ruby }: Readonly<{ text: string; ruby: string }>) {
  return (
    <ruby className="ruby-headword mx-[0.03em]">
      <span>{text}</span>
      <rt>{ruby}</rt>
    </ruby>
  );
}
