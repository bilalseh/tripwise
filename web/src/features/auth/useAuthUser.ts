import { useEffect, useState } from 'react';

import { getCurrentUser, subscribeToUser, type SessionUser } from '../../lib/session';

export function useAuthUser(): SessionUser | null {
  const [user, setUser] = useState(getCurrentUser);
  useEffect(() => subscribeToUser(setUser), []);
  return user;
}
