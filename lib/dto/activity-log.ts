export interface ActivityLogChangeDto {
  from: unknown;
  to: unknown;
}

export interface ActivityLogMetadataDto {
  before?: Record<string, unknown> | Record<string, unknown>[] | null;
  after?: Record<string, unknown> | null;
  changes?: Record<string, ActivityLogChangeDto>;
  [key: string]: unknown;
}

export interface ActivityLogDto {
  id: string;
  action: string;
  status: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  tenantId?: string | null;
  tenantName?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  method?: string | null;
  path?: string | null;
  message?: string | null;
  metadata?: ActivityLogMetadataDto | null;
  createdAt: string;
}
