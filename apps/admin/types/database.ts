// Supabase 테이블 타입

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  barcode: string;
  base_price: number;
  cost_price: number;
  base_stock: number;
  is_visible_default: boolean;
  width_cm: number | null;
  height_cm: number | null;
  depth_cm: number | null;
  weight_kg: number | null;
  image_url: string | null;
  description: string | null;
  category_id: string | null;
  created_at: string;
  categories?: Pick<Category, 'id' | 'name'> | null;
}

export interface InventoryLog {
  id: string;
  product_id: string;
  quantity: number;
  type: 'in' | 'out';
  memo: string | null;
  scanned_by: string | null;
  created_at: string;
  products?: Pick<Product, 'name' | 'barcode'>;
}

export interface ProductWithLog extends Product {
  inventory_logs?: InventoryLog[];
}

export interface Company {
  id: string;
  name: string;
  is_supplier: boolean;
  is_customer: boolean;
  country: string | null;
  status: 'pending' | 'active' | 'suspended';
  auth_user_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  contact_position: string | null;
  created_at: string;
}

export interface CompanyProduct {
  id: string;
  company_id: string;
  product_id: string;
  custom_price: number | null;
  visible_stock: number | null;
  is_visible: boolean;
  products?: Pick<Product, 'name' | 'barcode' | 'base_price' | 'base_stock'>;
}

export interface Quotation {
  id: string;
  company_id: string;
  number: string;
  status: 'draft' | 'sent' | 'confirmed';
  issued_at: string;
  issued_by: string | null;
  companies?: Pick<Company, 'id' | 'name'>;
}

export interface QuotationItem {
  id: string;
  quotation_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: Pick<Product, 'name' | 'barcode'>;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'packed' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  company_id: string;
  order_number: string | null;
  status: OrderStatus;
  confirmed_at: string | null;
  created_at: string;
  companies?: Pick<Company, 'id' | 'name' | 'contact_name' | 'contact_phone' | 'contact_email' | 'contact_position'> | null;
  order_items?: OrderItem[];
  quotations?: Pick<Quotation, 'id' | 'number' | 'status'>[];
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  products?: Pick<Product, 'name' | 'barcode'> | null;
}

export interface Shipment {
  id: string;
  order_id: string;
  status: 'pending' | 'in_progress' | 'packed' | 'completed';
  shipped_at: string | null;
  packed_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type InventoryStatus = 'receiving' | 'in_stock' | 'reserved' | 'shipped' | 'sold' | 'disposed';
/** @deprecated use InventoryStatus */
export type SerialStatus = InventoryStatus;

export interface InventoryItem {
  id: string;
  product_id: string;
  serial_number: number | null;
  unit_barcode: string | null;
  manufacturer_serial: string | null;
  receiving_item_id: string | null;
  receiving_staging_id: string | null;
  lot_id: string | null;
  location: string | null;
  warehouse_id: string | null;
  location_id: string | null;
  status: InventoryStatus;
  created_at: string;
  warehouses?: Pick<Warehouse, 'id' | 'name' | 'code'> | null;
  warehouse_locations?: Pick<WarehouseLocation, 'id' | 'name' | 'code' | 'full_path' | 'type'> | null;
}
/** @deprecated use InventoryItem */
export type ProductSerial = InventoryItem;

export interface InventoryMovement {
  id: string;
  inventory_item_id: string | null;
  product_id: string;
  from_status: string | null;
  to_status: string | null;
  from_location: string | null;
  to_location: string | null;
  quantity: number;
  reason: string | null;
  memo: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Warehouse {
  id: string;
  name: string;
  code: string;
  address: string | null;
  total_area: number | null;
  usable_area: number | null;
  warehouse_type: string;
  manager_name: string | null;
  manager_contact: string | null;
  is_active: boolean;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export type LocationType = 'zone' | 'aisle' | 'rack' | 'level' | 'bin';

export interface WarehouseLocation {
  id: string;
  warehouse_id: string;
  parent_id: string | null;
  type: LocationType;
  name: string;
  code: string;
  full_path: string | null;
  depth: number;
  sort_order: number;
  description: string | null;
  is_active: boolean;
  created_at: string;
  children?: WarehouseLocation[];
}

export interface WarehouseInventory {
  id: string;
  warehouse_id: string;
  location_id: string | null;
  product_id: string;
  quantity: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
  products?: Pick<Product, 'id' | 'name' | 'barcode'> | null;
  warehouses?: Pick<Warehouse, 'id' | 'name' | 'code'> | null;
  warehouse_locations?: Pick<WarehouseLocation, 'id' | 'name' | 'code' | 'full_path'> | null;
}

export interface CrmLog {
  id: string;
  company_id: string;
  order_id: string | null;
  action: string;
  memo: string | null;
  created_by: string | null;
  created_at: string;
  orders?: Pick<Order, 'id' | 'status'> | null;
}
