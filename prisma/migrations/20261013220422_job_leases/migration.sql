-- Leases for background jobs (one API instance runs each job at a time).
-- CreateTable
CREATE TABLE "job_leases" (
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "acquired_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "job_leases_pkey" PRIMARY KEY ("name")
);

