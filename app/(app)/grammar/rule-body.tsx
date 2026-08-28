/**
 * Renders a stored rule body.
 *
 * The one place this app injects HTML rather than rendering a text child. What
 * makes that safe is not this component but `sanitizeBody`, which is applied in
 * the Server Action before anything reaches the column — so what is stored is
 * already the allowlist, and only what is stored is ever rendered here.
 *
 * Typography is shadcn/typeset (`app/typeset.css`), which styles every tag the
 * allowlist can produce and a good deal more, so there is no third list of tags
 * to keep in step. `typeset-docs` is the preset already declared in
 * `app/globals.css`: it pins the size and points the body font at `--sans`,
 * whose Japanese tail is the thing that must not be lost here of all places.
 */
export function RuleBody({ html }: Readonly<{ html: string }>) {
  if (html === "") return null;

  return (
    <div
      className="typeset typeset-docs"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
