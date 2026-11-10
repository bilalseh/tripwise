import { useAuthUser } from './useAuthUser';

/** The signed-in user's id. Only call inside pages behind <RequireAuth>. */
export function useUid(): string {
  const user = useAuthUser();
  if (!user) throw new Error('useUid() needs a signed-in user');
  return user.uid;
}
