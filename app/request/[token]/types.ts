export type PublicRequestForm = {
  email: string;
  name: string;
  division: string;
  phone: string;
  requestType: string;
  title: string;
  description: string;
  priority: string;
  neededDate: string;
};

export const EMPTY_PUBLIC_REQUEST_FORM: PublicRequestForm = {
  email: "",
  name: "",
  division: "",
  phone: "",
  requestType: "",
  title: "",
  description: "",
  priority: "",
  neededDate: "",
};
