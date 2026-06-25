import { UserRole } from './enums';

export interface AuthUser {
  id: string;
  email?: string;
  phone?: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  organizationId?: string;
  roles?: string[];
}

export interface JwtPayload {
  sub: string;
  role: UserRole;
  email?: string;
  phone?: string;
  firstName: string;
  lastName: string;
  roles?: string[];
}
