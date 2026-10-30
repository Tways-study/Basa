import {
  BBoxSchema,
  JobStatusSchema,
  ReadingFieldsSchema,
  RegionKindSchema,
  type JobStatus,
  type Reading,
  type Region,
  type ScanResult,
} from "@/lib/schemas";
import type { SegmentedRegion } from "@/lib/models/types";
import { reconcileReadings } from "@/lib/pipeline/reconcile";
import { getServiceClient } from "./supabase";

export interface ScanRecord {
  id: string;
  status: JobStatus;
  imagePath: string | null;
  error: string | null;
  updatedAt: Date;
}

/** Everything the pipeline and routes need from the database. Tests use an in-memory fake. */
export interface ScanStore {
  getScan(id: string): Promise<ScanRecord | null>;
  /** Insert the scan if the id is new; an existing id is left untouched (idempotent). */
  createScan(id: string, imagePath: string): Promise<void>;
  setStatus(id: string, status: JobStatus, error?: string | null): Promise<void>;
  getRegions(scanId: string): Promise<Region[]>;
  insertRegions(scanId: string, regions: SegmentedRegion[]): Promise<Region[]>;
  getReadings(scanId: string): Promise<Reading[]>;
  /** Unique on (region_id, model), so a retried stage overwrites instead of duplicating. */
  upsertReading(reading: Reading): Promise<void>;
}

function fail(action: string, error: { message: string }): never {
  // Supabase messages describe the query, not credentials.
  throw new Error(`Database ${action} failed: ${error.message}`);
}

export function createSupabaseStore(): ScanStore {
  const db = getServiceClient();

  const toRegion = (row: Record<string, unknown>): Region => ({
    id: String(row.id),
    scanId: String(row.scan_id),
    kind: RegionKindSchema.parse(row.kind),
    bbox: BBoxSchema.parse(row.bbox),
    maskPath: (row.mask_path as string | null) ?? null,
  });

  return {
    async getScan(id) {
      const { data, error } = await db.from("scans").select("*").eq("id", id).maybeSingle();
      if (error) fail("read", error);
      if (!data) return null;
      return {
        id: data.id,
        status: JobStatusSchema.parse(data.status),
        imagePath: data.image_path,
        error: data.error,
        updatedAt: new Date(data.updated_at),
      };
    },

    async createScan(id, imagePath) {
      const { error } = await db
        .from("scans")
        .upsert({ id, image_path: imagePath }, { onConflict: "id", ignoreDuplicates: true });
      if (error) fail("insert", error);
    },

    async setStatus(id, status, message = null) {
      const { error } = await db
        .from("scans")
        .update({ status, error: message, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) fail("update", error);
    },

    async getRegions(scanId) {
      const { data, error } = await db
        .from("regions")
        .select("*")
        .eq("scan_id", scanId);
      if (error) fail("read", error);
      // Regions are inserted in one batch (same timestamp), so order them the way a person reads the page.
      return (data ?? []).map(toRegion).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
    },

    async insertRegions(scanId, regions) {
      const { data, error } = await db
        .from("regions")
        .insert(regions.map((r) => ({ scan_id: scanId, kind: r.kind, bbox: r.bbox, mask_path: r.maskPath })))
        .select("*");
      if (error) fail("insert", error);
      return (data ?? []).map(toRegion);
    },

    async getReadings(scanId) {
      const { data, error } = await db
        .from("readings")
        .select("region_id, model, structured_json, latency_ms, error, regions!inner(scan_id)")
        .eq("regions.scan_id", scanId);
      if (error) fail("read", error);
      return (data ?? []).map((row) => ({
        regionId: row.region_id,
        model: row.model,
        fields: ReadingFieldsSchema.parse(row.structured_json ?? {}),
        latencyMs: row.latency_ms ?? 0,
        error: row.error,
      })) as Reading[];
    },

    async upsertReading(reading) {
      const { error } = await db.from("readings").upsert(
        {
          region_id: reading.regionId,
          model: reading.model,
          structured_json: reading.fields,
          latency_ms: reading.latencyMs,
          error: reading.error,
        },
        { onConflict: "region_id,model" },
      );
      if (error) fail("upsert", error);
    },
  };
}

/** Assemble the GET /api/scans/[id] payload. Pure, so it is tested without a database. */
export function buildScanResult(
  scan: ScanRecord,
  regions: Region[],
  readings: Reading[],
  imageUrl: string | null,
): ScanResult {
  return {
    scanId: scan.id,
    status: scan.status,
    error: scan.error,
    imageUrl,
    regions: regions.map((region) => {
      const own = readings.filter((r) => r.regionId === region.id);
      return {
        ...region,
        readings: own.map(({ model, fields, latencyMs, error }) => ({ model, fields, latencyMs, error })),
        fields: reconcileReadings(own),
      };
    }),
  };
}
