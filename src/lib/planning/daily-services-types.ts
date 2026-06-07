export type DailyServiceRow = {
  /**
   * Identifiant NATIF unique de la mission (colonne « Id » du Sheet, ex.
   * `260601-TIM-ARRIVEE-64`). Quand il est présent, il fait foi comme
   * `service_id` Supabase : stable même si le nom/heure/vol changent.
   * Vide si la colonne est absente ou la cellule non remplie (repli sur la
   * clé composite date|vol|rdv|client).
   */
  sheetId: string;
  /** YYYY-MM-DD (fuseau local / feuille) */
  dateIso: string;
  client: string;
  tel: string;
  /** Colonne optionnelle « INFOS DRIVER » (affichée après le Tél. avec « / ») */
  driverInfo: string;
  type: string;
  rdv1: string;
  rdv2: string;
  vol: string;
  destProv: string;
  /** Colonne optionnelle du Sheet (ASSIGNÉ, CHAUFFEUR, etc.) — texte brut. */
  sheetAssignee: string;
};
