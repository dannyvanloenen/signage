CREATE TABLE "screens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"public_token" varchar(64) NOT NULL,
	"theme" varchar(20) DEFAULT 'dark' NOT NULL,
	"layout" varchar(20) DEFAULT 'auto' NOT NULL,
	"font" varchar(20) DEFAULT 'default' NOT NULL,
	"bg_image_path" varchar(500),
	"bg_video_path" varchar(500),
	"ticker_text" text,
	"category_ids" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "screens_public_token_unique" UNIQUE("public_token")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan" varchar(20) DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "screens" ADD CONSTRAINT "screens_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;