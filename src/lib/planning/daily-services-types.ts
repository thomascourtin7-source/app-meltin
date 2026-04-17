export type DailyServiceRow = {
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
};
