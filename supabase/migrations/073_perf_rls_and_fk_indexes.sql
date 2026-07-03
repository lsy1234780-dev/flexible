-- 073: 성능 — RLS initplan 최적화 + FK 커버링 인덱스
--
-- ① auth_rls_initplan [WARN×6]: 정책의 bare auth.uid()가 행마다 재평가됨
--    → (select auth.uid())로 감싸 쿼리당 1회 평가(initplan)로 변경. 의미는 동일.
-- ② unindexed_foreign_keys [INFO×39]: FK 커버링 인덱스 추가
--    (조인·CASCADE 삭제 성능. 신규 DB라 비용 거의 없음)

-- ─── ① RLS 정책 재생성 (표현식만 변경, 의미 동일) ───

drop policy channel_members_update on channel_members;
create policy channel_members_update on channel_members
  for update to authenticated
  using (workspace_id in (select current_workspace_ids()) and user_id = (select auth.uid()))
  with check (workspace_id in (select current_workspace_ids()) and user_id = (select auth.uid()));

drop policy channel_members_write on channel_members;
create policy channel_members_write on channel_members
  for insert to authenticated
  with check (workspace_id in (select current_workspace_ids()) and user_id = (select auth.uid()));

drop policy message_reactions_delete on message_reactions;
create policy message_reactions_delete on message_reactions
  for delete to authenticated
  using (workspace_id in (select current_workspace_ids()) and user_id = (select auth.uid()));

drop policy message_reactions_insert on message_reactions;
create policy message_reactions_insert on message_reactions
  for insert to authenticated
  with check (
    workspace_id in (select current_workspace_ids())
    and user_id = (select auth.uid())
    and exists (select 1 from messages m where m.id = message_reactions.message_id)
  );

drop policy message_attachments_delete on message_attachments;
create policy message_attachments_delete on message_attachments
  for delete to authenticated
  using (exists (
    select 1 from messages m
    where m.id = message_attachments.message_id and m.author_id = (select auth.uid())
  ));

drop policy workspace_members_self_read on workspace_members;
create policy workspace_members_self_read on workspace_members
  for select
  using (user_id = (select auth.uid()) or workspace_id in (select current_workspace_ids()));

-- ─── ② FK 커버링 인덱스 ───

create index if not exists idx_access_logs_company on access_logs (company_id);
create index if not exists idx_as_logs_request on as_logs (as_request_id);
create index if not exists idx_as_requests_company on as_requests (company_id);
create index if not exists idx_as_requests_product on as_requests (product_id);
create index if not exists idx_categories_parent on categories (parent_id);
create index if not exists idx_channel_members_user on channel_members (user_id);
create index if not exists idx_channel_members_ws on channel_members (workspace_id);
create index if not exists idx_channels_created_by on channels (created_by);
create index if not exists idx_company_products_product on company_products (product_id);
create index if not exists idx_crm_logs_company on crm_logs (company_id);
create index if not exists idx_crm_logs_created_by on crm_logs (created_by);
create index if not exists idx_crm_logs_order on crm_logs (order_id);
create index if not exists idx_deals_order on deals (order_id);
create index if not exists idx_deals_quotation on deals (quotation_id);
create index if not exists idx_deals_stage on deals (stage_id);
create index if not exists idx_inbound_shipment_events_created_by on inbound_shipment_events (created_by);
create index if not exists idx_inbound_shipment_items_product on inbound_shipment_items (product_id);
create index if not exists idx_inbound_shipments_created_by on inbound_shipments (created_by);
create index if not exists idx_inbound_shipments_receiving on inbound_shipments (receiving_order_id);
create index if not exists idx_inventory_items_receiving_item on inventory_items (receiving_item_id);
create index if not exists idx_inventory_logs_scanned_by on inventory_logs (scanned_by);
create index if not exists idx_inventory_movements_created_by on inventory_movements (created_by);
create index if not exists idx_message_attachments_ws on message_attachments (workspace_id);
create index if not exists idx_message_mentions_ws on message_mentions (workspace_id);
create index if not exists idx_message_reactions_user on message_reactions (user_id);
create index if not exists idx_message_reactions_ws on message_reactions (workspace_id);
create index if not exists idx_messages_author on messages (author_id);
create index if not exists idx_messages_reply_to on messages (reply_to);
create index if not exists idx_messages_ws on messages (workspace_id);
create index if not exists idx_order_items_product on order_items (product_id);
create index if not exists idx_products_category on products (category_id);
create index if not exists idx_purchase_order_items_product on purchase_order_items (product_id);
create index if not exists idx_purchase_order_payments_created_by on purchase_order_payments (created_by);
create index if not exists idx_purchase_orders_created_by on purchase_orders (created_by);
create index if not exists idx_quotation_items_product on quotation_items (product_id);
create index if not exists idx_receiving_items_product on receiving_items (product_id);
create index if not exists idx_receiving_orders_created_by on receiving_orders (created_by);
create index if not exists idx_shipments_order on shipments (order_id);
create index if not exists idx_warehouse_inventory_location on warehouse_inventory (location_id);
