CREATE TABLE "deployment_smoke_checks" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'phase-1',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "deployment_smoke_checks_pkey" PRIMARY KEY ("id")
);
