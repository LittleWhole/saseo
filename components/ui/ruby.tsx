export function Ruby({ text, ruby }: Readonly<{ text: string; ruby: string }>) {
    return (
        <ruby>
        {text}
        <rt>{ruby}</rt>
        </ruby>
    );
    }