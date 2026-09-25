export interface RoleDto {
    id?: string | null;
    name: string;
    permission: Array<{ model: string; action: string }>;
    createdAt?: Date | null;
    updatedAt?: Date | null;
    deletedAt?: Date | null;
}
