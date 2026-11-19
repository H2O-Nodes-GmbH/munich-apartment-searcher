/**
 * Values for Kleinanzeigen's extended rental contact form
 * (Anrede / SCHUFA / employment / income / household).
 * Override via env — defaults match Max & Milena's search profile.
 */
export type ContactProfile = {
  salutation: string;
  firstName: string;
  lastName: string;
  schufa: string;
  employment: string;
  income: string;
  household: string;
  pets: string;
};

export function loadContactProfile(): ContactProfile {
  return {
    salutation: process.env.KA_CONTACT_SALUTATION?.trim() || "Herr",
    firstName: process.env.KA_CONTACT_FIRST_NAME?.trim() || "Max",
    lastName: process.env.KA_CONTACT_LAST_NAME?.trim() || "Sherwood",
    schufa:
      process.env.KA_CONTACT_SCHUFA?.trim() || "Vorhanden (< 3 Monate)",
    employment:
      process.env.KA_CONTACT_EMPLOYMENT?.trim() || "Angestellte(r)",
    income: process.env.KA_CONTACT_INCOME?.trim() || "Über 5.000€",
    household:
      process.env.KA_CONTACT_HOUSEHOLD?.trim() || "Zweipersonenhaushalt",
    pets: process.env.KA_CONTACT_PETS?.trim() || "Keine",
  };
}
