// Who runs this deployment, for the terms page (#474).
//
// FLATPARE_OPERATOR_NAME, FLATPARE_OPERATOR_CITY and FLATPARE_CONTACT_EMAIL
// name the person responsible for the hosted service. They are configuration,
// not code, so nothing personal sits in the repository and a self-hosted copy
// never names the flatpare.com operator. All three are needed: with any of
// them unset there is no terms page and no link to one.
//
// Zero imports, so the landing page, the app's layout and the page itself can
// read it. Server-side only; the browser gets the values as props.
export type Operator = { name: string; city: string; email: string };

export function readOperator(env: Record<string, string | undefined> = process.env): Operator | null {
  const name = env.FLATPARE_OPERATOR_NAME?.trim();
  const city = env.FLATPARE_OPERATOR_CITY?.trim();
  const email = env.FLATPARE_CONTACT_EMAIL?.trim();
  if (!name || !city || !email) return null;
  return { name, city, email };
}

// The terms text names the operator through {operatorName}, {operatorCity}
// and {contactEmail}. Markdown and HTML characters in a configured value are
// taken literally.
function literal(value: string): string {
  return value.replace(/[\\`*_[\]()<>&#!|]/g, (c) => `\\${c}`);
}

export function fillOperator(markdown: string, operator: Operator): string {
  return markdown
    .replaceAll("{operatorName}", literal(operator.name))
    .replaceAll("{operatorCity}", literal(operator.city))
    .replaceAll("(mailto:{contactEmail})", `(mailto:${encodeURI(operator.email)})`)
    .replaceAll("{contactEmail}", literal(operator.email));
}

