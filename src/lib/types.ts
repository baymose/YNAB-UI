export type Account = {
  id: string;
  name: string;
  type: string;
  on_budget: boolean;
  balance: number;
  cleared_balance: number;
  uncleared_balance: number;
};

export type Category = {
  id: string;
  name: string;
  budgeted: number;
  activity: number;
  balance: number;
};

export type CategoryGroup = {
  id: string;
  name: string;
  categories: Category[];
};

export type CategoriesResponse = {
  ready_to_assign: number;
  age_of_money: number | null;
  groups: CategoryGroup[];
};

export type Transaction = {
  id: string;
  date: string;
  amount: number;
  payee_name: string | null;
  category_id: string | null;
  category_name: string | null;
  account_id: string;
  account_name: string;
  memo: string | null;
  approved: boolean;
  cleared: string;
};
