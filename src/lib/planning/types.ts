export type Person = {
  personId: string;
  name: string;
  color: string | null;
  email: string | null;
  active: boolean;
};

export type Shift = {
  shiftId: string;
  personId: string;
  date: string;
  start: string;
  end: string;
  label: string | null;
  notes: string | null;
  updatedAt: string | null;
};
