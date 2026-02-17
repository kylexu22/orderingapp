import { OrderStatus, PickupType } from "@prisma/client";

export type StoreHours = Record<
  string,
  Array<{
    open: string;
    close: string;
  }>
>;

export type ModifierSelectionInput = {
  groupId: string;
  optionId: string;
};

export type ComboSelectionInput = {
  comboGroupId: string;
  comboOptionId: string;
  selectedItemId?: string;
  modifiers?: ModifierSelectionInput[];
};

export type CartLineInput =
  | {
      lineType: "ITEM";
      refId: string;
      qty: number;
      lineNote?: string;
      modifiers: ModifierSelectionInput[];
    }
  | {
      lineType: "COMBO";
      refId: string;
      qty: number;
      lineNote?: string;
      comboSelections: ComboSelectionInput[];
    };

export type CreateOrderInput = {
  customerName: string;
  phone: string;
  notes?: string;
  pickupType: PickupType;
  pickupTime?: string;
  honeypot?: string;
  lines: CartLineInput[];
};

export type OrderStreamEvent = {
  type: "ORDER_CREATED" | "ORDER_UPDATED";
  payload: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    createdAt: string;
  };
};
