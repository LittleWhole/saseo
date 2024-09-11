import { Noto_Sans_KR } from "next/font/google";

const noto = Noto_Sans_KR({
  weight: "variable",
  subsets: ["latin"],
});

export function Ruby({ text, ruby }: Readonly<{ text: string; ruby: string }>) {
  return (
    <ruby>
      <p className={noto.className}>{text}</p><rt>{ruby}</rt>
    </ruby>
  );
}
