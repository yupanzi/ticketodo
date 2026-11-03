-- 审计只追加：拒绝 UPDATE / DELETE / TRUNCATE。防的是代码 bug，不防 DBA（表 owner 可以关触发器）。
-- 回填类迁移确需改审计时，在同一个迁移里 DISABLE TRIGGER、改完再 ENABLE。
CREATE FUNCTION "ticketodo_audit_log_append_only"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'ticketodo_audit_log 只追加，不允许 %', TG_OP;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "ticketodo_audit_log_no_update_delete"
	BEFORE UPDATE OR DELETE ON "ticketodo_audit_log"
	FOR EACH ROW EXECUTE FUNCTION "ticketodo_audit_log_append_only"();
--> statement-breakpoint
-- 行级触发器拦不住 TRUNCATE
CREATE TRIGGER "ticketodo_audit_log_no_truncate"
	BEFORE TRUNCATE ON "ticketodo_audit_log"
	FOR EACH STATEMENT EXECUTE FUNCTION "ticketodo_audit_log_append_only"();
